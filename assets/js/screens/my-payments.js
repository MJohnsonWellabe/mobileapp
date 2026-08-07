// MyPayments — pay a premium, or set up automatic payments.
//
// Two things here are load-bearing and easy to get subtly wrong.
//
// 1. THE PERIOD MATH. A successful payment advances paidThroughDate from its own
//    previous value, not from today, by however many whole premium periods were
//    paid. And the preselected "amount due now" is enough periods to land that date
//    strictly in the future. Without that, paying as April — two months in arrears —
//    shows "Payment successful" above a still-red coverage pill, which is the worst
//    thing this demo could do on stage. docs/04 §MyPayments has the formula.
//
// 2. THE CARD MATCH. The last four digits entered must equal cardOnFile.last4, and a
//    mismatch must write no successful payment record. This check is client-side by
//    design (DECISIONS-LOG.md): enforcing it in rules would need a cross-document
//    get(), which eats the batch access-call budget and reads pre-transaction state.
//    What the rules do guarantee is the part that protects the data — a failed
//    payment can never carry a resultingPaidThroughDate, so a spoofed failure cannot
//    extend coverage.

import { page, param } from './_page.js';
import {
  subscribePolicies,
  subscribeUser,
  subscribePayments,
  createPayment,
  updatePolicy,
  updateUserFields,
  serverTimestamp,
} from '../data.js';
import {
  amountDue,
  paidThroughAfter,
  coverageStatus,
  storedStatusFor,
  formatDate,
  formatMoney,
  PRODUCT_LABELS,
  startOfToday,
  round2,
  productEyebrow,
  paidThroughLabel,
} from '../format.js';
import { html, esc, dataRow, button, toast, on, parseAmount, illustration, headlineBand } from '../ui.js';
import { icons } from '../icons.js';
import { noticePaymentReceived, noticePaymentFailed } from '../notices.js';

page({
  title: 'MyPayments',
  tab: 'pay',
  ready: ['policies', 'user', 'payments'],
  illustrations: ['calculator'],

  subscribe(session, update, ctx) {
    ctx.view.policyId = param('policy');
    subscribeUser(session.userId, (user) => update({ user }));
    subscribePolicies(session.userId, (policies) => update({ policies }));
    subscribePayments(session.userId, (payments) => update({ payments }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-pay]', (event, el) => {
      ctx.view.policyId = el.dataset.pay;
      ctx.view.mode = 'form';
      ctx.view.error = null;
      ctx.view.otherAmount = '';
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-action="back"]', () => {
      ctx.view.mode = null;
      ctx.view.error = null;
      ctx.view.done = null;
      ctx.repaint();
    });

    on(app, 'click', '[data-action="autopay"]', (event, el) => {
      ctx.view.mode = 'autopay';
      ctx.view.policyId = el.dataset.policy;
      ctx.repaint();
    });

    on(app, 'change', 'input[name="amountChoice"]', (event, el) => {
      ctx.view.amountChoice = el.value;
      ctx.repaint();
    });

    // Live-tracked so Submit can be disabled the moment a lapsed policy's partial
    // "another amount" wouldn't reinstate it (docs/04: "Submit never becomes
    // enabled"), not just rejected after the tap.
    on(app, 'input', 'input[name="otherAmount"]', (event, el) => {
      ctx.view.otherAmount = el.value;
      ctx.repaint();
    });

    on(app, 'submit', 'form[data-payment]', (event, form) =>
      submitPayment(event, form, ctx, getState),
    );

    on(app, 'submit', 'form[data-autopay]', async (event, form) => {
      event.preventDefault();
      const { user, policies } = getState();
      const policy = policies.find((p) => p.id === ctx.view.policyId);
      const digits = form.account.value.replace(/\D/g, '');
      if (digits.length < 4) {
        ctx.view.error = 'Please enter your account number.';
        ctx.repaint();
        return;
      }
      try {
        await updateUserFields(user.id, {
          bankAccountOnFile: { bankName: form.bank.value.trim() || 'Your bank', last4: digits.slice(-4) },
        });
        await updatePolicy(policy.id, { autopayEnabled: true });
        ctx.view.mode = null;
        ctx.view.error = null;
        ctx.repaint();
        toast('Automatic payments are on.');
      } catch (err) {
        console.error(err);
        toast("We couldn't set that up. Please try again.", { tone: 'error' });
      }
    });
  },

  render(state, ctx) {
    const today = startOfToday();
    const { policies, user, payments } = state;

    if (ctx.view.done) return receiptView(ctx.view.done);
    if (ctx.view.mode === 'autopay') {
      const policy = policies.find((p) => p.id === ctx.view.policyId);
      if (policy) return autopayView(policy, user, ctx.view.error);
    }
    if (ctx.view.mode === 'form') {
      const policy = policies.find((p) => p.id === ctx.view.policyId);
      if (policy) return payForm(policy, user, ctx, today);
    }
    return listView(policies, user, payments, today);
  },
});

/* ------------------------------------------------------------- views ----- */

/** The band at the top of MyPayments.
 *
 *  There is exactly one number a member acts on here, and it is never an
 *  average. The first version of this heroed "a month, on average" at 44px for
 *  paid-up members — a derived statistic, meaningless for Dave who holds one
 *  policy, and rendered in the same large type and the same panel as April's
 *  genuinely-owed $174.00. Both reviewers flagged it: a big dollar figure a
 *  member can't tie to a transaction invites "wait, what is that?" from the
 *  floor, and at worst reads as a balance they didn't know they had.
 *
 *  So it's the next actual charge and its date when everything is current, and
 *  what is owed right now when it isn't — with the pay button inside the band in
 *  that case, since an "amount due" that offers no way to pay it is a dead end
 *  at the top of the most revenue-relevant screen in the app. */
function paymentsHeadline(policies, today) {
  const behind = policies.filter((p) => coverageStatus(p, today).key !== 'active');

  if (behind.length) {
    const owed = behind.reduce((sum, p) => sum + amountDue(p, today).amount, 0);
    return headlineBand({
      tone: 'attention',
      icon: 'alert',
      figure: formatMoney(round2(owed)),
      caption: behind.length === 1 ? 'due now on 1 policy' : `due now across ${behind.length} policies`,
      note:
        behind.length === 1
          ? `Paying this brings your ${PRODUCT_LABELS[behind[0].product]} coverage back to active.`
          : 'Paying this brings your coverage back to active.',
      action:
        behind.length === 1
          ? html`<button class="btn btn--primary btn--block" data-pay="${esc(behind[0].id)}">
              Pay ${formatMoney(round2(owed))} now
            </button>`
          : '',
    });
  }

  // The soonest-expiring policy is the one whose premium comes up next.
  const next = [...policies].sort((a, b) =>
    a.paidThroughDate < b.paidThroughDate ? -1 : 1,
  )[0];
  return headlineBand({
    icon: 'checkCircle',
    figure: formatMoney(next.premiumAmount),
    caption: 'your next premium',
    note: `Nothing is due now. This is due ${formatDate(next.paidThroughDate)}.`,
  });
}

function listView(policies, user, payments, today) {
  return html`
    ${policies.length ? paymentsHeadline(policies, today) : ''}
    ${policies.length
      ? policies.map((policy) => {
          const status = coverageStatus(policy, today);
          const due = amountDue(policy, today);
          return html`<div class="card stack-sm">
            <div style="display:flex;justify-content:space-between;gap:var(--space-3);align-items:flex-start">
              <div>
                <div class="card__meta">${esc(productEyebrow(policy))}</div>
                <h2 class="card__title">${esc(policy.planName)}</h2>
              </div>
              <span class="pill pill--${status.tone}"
                >${status.tone === 'success' ? icons.checkCircle() : icons.alert()}${esc(status.label)}</span
              >
            </div>
            ${dataRow('Paid through', paidThroughLabel(policy, today))}
            ${dataRow(
              'Premium',
              `${formatMoney(policy.premiumAmount)} ${policy.premiumFrequency}`,
            )}
            ${dataRow('Automatic payments', policy.autopayEnabled ? 'On' : 'Off')}
            ${status.key !== 'active'
              ? html`<div class="notice-banner notice-banner--danger">
                  ${icons.alert()}
                  <span
                    >This coverage is ${status.label.toLowerCase()}. Paying
                    ${formatMoney(due.amount)} brings it back to active.</span
                  >
                </div>`
              : ''}
            <button class="btn btn--primary btn--block" data-pay="${esc(policy.id)}">
              Make a payment
            </button>
            ${policy.autopayEnabled
              ? ''
              : html`<button
                  class="btn btn--secondary btn--block"
                  data-action="autopay"
                  data-policy="${esc(policy.id)}"
                >
                  ${icons.bank()} Set up automatic payments
                </button>`}
          </div>`;
        })
      : html`<div class="card">
          <p class="empty__title">Nothing to pay</p>
          <p class="empty__body">You have no coverage on file.</p>
        </div>`}

    <div class="card">
      <h2 class="section-heading">Payment history</h2>
      ${payments.length
        ? payments.map((p) => paymentRow(p, policies))
        : html`<div class="empty">
            <div class="empty__art">${illustration('calculator')}</div>
            <p class="empty__title">No payments yet</p>
            <p class="empty__body">Your payments will show up here once you make one.</p>
          </div>`}
    </div>
  `;
}

function paymentRow(payment, policies) {
  const policy = policies.find((p) => p.id === payment.policyId);
  const ok = payment.status === 'success';
  return html`<div class="data-row">
    <span class="data-row__label">
      ${formatDate(payment.timestamp)}<br />
      <span style="font-size:var(--text-xs)"
        >${esc(policy ? PRODUCT_LABELS[policy.product] : 'Policy')} ·
        ${payment.method === 'bank' ? 'Bank' : 'Card'} ending ${esc(payment.last4)}</span
      >
    </span>
    <span class="data-row__value">
      <span style="white-space:nowrap">${formatMoney(payment.amount)}</span><br />
      <span class="pill pill--${ok ? 'success' : 'danger'}"
        >${ok ? icons.checkCircle() : icons.alert()}${ok ? 'Paid' : 'Failed'}</span
      >
    </span>
  </div>`;
}

function payForm(policy, user, ctx, today) {
  const due = amountDue(policy, today);
  const status = coverageStatus(policy, today);
  const choice = ctx.view.amountChoice ?? 'due';
  const card = user.cardOnFile;
  const showOnePeriod = due.periodsOwed > 1;
  // Partial payment can never reinstate a lapsed policy (docs/04's reinstatement
  // rule) — Submit is disabled the moment "another amount" is below what's owed,
  // not just rejected after the tap.
  const otherAmountValue = parseAmount(ctx.view.otherAmount ?? '');
  const submitDisabled =
    choice === 'other' &&
    status.key !== 'active' &&
    (!Number.isFinite(otherAmountValue) || otherAmountValue < due.amount);

  return html`
    <div class="card stack-sm">
      <div class="card__meta">${esc(productEyebrow(policy))}</div>
      <h2 class="card__title">${esc(policy.planName)}</h2>
      ${dataRow('Paid through', paidThroughLabel(policy, today))}
    </div>

    <form class="card stack" data-payment="${esc(policy.id)}">
      <div>
        <h3 class="card__title">How much would you like to pay?</h3>
        <p class="card__meta">
          ${due.periodsOwed > 1
            ? `${due.periodsOwed} premium periods are outstanding.`
            : 'Your next premium period.'}
        </p>
      </div>

      <div>
        <label class="choice">
          <input type="radio" name="amountChoice" value="due" ${choice === 'due' ? 'checked' : ''} />
          <span class="choice__body">
            <span class="choice__title">Amount due now — ${formatMoney(due.amount)}</span>
            <span class="choice__meta">Brings your coverage fully up to date</span>
          </span>
        </label>
        ${showOnePeriod
          ? html`<label class="choice">
              <input
                type="radio"
                name="amountChoice"
                value="one"
                ${choice === 'one' ? 'checked' : ''}
              />
              <span class="choice__body">
                <span class="choice__title">One premium period — ${formatMoney(due.onePeriod)}</span>
                <span class="choice__meta">Covers one ${esc(periodWord(policy))}</span>
              </span>
            </label>`
          : ''}
        <label class="choice">
          <input
            type="radio"
            name="amountChoice"
            value="other"
            ${choice === 'other' ? 'checked' : ''}
          />
          <span class="choice__body"><span class="choice__title">Another amount</span></span>
        </label>
        ${choice === 'other'
          ? html`<label class="field" style="margin-top:var(--space-2)">
              <span class="field__label">Amount</span>
              <input
                class="input"
                name="otherAmount"
                inputmode="decimal"
                placeholder="0.00"
                value="${esc(ctx.view.otherAmount ?? '')}"
                data-focus-key="otherAmount"
              />
              ${status.key !== 'active'
                ? html`<span class="field__hint"
                    >To restore this policy, the full past-due amount of
                    ${formatMoney(due.amount)} is required.</span
                  >`
                : ''}
            </label>`
          : ''}
      </div>

      <div>
        <h3 class="card__title">Confirm your card</h3>
        ${card
          ? html`<p class="card__meta">
                ${esc(card.brand)} ending in ${esc(card.last4)}, exp
                ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}
              </p>
              <label class="field" style="margin-top:var(--space-3)">
                <span class="field__label">Enter the last four digits</span>
                <input
                  class="input last4 ${ctx.view.error ? 'input--invalid' : ''}"
                  name="last4"
                  inputmode="numeric"
                  maxlength="4"
                  autocomplete="off"
                  data-focus-key="last4"
                />
              </label>`
          : html`<p class="card__meta">There's no card on file for this account.</p>`}
        ${ctx.view.error
          ? html`<p class="field__error">${icons.alert()}<span>${esc(ctx.view.error)}</span></p>`
          : ''}
      </div>

      <p class="disclosure">
        This is a demonstration. No card is charged and no payment is sent to a bank.
      </p>
      ${button('Submit payment', { type: 'submit', block: true, disabled: submitDisabled })}
    </form>
  `;
}

function autopayView(policy, user, error) {
  return html`
    <form class="card stack" data-autopay="${esc(policy.id)}">
      <h2>Set up automatic payments</h2>
      <p>
        We'll draft ${formatMoney(policy.premiumAmount)} from your account each
        ${esc(periodWord(policy))}, on the date your coverage is paid through. You can turn it
        off at any time.
      </p>
      <label class="field">
        <span class="field__label">Bank name</span>
        <input class="input" name="bank" placeholder="For example, Bankers Trust" data-focus-key="bank" />
      </label>
      <label class="field">
        <span class="field__label">Account number</span>
        <input class="input" name="account" inputmode="numeric" data-focus-key="account" />
        <span class="field__hint">We only store the last four digits.</span>
      </label>
      ${error ? html`<p class="field__error">${icons.alert()}<span>${esc(error)}</span></p>` : ''}
      <p class="disclosure">
        This is a demonstration. No bank account is verified and no money moves.
      </p>
      ${button('Turn on automatic payments', { type: 'submit', block: true })}
    </form>
  `;
}

function receiptView(done) {
  return html`
    <div class="card stack">
      <span class="pill pill--success">${icons.checkCircle()}Payment received</span>
      <h2>${formatMoney(done.amount)} paid</h2>
      <p>
        Thank you. Your ${esc(done.planName)} coverage is now paid through
        <strong>${formatDate(done.paidThrough)}</strong>.
      </p>
      ${dataRow('Paid with', `${esc(done.brand)} ending ${esc(done.last4)}`)}
      ${dataRow('Date', formatDate(new Date()))}
      <p class="disclosure">
        A copy of this receipt is in MyMailbox. This is a demonstration — no card was
        charged.
      </p>
      <a class="btn btn--secondary btn--block" href="my-mailbox.html">${icons.mailbox()} Go to MyMailbox</a>
      ${button('Done', { action: 'back', block: true })}
    </div>
  `;
}

/* ----------------------------------------------------------- submit ------ */

async function submitPayment(event, form, ctx, getState) {
  event.preventDefault();
  const { user, policies } = getState();
  const policy = policies.find((p) => p.id === form.dataset.payment);
  const today = startOfToday();
  const due = amountDue(policy, today);
  const status = coverageStatus(policy, today);
  const choice = ctx.view.amountChoice ?? 'due';

  const amount =
    choice === 'due'
      ? due.amount
      : choice === 'one'
        ? due.onePeriod
        : parseAmount(form.otherAmount?.value ?? '');

  const fail = (message) => {
    ctx.view.error = message;
    ctx.repaint();
  };

  if (!Number.isFinite(amount) || amount <= 0) return fail('Please enter an amount to pay.');
  if (amount < policy.premiumAmount)
    return fail(
      `The smallest payment we can take is one premium period, ${formatMoney(policy.premiumAmount)}.`,
    );
  // Partial payment does not reinstate a lapsed policy — that is how reinstatement
  // actually works, and this audience knows it (docs/04 §MyPayments).
  if (status.key !== 'active' && round2(amount) < due.amount)
    return fail(
      `To restore this policy, the full past-due amount of ${formatMoney(due.amount)} is required.`,
    );

  const entered = (form.last4?.value ?? '').replace(/\D/g, '');
  if (entered.length !== 4) return fail('Please enter the last four digits of your card.');

  // The card-match guardrail. A mismatch writes a FAILED payment — never a
  // successful one — and the rules make it impossible for that record to carry a
  // resultingPaidThroughDate.
  if (!user.cardOnFile || entered !== user.cardOnFile.last4) {
    try {
      await createPayment({
        userId: user.id,
        policyId: policy.id,
        amount: round2(amount),
        method: 'card',
        last4: entered,
        status: 'failed',
        timestamp: serverTimestamp(),
      });
      await noticePaymentFailed({ userId: user.id, policy, amount: round2(amount) });
    } catch (err) {
      console.error(err);
    }
    return fail(
      "That doesn't match the card we have on file. Check the last four digits and try again. Nothing was charged.",
    );
  }

  const newPaidThrough = paidThroughAfter(policy, amount);

  try {
    await createPayment({
      userId: user.id,
      policyId: policy.id,
      amount: round2(amount),
      method: 'card',
      last4: entered,
      status: 'success',
      resultingPaidThroughDate: newPaidThrough,
      timestamp: serverTimestamp(),
    });

    // Status is written alongside the date so the stored field never contradicts
    // the derived pill, even though nothing reads it to render (docs/03).
    await updatePolicy(policy.id, {
      paidThroughDate: newPaidThrough,
      status: storedStatusFor(newPaidThrough, today),
    });

    await noticePaymentReceived({
      userId: user.id,
      policy,
      amount: round2(amount),
      paidThroughDate: newPaidThrough,
    });

    ctx.view.done = {
      amount: round2(amount),
      planName: policy.planName,
      paidThrough: newPaidThrough,
      brand: user.cardOnFile.brand,
      last4: entered,
    };
    ctx.view.error = null;
    ctx.view.mode = null;
    window.scrollTo(0, 0);
    ctx.repaint();
    toast('Payment received.');
  } catch (err) {
    console.error(err);
    fail("We couldn't complete that payment. Please try again.");
  }
}

function periodWord(policy) {
  return { monthly: 'month', quarterly: 'quarter', annual: 'year' }[policy.premiumFrequency];
}

