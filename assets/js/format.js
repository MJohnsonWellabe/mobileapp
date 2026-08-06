// Formatting and small domain rules shared by every screen.
//
// Nothing here touches Firestore. Keeping it framework- and SDK-free means the
// seed data builder can import the same date maths the app uses, so the two can
// never drift.

/* ============================================================ dates ======== */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Parse a YYYY-MM-DD string as a LOCAL date, not UTC.
 *  `new Date('2026-03-12')` parses as UTC midnight and then renders as the 11th
 *  for anyone west of Greenwich — which is everyone in this app's audience. */
export function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Add months, clamping to the end of the target month so Jan 31 + 1 lands on
 *  Feb 28 rather than rolling into March. */
export function addMonths(date, months) {
  const d = new Date(date);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return d;
}

/** Whole months from `from` to `to`, positive when `to` is later. */
export function monthsBetween(from, to) {
  const a = from instanceof Date ? from : parseYmd(from);
  const b = to instanceof Date ? to : parseYmd(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

export function daysBetween(from, to) {
  const a = from instanceof Date ? from : parseYmd(from);
  const b = to instanceof Date ? to : parseYmd(to);
  return Math.round((b - a) / 86400000);
}

/** "March 12, 2026" — always written in full. Never 3/12/26, never "3d ago".
 *  docs/01-design-system.md is explicit about this and it matters for this audience. */
export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  let h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${formatDate(d)} at ${h}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

/** Accepts a Date, a YYYY-MM-DD string, or a Firestore Timestamp. */
export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') return parseYmd(value);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

/* ========================================================== numbers ======== */

export function formatMoney(amount) {
  return `$${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPoints(n) {
  return Number(n).toLocaleString('en-US');
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many ?? one + 's'}`;
}

/* ===================================================== coverage state ====== */

export const PERIOD_MONTHS = { monthly: 1, quarterly: 3, annual: 12 };

export const PRODUCT_LABELS = {
  medSupp: 'Medicare Supplement',
  hospitalIndemnity: 'Hospital Indemnity',
  dental: 'Dental',
  shortTermCare: 'Short-Term Care',
  criticalIllness: 'Critical Illness',
  preneed: 'Preneed',
};

/**
 * THE single source of truth for what a coverage status pill says, everywhere in
 * the app — member screens, home dashboard, and admin console alike
 * (docs/03-data-model-and-seed-data.md).
 *
 * Derived from paidThroughDate, never from the stored `status` field. Two sources
 * would visibly disagree: pay as April, open the admin console, and one surface
 * would read Active while the other still read Lapsed. Deriving is also the safe
 * direction, since firestore.rules enforces paidThroughDate as monotonic.
 */
export function coverageStatus(policy, today = startOfToday()) {
  const paidThrough = parseYmd(policy.paidThroughDate);
  if (paidThrough >= today) return { key: 'active', label: 'Active', tone: 'success' };
  if (daysBetween(paidThrough, today) <= 31)
    return { key: 'pastDue', label: 'Past due', tone: 'warning' };
  return { key: 'lapsed', label: 'Lapsed', tone: 'danger' };
}

/** The `status` value to store alongside a paidThroughDate write. The rules only
 *  accept "active" | "lapsed", so "past due" collapses into "lapsed" on disk while
 *  staying a distinct pill on screen. */
export function storedStatusFor(paidThroughDate, today = startOfToday()) {
  return parseYmd(paidThroughDate) >= today ? 'active' : 'lapsed';
}

/**
 * Premium periods owed as of today, and what that costs.
 *
 * `periodsOwed` is at least 1 and always enough to land the new paid-through date
 * strictly in the future — which is what makes "paying as April restores her policy
 * to Active" reachable. Advancing by a single period, as an earlier draft of docs/04
 * specified, leaves a two-month-lapsed policy still in the past: the app would show
 * "Payment successful" above a red pill.
 */
export function amountDue(policy, today = startOfToday()) {
  const periodMonths = PERIOD_MONTHS[policy.premiumFrequency];
  const monthsBehind = monthsBetween(policy.paidThroughDate, today);
  const periodsOwed = Math.max(1, Math.floor(monthsBehind / periodMonths) + 1);
  return {
    periodMonths,
    periodsOwed,
    amount: round2(periodsOwed * policy.premiumAmount),
    onePeriod: round2(policy.premiumAmount),
  };
}

/** Where a payment of `amountPaid` moves the paid-through date. Anchored on the
 *  existing paidThroughDate, never on today, so catching up on arrears restores
 *  continuous coverage instead of leaving a gap. */
export function paidThroughAfter(policy, amountPaid) {
  const periodsPaid = Math.floor(round2(amountPaid) / policy.premiumAmount + 1e-9);
  if (periodsPaid < 1) return null;
  return toYmd(
    addMonths(parseYmd(policy.paidThroughDate), periodsPaid * PERIOD_MONTHS[policy.premiumFrequency]),
  );
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/* ============================================================ health ======= */

export const DAILY_CHALLENGES = [
  { id: 'steps5k', label: '5,000 steps', detail: 'A walk around the block counts.' },
  { id: 'calories400', label: 'Burn 400 calories', detail: 'Any activity that gets you moving.' },
  { id: 'stairs10', label: 'Climb 10 flights of stairs', detail: 'Or the equivalent incline.' },
  { id: 'activity10min', label: '10 minutes of activity', detail: 'Gardening and housework count.' },
  { id: 'mindfulness', label: 'One breathing or meditation session', detail: 'Even two minutes helps.' },
];

/** One challenge is assigned per calendar day, rotating through the 5 fixed
 *  types — not a checklist of all five (product owner correction; see
 *  DECISIONS-LOG.md). Pure function of the date, so it never needs storing:
 *  every member sees the same challenge on the same day, and a re-seed or a
 *  reload can never disagree with what was shown earlier. */
export function challengeForDate(date) {
  const days = daysBetween('1970-01-01', date);
  const index = ((days % DAILY_CHALLENGES.length) + DAILY_CHALLENGES.length) % DAILY_CHALLENGES.length;
  return DAILY_CHALLENGES[index];
}

/** A day counts toward a streak at ONE completed challenge. Low bar on purpose:
 *  showing up is the habit, and the surest way to lose a member on a bad day is to
 *  tell them the day didn't count (docs/05-features-engagement.md). */
export const CREDITED_DAY_THRESHOLD = 1;
export const POINTS_PER_CHALLENGE = 10;
export const POINTS_STREAK_MILESTONE = 50;
export const POINTS_WINDOW_MILESTONE = 250;
export const WINDOW_DAYS = 100;
export const WINDOW_QUALIFY_DAYS = 80;

export function isCreditedDay(log) {
  return (log?.challengesCompleted?.length ?? 0) >= CREDITED_DAY_THRESHOLD;
}

/**
 * Recompute every derived health number from the daily logs.
 *
 * These are derived on every load rather than trusted from storage, so the Home
 * card, MyHealth, and the admin console cannot disagree. `logsByDate` is a map of
 * YYYY-MM-DD to a healthDailyLog document.
 */
export function deriveHealthStats(logsByDate, today = startOfToday()) {
  const credited = new Set(
    Object.entries(logsByDate)
      .filter(([, log]) => isCreditedDay(log))
      .map(([date]) => date),
  );

  // A day still in progress never breaks a streak, so the walk starts at whichever
  // of today/yesterday is credited. Someone who opens the app before doing today's
  // challenges is never told they lost the streak.
  let cursor = credited.has(toYmd(today))
    ? today
    : credited.has(toYmd(addDays(today, -1)))
      ? addDays(today, -1)
      : null;

  let currentStreakDays = 0;
  while (cursor && credited.has(toYmd(cursor))) {
    currentStreakDays += 1;
    cursor = addDays(cursor, -1);
  }

  // Longest run anywhere in the log.
  let longestStreakDays = 0;
  let run = 0;
  const sorted = [...credited].sort();
  let previous = null;
  for (const date of sorted) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, run);
    previous = date;
  }

  const windowStart = addDays(today, -(WINDOW_DAYS - 1));
  const challengeDaysCompletedInWindow = [...credited].filter((date) => {
    const d = parseYmd(date);
    return d >= windowStart && d <= today;
  }).length;

  return {
    currentStreakDays,
    longestStreakDays: Math.max(longestStreakDays, currentStreakDays),
    challengeDaysCompletedInWindow,
    qualifiesForGuaranteedIssue: challengeDaysCompletedInWindow >= WINDOW_QUALIFY_DAYS,
  };
}

export function tierFor(lifetimePointsEarned) {
  if (lifetimePointsEarned >= 5000) return 'Gold';
  if (lifetimePointsEarned >= 2000) return 'Silver';
  return 'Bronze';
}

/* ============================================================= text ======== */

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export function titleCase(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
