// MyHealth domain actions, shared by the MyHealth screen and the home dashboard's
// Today card. Completing a challenge has to work identically in both places and
// credit the same ledger, so the logic lives here rather than in either screen.

import {
  setHealthLog,
  setHealthProfile,
  setRewardsTransaction,
  rewardsTransactionExists,
  setRewardsAccount,
  getRewardsAccount,
  serverTimestamp,
} from '../data.js';
import {
  DAILY_CHALLENGES,
  challengeForDate,
  deriveHealthStats,
  toYmd,
  startOfToday,
  tierFor,
  POINTS_PER_CHALLENGE,
  POINTS_STREAK_MILESTONE,
  POINTS_WINDOW_MILESTONE,
  WINDOW_QUALIFY_DAYS,
} from '../format.js';
import { noticeOfferUnlocked } from '../notices.js';

export { DAILY_CHALLENGES, challengeForDate };

/**
 * Toggle one of today's challenges and settle every consequence of it.
 *
 * Returns { stats, creditedPoints, newlyQualified } so the caller can render and
 * toast without re-deriving anything.
 *
 * Idempotency is the subtle part. Points are credited through a deterministic
 * document ID, `{userId}_{date}_{challengeId}`, so a member who toggles the same
 * challenge off and on all afternoon is credited exactly once. Un-completing does
 * not claw points back — reversing a reward for a habit is precisely the punitive
 * framing docs/05 rules out.
 */
export async function toggleChallenge({ userId, challengeId, logsByDate, profile }) {
  const today = startOfToday();
  const date = toYmd(today);
  const current = logsByDate[date]?.challengesCompleted ?? [];
  const isOn = current.includes(challengeId);
  const next = isOn ? current.filter((c) => c !== challengeId) : [...current, challengeId];

  await setHealthLog(userId, date, {
    challengesCompleted: next,
    pointsEarned: next.length * POINTS_PER_CHALLENGE,
  });

  const logs = { ...logsByDate, [date]: { userId, date, challengesCompleted: next } };
  const stats = deriveHealthStats(logs, today);

  let creditedPoints = 0;
  if (!isOn) {
    creditedPoints += await creditOnce({
      userId,
      txId: `${userId}_${date}_${challengeId}`,
      amount: POINTS_PER_CHALLENGE,
      reason: `Daily challenge: ${DAILY_CHALLENGES.find((c) => c.id === challengeId)?.label ?? challengeId}`,
    });

    if (stats.currentStreakDays > 0 && stats.currentStreakDays % 7 === 0) {
      creditedPoints += await creditOnce({
        userId,
        txId: `${userId}_streak_${stats.currentStreakDays}`,
        amount: POINTS_STREAK_MILESTONE,
        reason: `${stats.currentStreakDays}-day streak milestone`,
      });
    }
  }

  // The 80/100 milestone: credited once, ever, and it also files the notice that
  // makes the offer findable later from MyMailbox rather than only in the moment.
  const newlyQualified =
    stats.qualifiesForGuaranteedIssue && !profile?.qualifiesForGuaranteedIssue;
  if (newlyQualified) {
    creditedPoints += await creditOnce({
      userId,
      txId: `${userId}_window_${WINDOW_QUALIFY_DAYS}`,
      amount: POINTS_WINDOW_MILESTONE,
      reason: '80-day challenge milestone',
    });
    await noticeOfferUnlocked({ userId, daysCompleted: stats.challengeDaysCompletedInWindow });
  }

  await persistStats({ userId, stats, profile, offerShown: newlyQualified || profile?.guaranteedIssueOfferShown });

  return { stats, creditedPoints, newlyQualified, completed: next };
}

/** Write the derived numbers back so the admin console and the Home card read the
 *  same values the member is looking at. longestStreakDays is rules-enforced
 *  monotonic, so never send it backwards. */
export async function persistStats({ userId, stats, profile, offerShown }) {
  await setHealthProfile(userId, {
    userId,
    currentStreakDays: stats.currentStreakDays,
    longestStreakDays: Math.max(stats.longestStreakDays, profile?.longestStreakDays ?? 0),
    badges: profile?.badges ?? [],
    challengeDaysCompletedInWindow: stats.challengeDaysCompletedInWindow,
    qualifiesForGuaranteedIssue: stats.qualifiesForGuaranteedIssue,
    guaranteedIssueOfferShown: Boolean(offerShown),
    connectedTracker: profile?.connectedTracker ?? null,
  });
}

export async function connectTracker(userId, profile, trackerName) {
  await setHealthProfile(userId, { ...profile, userId, connectedTracker: trackerName });
}

/** Credit points under a fixed transaction ID, once. Returns what was actually
 *  credited so the caller can tell the member the truth. */
async function creditOnce({ userId, txId, amount, reason }) {
  if (await rewardsTransactionExists(txId)) return 0;

  await setRewardsTransaction(txId, {
    userId,
    type: 'earn',
    amount,
    reason,
    timestamp: serverTimestamp(),
  });

  const account = (await getRewardsAccount(userId)) ?? { pointsBalance: 0, lifetimePointsEarned: 0 };
  const lifetime = (account.lifetimePointsEarned ?? 0) + amount;
  await setRewardsAccount(userId, {
    userId,
    pointsBalance: (account.pointsBalance ?? 0) + amount,
    lifetimePointsEarned: lifetime,
    tier: tierFor(lifetime),
  });
  return amount;
}
