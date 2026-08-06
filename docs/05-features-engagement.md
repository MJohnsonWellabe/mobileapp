# 05 — Engagement Features: MyRewards, MyHealth, MyCare

Same review process as `docs/04-features-core.md`: build against real Firestore data,
verify each acceptance criterion by actually exercising it as the relevant seeded member,
then run the `visual-qa-reviewer` subagent per `docs/07-testing-and-visual-qa.md`.

These three sections are what make the brief's "opens the app multiple times a week"
goal realistic — a claims/payments app alone gives someone no reason to open it between
events. Build them with that in mind: they should feel genuinely engaging, not like a
compliance checkbox bolted onto an insurance app.

---

## MyRewards

Purpose: a points-based rewards store, modeled on the real-world pattern used by programs
like John Hancock's Vitality — points for healthy/engaged behavior, redeemable for
tangible perks, with both an earn side and a spend side visible.

**Balance & tier:** prominent current points balance and tier (Bronze/Silver/Gold, from
`rewardsAccounts`) at the top of the screen.

**Store:** a grid/list of redeemable items from `rewardsCatalog` (SilverSneakers, Weight
Watchers, Audible, gift card, etc.), each showing its point cost. Tapping an item the
member can afford opens a simple confirm step; on confirm:
- Deduct the cost from `pointsBalance`.
- Write a `rewardsTransactions` document (`type: "spend"`).
- Show a toast: **"You've been enrolled in [item name]!"** — this exact pattern from the
  brief, not a generic "success" message.
- Tapping an item the member **cannot** afford must be visibly disabled or must show a
  clear "not enough points" state — it must never be possible to redeem into a negative
  balance. Treat this as a hard rule, not just a UI nicety: the same check belongs in the
  write logic, not only in whether the button looks clickable.

**Earn more points:** a separate section listing articles/videos (from `rewardsCatalog`'s
earn-type items — content can be invented but must look specific and real, not
"Article 1") each showing its point value; "completing" one (a simple "Mark as Read/
Watched" action is sufficient — no real video player is required) credits points and logs
an `earn` transaction. Also show a standing note that a **policy anniversary bonus** is
one of the ways to earn points, even though it isn't a tap-to-complete action — this
should appear in the points history as a past `earn` transaction for members who've had
one (per seed data).

**History:** a combined, reverse-chronological list of `rewardsTransactions` (earned and
spent), each row showing amount, reason, and date, with a `+`/`-` visual distinction.

**Acceptance criteria**
- [ ] Redeeming an affordable item deducts points, logs the transaction, and shows the
  exact "You've been enrolled in X!" toast pattern.
- [ ] Attempting to redeem an item costing more than the current balance is blocked, both
  visually and in the underlying write logic — try it directly against a low-balance
  member (Dennis or April) as the test case.
- [ ] Completing an earn activity credits points and appears immediately in history.
- [ ] Todd (Gold tier, rich history) and Dennis (Bronze, sparse/unspent) both render
  correctly and look intentional at their respective ends of the spectrum — Dennis's
  screen should look like a designed "just getting started" state, not an empty/broken one.

---

## MyHealth

Purpose: an engagement hub that rewards daily healthy behavior with streaks, badges, and a
path to a real coverage benefit — modeled on the brief's daily-challenge system and on how
programs like Vitality connect health behavior to insurance outcomes.

**Tracker connection:** a simulated "Connect a fitness tracker" action (no real OAuth/
device integration — a believable fake connect flow ending in "Apple Health (connected)"
or similar is sufficient, per `healthProfiles.connectedTracker`).

**Daily challenges:** the 5 fixed challenge types from `docs/03-data-model-and-seed-data.md`
(5,000 steps · burn 400 calories · 10 flights of stairs · 10 minutes of activity · one
breathing/meditation session), shown as a checklist for "today," each completable with a
simple tap (no real sensor data — this is a prototype, marking a challenge complete is a
believable simulation, not a real measurement). Completing challenges contributes to that
day's streak credit.

**Streak:** a prominent current-streak display (ring or counter, per
`docs/01-design-system.md`), plus longest streak and earned badges. **Handle a broken
streak without shame** — this is a deliberate, evidence-based choice, not a style
preference: health-app research consistently finds that punitive framing after a missed
day drives people to abandon the habit rather than resume it, while a forgiving,
"welcome back" framing brings them back. April's seeded broken-streak state (0 current,
nonzero longest) is the test case — her screen should read as encouraging, not as a
scolding or a reset-to-zero shame moment.

**The 80/100 milestone:** track `challengeDaysCompletedInWindow` against the rolling
100-day window from the brief. At 80+, `qualifiesForGuaranteedIssue` becomes true and the
screen must surface a clear, specific, actionable callout: this member has qualified for
guaranteed-issue Hospital Indemnity coverage, with a next-step action into that
enrollment (can reuse the MyCoverages "Add More Coverage" flow, pre-filled and marked as
guaranteed-issue so the member understands they're not subject to normal underwriting for
this specific offer). Todd is the seeded test case — this must be visibly present and
actionable when logged in as Todd, not just present in the data.

**Points:** every completed challenge and every streak milestone credits points into the
same `rewardsAccounts`/`rewardsTransactions` system used by MyRewards — these two features
share one points ledger, they are not separate currencies.

**Acceptance criteria**
- [ ] All 5 daily challenges are completable and visibly update the day's progress and the
  streak.
- [ ] April's broken-streak state displays with encouraging, non-punitive framing, not a
  bare "0" with no context.
- [ ] Todd's 82/100 state shows the guaranteed-issue callout and it is actually clickable
  into a working (pre-filled, marked guaranteed-issue) enrollment start.
- [ ] Points earned here appear in MyRewards' history for the same member — verify this
  cross-feature link explicitly, it's an easy thing to accidentally build as two disconnected
  systems.
- [ ] Dennis's never-engaged state (no tracker connected, 0-day streak, never completed a
  challenge) renders as a clean, inviting "get started" state, not a broken-looking screen.

---

## MyCare

Purpose: let a member shop for care the way they'd shop for anything else — search by
service type, compare cost and quality, decide.

**Search:** a service-type picker/search (e.g., "Dentist," "Primary Care," "Physical
Therapy" — whatever types are seeded in `careProviders`) returning a results list from the
fake provider database.

**Results:** each provider shown as a card with name, service type, star rating, cost
estimate, and distance — sortable or at minimum clearly comparable at a glance (this is
explicitly meant to feel like shopping, not like a phone-book listing — star rating and
cost should be as visually prominent as the name).

**Detail:** tapping a provider shows a fuller detail view (address, phone, hours can be
invented plausibly) with a clear next action (e.g., "Request an Appointment," which for
this prototype can end in a simple confirmation rather than a real scheduling integration —
state that plainly in the copy).

**Acceptance criteria**
- [ ] Searching by at least two different service types returns distinct, plausible
  results from the seeded `careProviders` data.
- [ ] Cost and star rating are both visible without opening the detail view, for every
  result card.
- [ ] The detail view's next action works and its copy doesn't overpromise real scheduling.
- [ ] Eric (no other section-specific state to lean on) is a good test case for this
  section specifically looking polished and complete on its own.
