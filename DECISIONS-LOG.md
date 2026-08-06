# Decisions Log

This file is a running record of non-trivial judgment calls made while building the
Wellabe app prototype. Claude Code appends to it throughout the build per `CLAUDE.md`.
It is not a commit log — it's a record of *why*, for the human to skim later.

Keep entries short: what the situation was, what was decided, and why. Use the section
headers below as they come up; add new ones if a build phase needs a category that isn't
listed.

---

## Repo and Firebase setup

Entries from the pre-Phase-0 pass that fixed the Firebase handoff.

- **Repo restructured to match `setup/GITHUB-SETUP.md` step 2.** Everything had been
  uploaded into a nested `wellabe-app-design-bible/` folder, so `CLAUDE.md` was not at the
  repo root where Claude Code looks for it, and GitHub Pages had no root to serve the app
  from. Moved via `git mv` (history preserved). The loose `.pptx` and `.png` brand files at
  the bible root moved into `/brand-assets/`, which is where `CLAUDE.md`'s pre-Phase-0
  brand check looks — they were previously invisible to it.
- **Firebase project was incomplete.** Querying `mobileapp-3dcda` returned
  `SERVICE_DISABLED` for the Firestore API, meaning `setup/FIREBASE-SETUP.md` step 2 (create
  the database) never happened — the API is only enabled when the database is created. Steps
  1 and 4 were done. Documented as human steps; Claude Code cannot create a database.
- **Config was in the wrong place and unusable as written.** The raw console snippet had
  been committed to `setup/firebase-setup` (no extension). It used `const firebaseConfig`
  where the setup doc requires `export const`, and imported from the bare specifier
  `"firebase/app"`, which needs a bundler that `docs/02` forbids. Replaced with
  `assets/js/firebase-config.js` (exported) plus `assets/js/firebase-init.js` importing
  from the gstatic CDN, and deleted the original. `databaseURL` was dropped — nothing in
  the project uses Realtime Database.
- **Rules deploy automated rather than manual.** Claude Code has no Firebase credentials
  and `firebase login` is interactive, so it cannot deploy rules itself despite
  `docs/02` item 4 assigning it that job. Resolved with
  `.github/workflows/deploy-firebase-rules.yml`: a service-account secret deploys both
  rulesets on push to `main`, gated on the rules unit tests passing. Uses service-account
  auth rather than the deprecated `FIREBASE_TOKEN` flow.
- **Test mode replaced with production mode in the setup doc.** The doc told the human to
  start Firestore and Storage in test mode. Test mode is a rule with a hard 30-day expiry
  after which every read and write fails — a silent time bomb under a demo. Since real
  rules now exist and deploy automatically, there is no window that needs test mode.
- **Two factual corrections to the setup docs.** Authorized domains takes a *host*, not a
  URL (`GITHUB-SETUP.md` step 5 said otherwise), and that allowlist gates Firebase Auth
  sign-in only — it cannot cause or fix a Firestore/Storage error, which `docs/02` line 111
  implied it could. Also added the missing `cors.json` + `gsutil` command that
  `FIREBASE-SETUP.md` had left as a stub.
- **`.gitignore` added.** Three separate requirements in the docs (gitignored
  `scripts/output/`, optionally gitignored config, "gitignore the raw PPT if large") assumed
  one existed. None did.
- **Missing subagent definitions written.** `.claude/agents/design-researcher.md` and
  `.claude/agents/visual-qa-reviewer.md` are required by `CLAUDE.md` Phases 0 and 3 and by
  `docs/07`/`docs/08`, but did not exist — Phase 0 could not have run. Written from the
  prompts and constraints in `docs/08`.

## Security posture (no Firebase Auth)

**The design bible asks for two incompatible things.** `docs/02` §"Why no real Firebase
Auth" mandates no auth provider, and in the same paragraph asks that security rules
"prevent a member from writing another member's documents (each member document write is
scoped to its own `uid`/`memberId` field match)." With no auth, `request.auth` is null on
every request — there is no identity to scope a write against. The two cannot both hold.

**Resolved in the honest direction.** `firestore.rules` enforces everything achievable
without identity and does not pretend to enforce ownership:

- *Enforced:* document shape and unknown-field rejection; enums; the claim state machine
  (forward-only, no skipped stages, terminal states terminal); `deniedReason` required iff
  Denied and `paidAmount` iff Paid; `resultingPaidThroughDate` iff a payment succeeded;
  `pointsBalance` never negative; `gender`/`dob`/`role` not plain-field-editable;
  `paidThroughDate` and `longestStreakDays` monotonic; claim photos write-once; shared
  reference collections read-only.
- *Not enforced, and cannot be:* member-to-member write isolation, and confidentiality of
  anything. All reads are open, because login queries `users.usernameLower` from an
  anonymous client and the admin console reads every collection from that same session.

The practical consequence, stated so nobody is surprised: **anyone who can reach the site
can write any valid document on any member's behalf, and can read every member's data.**
That is acceptable only because every record is fabricated. Seed no real person's DOB,
address, or card digits — not even a real employee's as a stand-in. Enabling App Check
would meaningfully narrow this (it restricts requests to the registered web app rather
than `curl`); it is a console toggle, not a rule, and is worth doing before the demo.

## Feature-level judgment calls

- **Card-match check stays client-side.** `docs/03` says `payments.last4` must match
  `users.cardOnFile.last4`. Enforcing that in rules needs a cross-document `get()`, which
  consumes the shared batch access-call budget, reads pre-transaction state (so "update
  card, then pay" would fail mysteriously), needs defensive handling for a null
  `cardOnFile`, and is bypassable anyway by writing `status: "failed"` with any digits. It
  stays in `my-payments.js`. The rules instead guarantee the part that protects data
  integrity: a failed payment can never carry a `resultingPaidThroughDate`, so a spoofed
  failure cannot extend coverage.
- **`qualifiesForGuaranteedIssue` is not rules-enforced against
  `challengeDaysCompletedInWindow >= 80`.** Enforcing a derived field couples the rules to
  the client's field-update ordering and would turn a cosmetic bug into a hard write
  failure mid-demo. `my-health.js` owns the derivation.
- **`_config/seed` switch resolves the seeding-vs-rules conflict.** `seed.js` is a browser
  script with identical privileges to the app, so rules cannot distinguish them. A config
  document that no client can read or write (rules-internal `get()` bypasses rules) gates
  the seeder's extra powers, with an `expiresAt` so a forgotten flag closes itself. Two
  consequences: `seed.js` must use individual `setDoc()` calls rather than batches (the
  check costs access calls, and batches share a budget of 20), and byte-identical re-runs
  need no flag at all, since rewriting a field with the same value affects no keys — so
  the idempotency requirement in `docs/03` is satisfied without the switch.
- **`changeRequests` collection added** for the MyInformation gender/DOB request flow.
  `docs/04` requires the action to log a request record but never named a collection;
  added to `docs/03` so the schema stays the single source of truth.
- **`lifetimePointsEarned` added to `rewardsAccounts`.** `docs/03` says `tier` derives from
  lifetime points earned rather than current balance, but stored no lifetime total — the
  tier would have been unrecomputable after any redemption.
- **April gets a valid `cardOnFile`.** `docs/03` excepted her ("except where a mismatch is
  the point"), but `docs/04` requires that paying successfully as April restores her policy
  to Active, which needs a matching card. Her demo state comes from a seeded historical
  failed payment; the mismatch is demonstrated by typing wrong digits at the form. `docs/03`
  updated.
- **A write sunset, not just a rules deploy.** Both rulesets stop accepting writes after
  2027-03-31, so an abandoned demo project cannot quietly accumulate writes forever. Reads
  are deliberately *not* sunset, so an expired prototype still renders rather than dying
  on stage. Adjust the date if the demo tour runs longer.
- **Rules unit tests added** (`tests/rules/`, `npm test`). With this much logic in the
  rules and no way to deploy from the build environment, the emulator is the only way to
  verify the invariants rather than assert them. 49 tests; CI blocks the deploy if they
  fail. This caught one real bug: claim-photo write-once was not actually enforced, because
  Storage classifies an overwrite as `create`, so `allow update: if false` never fired —
  fixed with an explicit `resource == null` check.

## Brand alignment

**`/brand-assets/` had real content, so the placeholder palette is gone.** The two PPTX
decks are not mood boards — their embedded media are Wellabe's actual mark and illustration
library, and `Line Drawings.pptx`'s theme carries the real brand palette. `docs/01` was
rewritten against it.

- **Palette.** Brand yellow `#EDC319`, brand teal `#15A5BB` / `#00A29C`, warm off-white
  `#F3EFEC`, black. The old placeholder was a deep teal-green (`#0B6E5C`) with a navy
  secondary; neither exists in the real brand. `--color-secondary` was deleted rather than
  remapped — the admin console's navy chrome had no brand equivalent, so it now uses the
  deep teal with white table surfaces.
- **Yellow is a background color, not a brand-primary.** `#EDC319` measures **1.48:1**
  against the app background — it cannot legally carry text, a border, or a status
  indicator. Wellabe's own portal uses it as large panels under black text (10.6:1), so
  that is how the app uses it. Actions are carried by `--color-primary: #076874`, a deepened
  brand teal at 5.67:1 on the background with white text at 6.48:1. The brand's own
  `#15A5BB` measures 2.58:1 and fails even the 3:1 floor for UI components, so it is
  demoted to decorative fills.
- **Warning had to move away from amber.** The obvious warning color for insurance is a
  yellow-amber, which here would sit a few degrees of hue from the brand yellow and read as
  decoration rather than an alert. Warning is `#A34A06`, a burnt orange. Every token's
  contrast ratio was computed, not eyeballed, and is recorded in the `docs/01` table.
- **Assets are traced to SVG, not exported as PNG.** The source art is pure black line work,
  which traces cleanly and comes out both smaller and resolution-independent — the largest
  illustration is 77 KB as a 720px PNG versus 71 KB as a vector that stays sharp at any
  size, and the whole 15-piece set plus the mark is 356 KB. Tracing also means everything
  inherits `currentColor`, so one file serves ink-on-light and yellow-on-dark.
- **The derivation is reproducible, not a one-off export.** `scripts/extract-brand-assets.py`
  regenerates every shipped asset from `/brand-assets/`, so nobody has to guess later which
  deck a given illustration came from. Two traps are handled in it and worth knowing: potrace
  wants the *complement* of the ink mask (tracing the ink returns the canvas border as an
  extra contour), and the decks mix transparent-background art with white-background art and
  a yellow mark, so the ink mask keys on "any channel meaningfully darker than white" rather
  than on alpha or luminance alone. Keying on alpha turned one illustration into a solid
  black rectangle; keying on luminance lost the yellow mark entirely.
- **Not found: the "wellabe" wordmark as vector.** Only the `ll` ligature mark ships. The
  wordmark exists in the deck's screenshots at low resolution and in `.emf` files that
  LibreOffice in this environment cannot convert. The app pairs the traced mark with the
  wordmark set in the app's own type. If the official wordmark SVG turns up, it drops
  straight into `assets/img/` with no other change.

## Design bible self-review (Phase 0, weakest-parts pass)

Three findings, all applied. Each was a real defect in the spec, not a style preference.

**1. MyPayments specified an algorithm that could not satisfy its own acceptance criterion.**
`docs/04` said a successful payment advances `paidThroughDate` "by however many billing
periods the payment amount covers", and separately required that paying as April restores
her policy to Active. April is seeded lapsed. If her paid-through date is two months in the
past and she pays one monthly premium, the new date is *still in the past* — the app shows
"Payment successful" and her coverage pill stays red. That is the worst thing this demo
could do on stage, and it was the specified behavior. Worse, nothing pinned how far in the
past her date was, so whether the criterion passed was decided by whoever wrote `seed.js`.

Fixed by writing the actual formula into `docs/04` (`periodsOwed` computed from months
behind, so the new date always lands strictly in the future), pinning April's lapse to
exactly two months in `docs/03`, replacing the free-text amount field with a preselected
"Amount due now" radio list, and adding a reinstatement rule that blocks partial payment on
a lapsed policy — which is also how reinstatement actually works, and this audience knows
it. The card step now asks for the last four digits only rather than a full 16-digit number:
same guardrail, far less mis-tap risk, and a cleaner live demo of the mismatch.

Same finding surfaced a second bug: **coverage status had two sources of truth.** `docs/03`
stored `policies.status`; `docs/04` derived the pill from `paidThroughDate`; `docs/06` said
neither. Pay as April, open the admin console, and one surface would read Active while the
other read Lapsed. `docs/03` now defines one `coverageStatus(policy)` helper derived from
`paidThroughDate` — which is the safe direction, since the rules already enforce that field
as monotonic — and adds a "Past due" state between Active and Lapsed. The stored field stays
for the rules' enum but is display-irrelevant.

**2. The navigation spec described a top app bar that cannot fit at 375px, and hid four of
seven sections behind a hamburger.** `docs/01` asked the bar to carry a mark, a screen
title, a profile icon, a menu affordance, a back-to-home control, and (per `docs/04`) a log
out reachable in one tap from anywhere. At the doc's own 44px minimum plus mandated
spacing, that is ~200px of controls in a 343px-wide bar — the title overflows before a
single screen is built. It is exactly the class of bug `docs/01` tells the visual QA agent
to hunt, written into the spec.

The deeper problem was the hamburger. `docs/01` ruled out a bottom tab bar because seven
items is too many — correct — and then reached for hidden navigation, which is the worst
option for this audience: hidden nav is used roughly 1.5× less than visible nav on mobile,
and persistent tabs are specifically what helps users with memory or cognitive load.
Replaced with four tabs plus a full-screen "More" list, which also settles the doc's
undecided "slide-out or bottom-sheet". The top bar is now three elements maximum, the
minimum touch target went from 44px to **48px** (above WCAG 2.2 AA and matching Material,
deliberate for this base), and the "log out in one tap from anywhere" criterion was replaced
with the achievable "one tap from Home, two from anywhere else."

**3. MyHealth's headline demo moment rested on three undefined numbers and a seed that goes
stale on the shelf.** Nothing defined what makes a day "count" toward a streak — one
challenge of five, or all five? — so `currentStreakDays`, `challengeDaysCompletedInWindow`,
and Todd's seeded "82 of 100" were all assertions resting on a rule nobody had written, and
"visibly update the streak" was unverifiable. Points per challenge were never specified at
all. `docs/05` now defines a credited day as **3 or more of 5**, defines the streak and the
rolling window precisely, sets point values, and requires all four numbers to be *derived*
from `healthDailyLog` rather than hand-set — so the Home card, MyHealth, and the admin
console cannot disagree.

The stale-seed problem was the more dangerous half. Every seeded date was implicitly
static. Seed three weeks before the demo and Todd's 100-day window rolls past his 82
credited days, the no-health-questions offer — the one thing `docs/03` says "must be
visibly actionable" — silently vanishes, and every streak in the app reads 0. Nobody would
catch it, because the day you seed is the day you test. `docs/03` now requires every date in
`seed.js` to be an offset from a single `TODAY`, with a per-member table of offsets, and
`docs/05` has an acceptance criterion that advances the system clock 30 days and re-checks.

Also from finding 3, and worth its own note: **the phrase "guaranteed issue" is gone from
member-facing copy.** It has a specific meaning in federal law for Medicare Supplement, and
here the trigger is five self-attested taps a day — `docs/05` is explicit that completing a
challenge is a simulation, not a measurement. Demoing a *waiver of medical underwriting*
earned by untracked taps, to a room containing an insurer's underwriting and compliance
people, invites the wrong conversation. The screen now says "a no-health-questions offer",
carries a computed expiry and a "not an offer of insurance" footnote. The Firestore field
name `qualifiesForGuaranteedIssue` is unchanged — it is a contract the rules and seed code
against.

Two smaller fixes taken from the same pass: a stray quote mark in `docs/04`'s
`premiumFrequency"`, and the absence of any **loading or error state** anywhere in the docs.
`docs/01` mandated empty states but not the other two, for a fully client-side app that will
be demoed over conference-room Wi-Fi. Skeleton and retry states are now core components, and
Firestore's `persistentLocalCache` is enabled so a dropped connection renders cached data
instead of nothing.

## Gap-fill addition (Phase 0, omitted-feature pass)

**Added: MyMailbox — Notices & Documents.** `docs/04-features-core.md`, after MyClaims;
schema in `docs/03`; an admin Mailbox tab in `docs/06`.

**The gap.** The app as specified was entirely member→insurer. All seven sections are
things the member *does*. There was no insurer→member channel at all, and two concrete
problems fell out of that.

First, **every confirmation in the app was ephemeral.** Payment success is a toast. Claim
submission "shows a confirmation". Reward redemption is a toast. Enrollment "ends in a
confirmation state". And `docs/01` specifies toasts as auto-dismiss. So a member who taps
away, whose screen times out, or who just wants to check tomorrow that the payment went
through had nowhere in the app to look. For this member base that is a real failure, not a
nicety.

Second, **nothing gave a member a reason to open the app when nothing was due.** `docs/00`
sets the goal of an app opened multiple times a week; the only pull mechanism specified was
the daily-challenge streak, which by design does nothing for Dennis, Eric, or April. Every
comparable product — Humana, UnitedHealthcare, Medicare.gov — ships a documents archive and
a message center precisely because the notify-then-return loop is the mechanic.

**What it is.** A Notices tab (stored event notices plus a *derived* "Needs your attention"
group), a Documents tab whose documents render from Firestore data rather than stored files
— so `window.print()` against a print stylesheet produces a real PDF with no PDF library and
no build step — a message composer and thread view, and delivery preferences.

Three design calls inside it worth recording:

- **Condition notices are derived at render and never written to Firestore.** The moment a
  "premium due soon" notice is persisted for convenience, the mailbox starts showing a
  past-due warning for a policy that was paid ten minutes ago. Event notices, which record
  things that actually happened, are stored; conditions are computed.
- **Paper delivery is opt-out, never opt-in, and defaults on for every category.** A large
  majority of consumers still prefer paper specifically for insurance. Quietly defaulting a
  78-year-old to paperless is both a real harm and a compliance problem, so choosing
  paperless is deliberate and never gets a celebratory toast.
- **No Wellabe reply is ever fabricated at runtime.** A thread with no reply shows a
  timestamped receipt line and says plainly that this is a demo. Debbie's seeded thread
  carries a real two-message exchange so the reply pattern is still visible live.

**What it changes elsewhere.** `notices.js` moves into Phase 1 rather than being built with
MyMailbox — MyPayments, MyClaims, MyRewards, and MyHealth each write event notices inline in
their own code paths, so the shared writer has to exist first or all four get retrofitted.
`CLAUDE.md`'s Phase 2 order was amended accordingly, with MyMailbox as feature 5. It also
gives two previously dead-end actions somewhere to go: "Talk to an Agent" and the
denied-claim "Request a review" now both open the composer pre-filled.

**Runners-up, and why not.** *Caregiver / authorized-representative access* was the closest
call and has the highest real-world leverage for a 75-year-old median member — but with no
Firebase Auth there is no identity to scope a delegated session against, so it would be a
convincing shell over a permission model the rules provably cannot enforce. It is the right
feature for the iteration after real auth. *Benefit accumulators* ("you've used $340 of your
$1,500 dental maximum") are real and on-product but apply to only three of six product lines
and not to the flagship Medicare Supplement — a subsection of MyCoverages, not a missing half
of the app. *Accessibility display settings* lost because the correct answer is to make the
default accessible, which `docs/01` now does at 17px and 48px targets; shipping a settings
screen would let the design system off the hook.

## Build-time judgment calls

*(One entry per feature as it is built, only when a real judgment call was made — not for
every routine implementation choice already specified in the docs. The pre-build
"Feature-level judgment calls" section above covers the rules/schema decisions made before
any app code existed.)*

- **A credited day is one completed challenge, not three.** The Phase 0 critique proposed
  a threshold of three of five, on the reasoning that three is "achievable on an ordinary
  day, not achievable by accident" and makes "82 of 100" mean something. The product owner
  overrode it: one challenge credits the day. That is the right call for this member base —
  the streak exists to build the habit of opening the app and doing *something*, and a
  member having a bad day who completes one challenge and is told the day didn't count is
  exactly the punitive framing `docs/05` rules out everywhere else. It also makes the
  80/100 milestone reachable by consistency rather than by volume. Changed in
  `format.js` (`CREDITED_DAY_THRESHOLD`), the Today card copy, the seeded daily logs
  (now 1–5 challenges a day rather than 3–5), and `docs/05`/`docs/03`.
- **One challenge is assigned per day, not five to choose from.** A later product-owner
  correction on top of the one above: MyHealth and the Home Today card had been showing all
  5 fixed challenge types every day as a checklist, crediting the day at any one completed.
  The product owner corrected this — exactly one challenge is assigned per calendar day, and
  it's the only one shown. Implemented as a pure function of the date,
  `challengeForDate()` in `format.js` (rotates through the 5 fixed types, `days since epoch
  mod 5`), so it needs no storage and every member sees the same challenge on the same day —
  a reload or re-seed can never disagree with what was shown earlier. `isCreditedDay` and
  every derived stat (`deriveHealthStats`, streaks, the 100-day window, milestones) were
  already keyed off `challengesCompleted.length >= 1`, so none of that math changed; only
  what's offered did. `firestore.rules`' `dailyLogValid()` tightened from
  `challengesCompleted.size() <= 5` to `<= 1` (plus the previously-commented-out
  `hasOnly` check on the 5 valid IDs) and `pointsEarned` from `<= 1000` to `<= 10`, both
  now real invariants instead of loose bounds. `seed-data.js`'s per-day challenge picker
  (`challengesForDay`, a seeded-random draw of 1–5 from the pool) is gone; every credited
  seed date now writes `[challengeForDate(date).id]`. Touched: `format.js`, `features/
  health.js`, `screens/home.js`, `screens/my-health.js`, `seed-data.js`, `firestore.rules`,
  `tests/rules/firestore.rules.test.mjs`, `docs/03`, `docs/05`.
- **Firebase SDK vendored into the repo instead of loaded from the gstatic CDN.**
  `docs/02` preferred CDN imports. Three things outweighed that: the demo no longer depends
  on a third party at runtime, version drift across three separate pinned URLs becomes
  impossible, and — decisively — the build environment cannot reach gstatic at all, so with
  CDN imports the app could not be rendered or screenshotted locally and the entire visual
  QA loop would have been reviewing something other than what ships. One bundle, not three:
  Firestore and Storage both look up the initialized app in a registry inside
  `@firebase/app`, and bundling them separately would give each its own copy of it. Not a
  build step in the sense `docs/02` warns about — Pages still serves committed static files
  and nothing builds in CI. Regenerate with `npm run vendor:firebase`. Logged in
  `setup/GITHUB-SETUP.md` too, since that doc asked to be told.
- **`persistentLocalCache` enabled.** A fully client-side app demoed over conference-room
  Wi-Fi should re-render cached data on a dropped connection rather than an empty screen.
  Single-tab manager, because nothing here coordinates across tabs and the multi-tab manager
  costs a leader election on every load. Disabled under the emulator, where it mostly
  produces confusing stale reads after a data reset.
- **Two seed transports, one set of seed data.** The browser cannot reach Firestore from
  the build container — Chromium gets `ERR_CONNECTION_RESET` with or without the egress
  proxy, while Node and curl both get `200`. Rather than give up on verifying the real seed,
  the seed *content* lives in one framework-free module and two thin transports consume it:
  `assets/js/seed.js` (browser, Firebase SDK, the documented artifact the human runs) and
  `scripts/seed-node.mjs` (Node, Firestore REST through an undici `ProxyAgent`, what the
  build uses to seed and verify). Same documents either way; no duplicated content.
- **A third, admin-authenticated seed path, by explicit human request.** The human
  generated a narrowly-scoped service account (`Cloud Datastore User` only — not
  editor/owner) specifically so Claude Code could seed and verify the real project
  directly instead of relaying "open the console and flip `_config/seed`" instructions
  every time. `scripts/seed-node.mjs --admin` mints an IAM OAuth token from the key
  (path via `GOOGLE_APPLICATION_CREDENTIALS`, `google-auth-library`, added as an explicit
  devDependency though it was already present transitively via `firebase-tools`) and talks
  to the same Firestore REST endpoints the other two transports use — IAM-authenticated
  requests bypass security rules entirely, so this mode needs no seed-mode flag and no
  console step. The key itself lives only in the session's gitignored scratch directory,
  never in the repo; the human was told to revoke it once real-project verification is
  done, consistent with how the existing `github-rules-deployer` service account
  (`setup/FIREBASE-SETUP.md` §7) is handled.

## Visual QA patterns

**Full-app pass run over 70 screenshots, every screen, both breakpoints, all 8 members plus
admin. Verdict: FAIL.** Eight blocking findings. Five were fixed; three remain open, along
with a long tail of notable and minor items. This section is the handoff.

**Fixed:**

- **One state, two words.** April's policy showed a red "Lapsed" pill while the body copy on
  the same card said "past due", and the home alert said a third thing. These mean different
  things to a member — past due means pay and you're fine, lapsed means your coverage ended.
  All copy now derives its wording from the same `coverageStatus()` label as the pill.
- **"You're all caught up" sat directly above unread notices.** The banner describes the
  derived attention group, not the inbox, but nothing on screen said so. Reworded to
  "Nothing needs your attention right now."
- **The header badge and the MyMailbox card disagreed on the same screen** — 2 versus 1 —
  because the badge added derived attention items on top of unread notices. The badge now
  counts unread notices only.
- **A lapsed policy offered no way out.** MyCoverages gave April "View ID card" and
  "Details", with a full-width cross-sell as the loudest element on the screen. The policy
  card now leads with "Pay $174.00 to restore this coverage", and the cross-sell drops to
  secondary whenever any policy needs attention.
- **Claim list cards had no affordance and no outcome.** No chevron, no summary — Debbie's
  card said "Denied" and stopped, with no visible route to the reason or the review action.
  Cards now carry a chevron and a plain-language outcome line. The same fix settled a naming
  inconsistency: the pill, tracker and notice used "Processing", "In review" and "Reviewing"
  for one stage, and an in-progress claim was tinted with the warning token as though
  something were wrong. Only Denied gets an alarming tone now.

**Still open — worth doing before the demo:**

1. **The bottom tab bar clips on Home at 375px** on every member, showing only the top of
   each icon and no labels. It renders correctly on the same screens at 430px and on other
   screens at 375px, so it is specific to the tallest page.
2. **April's payment history contradicts her balance.** The card says paid through June 6 and
   asks for $174.00, while the history immediately below shows a successful $58.00 payment on
   July 6. The seeded history needs to reconcile with the seeded paid-through date.
3. **Brand yellow is doing status work**, which the design system forbids: the rewards tier
   chip, the points chips, the streak ring, badge borders, and the admin console's active-tab
   underline. The rewards tier chip is the worst of these — Bronze, Silver and Gold all
   render as the same gold pill.

The notable tail, roughly in order of value: Todd's unlocked-offer card is styled the same as
the routine challenges card directly above it, so the demo's hero moment reads as wallpaper;
good news and bad news share an icon and the "Needs your attention" heading; the MyCare and
admin chip strips clip mid-word with no scroll cue; the rewards store re-offers items the
member already redeemed; "N more earned to reach Silver" never explains that tier runs on
lifetime points while the big number is spendable balance; the 100-day card never states the
80-day target; Log Out is styled as a destructive action; the More screen's row layout
differs from every other list; and the challenge checkboxes look to be under the 48px
minimum.

## Closing summary

*(Filled in at the end of Phase 4: what's solid, what's intentionally thin and why, and
what to tackle first in the next iteration.)*
