// MyClaims — submit a claim with a photo, and track it to resolution.
//
// The tracker is modelled on the "pizza tracker" pattern the brief asks for:
// Intake -> Processing -> Reviewing -> Paid, with each completed stage carrying its
// real timestamp from statusHistory. Denied is a distinct terminal state, not Paid
// recoloured — a member should never have to read a colour to work out what
// happened.
//
// No UI path here can move a claim backwards or skip a stage. That is also enforced
// in firestore.rules by claimAdvance() and historyAppended(), so the guardrail
// survives someone poking at the console.

import { page, param } from './_page.js';
import {
  subscribeClaims,
  subscribePolicies,
  createClaim,
  updateClaim,
  serverTimestamp,
  Timestamp,
} from '../data.js';
import { storage } from '../firebase-init.js';
import { storageRef, uploadBytes, getDownloadURL } from '../../vendor/firebase.js';
import { formatDate, formatDateTime, formatMoney, PRODUCT_LABELS, toDate, SERVICE_NUMBER } from '../format.js';
import { html, esc, dataRow, button, toast, on, illustration, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import { noticeClaimSubmitted } from '../notices.js';

const STAGES = ['Intake', 'Processing', 'Reviewing', 'Paid'];

const STAGE_HELP = {
  Intake: 'We have your claim and are getting it ready for review.',
  Processing: 'A claims specialist has picked it up.',
  Reviewing: 'This is the last stage before a decision.',
  Paid: 'Your payment is on its way.',
};

page({
  title: 'MyClaims',
  tab: 'claims',
  ready: ['claims', 'policies'],
  illustrations: ['thinking-at-computer', 'embrace'],

  subscribe(session, update, ctx) {
    ctx.view.openClaim = param('id');
    subscribePolicies(session.userId, (policies) => update({ policies }));
    subscribeClaims(session.userId, (claims) => update({ claims }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-open]', (event, el) => {
      ctx.view.openClaim = el.dataset.open;
      ctx.view.mode = null;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-action="back"]', () => {
      ctx.view.openClaim = null;
      ctx.view.mode = null;
      ctx.view.error = null;
      ctx.repaint();
    });

    on(app, 'click', '[data-action="new"]', () => {
      ctx.view.mode = 'new';
      ctx.view.openClaim = null;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'submit', 'form[data-new-claim]', (event, form) => submitClaim(event, form, ctx, getState));
  },

  render(state, ctx) {
    const { claims, policies } = state;

    if (ctx.view.mode === 'new') return newClaimForm(policies, ctx);
    if (ctx.view.submitted) return submittedView(ctx.view.submitted);

    if (ctx.view.openClaim) {
      const claim = claims.find((c) => c.id === ctx.view.openClaim);
      if (claim) return detailView(claim, policies);
    }
    return listView(claims, policies);
  },
});

/* ------------------------------------------------------------- views ----- */

function listView(claims, policies) {
  return html`
    ${claims.length
      ? html`<div class="stack-sm">
          <h2 class="section-heading">
            ${claims.length === 1 ? 'Your claim' : `Your claims (${claims.length})`}
          </h2>
          ${claims.map((claim) => claimRow(claim, policies))}
        </div>`
      : emptyState({
          art: 'thinking-at-computer',
          title: 'No claims yet',
          body: "When you need to file one, it takes a couple of minutes and you can follow it right here.",
        })}

    <button class="btn btn--primary btn--block" data-action="new">
      ${icons.plus()} File a new claim
    </button>

    ${whatHappensNext(claims)}
  `;
}

/** Shown under the claims list, not the empty state — the empty state has its
 *  own illustration and copy.
 *
 *  This exists because the populated list was one card and a button on an
 *  otherwise bare screen (visual QA finding, three rounds running), and because
 *  the questions it answers are the ones this membership actually rings member
 *  services about. It's real information, not filler placed to fill height.
 *
 *  It branches on state, because the first version didn't and that was worse
 *  than saying nothing: it told Debbie, whose claim had just been DENIED, that
 *  "we check your claim against your policy, most take about two weeks" and
 *  that "when there's a decision you'll get a notice." Future-tense intake
 *  guidance under a terminal state is exactly the "never make someone guess a
 *  status" failure docs/01 principle 2 rules out. */
function whatHappensNext(claims) {
  if (!claims.length) return '';
  const anyOpen = claims.some((c) => !['Paid', 'Denied'].includes(c.status));
  const anyDenied = claims.some((c) => c.status === 'Denied');

  if (anyOpen) {
    return html`<div class="card stack-sm">
      <h2 class="card__title">What happens next</h2>
      <ol class="next-steps">
        <li>We check your claim against your policy. Most take about two weeks.</li>
        <li>If we need anything else from you, we'll write to you in MyMailbox.</li>
        <li>
          When there's a decision you'll get a notice, and this page will show it.
          Approved claims are paid to you directly.
        </li>
      </ol>
      <p class="card__meta">You don't need to do anything while a claim is being worked on.</p>
    </div>`;
  }

  if (anyDenied) {
    return html`<div class="card stack-sm">
      <h2 class="card__title">If you disagree with a decision</h2>
      <p>
        You can ask us to look at a denied claim again. Open the claim above to see the
        reason, and what would change the outcome.
      </p>
      <p class="card__meta">
        You have 180 days from the decision to ask for a review. Call ${SERVICE_NUMBER} or
        send us a message from MyMailbox.
      </p>
    </div>`;
  }

  return html`<div class="card stack-sm">
    <h2 class="card__title">About your payment</h2>
    <p>
      Paid claims are sent to you directly. Allow a few business days for the money to
      reach your account after the date shown on the claim.
    </p>
    <p class="card__meta">
      Anything not right? Call ${SERVICE_NUMBER} or send us a message from MyMailbox.
    </p>
  </div>`;
}

function claimRow(claim, policies) {
  const policy = policies.find((p) => p.id === claim.policyId);
  const s = statusPill(claim.status);
  return html`<button class="card stack-sm" data-open="${esc(claim.id)}" style="width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit">
    <div style="display:flex;justify-content:space-between;gap:var(--space-3);align-items:flex-start">
      <div>
        <div class="card__meta">${esc(policy ? PRODUCT_LABELS[policy.product] : PRODUCT_LABELS[claim.product])}</div>
        <div class="card__title">${esc(claim.claimNumber)}</div>
      </div>
      <span class="pill pill--${s.tone}">${icons[s.icon]()}${esc(s.label)}</span>
    </div>
    ${stageBar(claim)}
    <div style="display:flex;align-items:center;gap:var(--space-2)">
      <span class="card__meta" style="flex:1">${esc(s.summary)} · filed ${formatDate(claim.submittedAt)}</span>
      <span style="color:var(--color-text-secondary);flex:none">${icons.chevronRight()}</span>
    </div>
  </button>`;
}

/** A condensed four-segment version of the tracker, for the list view.
 *
 *  The full tracker() below is one tap away, but the list was previously a
 *  status word and nothing else — a member couldn't tell "just filed" from
 *  "nearly decided" without opening the claim. Same stage order and same
 *  index math as tracker(), deliberately reading from the shared STAGES
 *  constant rather than restating it, so the two can never disagree.
 *
 *  Denied claims fill every segment in the danger tone rather than being
 *  skipped: a denial IS a finished claim, and leaving the one state a member
 *  most needs to understand as the only card in the list with no indicator
 *  read as a component that had failed to render (visual QA finding). Paid
 *  fills in the success tone so the bar can't contradict the pill above it.
 *
 *  The caption is not decoration — an unlabelled bar communicates by fill
 *  position alone, which is exactly the "never colour/shape alone" case
 *  docs/01 principle 2 rules out. */
function stageBar(claim) {
  const denied = claim.status === 'Denied';
  const index = denied ? STAGES.length - 1 : STAGES.indexOf(claim.status);
  const toneClass = denied ? 'stagebar--denied' : claim.status === 'Paid' ? 'stagebar--done' : '';
  const caption = denied
    ? 'Closed — not approved'
    : `Step ${index + 1} of ${STAGES.length} · ${claim.status}`;

  return html`<div class="stagebar-wrap">
    <div class="stagebar ${toneClass}" aria-hidden="true">
      ${STAGES.map(
        (stage, i) =>
          html`<span
            class="stagebar__seg ${i <= index ? 'is-done' : ''}"
            title="${esc(stage)}"
          ></span>`,
      )}
    </div>
    <span class="stagebar__caption">${esc(caption)}</span>
  </div>`;
}

function detailView(claim, policies) {
  const policy = policies.find((p) => p.id === claim.policyId);
  const denied = claim.status === 'Denied';

  return html`
    <div class="card stack-sm">
      <div class="card__meta">${esc(policy ? PRODUCT_LABELS[policy.product] : PRODUCT_LABELS[claim.product])}</div>
      <h2>${esc(claim.claimNumber)}</h2>
      <p>${esc(claim.description)}</p>
    </div>

    ${denied ? deniedTracker(claim) : tracker(claim)}

    ${claim.status === 'Paid'
      ? html`<div class="card stack-sm">
          <span class="pill pill--success">${icons.checkCircle()}Paid</span>
          <h3 class="card__title">${formatMoney(claim.paidAmount ?? 0)} has been paid</h3>
          <p class="card__meta">
            Sent to you on ${formatDate(stageDate(claim, 'Paid'))}. Allow a few business days
            for it to arrive.
          </p>
        </div>`
      : ''}

    <div class="card">
      <h3 class="section-heading">Claim details</h3>
      ${dataRow('Filed', formatDate(claim.submittedAt))}
      ${policy ? dataRow('Policy', policy.policyNumber) : ''}
      ${claim.photoUrl
        ? dataRow('Photo', '', {
            valueHtml: `<a href="${esc(claim.photoUrl)}" target="_blank" rel="noopener">View attachment</a>`,
          })
        : dataRow('Photo', 'None attached')}
    </div>
  `;
}

/** The pizza tracker. Past stages are marked complete with their real timestamp;
 *  the current stage is the visually loudest thing on the screen. */
function tracker(claim) {
  const index = STAGES.indexOf(claim.status);
  return html`<div class="card">
    <h3 class="section-heading">Where your claim is</h3>
    <ol class="tracker">
      ${STAGES.map((stage, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        const when = stageDate(claim, stage);
        return html`<li class="tracker__step tracker__step--${state}">
          <span class="tracker__marker" aria-hidden="true">
            ${state === 'done' ? icons.check() : state === 'current' ? icons.clock() : ''}
          </span>
          <span class="tracker__body">
            <span class="tracker__label"
              >${esc(stage)}${state === 'current' ? ' — where it is now' : ''}</span
            >
            <span class="tracker__meta"
              >${when ? formatDateTime(when) : state === 'current' ? esc(STAGE_HELP[stage]) : 'Not yet'}</span
            >
            ${state === 'current' && when
              ? html`<span class="tracker__meta">${esc(STAGE_HELP[stage])}</span>`
              : ''}
          </span>
        </li>`;
      })}
    </ol>
  </div>`;
}

/** A distinct end state, not Paid recoloured. The reason and the next step are the
 *  point of this screen — a bare "Denied" is a defect (docs/04 §MyClaims). */
function deniedTracker(claim) {
  const reached = ['Intake', 'Processing', 'Reviewing'];
  return html`
    <div class="card">
      <h3 class="section-heading">Where your claim is</h3>
      <ol class="tracker">
        ${reached.map(
          (stage) => html`<li class="tracker__step tracker__step--done">
            <span class="tracker__marker" aria-hidden="true">${icons.check()}</span>
            <span class="tracker__body">
              <span class="tracker__label">${esc(stage)}</span>
              <span class="tracker__meta">${formatDateTime(stageDate(claim, stage))}</span>
            </span>
          </li>`,
        )}
        <li class="tracker__step tracker__step--denied">
          <span class="tracker__marker" aria-hidden="true">${icons.close()}</span>
          <span class="tracker__body">
            <span class="tracker__label">Denied</span>
            <span class="tracker__meta">${formatDateTime(stageDate(claim, 'Denied'))}</span>
          </span>
        </li>
      </ol>
    </div>

    <div class="card stack-sm">
      <span class="pill pill--danger">${icons.alert()}Denied</span>
      <h3 class="card__title">Why this claim was denied</h3>
      <p>${esc(claim.deniedReason ?? '')}</p>
    </div>

    <div class="card stack-sm">
      <div class="illustration" style="max-width:180px;opacity:.5" aria-hidden="true">
        ${illustration('embrace')}
      </div>
      <h3 class="card__title">This does not have to be the end of it</h3>
      <p>
        If you have something that would change our decision, send it to us and a person
        will look at this claim again.
      </p>
      <a
        class="btn btn--primary btn--block"
        href="my-mailbox.html?compose=claims&amp;claim=${esc(claim.id)}&amp;subject=${encodeURIComponent(
          `Request a review — ${claim.claimNumber}`,
        )}"
        >${icons.send()} Request a review</a
      >
    </div>
  `;
}

function newClaimForm(policies, ctx) {
  return html`
    <form class="card stack" data-new-claim>
      <h2>File a claim</h2>

      ${policies.length > 1
        ? html`<div>
            <span class="field__label">Which coverage is this for?</span>
            ${policies.map(
              (p, i) => html`<label class="choice">
                <input type="radio" name="policyId" value="${esc(p.id)}" ${i === 0 ? 'checked' : ''} />
                <span class="choice__body">
                  <span class="choice__title">${esc(PRODUCT_LABELS[p.product])}</span>
                  <span class="choice__meta">${esc(p.planName)}</span>
                </span>
              </label>`,
            )}
          </div>`
        : html`<input type="hidden" name="policyId" value="${esc(policies[0]?.id ?? '')}" />
            <p class="card__meta">
              For your ${esc(policies[0] ? PRODUCT_LABELS[policies[0].product] : 'coverage')} policy.
            </p>`}

      <label class="field">
        <span class="field__label">What happened?</span>
        <textarea
          class="textarea"
          name="description"
          rows="5"
          required
          placeholder="For example: two nights in the hospital after a fall at home."
          data-focus-key="description"
        ></textarea>
        <span class="field__hint">A sentence or two is plenty. We'll come back to you if we need more.</span>
      </label>

      <label class="field">
        <span class="field__label">Add a photo of your bill or receipt</span>
        <input class="input" type="file" name="photo" accept="image/*" capture="environment" />
        <span class="field__hint">Optional, but it usually speeds things up.</span>
      </label>

      ${ctx.view.error
        ? html`<p class="field__error">${icons.alert()}<span>${esc(ctx.view.error)}</span></p>`
        : ''}
      <p class="disclosure">This is a demonstration. Nothing is sent to a real claims team.</p>
      ${button('Submit claim', { type: 'submit', block: true })}
    </form>
  `;
}

function submittedView(claim) {
  return html`<div class="card stack">
    <span class="pill pill--success">${icons.checkCircle()}Claim received</span>
    <h2>We have your claim</h2>
    <p>
      Your claim number is <strong>${esc(claim.claimNumber)}</strong>. It's at intake now —
      we'll send you a notice here each time it moves to a new stage.
    </p>
    <button class="btn btn--primary btn--block" data-open="${esc(claim.id)}">
      Track this claim
    </button>
  </div>`;
}

/* ----------------------------------------------------------- submit ------ */

async function submitClaim(event, form, ctx, getState) {
  event.preventDefault();
  const { policies } = getState();
  const session = ctx.session;
  const policyId = form.policyId?.value;
  const policy = policies.find((p) => p.id === policyId);
  const description = form.description.value.trim();

  if (!policy) {
    ctx.view.error = 'Please choose which coverage this claim is for.';
    return ctx.repaint();
  }
  if (description.length < 5) {
    ctx.view.error = 'Please tell us briefly what happened.';
    return ctx.repaint();
  }

  const claimId = `claim-${session.userId.replace('user-', '')}-${Date.now()}`;
  const claimNumber = `CLM-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 89999))}`;
  const now = Timestamp.now();

  try {
    // A claim may only ever be created at Intake with a one-entry history — the
    // rules reject anything else from a client, so this is the only legal shape.
    await createClaim(claimId, {
      userId: session.userId,
      policyId: policy.id,
      product: policy.product,
      claimNumber,
      description,
      status: 'Intake',
      statusHistory: [{ status: 'Intake', timestamp: now }],
      submittedAt: now,
    });

    const file = form.photo?.files?.[0];
    if (file) {
      try {
        // Unique file name per upload: storage.rules makes a claim photo
        // write-once, so an overwrite is rejected rather than silently replacing
        // evidence.
        const safe = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-60);
        const ref = storageRef(storage, `claims/${session.userId}/${claimId}/${Date.now()}-${safe}`);
        await uploadBytes(ref, file);
        await updateClaim(claimId, { photoUrl: await getDownloadURL(ref) });
      } catch (uploadErr) {
        // The claim itself is filed; losing the attachment should not lose the
        // claim. Tell the member the truth rather than failing the whole thing.
        console.error(uploadErr);
        toast("Your claim was filed, but we couldn't attach the photo.", { tone: 'error' });
      }
    }

    await noticeClaimSubmitted({ userId: session.userId, claim: { id: claimId, claimNumber } });

    ctx.view.submitted = { id: claimId, claimNumber };
    ctx.view.mode = null;
    ctx.view.error = null;
    window.scrollTo(0, 0);
    ctx.repaint();
  } catch (err) {
    console.error(err);
    ctx.view.error = "We couldn't file that claim. Please try again.";
    ctx.repaint();
  }
}

/* ------------------------------------------------------------ helpers ---- */

function statusPill(status) {
  return {
    // "Reviewing" everywhere — the pill, the tracker and the notice used to say
    // three different words for one stage. And an in-progress claim is not a
    // warning: only Denied gets an alarming tone.
    Intake: { label: 'Intake', tone: 'info', icon: 'clock', summary: 'We have it' },
    Processing: { label: 'Processing', tone: 'info', icon: 'clock', summary: 'Being worked on' },
    Reviewing: { label: 'Reviewing', tone: 'info', icon: 'clock', summary: 'Last stage before a decision' },
    Paid: { label: 'Paid', tone: 'success', icon: 'checkCircle', summary: 'Resolved and paid' },
    // Not "Tap to see why" — the whole row is already tappable, and the
    // instruction crowded out the one thing every sibling card puts here: what
    // state the claim is actually in.
    Denied: { label: 'Denied', tone: 'danger', icon: 'alert', summary: 'Not approved — see why' },
  }[status];
}

function stageDate(claim, stage) {
  const entry = (claim.statusHistory ?? []).find((s) => s.status === stage);
  return entry ? toDate(entry.timestamp) : null;
}

