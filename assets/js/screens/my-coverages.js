// MyCoverages — what you have, what it covers, your ID card, and how to add more.

import { page, param } from './_page.js';
import { subscribePolicies, subscribeUser, subscribeHealthProfile, createPolicy } from '../data.js';
import {
  coverageStatus,
  formatDate,
  formatMoney,
  PRODUCT_LABELS,
  amountDue,
  toYmd,
  addMonths,
  startOfToday,
  titleCase,
  SERVICE_NUMBER,
} from '../format.js';
import { html, esc, dataRow, button, toast, on, illustration } from '../ui.js';
import { icons, wellabeMark } from '../icons.js';
import { setTitle } from '../app-shell.js';


/** The six product lines, with the copy a member sees when picking one to add. */
const PRODUCT_CATALOG = {
  medSupp: {
    planName: 'Medicare Supplement Plan G',
    blurb: 'Picks up most of what Original Medicare leaves you to pay.',
    premium: 152.4,
    frequency: 'monthly',
  },
  hospitalIndemnity: {
    planName: 'Hospital Indemnity — Essential',
    blurb: 'Cash paid straight to you for every day you spend in the hospital.',
    premium: 64.0,
    frequency: 'monthly',
  },
  dental: {
    planName: 'Dental Choice',
    blurb: 'Cleanings and exams covered in full, with help on the bigger work.',
    premium: 42.5,
    frequency: 'monthly',
  },
  shortTermCare: {
    planName: 'Short-Term Care — 360 Day',
    blurb: 'Pays toward nursing home, assisted living or home care for up to a year.',
    premium: 59.75,
    frequency: 'monthly',
  },
  criticalIllness: {
    planName: 'Critical Illness — $20,000',
    blurb: 'A lump sum paid to you on a covered diagnosis, to spend however you need.',
    premium: 98.0,
    frequency: 'quarterly',
  },
  preneed: {
    planName: 'Preneed Whole Life',
    blurb: 'Sets aside the cost of a funeral so your family is not asked to find it.',
    premium: 430.0,
    frequency: 'annual',
  },
};

const PRODUCT_COPY = {
  medSupp: ['Part A hospital deductible and coinsurance', 'Part B coinsurance and copayments', 'Skilled nursing facility coinsurance'],
  hospitalIndemnity: ['A fixed cash amount for each day admitted', 'More for each day in intensive care', 'A lump sum on first admission each year'],
  dental: ['Two cleanings and exams a year', '80% of fillings and simple extractions', '50% of crowns, bridges and dentures'],
  shortTermCare: ['Nursing home and assisted living care', 'Home health care', 'Up to 360 days of benefits'],
  criticalIllness: ['A lump sum on a covered diagnosis', 'Heart attack, stroke and major organ failure', 'Invasive cancer at 100% of the benefit'],
  preneed: ['A benefit paid to your funeral home', 'Premiums that never increase', 'Coverage that cannot be cancelled'],
};

page({
  title: 'MyCoverages',
  tab: 'coverage',
  ready: ['policies', 'user'],
  illustrations: ['two-people-talking', 'family-couch'],

  subscribe(session, update, ctx) {
    if (param('add')) ctx.view.mode = 'add';
    // ?view=card&id=<policy> — a one-tap deep link straight to the digital ID
    // card (Home's MyCoverages card uses this), skipping the list → Details
    // detour. The ID card is the most universally loved feature across every
    // competitor insurance app reviewed for this redesign precisely because
    // it's surfaced directly rather than buried in a menu.
    if (param('view') === 'card') ctx.view.mode = 'card';
    if (param('id')) ctx.view.openPolicy = param('id');
    subscribeUser(session.userId, (user) => update({ user }));
    subscribePolicies(session.userId, (policies) => update({ policies }));
    subscribeHealthProfile(session.userId, (health) => update({ health: health ?? {} }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-view]', (event, el) => {
      ctx.view.mode = el.dataset.view;
      ctx.view.openPolicy = el.dataset.policy ?? null;
      ctx.view.product = el.dataset.product ?? null;
      ctx.view.enrolled = null;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'submit', 'form[data-enroll]', async (event, form) => {
      event.preventDefault();
      const product = form.dataset.enroll;
      const { user, health } = getState();
      const spec = PRODUCT_CATALOG[product];
      const today = startOfToday();
      const guaranteed = product === 'hospitalIndemnity' && health?.qualifiesForGuaranteedIssue;

      try {
        const id = `policy-${user.id.replace('user-', '')}-${product.toLowerCase()}-new`;
        await createPolicy(id, {
          userId: user.id,
          product,
          planName: spec.planName,
          policyNumber: newPolicyNumber(product),
          status: 'active',
          effectiveDate: toYmd(today),
          paidThroughDate: toYmd(addMonths(today, 1)),
          premiumAmount: spec.premium,
          premiumFrequency: spec.frequency,
          autopayEnabled: false,
          coverageSummary: spec.blurb,
          whatItCovers: PRODUCT_COPY[product],
          ...(guaranteed ? { guaranteedIssue: true } : {}),
        });
        ctx.view.mode = 'enrolled';
        ctx.view.enrolled = spec.planName;
        window.scrollTo(0, 0);
        ctx.repaint();
      } catch (err) {
        console.error(err);
        toast("We couldn't start that enrollment. Please try again.", { tone: 'error' });
      }
    });
  },

  render(state, ctx) {
    const { policies, user, health } = state;
    const today = startOfToday();
    const mode = ctx.view.mode;

    if (mode === 'card') {
      const policy = policies.find((p) => p.id === ctx.view.openPolicy);
      // Name the screen you're standing on. The shared top bar says
      // "MyCoverages" for every sub-view of this screen, which is fine for a
      // detail pane but wrong for the ID card — that's a destination in its
      // own right, and the one members are most likely to arrive at directly
      // from Home (visual QA finding).
      if (policy) {
        setTitle('Member ID card');
        return idCardView(policy, user, policies);
      }
      setTitle('MyCoverages');
      return listView(policies, user, health, today);
    }
    setTitle('MyCoverages');
    if (mode === 'agent') return agentView();
    if (mode === 'add') return addPicker(policies, health);
    if (mode === 'enroll') return enrollForm(ctx.view.product, user, health);
    if (mode === 'enrolled') return enrolledView(ctx.view.enrolled);
    if (mode === 'detail') {
      const policy = policies.find((p) => p.id === ctx.view.openPolicy);
      if (policy) return detailView(policy, today);
    }
    return listView(policies, user, health, today);
  },
});

/* ------------------------------------------------------------- views ----- */

function listView(policies, user, health, today) {
  const held = new Set(policies.map((p) => p.product));
  const available = Object.keys(PRODUCT_CATALOG).filter((p) => !held.has(p));

  return html`
    ${health?.qualifiesForGuaranteedIssue && !held.has('hospitalIndemnity')
      ? html`<div class="card card--accent stack-sm">
          <h2 class="card__title">You've unlocked a no-health-questions offer</h2>
          <p>
            You can add Wellabe Hospital Indemnity coverage without answering any health
            questions.
          </p>
          <button class="btn btn--primary btn--block" data-view="enroll" data-product="hospitalIndemnity">
            See the offer
          </button>
          <p class="disclosure">
            Demonstration only. Not an offer of insurance. Eligibility, availability and terms
            vary by state.
          </p>
        </div>`
      : ''}
    ${policies.length
      ? policies.map((p) => policyCard(p, today))
      : html`<div class="card">
          <p class="empty__title">No coverage on file yet</p>
          <p class="empty__body">When you add coverage it will show up here.</p>
        </div>`}

    <div class="card stack-sm">
      <h2 class="card__title">Add more coverage</h2>
      <p class="card__meta">
        ${available.length
          ? `${available.length} more Wellabe product${available.length === 1 ? '' : 's'} you don't have yet.`
          : 'You already hold all six Wellabe product lines.'}
      </p>
      <!-- Always secondary. This used to be primary for members in good
           standing and secondary for lapsed ones, which meant (a) the same
           card rendered two different ways depending on who was logged in,
           and (b) for most members the loudest, last control on the coverage
           screen was a cross-sell rather than anything to do with the
           coverage they already hold. docs/01 asks for confident, not salesy
           (visual QA finding). -->
      ${available.length
        ? html`<button class="btn btn--secondary btn--block" data-view="add">
            ${icons.plus()} See what else you can add
          </button>`
        : ''}
    </div>
  `;
}

function policyCard(policy, today) {
  const status = coverageStatus(policy, today);
  return html`<div class="card stack-sm">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3)">
      <div>
        <div class="card__meta">${esc(PRODUCT_LABELS[policy.product])}</div>
        <h2 class="card__title">${esc(policy.planName)}</h2>
      </div>
      <span class="pill pill--${status.tone}"
        >${status.tone === 'success' ? icons.checkCircle() : icons.alert()}${esc(status.label)}</span
      >
    </div>
    <p>${esc(policy.coverageSummary)}</p>
    ${dataRow('Policy number', policy.policyNumber)}
    ${dataRow('Paid through', formatDate(policy.paidThroughDate))}
    ${status.key !== 'active'
      ? html`<a
          class="btn btn--primary btn--block"
          href="my-payments.html?policy=${esc(policy.id)}"
          >Pay ${formatMoney(amountDue(policy, today).amount)} to restore this coverage</a
        >`
      : ''}
    <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
      <!-- Secondary when the policy needs paying: "restore this coverage"
           directly above is the one action that matters on a lapsed card, and
           two filled primaries stacked gave a navigation shortcut equal weight
           with it (visual QA finding). One primary per card state. -->
      <button
        class="btn btn--${status.key === 'active' ? 'primary' : 'secondary'}"
        data-view="card"
        data-policy="${esc(policy.id)}"
      >
        View ID card
      </button>
      <button class="btn btn--secondary" data-view="detail" data-policy="${esc(policy.id)}">
        Details
      </button>
    </div>
  </div>`;
}

/** The ID card. This is one of the two artifacts most likely to be pinch-zoomed in
 *  the demo, so it is drawn as a card, not a table (docs/04 §MyCoverages). */
function idCardView(policy, user) {
  return html`
    <div class="idcard">
      <div class="idcard__top">
        <span class="idcard__mark" aria-hidden="true">${wellabeMark()}</span>
        <span class="idcard__brand">wellabe</span>
        <span class="idcard__type">${esc(PRODUCT_LABELS[policy.product])}</span>
      </div>
      <div class="idcard__body">
        <div class="idcard__field">
          <span class="idcard__label">Member</span>
          <span class="idcard__value idcard__value--lg">${esc(user.firstName)}</span>
        </div>
        <div class="idcard__field">
          <span class="idcard__label">Policy number</span>
          <span class="idcard__value idcard__value--mono">${esc(policy.policyNumber)}</span>
        </div>
        <div class="idcard__field">
          <span class="idcard__label">Plan</span>
          <span class="idcard__value">${esc(policy.planName)}</span>
        </div>
        <div class="idcard__field">
          <span class="idcard__label">Effective</span>
          <span class="idcard__value">${formatDate(policy.effectiveDate)}</span>
        </div>
      </div>
      <div class="idcard__foot">
        <span>Member services</span>
        <strong>${SERVICE_NUMBER}</strong>
      </div>
    </div>
    <p class="disclosure" style="text-align:center">
      Show this card at your provider. You can also keep a screenshot on your phone.
    </p>
    <!-- The likeliest thing anyone wants from an ID card screen is to call the
         number printed on it. A tel: link is the real thing, not a fake
         integration — the phone dialler is the OS's, not ours. -->
    <a class="btn btn--secondary btn--block" href="tel:${SERVICE_NUMBER.replace(/-/g, '')}">
      ${icons.phone()} Call member services
    </a>
  `;
}

function detailView(policy, today) {
  const status = coverageStatus(policy, today);
  return html`
    <div class="card stack-sm">
      <div class="card__meta">${esc(PRODUCT_LABELS[policy.product])}</div>
      <h2>${esc(policy.planName)}</h2>
      <span class="pill pill--${status.tone}"
        >${status.tone === 'success' ? icons.checkCircle() : icons.alert()}${esc(status.label)}</span
      >
      <p>${esc(policy.coverageSummary)}</p>
    </div>

    <div class="card">
      <h2 class="section-heading">What it covers</h2>
      <ul style="margin:0;padding-left:var(--space-5)">
        ${policy.whatItCovers.map((line) => html`<li style="margin-bottom:var(--space-2)">${esc(line)}</li>`)}
      </ul>
    </div>

    <div class="card">
      <h2 class="section-heading">The details</h2>
      ${dataRow('Policy number', policy.policyNumber)}
      ${dataRow('Effective date', formatDate(policy.effectiveDate))}
      ${dataRow('Paid through', formatDate(policy.paidThroughDate))}
      ${dataRow('Premium', `${formatMoney(policy.premiumAmount)} ${policy.premiumFrequency}`)}
      ${dataRow('Automatic payments', policy.autopayEnabled ? 'On' : 'Off')}
    </div>

    <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
      <button class="btn btn--primary" data-view="card" data-policy="${esc(policy.id)}">
        View ID card
      </button>
      <button class="btn btn--secondary" data-view="agent">Talk to an agent</button>
    </div>
  `;
}

/** Deliberately honest: a contact card, plus a route into the mailbox composer so
 *  the action isn't a dead end (docs/04 §MyCoverages). */
function agentView() {
  return html`
    <div class="card stack">
      <div class="illustration" style="max-width:220px;opacity:.5" aria-hidden="true">
        ${illustration('two-people-talking')}
      </div>
      <h2>Talk to a Wellabe agent</h2>
      <p>
        Our agents can walk you through your options, compare plans with you, and answer
        anything you are unsure about. There is no cost and no obligation.
      </p>
      ${dataRow('Phone', SERVICE_NUMBER)}
      ${dataRow('Hours', 'Monday to Friday, 8:00 AM – 6:00 PM Central')}
      <p class="disclosure">
        Calling connects you to a real person during those hours. Nobody is standing by
        inside this app — this is a demonstration.
      </p>
      <a class="btn btn--secondary btn--block" href="my-mailbox.html?compose=coverage">
        ${icons.send()} Send a message instead
      </a>
    </div>
  `;
}

function addPicker(policies, health) {
  const held = new Set(policies.map((p) => p.product));
  const available = Object.keys(PRODUCT_CATALOG).filter((p) => !held.has(p));

  return html`
    <div>
      <h2>Add more coverage</h2>
      <p class="card__meta">Only showing what you don't already have.</p>
    </div>
    ${available.map((product) => {
      const spec = PRODUCT_CATALOG[product];
      const guaranteed = product === 'hospitalIndemnity' && health?.qualifiesForGuaranteedIssue;
      return html`<div class="card stack-sm ${guaranteed ? 'card--accent' : ''}">
        <h3 class="card__title">${esc(PRODUCT_LABELS[product])}</h3>
        <p>${esc(spec.blurb)}</p>
        <p class="card__meta">
          From ${formatMoney(spec.premium)} ${esc(spec.frequency)}
          ${guaranteed ? ' · No health questions for you' : ''}
        </p>
        <button class="btn btn--primary btn--block" data-view="enroll" data-product="${product}">
          Get started
        </button>
      </div>`;
    })}
    <button class="btn btn--secondary btn--block" data-view="agent">
      ${icons.phone()} Talk to an agent
    </button>
  `;
}

/** Pre-filled from MyInformation, which is the acceptance criterion — a member
 *  should never retype what Wellabe already knows. */
function enrollForm(product, user, health) {
  const spec = PRODUCT_CATALOG[product];
  const guaranteed = product === 'hospitalIndemnity' && health?.qualifiesForGuaranteedIssue;

  return html`
    <div class="card stack-sm">
      <div class="card__meta">${esc(PRODUCT_LABELS[product])}</div>
      <h2>${esc(spec.planName)}</h2>
      <p>${esc(spec.blurb)}</p>
      <p class="card__meta">${formatMoney(spec.premium)} ${esc(spec.frequency)}</p>
    </div>

    ${guaranteed
      ? html`<div class="notice-banner notice-banner--info">
          ${icons.checkCircle()}
          <span
            ><strong>No health questions required.</strong> You qualified for this through
            MyHealth.</span
          >
        </div>`
      : ''}

    <form class="card stack" data-enroll="${product}">
      <h3 class="card__title">Confirm your details</h3>
      <p class="card__meta">We've filled these in from your account. Change anything that's out of date in MyInformation.</p>
      ${dataRow('Name', user.firstName)}
      ${dataRow('Date of birth', formatDate(user.dob))}
      ${dataRow('Email', user.email)}
      ${dataRow('Phone', user.phone)}
      ${dataRow('Address', '', {
        valueHtml: `${esc(user.address.street)}<br>${esc(user.address.city)}, ${esc(user.address.state)} ${esc(user.address.zip)}`,
      })}
      ${dataRow('Preferred contact', titleCase(user.preferredContactMethod))}
      <p class="disclosure">
        This is a demonstration. Submitting starts a sample enrollment — no application is
        sent and nothing is underwritten.
      </p>
      ${button('Start my enrollment', { type: 'submit', block: true })}
    </form>

    <button class="btn btn--secondary btn--block" data-view="agent">
      ${icons.phone()} Talk to an agent first
    </button>
  `;
}

function enrolledView(planName) {
  return html`
    <div class="card stack">
      <div class="illustration" style="max-width:200px;opacity:.5" aria-hidden="true">
        ${illustration('family-couch')}
      </div>
      <h2>You're enrolled in ${esc(planName)}</h2>
      <p>
        It's on your coverage list now, and your welcome packet will be in MyMailbox shortly.
        Your first premium is due next month.
      </p>
      <p class="disclosure">Demonstration only — no application was actually submitted.</p>
      <button class="btn btn--primary btn--block" data-view="list">See my coverage</button>
    </div>
  `;
}


function newPolicyNumber(product) {
  const prefix = {
    medSupp: 'MS',
    hospitalIndemnity: 'HI',
    dental: 'DN',
    shortTermCare: 'STC',
    criticalIllness: 'CI',
    preneed: 'PN',
  }[product];
  return `WLB-${prefix}-${String(Math.floor(100000 + Math.random() * 899999))}`;
}
