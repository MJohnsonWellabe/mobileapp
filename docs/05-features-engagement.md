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

### Definitions (these numbers must mean exactly one thing everywhere in the app)

- **A credited day.** A calendar day (member's local date) counts as credited when
  `healthDailyLog[userId_date].challengesCompleted.length >= 3` — three or more of the
  five. Three is achievable on an ordinary day, not achievable by accident, and it makes
  "82 of 100" mean something. `dayCredited` is derived from the existing array; no new
  field, so `firestore.rules`' shape contract is untouched.
- **Current streak.** Consecutive credited days ending **today or yesterday**. If the most
  recent credited day is older than yesterday, `currentStreakDays` is 0 — a day still in
  progress never breaks a streak, so a member who opens the app in the morning is never
  told they lost it.
- **The 100-day window.** Credited days within `[today − 99 days, today]` inclusive.
  `qualifiesForGuaranteedIssue` is `challengeDaysCompletedInWindow >= 80`.

**Derivation, not storage.** `currentStreakDays`, `longestStreakDays`,
`challengeDaysCompletedInWindow`, and `qualifiesForGuaranteedIssue` are recomputed from
`healthDailyLog` every time MyHealth or the home dashboard loads, then written back to
`healthProfiles` so the admin console and the Home card read one consistent value. They are
never hand-set except by `seed.js`, which must compute them from the daily logs it just
wrote rather than assert them independently. `longestStreakDays` is rules-enforced
monotonic, so recompute uses `max(computed, stored)`.

### Points values

| Event | Points |
|---|---|
| Each daily challenge completed | **10** |
| Reaching a multiple of 7 on the current streak | **50** bonus |
| Crossing 80 credited days in the window (once ever) | **250** |

**Idempotency.** Challenges are toggleable until local midnight. Each challenge credits at
most once per day, enforced by a deterministic transaction ID
`rewardsTransactions/{userId}_{date}_{challengeId}`. Un-completing does not reverse the
points; re-completing does not re-credit them. `healthDailyLog.pointsEarned` must always
equal the sum of that day's `earn` transactions.

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

**The 80/100 milestone:** at 80+ credited days in the window, MyHealth and the home
dashboard surface a callout card.

**Do not use the phrase "guaranteed issue" in member-facing copy.** It has a specific
meaning in federal law for Medicare Supplement (42 U.S.C. § 1395ss), where it obliges an
insurer to sell at the best available rate and forbids denial. Here the trigger is five
self-attested taps a day — `docs/05` is explicit that marking a challenge complete is a
simulation, not a measurement — so an underwriting-minded person in the demo room will
reasonably ask what stops someone tapping five buttons for eighty days. The answer is not
to cut the feature; it is to not borrow a regulated term for it. The Firestore field name
`qualifiesForGuaranteedIssue` stays exactly as it is — it is an internal contract that
`firestore.rules` and the seed code against. Only the words on screen change.

Exact copy for the callout card:

> **You've unlocked a no-health-questions offer**
>
> You've completed 82 of the last 100 days of daily challenges. That qualifies you to add
> Wellabe Hospital Indemnity coverage without answering any health questions.
>
> *This offer is available through October 5, 2026.*
>
> **[ See the offer ]**
>
> <small>Demonstration only. Not an offer of insurance. Eligibility, availability, and
> terms vary by state.</small>

The expiry renders as `TODAY + 60 days`, computed at read time — no schema change, and it
keeps the offer from reading as an open-ended promise. The footnote is always visible, not
behind a tap. "See the offer" enters the MyCoverages Add More Coverage flow pre-filled,
with the health-questions section replaced by a confirmation band reading "No health
questions required — you qualified through MyHealth", and the resulting policy carries
`guaranteedIssue: true`.

The 250-point milestone bonus is credited once, the first time the callout is shown, and
appears in MyRewards history as "80-day challenge milestone". Todd is the seeded test case:
this must be visibly present and actionable when logged in as Todd, not merely present in
the data.

**Points:** every completed challenge and every streak milestone credits points into the
same `rewardsAccounts`/`rewardsTransactions` system used by MyRewards — these two features
share one points ledger, they are not separate currencies.

**Acceptance criteria**
- [ ] Completing 1 or 2 of today's challenges shows day progress ("2 of 5 today") but does
  **not** increment the streak. Completing the 3rd increments it by exactly 1. The 4th and
  5th do not increment it again.
- [ ] Un-completing and re-completing the same challenge on the same day produces exactly
  one `rewardsTransactions` document for it. Verify by counting documents, not by checking
  the balance.
- [ ] Every number shown for a member — streak, longest streak, days-in-window, points — is
  reproducible by recomputing from that member's `healthDailyLog`. Verify by hand for two
  members.
- [ ] The same streak value appears on the home dashboard Today card, on MyHealth, and in
  the admin console Health tab, with no refresh in between.
- [ ] **Re-run `seed.js`, then advance the system clock 30 days and reload.** Todd still
  shows 82 of 100 and the offer callout; Matt still shows a 45-day streak; April is still
  lapsed by two months. If any of these drift, a date was hardcoded.
- [ ] Todd's callout uses the "no health questions" copy above, shows a computed expiry date
  and the demonstration footnote, and opens a pre-filled enrollment flow.
- [ ] The phrase "guaranteed issue" appears nowhere in rendered member-facing text, while
  the `qualifiesForGuaranteedIssue` field name is unchanged.
- [ ] April's screen reads as encouraging: "Your longest streak was 14 days. Complete 3
  challenges today to start a new one." Never a bare 0, never "lost" or "broken".
- [ ] Points earned here appear in MyRewards' history for the same member — verify this
  cross-feature link explicitly, it's an easy thing to accidentally build as two
  disconnected systems.
- [ ] Dennis's never-engaged state shows the five challenges as an inviting, tappable
  checklist with "Complete any 3 today to start your streak" — not an empty-state
  illustration with nothing to do.

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
