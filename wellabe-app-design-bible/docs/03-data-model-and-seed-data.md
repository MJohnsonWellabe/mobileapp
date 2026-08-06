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
| `pointsBalance` | number | Never allowed to go negative — enforce client-side *and* treat as a Firestore rule check |
| `tier` | `"Bronze"` \| `"Silver"` \| `"Gold"` | Derived from lifetime points earned, not current balance |

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
| `challengesCompleted` | array of challenge IDs | Subset of the 5 daily challenge types |
| `pointsEarned` | number | |

Daily challenge catalog (static, same 5 for everyone): 5,000 steps · Burn 400 calories ·
Climb 10 flights of stairs · 10 minutes of activity · One breathing/meditation session.

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

## Why this shape, briefly

Payments, claims, and rewards transactions are each their own top-level collection (rather
than nested under `users`) because the admin console (`docs/06-admin-console.md`) needs to
show "all payments across all members," "all claims across all members," etc. as flat,
sortable views — nesting would make that harder for no benefit at this scale.

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

Give every member a complete `users/{userId}` document including a `cardOnFile` (except
where a mismatch is the point, per April) so the MyPayments card-match acceptance
criterion in `docs/04-features-core.md` is testable for each of them.

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

## Definition of done for data model & seed

- Every collection above exists in Firestore with the fields listed, and every feature
  module reads/writes against these exact field names — no divergence discovered late.
- All 8 members plus admin can log in and each sees a genuinely different, coherent state
  matching their row above.
- Re-running `seed.js` doesn't create duplicates or drift the data into an inconsistent
  state.
