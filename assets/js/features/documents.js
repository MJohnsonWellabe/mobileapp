// Document rendering for MyMailbox.
//
// Documents are drawn from Firestore data, not stored as files. That keeps the
// no-build-step constraint intact (no PDF library), leaves storage.rules untouched,
// and still produces a real PDF when the member hits "Save or print", because
// window.print() against the print stylesheet goes through the OS print dialog.
//
// The bar here is the same as the ID card: this should look like a printed Wellabe
// artifact, not a table of fields. It is the other thing an ELT viewer will
// pinch-zoom into.

import { html, esc } from '../ui.js';
import { wellabeMark } from '../icons.js';
import { formatDate, PRODUCT_LABELS, SERVICE_NUMBER } from '../format.js';


export function renderDocument(doc, user) {
  const body = BODIES[doc.renderer]?.(doc.payload, user) ?? '';

  return html`<article class="doc">
    <header class="doc__letterhead">
      <span class="doc__mark" aria-hidden="true">${wellabeMark()}</span>
      <span class="doc__brand">wellabe</span>
      <span class="doc__origin">
        1200 Grand Avenue<br />Des Moines, IA 50309<br />${SERVICE_NUMBER}
      </span>
    </header>

    <div class="doc__addressee">
      <strong>${esc(user.firstName)}</strong><br />
      ${esc(user.address.street)}<br />
      ${esc(user.address.city)}, ${esc(user.address.state)} ${esc(user.address.zip)}
    </div>

    <div class="doc__meta">Issued ${formatDate(doc.issuedDate)}</div>
    <h1 class="doc__title">${esc(doc.title)}</h1>

    ${body}

    <footer class="doc__foot">
      <p>
        Questions about this document? Call us at ${SERVICE_NUMBER}, Monday to Friday,
        8:00 AM – 6:00 PM Central.
      </p>
      <p class="doc__fineprint">
        This is a demonstration document produced by a prototype application. It is not a
        contract, not evidence of coverage, and the information in it is fabricated.
      </p>
    </footer>
  </article>`;
}

const row = (label, value) =>
  html`<div class="doc__row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;

const BODIES = {
  welcomePacket: (p) => html`
    <p>Welcome to Wellabe. Your coverage is in place, and this packet confirms the details.</p>
    <div class="doc__table">
      ${row('Plan', p.planName)} ${row('Policy number', p.policyNumber)}
      ${row('Effective date', formatDate(p.effectiveDate))}
    </div>
    <p>
      Keep this for your records. You can view your ID card at any time in the Wellabe app
      under MyCoverages, and your full Outline of Coverage is filed alongside this document.
    </p>
    <p>
      If anything here looks wrong, call us. It is much easier to correct in the first
      thirty days than later.
    </p>
  `,

  outlineOfCoverage: (p) => html`
    <p>${esc(p.summary ?? '')}</p>
    <div class="doc__table">
      ${row('Plan', p.planName)} ${row('Policy number', p.policyNumber)}
      ${row('Effective date', formatDate(p.effectiveDate))}
    </div>
    <h2 class="doc__h2">What this policy covers</h2>
    <ul class="doc__list">
      ${String(p.covers ?? '')
        .split(' | ')
        .filter(Boolean)
        .map((line) => html`<li>${esc(line)}</li>`)}
    </ul>
    <p class="doc__fineprint">
      This outline summarises the policy. The policy itself sets out the exact terms,
      exclusions and limitations, and it governs if the two ever disagree.
    </p>
  `,

  premiumStatement: (p) => html`
    <p>Here is a summary of what you paid Wellabe for this plan in ${esc(p.statementYear)}.</p>
    <div class="doc__table">
      ${row('Plan', p.planName)} ${row('Policy number', p.policyNumber)}
      ${row('Premium', `${p.premiumAmount} ${p.frequency}`)}
      ${row(`Total paid in ${p.statementYear}`, p.annualTotal)}
    </div>
    <p>
      Premiums for this kind of coverage are not usually tax deductible, but your tax
      preparer may ask for this figure. Keep it with your records.
    </p>
  `,

  rateNotice: (p) => html`
    <p>
      Each year we review what it costs to provide your coverage. Your premium is changing
      as set out below. Nothing else about your coverage changes, and you do not need to do
      anything.
    </p>
    <div class="doc__table">
      ${row('Plan', p.planName)} ${row('Policy number', p.policyNumber)}
      ${row('Current premium', p.currentPremium)} ${row('New premium', p.newPremium)}
      ${row('Change', p.percentChange)} ${row('Effective', formatDate(p.effectiveDate))}
    </div>
    <p>
      If this makes the coverage hard to afford, call us before the change takes effect.
      There are usually options, and we would rather talk than have you go without.
    </p>
  `,

  claimSummary: (p) => html`
    <p>This is the record of how your claim was decided.</p>
    <div class="doc__table">
      ${row('Claim number', p.claimNumber)} ${row('Plan', p.planName)}
      ${row('Outcome', p.outcome)}
      ${p.amountPaid ? row('Amount paid', p.amountPaid) : ''}
      ${row('Decision date', formatDate(p.decisionDate))}
    </div>
    <p>
      If you disagree with this decision, you can ask us to look at it again from MyClaims
      in the app, or by calling the number below.
    </p>
  `,

  premiumTaxSummary: (p) => html`
    <div class="doc__table">
      ${row('Tax year', p.statementYear ?? p.year ?? '')}
      ${row('Total premiums paid', p.annualTotal ?? p.total ?? '')}
    </div>
    <p>Provide this to your tax preparer if they ask for it.</p>
  `,
};

export { PRODUCT_LABELS };
