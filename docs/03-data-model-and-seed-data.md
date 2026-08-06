# 03 — Data Model & Seed Data

## Firestore collections

All documents include a `userId` field pointing at the owning member's `users/{userId}`
document (except where noted). Field names below are the contract feature modules code
against — keep them exact.

### `users/{userId}`

| Field | Type | Notes |
|---|---|---|
| `firstName` | string | Also the login username, display name |
| `usernameLower` | string | `firstName` lowercased — what login actually queries against |
| `role` | `"member"` \| `"admin"` | |
| `gender` | string | Editable only via a "request a change" flow, never a plain field edit — see `docs/04-features-core.md` §MyInformation |
| `dob` | string (`YYYY-MM-DD`) | Same restriction as `gender` |
| `email` | string | Freely editable |
| `phone` | string | Freely editable |
| `preferredContactMethod` | `"email"` \| `"phone"` \| `"mail"` | Freely editable |
| `address` | object `{street, city, state, zip}` | Freely editable |
| `cardOnFile` | object `{brand, last4, expMonth, expYear}` \| `null` | Used by MyPayments' card-match check |
| `bankAccountOnFile` | object `{bankName, last4}` \| `null` | Used for autopay setup |
| `deliveryPreferences` | object | Four keys — `bills`, `claims`, `policy`, `rewards` — each `{paper: boolean, email: boolean}`. Backs MyMailbox's delivery preferences. Every `paper` seeds to `true`; see `docs/04` §MyMailbox for why paper is opt-out, never opt-in |
| `createdAt` | timestamp | |

The `admin` user document has `role: "admin"` and otherwise minimal/empty personal fields
— the admin console never needs to display "admin's" own personal info.

### `policies/{policyId}`

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `product` | `"medSupp"` \| `"hospitalIndemnity"` \| `"dental"` \| `"shortTermCare"` \| `"criticalIllness"` \| `"preneed"` | |
| `planName` | string | e.g. "Medicare Supplement Plan G" |
| `policyNumber` | string | Fake but formatted realistically, e.g. `WLB-MS-104829` |
| `status` | `"active"` \| `"lapsed"` | |
| `effectiveDate` | string (`YYYY-MM-DD`) | |
| `paidThroughDate` | string (`YYYY-MM-DD`) | Drives the status pill on MyCoverages and the home dashboard |
| `premiumAmount` | number | |
| `premiumFrequency` | `"monthly"` \| `"quarterly"` \| `"annual"` | |
| `autopayEnabled` | boolean | |
| `coverageSummary` | string | 1–2 plain-language sentences on what it covers — this is member-facing copy, write it well |
| `whatItCovers` | array of strings | Bullet list for the coverage detail screen |
| `guaranteedIssue` | boolean | Optional. Set on a policy created through the MyHealth no-health-questions offer |

#### Coverage status has exactly one source of truth: `paidThroughDate`

A single shared helper, `coverageStatus(policy)`, is the **only** thing anywhere in the app
— member screens, home dashboard, and admin console alike — that decides what a coverage
status pill says:

| Condition | Pill label | Token |
|---|---|---|
| `paidThroughDate >= today` | **Active** | `--color-success` |
| `today − 31d <= paidThroughDate < today` | **Past due** | `--color-warning` |
| `paidThroughDate < today − 31d` | **Lapsed** | `--color-danger` |

The stored `status` field stays in the schema — `firestore.rules` validates its enum — but
it is **display-irrelevant**. Any write that moves `paidThroughDate` must set `status` in
the same write (`"active"` when `paidThroughDate >= today`, otherwise `"lapsed"`). No screen
may read `status` to render a pill.

Without this rule the app has two sources of truth for the single most important fact on
the screen, and they will visibly disagree: pay as April, then open the admin console, and
one surface says Active while the other still says Lapsed. Deriving from `paidThroughDate`
is also the safe direction, because `firestore.rules` already enforces that field as
monotonic.

### `payments/{paymentId}`

| Field | Type | Notes |
|---|---|---|
| `userId`, `policyId` | string | |
| `amount` | number | |
| `method` | `"card"` \| `"bank"` | |
| `last4` | string | Must match `users/{userId}.cardOnFile.last4` for a card payment to succeed — this is the acceptance criterion in `docs/04` |
| `status` | `"success"` \| `"failed"` | |
| `resultingPaidThroughDate` | string \| null | Only set on success |
| `timestamp` | timestamp | |

### `claims/{claimId}`

| Field | Type | Notes |
|---|---|---|
| `userId`, `policyId`, `product` | | |
| `claimNumber` | string | e.g. `CLM-2026-00417` |
| `description` | string | Member-entered at submission |
| `photoUrl` | string | Cloud Storage download URL |
| `status` | `"Intake"` \| `"Processing"` \| `"Reviewing"` \| `"Paid"` \| `"Denied"` | Must move forward in this order only — a claim cannot skip a stage |
| `statusHistory` | array of `{status, timestamp}` | Powers the tracker UI |
| `deniedReason` | string \| null | Required, plain-language, whenever `status === "Denied"` — see acceptance criteria in `docs/04` |
| `paidAmount` | number \| null | Set when `status === "Paid"` |
| `submittedAt` | timestamp | |

### `rewardsAccounts/{userId}`

| Field | Type | Notes |
|---|---|---|
| `pointsBalance` | number | Never allowed to go negative — enforced client-side *and* in `firestore.rules` |
| `tier` | `"Bronze"` \| `"Silver"` \| `"Gold"` | Derived from lifetime points earned, not current balance |
| `lifetimePointsEarned` | number | Optional. The running total `tier` derives from — without it, tier can't be recomputed after a redemption drops the balance |

### `rewardsTransactions/{txId}`

| Field | Type | Notes |
|---|---|---|
| `userId` | | |
| `type` | `"earn"` \| `"spend"` | |
| `amount` | number | |
| `reason` | string | e.g. "Watched: Understanding Your Medicare Supplement Plan", "Redeemed: SilverSneakers Membership", "Policy anniversary bonus" |
| `timestamp` | timestamp | |

### `rewardsCatalog/{itemId}` (shared, not per-user)

Seed with at least: SilverSneakers Membership, Weight Watchers Membership, Audible
Membership, a $25 gift card option, and 3–4 "earn more points" activities (articles/videos)
each with a fixed point value and placeholder title/thumbnail — content can be invented,
it just needs to look real and specific, not "Article 1."

### `healthProfiles/{userId}`

| Field | Type | Notes |
|---|---|---|
| `currentStreakDays` | number | |
| `longestStreakDays` | number | |
| `badges` | array of strings | e.g. `"7-Day Streak"`, `"First 5K Steps"` |
| `challengeDaysCompletedInWindow` | number | Out of the rolling 100-day window described in the brief |
| `qualifiesForGuaranteedIssue` | boolean | True once `challengeDaysCompletedInWindow >= 80` |
| `guaranteedIssueOfferShown` | boolean | Whether the offer UI has been surfaced |
| `connectedTracker` | string \| null | Fake device name, e.g. `"Apple Health (connected)"` |

### `healthDailyLog/{userId}_{date}`

| Field | Type | Notes |
|---|---|---|
| `userId`, `date` | | |
| `challengesCompleted` | array of 0 or 1 challenge IDs | The single challenge assigned to that calendar date, if completed — never more than one entry (product owner correction; see `DECISIONS-LOG.md`) |
| `pointsEarned` | number | `0` or `POINTS_PER_CHALLENGE` (10) |

Daily challenge catalog (static, same 5 for everyone): 5,000 steps · Burn 400 calories ·
Climb 10 flights of stairs · 10 minutes of activity · One breathing/meditation session.
Exactly **one** of the five is assigned per calendar day — not a checklist of all five —
rotating deterministically by date (`challengeForDate()` in `format.js`, the same function
the app and the seeder both call, so neither can disagree about which challenge a given
date carries). Every member sees the same challenge on the same day.

### `careProviders/{providerId}` (shared, not per-user)

| Field | Type | Notes |
|---|---|---|
| `name`, `serviceType` (e.g. `"Dentist"`, `"Primary Care"`, `"Physical Therapy"`) | | |
| `city`, `state` | | |
| `costEstimate` | number | Displayed as "$" range or dollar figure per the feature spec |
| `starRating` | number (1–5, one decimal) | |
| `distanceMiles` | number | Fake but plausible |

Seed at least 4–5 providers per service type across a handful of service types so a search
returns a believable result set, not one item.

### `changeRequests/{requestId}`

Backs the MyInformation "Start a Request" flow for gender and DOB (`docs/04` requires the
action to log a request record but doesn't name a collection). Append-only.

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `field` | `"gender"` \| `"dob"` | Enforced in rules — this collection can only ever be about these two fields |
| `currentValue` | string | May be empty |
| `requestedValue` | string | |
| `status` | `"open"` \| `"closed"` | Client writes are forced to `"open"`; only seed mode can write `"closed"` |
| `note` | string \| null | Optional member-entered context |
| `submittedAt` | timestamp | |

### `notices/{noticeId}`

Backs MyMailbox's Notices tab (`docs/04` §MyMailbox). Written by whichever feature module
caused the event, in the same code path as its primary write.

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `type` | `"paymentReceived"` \| `"paymentFailed"` \| `"claimStatus"` \| `"coverage"` \| `"rateNotice"` \| `"rewards"` \| `"welcome"` | |
| `subject` | string (≤80) | Plain language, second person |
| `body` | string (≤600) | Two to four short paragraphs |
| `actionLabel` | string \| null | e.g. "Pay $128.40 now" |
| `actionTarget` | string \| null | In-app route, e.g. `claims/claim-debbie-ci` |
| `documentId` | string \| null | Links to a `documents` doc when one exists |
| `read` | boolean | Client writes may only flip this false → true |
| `createdAt` | timestamp | |

### `documents/{documentId}`

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `policyId` | string \| null | |
| `category` | `"policy"` \| `"statement"` \| `"claim"` \| `"notice"` \| `"tax"` | |
| `title` | string (≤120) | e.g. "2025 Premium Statement — Medicare Supplement Plan G" |
| `renderer` | `"welcomePacket"` \| `"outlineOfCoverage"` \| `"premiumStatement"` \| `"claimSummary"` \| `"rateNotice"` \| `"premiumTaxSummary"` | Which layout the viewer draws |
| `payload` | map | The values that renderer prints |
| `issuedDate` | string (`YYYY-MM-DD`) | |
| `createdAt` | timestamp | |

Documents are **rendered from this data, never stored as binary files** — no PDF library, no
build step, and `storage.rules` stays untouched. "Save or print" calls `window.print()`
against a print stylesheet.

### `messageThreads/{threadId}`

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `topic` | `"billing"` \| `"claims"` \| `"coverage"` \| `"other"` | |
| `subject` | string (≤120) | |
| `relatedTo` | map `{section, id}` \| null | What the member was looking at when they asked |
| `status` | `"open"` \| `"answered"` \| `"closed"` | |
| `messages` | array of `{from: "member"\|"wellabe", body, sentAt}` | |
| `autoAckedAt` | timestamp \| null | Drives the "Received …" receipt line |
| `lastMessageAt` | timestamp | |
| `unreadByMember` | boolean | |

### `_config/seed` — not app data

A single administrative document that gates the seeding of everything above. No client can
read or write it; only the Firebase console can. `seed.js` needs to perform writes the app
itself must never perform (creating member documents, opening a claim already at "Paid",
writing the shared `rewardsCatalog` and `careProviders` collections), and since `seed.js`
is a browser script with the same zero privileges as the app, the rules cannot tell the two
apart. This flag is how they're distinguished. Fields: `enabled` (boolean) and `expiresAt`
(timestamp, so a flag left on closes itself). Operating procedure is in
`setup/FIREBASE-SETUP.md` §7.

## Why this shape, briefly

Payments, claims, and rewards transactions are each their own top-level collection (rather
than nested under `users`) because the admin console (`docs/06-admin-console.md`) needs to
show "all payments across all members," "all claims across all members," etc. as flat,
sortable views — nesting would make that harder for no benefit at this scale.

## Every seeded date is relative to the seed run, never hardcoded

`seed.js` computes `const TODAY = startOfDay(new Date())` once and derives **every** date
and timestamp it writes as an offset from it. A literal date string in `seed.js` is a bug.

The reason is direct. Seeding happens days or weeks before the ELT demo. With hardcoded
dates, Todd's rolling 100-day window slides past his 82 credited days and the
no-health-questions offer — the one thing this doc says "must be visibly actionable" —
silently disappears; every streak in the app reads 0 because the last credited day is weeks
old; and April's lapse is a different size than the payment math expects. It is the failure
mode nobody catches, because the day you seed is the day you test. Re-running `seed.js` on
the morning of the demo must reproduce the same *demo state*, not the same *literal values*
— still idempotent, because the document IDs are fixed.

| Member | `healthDailyLog` seeding | Coverage dates |
|---|---|---|
| **Todd** | 82 credited days (each day's one assigned challenge, per `challengeForDate()`) across `TODAY−99 … TODAY−1`, as five runs separated by four gaps totalling 17 uncredited days. **`TODAY` itself is left empty**, so a presenter can complete a challenge live and watch 82 become 83 | active |
| **Matt** | 45 consecutive credited days ending `TODAY−1` | both active |
| **Debbie** | 20 consecutive credited days ending `TODAY−1` | active |
| **Dave** | 12 consecutive credited days ending `TODAY−1` | `effectiveDate = TODAY − 6 years` |
| **Sara** | 3 consecutive credited days ending `TODAY−1` | `effectiveDate = TODAY − 4 months` |
| **April** | 14 consecutive credited days ending `TODAY−40`, giving current 0 / longest 14 | **`paidThroughDate = addMonths(TODAY, −2)`**, `premiumFrequency: "monthly"` |
| **Eric**, **Dennis** | none | active |

Claim numbers use the seed-run year: `CLM-{TODAY.year}-NNNNN`. Payment history spans
`TODAY − 4 months … TODAY`.

April's two-month lapse is not arbitrary — it makes `periodsOwed` exactly 3 under the
MyPayments formula in `docs/04`, so paying the preselected amount lands her paid-through
date one month into the future and her policy genuinely returns to Active. Change one and
you must change the other.

Volume note: this is roughly 165 `healthDailyLog` documents plus payment and rewards
history. Per the individual-`setDoc()` constraint below, chunk them with `Promise.all` in
batches of about 25 rather than one flat `Promise.all` over several hundred writes.

## Seed data: the 8 members

Seed these deliberately unevenly, per the brief, so the ELT collectively sees the whole
app across their 8 logins. Each row below is the *primary* state to seed; add the
supporting `payments`/`claims`/`rewardsTransactions`/`healthDailyLog` documents needed to
make that state true and give each member 2–4 months of plausible history, not just a
single current snapshot.

| Member | Primary product | Coverage state | Claims | Payments | Rewards | Health | Notes |
|---|---|---|---|---|---|---|---|
| **Dave** | Medicare Supplement (Plan G) | Active, long-tenured (5+ yr effective date) | None yet | Current, autopay on | Mid-range balance, Silver tier | Steady but modest streak (~12 days) | Good "Add More Coverage → Dental" upsell candidate — leave dental un-enrolled on purpose |
| **Sara** | Hospital Indemnity | Active, recently enrolled (effective this year) | One claim, status **Processing** | Current, manual card payments | Low balance, Bronze tier, has unread "earn more points" activities available | New, short streak (~3 days), tracker just connected | Good state for demoing the claims tracker mid-journey |
| **Eric** | Dental | Active | None | Current, autopay on | Mid balance, Silver tier | No tracker connected yet | Good state for demoing MyCare provider search fresh (dentist search) |
| **April** | Short-Term Care | **Lapsed** (paid-through date in the past) | None | One **failed** payment on record (card mismatch), currently past due | Small balance | Streak broken (0 days, had a past streak) — non-punitive framing per `docs/05` | Good state for demoing the past-due/lapsed status pill and a payment retry flow |
| **Debbie** | Critical Illness | Active | One claim, status **Denied**, with a plain-language `deniedReason` and next-step info | Current | Mid balance, Silver tier | Steady streak (~20 days) | Good state for demoing the denial path — see acceptance criteria in `docs/04-features-core.md` §MyClaims |
| **Dennis** | Preneed | Active, long-tenured | None | Current, manual, infrequent app opens implied by sparse history | Small balance, mostly unspent, Bronze tier | No tracker connected, 0-day streak, never engaged | Deliberately the "low digital engagement" member — every relevant empty state (health, rewards activity) should look designed, not broken, when viewed as Dennis |
| **Todd** | Medicare Supplement (Plan N) | Active | One claim, status **Paid** (fully resolved, good "happy path" example) | Current, autopay on | High balance, Gold tier, rich earn/spend history | **82/100 days completed**, `qualifiesForGuaranteedIssue: true`, offer already surfaced | This is "someone in this state" from the brief — the guaranteed-issue Hospital Indemnity offer must be visibly actionable when logged in as Todd |
| **Matt** | Dental **and** Hospital Indemnity (two active policies) | Both active | Two claims: one **Paid**, one **Reviewing** | Current on both, mixed card/autopay | Highest balance, Gold tier | Strong streak (~45 days), several badges | Demonstrates a multi-policy member and a fuller claims history/list view |

Give every member a complete `users/{userId}` document including a valid `cardOnFile`, so
the MyPayments card-match acceptance criterion in `docs/04-features-core.md` is testable
for each of them.

**April included.** An earlier draft of this doc excepted her, but `docs/04` requires that
paying successfully as April restores her policy to Active — which needs a card that
matches. Her demo state comes from a seeded historical **failed** payment, and the
mismatch is demonstrated live by typing the wrong digits into the form. Omitting her card
would leave nothing to mismatch against and make her acceptance criterion unreachable.

### MyMailbox seed additions

Every member gets a `welcome` notice, a Welcome Packet document, an Outline of Coverage per
policy, and a premium statement per policy year. On top of that:

| Member | Additional notices | Additional documents | Threads |
|---|---|---|---|
| **Dave**, **Todd** | `rateNotice` (the annual rate-adjustment letter is the most common real Medigap mailing) | matching rate-notice document | — |
| **April** | `paymentFailed`, dated to her failed payment | — | — |
| **Sara** | `claimStatus` | — | — |
| **Debbie** | `claimStatus` | claim summary | a two-message thread about her denied claim, with a real Wellabe reply |
| **Todd** | `coverage` (the no-health-questions offer) | claim summary | — |
| **Matt** | two `claimStatus` | two claim summaries | — |
| **Dennis** | none — exactly one notice and two documents in total | — | — |

Dennis's deliberately sparse mailbox is the test case for the "You're all caught up" state.
Every member's `deliveryPreferences` seeds with all four `paper` flags **true**.

## Seed data: admin

One `users/{userId}` document with `usernameLower: "admin"`, `role: "admin"`. Login
credential is the literal string `wellabe`, matched case-insensitively, same mechanism as
member logins (see `docs/02-architecture.md`'s Auth section for why this is intentionally
simple).

## `seed.js` — the loader

Write one idempotent script (`assets/js/seed.js`) that writes all of the above in one run,
safe to re-run without duplicating documents (use fixed, predictable document IDs like
`user-dave`, `policy-dave-medsupp`, rather than auto-generated IDs, specifically so re-runs
overwrite cleanly). This is a dev tool run manually from a local console/browser page —
it is never linked from the live member-facing app.

Three constraints the security rules impose on how it must be written:

- **Use individual `setDoc()` calls, never `writeBatch()` or `runTransaction()`.** A
  single-document write gets a budget of 10 document access calls; an entire batch or
  transaction shares a budget of **20 across all of its documents**. The seed-mode check
  costs up to 4 access calls, so a large batch would blow the budget and fail wholesale.
  Chunked `Promise.all` over individual writes is the correct shape. (The app itself may
  batch freely — the seed check short-circuits away on the normal path and costs nothing.)
- **`_config/seed.enabled` must be `true` while it runs** (`setup/FIREBASE-SETUP.md` §7).
- **Every document must satisfy the shape contracts in `firestore.rules`**, which are
  stricter than the tables above: `claimNumber` matches `CLM-YYYY-NNNNN`, `policyNumber` is
  uppercase alphanumerics and hyphens, `address.state` is exactly two letters, `zip` is five
  digits, and the admin user still needs `email`/`phone`/`preferredContactMethod`/`address`
  keys present. **Correction to an earlier version of this doc:** it said the admin's values
  could all be empty strings. That is true of `email` and `phone`, which the rules check with
  `isTextOrEmpty`, but *not* of `address` — `addressValid()` requires a non-empty street and
  city, a two-letter state, and a five-digit zip, so an all-empty address is rejected. The
  admin document carries a placeholder address that reads as internal rather than personal.
  A seed failure reporting "Missing or insufficient permissions" while seed mode is on is a
  shape violation, not a permissions problem; the console's Rules Playground pinpoints the
  failing clause.

## Definition of done for data model & seed

- Every collection above exists in Firestore with the fields listed, and every feature
  module reads/writes against these exact field names — no divergence discovered late.
- All 8 members plus admin can log in and each sees a genuinely different, coherent state
  matching their row above.
- Re-running `seed.js` doesn't create duplicates or drift the data into an inconsistent
  state.
