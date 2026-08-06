// Notices — the insurer-to-member channel behind MyMailbox (docs/04 §MyMailbox).
//
// This module exists in Phase 1, before the features that use it, because event
// notices are written by the feature module that caused the event, inline in the
// same code path as its primary write. MyPayments, MyClaims, MyRewards and MyHealth
// all call in here; if it arrived with MyMailbox, all four would need retrofitting.
//
// Two classes of notice, and the distinction is load-bearing:
//
//   * EVENT notices record something that happened. They are written to Firestore
//     by writeNotice() below.
//   * CONDITION notices ("your premium is due soon") are DERIVED at render time by
//     attentionItems() and are never written. Persisting one produces the bug every
//     real portal has: a past-due warning still sitting there for a policy that was
//     paid ten minutes ago.

import { createNotice, serverTimestamp } from './data.js';
import { coverageStatus, formatDate, formatMoney, amountDue, parseYmd, startOfToday, daysBetween, PRODUCT_LABELS } from './format.js';

export const NOTICE_TYPES = [
  'paymentReceived',
  'paymentFailed',
  'claimStatus',
  'coverage',
  'rateNotice',
  'rewards',
  'welcome',
];

/**
 * Write an event notice. Always unread — firestore.rules rejects a client-created
 * notice with read: true, so a feature module cannot accidentally file something
 * the member never sees.
 */
export function writeNotice({ userId, type, subject, body, actionLabel = null, actionTarget = null, documentId = null }) {
  return createNotice({
    userId,
    type,
    subject,
    body,
    actionLabel,
    actionTarget,
    documentId,
    read: false,
    createdAt: serverTimestamp(),
  });
}

/* ------------------------------------------------------------------ events -- */

export function noticePaymentReceived({ userId, policy, amount, paidThroughDate }) {
  return writeNotice({
    userId,
    type: 'paymentReceived',
    subject: `Payment received — ${formatMoney(amount)}`,
    body:
      `Thank you. We received your ${formatMoney(amount)} payment for your ` +
      `${PRODUCT_LABELS[policy.product]} policy ${policy.policyNumber}.\n\n` +
      `Your coverage is now paid through ${formatDate(paidThroughDate)}.`,
    actionLabel: 'View your coverage',
    actionTarget: 'coverages',
  });
}

export function noticePaymentFailed({ userId, policy, amount }) {
  return writeNotice({
    userId,
    type: 'paymentFailed',
    subject: 'We could not process your payment',
    body:
      `Your ${formatMoney(amount)} payment for ${PRODUCT_LABELS[policy.product]} policy ` +
      `${policy.policyNumber} did not go through, because the card details did not match ` +
      `the card we have on file.\n\nNothing was charged. You can try again at any time.`,
    actionLabel: 'Try the payment again',
    actionTarget: 'payments',
  });
}

export function noticeClaimSubmitted({ userId, claim }) {
  return writeNotice({
    userId,
    type: 'claimStatus',
    subject: `We received claim ${claim.claimNumber}`,
    body:
      `Your claim is in intake, which means we have it and are getting it ready for ` +
      `review.\n\nYou can follow its progress at any time — we will send you a notice ` +
      `here each time it moves to a new stage.`,
    actionLabel: 'Track this claim',
    actionTarget: `claims/${claim.id}`,
  });
}

export function noticeClaimAdvanced({ userId, claim, status }) {
  const copy = {
    Processing: 'is now being processed. A claims specialist has picked it up.',
    Reviewing: 'is under review. This is the last stage before a decision.',
    Paid: 'has been paid.',
    Denied: 'has been denied.',
  }[status];
  return writeNotice({
    userId,
    type: 'claimStatus',
    subject: `Claim ${claim.claimNumber} is now ${status}`,
    body: `Your claim ${claim.claimNumber} ${copy}`,
    actionLabel: 'View the details',
    actionTarget: `claims/${claim.id}`,
  });
}

export function noticeRewardRedeemed({ userId, itemName, cost }) {
  return writeNotice({
    userId,
    type: 'rewards',
    subject: `You're enrolled in ${itemName}`,
    body:
      `You redeemed ${cost} points for ${itemName}. Look out for a welcome email with ` +
      `everything you need to get started.\n\nYour points balance has been updated.`,
    actionLabel: 'See your rewards',
    actionTarget: 'rewards',
  });
}

export function noticeOfferUnlocked({ userId, daysCompleted }) {
  return writeNotice({
    userId,
    type: 'coverage',
    subject: "You've unlocked a no-health-questions offer",
    body:
      `You've completed ${daysCompleted} of the last 100 days of daily challenges. That ` +
      `qualifies you to add Wellabe Hospital Indemnity coverage without answering any ` +
      `health questions.\n\nDemonstration only. Not an offer of insurance.`,
    actionLabel: 'See the offer',
    actionTarget: 'coverages/add',
  });
}

/* -------------------------------------------------------------- conditions -- */

/**
 * Derive the "Needs your attention" group. Never stored.
 *
 * Returns items in priority order, each with the shape the mailbox and the badge
 * both consume. Recomputed on every render, so it self-clears the moment the
 * underlying condition resolves.
 */
export function attentionItems({ policies = [], user, health, today = startOfToday() }) {
  const items = [];

  for (const policy of policies) {
    const status = coverageStatus(policy, today);
    const product = PRODUCT_LABELS[policy.product] ?? policy.product;

    if (status.key !== 'active') {
      const due = amountDue(policy, today);
      items.push({
        id: `pastdue-${policy.id}`,
        tone: 'danger',
        title: `Your ${product} coverage is ${status.label.toLowerCase()}`,
        body: `Pay ${formatMoney(due.amount)} to bring it back to active.`,
        actionLabel: `Pay ${formatMoney(due.amount)}`,
        actionTarget: `payments?policy=${policy.id}`,
      });
      continue;
    }

    const daysToDue = daysBetween(today, parseYmd(policy.paidThroughDate));
    if (daysToDue <= 30 && !policy.autopayEnabled) {
      items.push({
        id: `duesoon-${policy.id}`,
        tone: 'warning',
        title: `Your next ${product} premium is due soon`,
        body: `${formatMoney(policy.premiumAmount)} is due by ${formatDate(policy.paidThroughDate)}.`,
        actionLabel: 'Make a payment',
        actionTarget: `payments?policy=${policy.id}`,
      });
    }
  }

  const card = user?.cardOnFile;
  if (card) {
    const expiry = new Date(card.expYear, card.expMonth, 0);
    const daysLeft = daysBetween(today, expiry);
    if (daysLeft <= 60) {
      items.push({
        id: 'card-expiring',
        tone: 'warning',
        title: `The card ending in ${card.last4} expires soon`,
        body:
          daysLeft < 0
            ? 'It has already expired. Update it so your payments keep working.'
            : `It expires ${formatDate(expiry)}. Update it so your autopay doesn't stop.`,
        actionLabel: 'Update your card',
        actionTarget: 'payments',
      });
    }
  }

  if (health?.qualifiesForGuaranteedIssue) {
    const alreadyHas = policies.some((p) => p.product === 'hospitalIndemnity');
    if (!alreadyHas) {
      items.push({
        id: 'gi-offer',
        tone: 'accent',
        title: "You've unlocked a no-health-questions offer",
        body: `${health.challengeDaysCompletedInWindow} of your last 100 days had challenges completed.`,
        actionLabel: 'See the offer',
        actionTarget: 'coverages/add',
      });
    }
  }

  return items;
}

/** Resolve a notice's actionTarget into a relative href. Keeping the mapping in one
 *  place means a route rename is one edit, not a hunt through seed copy. */
export function resolveTarget(target, base = '') {
  if (!target) return null;
  const [route, rest] = [target.split('?')[0], target.includes('?') ? `?${target.split('?')[1]}` : ''];
  const [section, id] = route.split('/');
  const map = {
    coverages: 'pages/my-coverages.html',
    payments: 'pages/my-payments.html',
    claims: 'pages/my-claims.html',
    rewards: 'pages/my-rewards.html',
    health: 'pages/my-health.html',
    care: 'pages/my-care.html',
    information: 'pages/my-information.html',
    mailbox: 'pages/my-mailbox.html',
  };
  const page = map[section];
  if (!page) return null;
  if (section === 'coverages' && id === 'add') return `${base}${page}?add=1`;
  if (id) return `${base}${page}?id=${encodeURIComponent(id)}`;
  return `${base}${page}${rest}`;
}
