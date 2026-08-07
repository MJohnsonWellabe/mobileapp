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
- **The bottom tab bar clipped on Home at 375px**, showing only the top of each icon and no
  labels — correct at 430px and on every other screen at 375px, so it was specific to the
  tallest page. Root cause had nothing to do with height or the tab bar itself:
  `.section-card` is a CSS Grid item inside `.section-grid` (`display:grid`, no explicit
  columns), and grid items get an automatic minimum width equal to their own min-content
  size unless overridden. The card's `white-space: nowrap` status line pushed that
  min-content floor to ~369px, which exceeds the ~343px available at 375px width (but not
  the ~398px available at 430px) — so the whole page overflowed horizontally by exactly that
  amount, and `position: fixed` on an overflowing document uses the wider layout viewport as
  its containing block, stretching the tab bar past the visible frame and clipping its
  bottom in the screenshot tool's viewport-resize-then-capture step. Fixed with one line,
  `min-width: 0` on `.section-card` itself (not just its `__body`, which already had it) —
  the standard override for this exact CSS Grid/Flexbox default. Worth remembering for any
  future card-in-a-grid: the automatic minimum size applies to the grid *item*, not just
  whatever flex children live inside it.
- **April's payment history contradicted her balance.** The card said paid through June 6
  and asked for $174.00, while the history immediately below showed a successful $58.00
  payment on July 6. Root cause: `seed-data.js`'s payment-history loop generated `count`
  successful payments for every policy unconditionally, including April's lapsed one, so the
  most recent generated payment's `resultingPaidThroughDate` landed after her policy's actual
  (2-months-behind) `paidThroughDate`. Fixed by skipping any generated payment whose
  resulting date would exceed the policy's stored `paidThroughDate` — a one-line guard, no
  schema change.
- **Brand yellow was doing status work in two places the design system genuinely forbids.**
  The finding named five things; three turned out to already be the sanctioned use docs/01
  explicitly calls out ("streak and progress rings, points/rewards emphasis") and were left
  alone: the streak ring, the rewards-store points chips, and achievement badge borders (all
  reward/milestone emphasis, all yellow-as-background-only, none of them a state indicator).
  Two were real violations and got fixed:
  - **The rewards tier chip rendered Bronze, Silver, and Gold identically** — same yellow
    pill, different text only. Fixed with two new tokens, `--color-tier-bronze`/`-tint` and
    `--color-tier-silver`/`-tint` (contrast-checked the same way as the status tokens, both
    clear 4.5:1), plus three `.pill--tier-*` variants. Gold keeps `--color-brand-yellow-tint`
    under `--color-text-primary` — the one combination yellow is actually allowed in — rather
    than introducing a third new token for a color that already has a compliant home.
  - **The admin console's active-tab underline used brand yellow as a border**, which
    tokens.css reserves as background-only regardless of contrast. (It measures a strong
    10.56:1 against the admin's dark chrome, so this wasn't a legibility problem — it was a
    role violation: a border is a status indicator, which is exactly the role that token
    isn't allowed to play.) Switched to `--color-text-on-dark` — the same white the active
    tab's text already turns — so the active state now carries one consistent signal instead
    of introducing a second, reserved color for it.

**Still open — worth doing before the demo:** none from this pass. See the notable tail
below.

**The notable tail — all fixed except one, kept deliberately open:**

- **Todd's unlocked-offer card read as wallpaper**, styled identically to the routine
  yellow challenge card directly above it. New `.card--celebrate` variant (white surface,
  bold `--color-primary` border, an "UNLOCKED" eyebrow) makes the demo's hero moment
  actually look like one.
- **Good news and bad news shared an icon** ("Needs your attention" always showed
  `icons.alert()`, even for the accent-toned unlocked-offer notice). The accent tone now
  gets `icons.starFilled()`; warning/danger keep the alert triangle. Fixed in both places
  this is rendered — `home.js` and `my-mailbox.js` — since the markup was duplicated, not
  shared.
- **The MyCare and admin chip/tab strips clipped with no scroll cue.** Both `.chips` and
  `.admin-tabs` now carry a trailing `mask-image` fade, the same technique iOS/Android use
  for truncated horizontal lists — no JS scroll-position tracking needed.
- **The rewards store re-offered items already redeemed.** `storeCard` now takes a
  `alreadyRedeemed` flag (checked against `spend`-type transactions by reason, the same
  pattern `earnCard`/`earned` already used for read/watched items) and shows a "Redeemed"
  pill instead of a buy button.
- **"N more earned to reach Silver" didn't explain tier vs. balance.** Reworded to "N more
  *lifetime points*" and added a one-line disclosure: tier tracks lifetime earned and never
  drops on redemption, the spendable balance above is the separate number that does.
- **The 100-day card never stated the 80-day target.** Title and body now both name it
  explicitly ("100-day progress — 80 days unlocks an offer" / "toward the 80-day target").
- **Log Out was styled as a destructive action** (`.more-row--danger`, red icon/label) on
  the More screen, which misrepresents it — logging out loses nothing and is one tap to
  undo. Switched to the plain `.more-row` styling every other row uses. (The `--danger`
  modifier itself stays in `screens.css` as a reusable primitive; it was just applied to
  the wrong action.)
- **The challenge checkbox looked smaller than the 48px minimum.** The real tap target
  (the full-width `.challenge` button) already met `--tap-target-min`, but the visible
  glyph was only 28px, which reads as too small regardless of the actual hit area. Sized
  up to 32px.
- **Left open, deliberately:** "the More screen's row layout differs from every other
  list." More is a flat, divided settings-style list (`.more-row`) by design, distinct from
  the bordered/shadowed `.section-card` dashboard cards on Home — that's a recognized,
  intentional pattern split (settings list vs. dashboard cards), not obviously a defect.
  Left for the next full `visual-qa-reviewer` pass to adjudicate with fresh eyes rather than
  guessing at a restructure the finding didn't specify.

## Acceptance-criteria audit (Phase 4)

CLAUDE.md's Phase 4 asks every acceptance criterion in `docs/04`–`06` to actually be
exercised, not read and assumed. Did that live against the Firestore emulator — logging in
as the relevant seeded member and doing the thing, per each doc's own review process —
rather than a code-only pass. One real gap found and fixed; everything else checked held.

**Fixed:** MyPayments' Submit button wasn't disabled for a below-due "another amount" on a
lapsed policy — see the entry above under "Build-time judgment calls." Verified end to end
against April via Playwright afterward: disabled at $10, enabled at the full $174, wrong
last4 produces the inline mismatch with a `failed`-status payment and no
`resultingPaidThroughDate`, the correct last4 succeeds, and MyCoverages/Home/the admin
console Members tab all read Active with matching notices in MyMailbox — the exact
"April, end to end" criterion both `docs/04` and `docs/05` name explicitly.

**Verified, no changes needed** (live where the criterion calls for it, code-read where the
logic is unambiguous and already covered by a passing rules test):

- **Auth** — case-insensitive username/password matching, no field-specific error leak,
  session persistence via `sessionStorage`, and role-based routing (`auth.js`, `login.js`)
  all match `docs/04` exactly on inspection.
- **MyInformation** — gender/DOB route through `dataRowButton`'s documentation-request flow
  with no path to a direct field edit; rules test "gender/dob immutability" backs this at
  the data layer too.
- **MyCoverages** — "Add More Coverage" filters to products the member doesn't already
  hold; "Talk to an Agent" is reachable from both the policy detail view and the enrollment
  flow, with a working "Send a message instead" that opens the MyMailbox composer
  pre-filled and copy that doesn't overpromise a live agent.
- **MyClaims** — Sara (Processing), Todd (Paid), and Debbie (Denied) each render a distinct,
  correctly-highlighted tracker with per-stage timestamps; Debbie's denial shows a specific
  plain-language reason and a working "Request a review" that opens the composer with
  `claim`/`subject` pre-filled; Matt's two claims list correctly.
- **MyMailbox** — Dennis's "You're all caught up" state, Debbie's real two-message thread
  (member right-aligned, Wellabe left-aligned, no fabricated reply), the Documents tab's
  chip filter and year grouping, `window.print()` producing a clean letterhead artifact with
  no app chrome, and delivery-preferences persistence (toggling one category's paper off
  left every other category's paper on, confirmed against `users.deliveryPreferences`) all
  checked out live.
- **MyRewards / MyHealth** — covered by the daily-challenge rework and the tier-chip/
  redeemed-item fixes above, both verified live earlier in this pass.
- **Admin console (`docs/06`)** — member-tap filtering ("Showing April only, across every
  tab" + "Show everyone") works across tabs including Payments; no `.tabbar` element is
  ever present on an admin screen; names are always joined in, never a raw `userId`; status
  pills reuse the member-app component and color tokens.

Not re-verified line-by-line in this pass: MyCoverages' ID card artifact rendering and a
few of MyMailbox's narrower per-`type` notice-routing claims — these were already covered
by the earlier visual-QA screenshots and code inspection and didn't surface anything, but
weren't independently re-driven through the browser here. Worth a look in the next full
`visual-qa-reviewer` pass rather than assumed permanently clean.

**The Firestore emulator silently undercounts `healthDailyLog` under this seeder's write
pattern; the real project doesn't.** After seeding the emulator repeatedly across a long
session, Todd's health-log count read 56 instead of 82, capped at a fixed date regardless of
how many times the emulator was restarted fresh and reseeded — this looked like a real bug
in the credited-days logic. It wasn't: `buildSeed()`'s in-memory output has exactly the
right 82 keys every time (checked directly), `seed-node.mjs` reported zero write failures,
and seeding the real project once via the `--admin` service-account path (Part 1) produced
the fully correct 82 documents, April 29 through August 5. This is a known class of Firestore
emulator limitation under many concurrent writes into one large, newly-created collection —
not a code defect. Anyone chasing a "missing health log days" report against the emulator
specifically should re-check against `--admin --verify` on the real project before assuming
the seed logic is wrong.

## Full-app visual QA re-pass (Phase 4)

Ran `visual-qa-reviewer` fresh across all 70 screenshots (every screen, both breakpoints,
representative members + admin). Verdict: **FAIL**, 3 blocking findings. All three fixed and
verified; a further round of notable/minor findings is logged in the closing summary below
rather than all chased in this pass — see "what's intentionally thin" there.

- **Currency amounts wrapped mid-number at 375px.** MyPayments' Payment History rows put a
  bare `${formatMoney(...)}<br/>` inside `.data-row__value`, which sets
  `overflow-wrap: anywhere` (correct for its other uses — addresses, emails — where
  wrapping *should* be possible). At 375px a 3-digit premium like $148.50 had nowhere else
  to break, so it split into "$148." / "50" on two lines. Fixed by wrapping just the money
  span in `white-space: nowrap`, not by touching the shared class.
- **"Nothing needs your attention" could sit directly above an unread denied-claim
  notice.** `attentionItems()` only ever derived from `policies`/`user`/`health` —
  `docs/04`'s own MyMailbox spec never listed a denied claim as a derived condition, which
  is a real gap in the original design bible, not just an implementation miss. Added a new
  derived condition, danger-tier, for any claim with `status === 'Denied'`: title, the
  claim's own `deniedReason`, and a "View claim" action to `claims?id=<id>`. Threaded
  `claims` through both call sites (`home.js` already had it in state; `my-mailbox.js`
  needed a new `subscribeClaims` subscription added). Durable like the other three
  conditions — clears only if the claim's status itself changes, never on a read flag or a
  timer. `docs/04` should be read as amended to include this as a fifth condition.
- **The rewards points ledger didn't reconcile.** "Recent activity" (formerly "Points
  history") shows a small hand-authored sample of transactions per member — deliberately
  not exhaustive, since `rewardsAccounts.lifetimePointsEarned`/`pointsBalance` are separate
  hand-set totals meant to represent years of unlisted activity (Dave's is 6 years
  tenured). Checked: summing every member's visible sample as if it were the complete
  ledger goes *negative* for 5 of 8 members, confirming the sample was never meant to be
  read as complete — but nothing on screen said so, so it read as three numbers silently
  contradicting each other. Retitled the section "Recent activity" and added an explicit
  disclosure: "Showing your most recent activity. Earlier earning and redeeming is folded
  into the lifetime and balance totals above." Fabricating a fully exhaustive multi-year
  transaction ledger per member was the alternative and heavier-weight fix; framing what's
  already there honestly is the one actually taken.

Also fixed from the same pass, all minor/cheap: a subject-verb slip in the 100-day
progress card copy (introduced by me earlier this session — "80 days unlocks" → "unlock"),
British spellings ("in hospital" → "in the hospital", "Full cover" → "Full coverage"),
"tick" → "check" in MyHealth's tracker copy, unified "Complete it to count today" wording
between Home and MyHealth (they'd drifted to two different phrasings), and a password-field
hint added to the login form to match the username field's ("Case doesn't matter.", without
printing the actual demo password on screen).

**Re-reviewed after those fixes: PASS.** All three previously-blocking findings confirmed
resolved with no regressions (verified independently, including that the "you're all caught
up" scoping wasn't over-corrected — Dennis and April's correct states still render
correctly). Two more items fixed in the same pass:

- **Home's bottom two hub-card subtitles truncated mid-word at 375px** ("Compare doctors,
  dentists an…", "Your contact details and addr…") — correct at 430px, so purely a
  too-long-for-the-column problem at the narrow breakpoint, and called out as "the one
  change worth making if only one gets made" since it's on the first screen every member
  sees. Shortened the copy itself ("Find care near you", "Contact details and address")
  rather than allowing wrap, since `.section-card__status` is deliberately single-line
  ellipsis elsewhere.
- **The MyCare/MyMailbox chip strips and the admin tab strip still had no working scroll
  cue**, despite two prior attempts. Root-caused properly this time: `mask-image` on a
  scrolling flex container doesn't render at all in this Chromium build (confirmed via an
  isolated test page — same story for a `::after` overlay positioned against the scrolling
  element itself, which scrolls away with its own content since the scrolling element can't
  also be the stationary frame for its own fade). Even after fixing the positioning with a
  separate non-scrolling wrapper, a *color-matched* fade (transparent → white, transparent →
  navy) turned out to be invisible for a different reason: fading dark text to white on an
  already-white chip background produces no perceptible change at all — confirmed by
  swapping the target color to an obviously-visible blue, which rendered the fade correctly
  and proved the geometry was right all along. Replaced the whole approach with a plain
  `inset box-shadow` directly on `.chips`/`.admin-tabs` (no wrapper divs, no pseudo-elements)
  — a shadow darkens whatever's under it regardless of that content's own color, which is
  exactly the property a same-color gradient fade doesn't have. Simpler than either previous
  attempt and the only one of the three that's actually visible in a screenshot.

**Left open, by choice, this round:** the streak-ring proportionality question (MyHealth's
ring reads "goal complete" whenever current streak equals personal-best longest streak,
which is a common case, not a rare one — a real design question about what the ring should
encode, not a quick fix); the claim card's visual hierarchy (claim number is the boldest
text on the card; the coverage name and outcome are smaller, and Debbie's denial reason
doesn't appear on the card at all even though MyMailbox now surfaces it in full); the
unread "New" pill's red carrying both "problem" and "merely unread" meanings; "past due" vs.
"Lapsed" wording drift between Home and every other surface for the same policy state; and
the disabled reward-tile's low-contrast, button-shaped-but-not-a-button styling. All are
real and worth the next iteration's attention — see the closing summary below.

## Closing summary

**What's solid.** All nine Phase 2 build items exist and work end to end against real
Firestore data: Auth, MyInformation, MyCoverages, MyPayments, MyClaims, MyMailbox,
MyRewards, MyHealth, MyCare, and the admin console, seeded for all 8 members plus admin.
The guardrails CLAUDE.md calls out by name all hold and are rules-enforced, not just
UI-enforced: gender/DOB require the documentation-request flow, a card mismatch in
MyPayments writes a `failed` payment and never a `resultingPaidThroughDate`, a rewards
redemption can never take the balance negative, and a claim can never skip or reverse a
stage. April's flagship end-to-end scenario — lapsed policy, wrong-then-right card digits,
reinstatement, and the same "Active" reading on MyCoverages, Home, *and* the admin
console with no manual edit in between — is verified working, not just asserted. The claim
tracker (Intake→Processing→Reviewing→Paid, plus the distinct Denied end state with a
plain-language reason and a working "Request a review") is genuinely well built. The 373→371
document seed matches `docs/03`'s per-member table exactly, verified against the real
project directly via the admin-authenticated seed path built this session, not just the
emulator.

**What's intentionally thin, and why.** A handful of real, verified findings were
deliberately left for the next pass rather than patched hastily in this one, because each
needs a design decision, not just a code fix:
- **The MyHealth streak ring's fill doesn't mean what it looks like it means.** It renders
  fully closed ("goal complete") whenever the current streak equals the personal-best
  longest streak — which is the common case for anyone actively building a streak, not an
  edge case. Fixing this well needs deciding what the ring *should* encode (progress toward
  a fixed goal? days until the next badge? something else), not a one-line tweak.
- **The claim card's visual hierarchy is upside down.** The internal claim number
  (`CLM-2026-00418`) is the boldest text on the card; the plain-language outcome and, for a
  denied claim, the reason itself are smaller or absent from the card entirely (even though
  MyMailbox now surfaces the same denial in full). Worth a real redesign pass of that card,
  not a font-weight swap.
- **Two members refer to the same coverage state with two different words.** Home's
  MyPayments row says "past due"; MyCoverages, MyPayments' own detail view, and MyMailbox
  all say "Lapsed" for the identical policy. These aren't synonyms to a member — pick one
  and derive every surface from it, the same way `coverageStatus()` already unifies the
  status *pill* everywhere.
- **The unread "New" pill and the danger pills share the same red**, so an unread-but-good
  notice (a claim advancing to Reviewing) reads with the same visual alarm as a denial or a
  lapse. Needs a second color in the palette for "unread," not reserved for "wrong."
- **The disabled reward-tile ("790 more points needed") is styled like a live secondary
  button** at contrast that reads as marginal — a member will tap it expecting something to
  happen. Should be a plain status line, not button chrome.

None of these were guessed at or left out of laziness — each was found by the
`visual-qa-reviewer` subagent looking at real screenshots, confirmed by inspecting the
actual rendered output, and scoped out deliberately because a rushed fix risked being wrong
in a way that's worse than the current honest gap.

**What I'd tackle first in the next iteration**, in order: (1) the two-words-for-one-state
wording drift, because it's the cheapest of the five and touches member trust directly;
(2) the claim card hierarchy redesign, because Debbie's denial is the single most
emotionally loaded screen in the app and it currently under-serves the information that
matters most; (3) the streak ring, because it's this app's one genuinely novel engagement
mechanic and right now it lies to the member on the most common path through it; (4) the
unread-pill color and the disabled-tile contrast, both quick once a moment is taken to pick
the right token; (5) a fresh `design-researcher` gap-fill pass, since the last one predates
MyMailbox's own build-out and eight more member states' worth of real content now exists to
critique against.

**One thing to hand back to the human immediately:** the `claude-code-firestore-admin`
service-account key (Part 1 of this session) has done its job — the real project is
seeded and verified end-to-end via `--admin --verify`. Safe to revoke it from the GCP
console now (Keys tab → trash icon); regenerating a fresh one costs nothing next time it's
needed.

## Post-merge: a blank page with no way to see why

After merging to `main`, the human reported every page past login rendering completely
blank on the deployed site — on a phone, with no devtools access to read a console. Every
static/API-level check available from this environment came back clean: the deploy
succeeded (`pages build and deployment` and `Deploy Firebase rules` both green for the
merged commit), `index.html` and all 9 page HTML files and the vendored Firebase bundle are
present and intact on `main`, every JS file touched this session passes a syntax check, and
unauthenticated REST calls that replicate exactly what the browser does for login and every
subscription-based screen (`policies`, `notices`, `healthDailyLog`, `claims`, `payments`,
`documents`, `messageThreads`) all return `200` with correct data against the real project.
None of that rules out a real-SDK-specific failure this environment structurally cannot
reproduce — Chromium here cannot reach Firestore at all (`scripts/seed-node.mjs`'s own
header explains why), and this environment's network policy blocks `github.io` outright, so
the live site can't be loaded or fetched from here to see the actual failure directly.

**Added `assets/js/fatal-guard.js`, loaded as a plain (non-module) script before every
page's module script.** It listens for `error` and `unhandledrejection` on `window`, and
falls back to an 8-second "taking longer than expected" timeout if `document.body.dataset
.ready` never flips, replacing a silent blank screen with a plain-language message and a
"Try again" button. This doesn't fix whatever the underlying issue turns out to be — it
exists so a failure is *legible* to whoever hits it, devtools or not, which a live demo in
front of an ELT audience needs regardless of what today's specific bug is. Loaded as a
classic script rather than a module deliberately: a module import failure can prevent the
whole module graph from executing, but a plain script tag that already ran and attached its
listeners keeps working even if everything after it fails to load.

## Root cause found: GitHub Pages Jekyll was silently dropping `_page.js`

The blank-page bug above had a real, fully-explainable cause. The human's follow-up report
narrowed it precisely: after logging in, Home worked fine, but every other screen was
blank. `assets/js/screens/home.js` is the one screen module in the whole app that does not
import `assets/js/screens/_page.js` — every other section screen (`my-mailbox.js`,
`my-payments.js`, `my-claims.js`, `my-coverages.js`, `my-health.js`, `my-care.js`,
`my-rewards.js`, `my-information.js`, `more.js`) does. That split is the whole bug.

GitHub Pages runs the published branch through Jekyll by default, and Jekyll's default
behavior is to exclude any file or directory starting with an underscore from the build
output (the same rule that hides `_layouts`/`_includes`/`_sass` in an ordinary Jekyll
site) — the standard fix is a `.nojekyll` file at the repo root, which this repo never had.
So `_page.js` was never published at all; every screen importing it got a 404 on that
module, which fails the whole ES module graph for that page before any synchronous DOM
work runs (no topbar, no skeleton — a truly blank page, not even a fatal-guard message).
And because a failed `<script>` load is a non-bubbling resource-error event,
`fatal-guard.js`'s `window.addEventListener('error', ...)` (bubble phase, no `capture`)
never saw it either — it would only ever have caught this via its generic 8-second
timeout, never with a specific message. None of the checks logged above caught this
because they were all either static file/API checks (the file is present and correct in
the git tree — Jekyll strips it only during GitHub's *publish* step, not from the repo
itself) or local/emulator testing, which never runs the published output through Jekyll at
all. Fixed by adding an empty `.nojekyll` file at the repo root (zero code changes needed)
and confirming no other underscore-prefixed paths exist in the tree. Also hardened
`fatal-guard.js` to listen with `capture: true`, so a future failed resource load names
itself immediately instead of falling through to the generic timeout.

Separately, while chasing this, found and fixed a real false-positive in `fatal-guard.js`
itself: `login.js` is a standalone script outside the `_page.js` framework and never set
`document.body.dataset.ready`, so the guard's 8-second timeout was guaranteed to fire on
the login page regardless of whether login worked — fixed by setting the flag right after
login's synchronous setup completes, since the form is interactive immediately with no
async gate.

## Home (and shared layout) redesign: a third, additive responsive tier

Once the site was actually loading again, the human looked at a real Home screenshot and
asked to use the screen's space better, make it "scale to any type of phone," read easier
for a senior audience, and feel more engaging. This is a genuine, human-directed change to
a rule docs/01 stated flatly — "single-column layouts throughout," content capped at
560px, with no strategy for anything past "430–600px, large phone/small tablet" — not a
bug fix, so it's logged as a design decision, not folded silently into the CSS.

Confirmed before touching anything: nothing in the app's CSS changes layout above ~430px
today. `.app-main` (the one shared container every screen uses) hard-caps at 560px with
zero width-based `@media` rules anywhere in `components.css`/`screens.css` (the only
precedent for a width breakpoint in the whole codebase is `admin.css`'s internal
720px card/table switch, which is unrelated and untouched). Home's own "Your Wellabe"
list (`.section-grid`) had no `grid-template-columns` at all, so it was a single implicit
column at every width, and its bottom illustration was small (max-width 320px) and faded,
leaving visible dead space beneath it on anything taller or wider than the minimum tested
size.

Asked the human to choose scope and direction rather than guessing: they chose the whole
shared layout system (not just Home) and both wider-and-richer rather than picking one.
Landed on a new, purely additive tier at `min-width: 640px` — the existing 375px and
430–600px breakpoints are byte-for-byte unchanged, still single-column, still capped at
560px:

- `.app-main` widens to a new `--content-max-wide: 720px` token, globally, so every
  screen gets more room with no per-page markup changes.
- Home's `.section-grid` becomes two columns at this tier (the only "grid of nav cards"
  pattern in the app — every other screen's list uses its own per-screen markup).
- Home's greeting, streak ring, and illustration scale up so the extra width reads as
  intentional rather than the same small elements floating in more empty margin.
- Running text (`.field__hint`, `.empty__body`, paragraph copy inside `.card`) gets a
  60ch cap at this tier specifically because docs/01's original 560px ceiling existed to
  avoid uncomfortable line lengths — widening the container without this would have
  silently reintroduced that problem on text-heavy screens.

**Regression caught during the first screenshot pass, fixed before shipping:** going to
two columns roughly halves each Home section card's width, and `.section-card__status`
was `white-space: nowrap` with ellipsis truncation — tuned for a full-width single column,
it started clipping real information ("Medicare Supplement …", "Contact details and
ad…"). Hiding text behind an ellipsis is a worse outcome than a two-line card, especially
for this audience, so the status line wraps to two lines instead of truncating at this
tier. Re-shot and confirmed full text now shows for every member tested.

Also fixed while in `docs/01`: the "five daily challenges" line in §Navigation pattern was
stale — the shipped app has used one assigned challenge per day since the earlier
redesign this session; the doc just never caught up.

Screenshot QA (`scripts/screenshot.mjs`) now includes 640 and 768 in its default
`BREAKPOINTS` alongside the existing 375/430, so this tier gets checked going forward
without a manual `--widths` override.

First `visual-qa-reviewer` pass came back FAIL: one blocking finding (the 2-column Home
grid centered each card's icon+body on its own height, so a card whose status wrapped to
two lines threw its row partner's title out of alignment — plus the middot/date wrapping
already described) and several notable ones (a `.btn--block` stretched to a ~685px slab
at 720px width, `.data-row`'s `space-between` stranding a label and value a few hundred
pixels apart, an admin tab sitting flush against the viewport edge at 640px, and the
rewards tier disclosure's run-on sentence). Fixed all of them — top-aligned the grid
card's icon+body block, capped `.btn--block` and `.data-row` width at the wide tier, gave
`.admin-tabs` trailing padding, and split the disclosure copy — then re-shot and confirmed
each one directly. Two findings were reviewed and intentionally left alone: MyCoverages'
"See what else you can add" button switching between primary and secondary styling
between members is the "one primary CTA per screen state" rule working correctly (it
demotes to secondary when a more urgent action — restoring lapsed coverage — is already
the page's primary), not an inconsistency; and the rewards store's low-contrast disabled
"N more points needed" button is a real, pre-existing issue unrelated to this change
(it's the disabled-state opacity used everywhere in the app) — already called out as a
deferred item in the earlier closing summary, left for a dedicated pass rather than
patched in isolation here.

## Dark mode, bolder yellow, native-app feel, bigger text, competitive bar

The human looked at a real screenshot after the wide-tier redesign and said it still
wasn't good enough: lean into the Wellabe yellow more, ship a real dark mode, make it feel
like an app instead of a website, use the space, make things bigger for a senior audience,
be more engaging — benchmarked against what people actually praise about Aetna, Mutual of
Omaha, and Cigna's apps, reviewed by a dedicated agent until it holds up. Two research
passes and one architecture-specific pass grounded this before any code changed: a
codebase audit of exactly how color/type/chrome are built, competitive research on named
insurers plus Devoted/Oscar/Humana/UHC/Sydney Health, and a dedicated dark-mode
architecture pass (this is a 12-page static app with no router or build step, so
theme-switching has real failure modes that needed solving up front, not discovered live).
The human chose, via explicit question: an **in-app manual toggle** (not just following the
OS setting), and **the whole app in one pass**, same as the wide-tier work.

**Dark mode.** Every color in `tokens.css` is now a custom property with a light value in
`:root` and, where it needs to differ, a dark value in a new `@media screen { :root[data-
theme='dark'] { ... } }` block — wrapped in `@media screen` specifically so print always
resolves the light values regardless of the active theme; a member with dark mode on who
prints a document from MyMailbox must not get a black page. Three things about it that
weren't obvious going in:

- **One color can't serve two roles once it inverts.** `--color-primary` in light mode is
  both "legible as text on a light surface" and "legible as a surface under white button
  text." Once it has to brighten for contrast on a dark surface, white text on top of it
  stops passing — the two requirements are mathematically incompatible for a single value
  (verified: the natural compromise clears neither at once). Fixed by splitting the
  foreground into its own token per fill color (`--color-on-primary`, `-on-success`,
  `-on-warning`, `-on-danger`, `-on-brand-yellow`) instead of assuming "always white on a
  filled control," which turned out to be a light-mode-only assumption baked into every
  component that used `--color-text-on-dark` for this. `--color-text-on-dark` itself
  survives, narrowed to its true meaning: chrome that's dark in *both* themes (the toast,
  the ID card's footer band) — not "the opposite of light mode."
- **Elevation inverts.** `--color-ink` (the toast, the ID card footer) has to get *lighter*
  than `--color-surface` in dark mode, not darker — otherwise it disappears into the page
  instead of reading as an elevated panel. `--color-surface-sunken` goes the other way,
  darker than both surface and page in dark mode, which is what keeps `.segmented`'s
  well/pill relationship (the sunken track vs. the raised selected pill) correct in both
  themes.
- **Brand yellow is a constant, not a surface.** It does not flip, and neither does its
  ink (`--color-on-brand-yellow`) — text on solid yellow needs one fixed color regardless
  of theme, the same way the brand mark itself doesn't change color by theme.
- Storage is `localStorage`, not `sessionStorage` — `auth.js`'s session-storage choice is
  about not leaving a device logged in as a specific member overnight, which is about
  identity. A theme preference carries none, and a demo where dark mode reverts on the
  next page load reads as a bug, not privacy hygiene. `logout()` does not clear it.
- Every page's `<head>` carries a byte-identical inline boot script, above the stylesheet
  `<link>`s, that reads the stored theme (falling back to system preference) and sets
  `data-theme` on `<html>` before first paint — the only way to avoid a flash of the wrong
  theme on every navigation in an app with no router, where each screen is a real page
  load. Wrapped in `try/catch`: `localStorage` *throws*, not returns null, in Safari
  private browsing, and this runs before `fatal-guard.js` is even registered.
- The document viewer (`.doc`, a rendered letter) is explicitly exempt — its tokens are
  re-pinned to their light values on the `.doc` selector itself, not with dark-block
  overrides, so the whole subtree (everything inside already resolves color through
  `var(--color-*)`) re-pins to paper in one place. The digital ID card is *not* exempt —
  it's an app surface, not a piece of mail, and themes normally.
- The toggle lives on the More screen as a full-width row (`role="switch"`, the entire
  64px band is the hit target, not a small puck) with an explicit "On"/"Off" status text
  next to the track+thumb visual — thumb position alone would be exactly the kind of
  color/shape-only status signal principle 2 above forbids.
- Fixed two real bugs found only by forcing dark mode on: `fatal-guard.js`'s error screen
  hardcoded near-black text with no background override, so it would have rendered
  illegibly on a dark page — the one screen built to survive total failure would have
  failed silently in dark mode specifically. And `.more-list`'s `overflow: hidden` (there
  to clip square row corners to the list's rounded corners) was clipping every row's focus
  ring, harmless while every row only navigated, disqualifying once one row became a
  keyboard-operated switch — fixed by moving the corner-radius to the first/last row
  instead of clipping the whole list.

**Bolder yellow, within the existing rule.** The accessibility constraint (yellow never as
text/border/status, 1.48:1 contrast) doesn't move — it's a floor, not a style preference.
But yellow's *sanctioned* roles (filled panels, points/rewards emphasis) were used narrowly
before this pass: tints and one full-bleed panel (the ID card band) in the whole app. Added
two more full-fill panels using the exact same sanctioned role: Home's greeting is now a
yellow hero panel, and MyRewards' balance card is now solid yellow instead of tinted
(`.card--accent-solid`, a new modifier — deliberately not a change to the shared
`.card--accent` tint class, which two other cards also use for a different purpose).

**Native-app feel.** Deepened `--shadow-raised` for more visible elevation; added a small
`:active` press-in (`scale(0.98)`) on buttons and section cards, and a background-tint
press state on row-style tappables (`.more-row`, `.data-row`'s button/link variant) — the
row treatment reads more like a native list-row press than a scale would on a thin
full-width band. Both respect `prefers-reduced-motion`, matching every other animation in
the codebase. Added a one-tap "View ID card" shortcut on Home's MyCoverages card — the
single most universally praised feature across every competitor app reviewed, specifically
because those apps surface it directly rather than behind a list → Details detour. Two
`<a>` tags can't nest, so this required a new card shape (`.section-card--split`: a plain
`div` carrying the card chrome, with two sibling links inside) rather than reusing the
single-link `.section-card` — the first instance of this pattern; documented in docs/01 so
it's the thing to reach for if another card needs a second, more specific shortcut later.
Defaults to the member's first active policy (or first policy, if none are active) when
choosing which policy's card to jump to.

**Explicitly not done:** reducing Home's eight section cards toward the "5–6 cards" figure
competitive research cites as the current market norm. docs/01 states "all eight section
cards live on Home" as a considered decision, and this round of work was about visual and
interaction polish, not information-architecture surgery — a real tradeoff worth revisiting
deliberately later, not something to change as a side effect of a styling pass.

**Bigger text.** `--text-sm` moved from 15px to 16px — it's the workhorse size for status
pills app-wide, every Home dashboard status line, and admin table bodies, i.e. exactly the
content principle 2 says must be readable in under two seconds. Also promoted three
`--text-xs` (13px) sites that carry real information rather than decoration up to
`--text-sm`: the ID card's field labels and plan-type label, the streak ring's "days" unit,
and MyCare's per-provider stat labels. Caught one regression from the `--text-sm` bump
during verification: `.section-card__status` was `white-space: nowrap` with ellipsis
truncation, sized for the old, smaller text — the bigger text made it start truncating
real information ("Paid through September 3, 2026") even in the single-column phone
layout, not just the 2-column wide tier this rule was originally written for. Changed to
wrap instead of truncate everywhere, not just the wide tier — a wrapped two-line status is
always better than a hidden one, at any width.

**New review subagent.** `.claude/agents/brand-experience-reviewer.md`, matching
`visual-qa-reviewer.md`'s format exactly, graded specifically on the five marks this round
of work targeted: brand presence, dark-mode correctness, native-app feel, senior
legibility, and the competitive bar sourced from this session's research — a second,
additional pass, not a replacement for the existing reviewer. `scripts/screenshot.mjs`
gained a `--theme dark` flag (plants `localStorage`'s `wellabe.theme` key via the same
`addInitScript` mechanism it already uses to plant the session) so both reviewers can be
run against dark-mode screenshots, not just light.

## Part 6 iteration: two full review rounds, blocking fixes, and what's still open

Ran both reviewers (`visual-qa-reviewer` and `brand-experience-reviewer`) against all 140
screenshots (every screen, light + dark, 375px + 640px). First round: both FAIL. Fixed
every finding either reviewer graded blocking, re-shot, re-reviewed. Second round: both
FAIL again, but on different, smaller defects — one new bug introduced by the first
round's own fix, plus a scope-level pattern neither reviewer had surfaced before.

**Real bugs found and fixed:**

- **The wide (640px) tier was architected wrong.** `.app-main` widened to 720px for every
  screen, but only Home actually reflows content into that extra width (its 2-column card
  grid). Every other screen — MyPayments, MyInformation, MyCoverages, MyRewards,
  MyMailbox, MyHealth — just got a wider container around an unchanged single-column
  layout, and the `.data-row`/`.btn--block` width caps added earlier to keep those elements
  from looking stretched (see the wide-tier redesign entry above) made it worse: dividers,
  buttons, and values stopped at their old cap while the card around them kept growing,
  producing four different right edges inside one card. Fixed by making the wide tier
  **opt-in** (`.app-main--wide`, applied only to `home.html`) instead of a blanket rule —
  every other screen now keeps its proven 375/430 layout at every width, which is honest
  given none of them have a wide-tier design yet, rather than a container that grows with
  nothing to fill it.
- **Home's streak ring never actually moved.** It was wired to *today's* checkbox state
  (0 or 1), not the streak count next to it, so a 0-day and a 45-day streak rendered
  pixel-identically — the one thing a progress ring must never do. Fixed by reusing
  MyHealth's own ring formula (`currentStreakDays / max(7, longestStreakDays)`) so the two
  screens' rings agree and the ring actually shows progress. Today's completion is still
  fully covered by the checkbox row directly beneath it.
- **MyRewards' locked store items were a disabled button at ~2–3:1 contrast** (`.btn[disabled]`'s
  45% opacity applied to already-mid-contrast secondary-button colors) shaped identically
  to the real "Redeem" button next to it — unreadable and looked like a broken tap target.
  Fixed by rendering it as plain text with a lock icon instead of a disabled button; no
  button chrome to look broken.
- **A CSS specificity collision truncated a real divider.** `.section-grid .section-card
  { align-items: flex-start }` (added to fix title misalignment when a card's status wraps
  to two lines) has the same specificity as `.section-card--split`'s own `align-items:
  stretch`, and wins by source order at the same breakpoint — so the MyCoverages card's
  second link ("View ID card") shrank to its own content width instead of spanning the
  card, truncating the divider above it to a stub. This one survived the *first* fix round
  because I checked a screenshot before scrolling to look closely at it and misjudged what
  I was looking at — a reminder that "I looked at it" isn't the same as "I looked closely
  enough." Fixed with a scoped `.section-grid .section-card--split { align-items: stretch
  }` re-assertion, later in the cascade.
- Unread notice pill changed from red (`.pill--danger`, colliding with Failed/Denied/
  Lapsed in the same list) to teal (`.pill--info`) — "new" and "something is wrong" were
  sharing a color.
- `.section-grid { align-items: start }` — grid's default `stretch` was matching every
  card's height to its row's tallest neighbor, which stretched MyMailbox's shorter card to
  match MyCoverages' new two-link card and stranded its chevron mid-card. Cards now keep
  their own height.
- Warmed the dark-mode yellow tint (`#332c10` → `#4a3a14`) — the original read as muddy
  olive-brown next to the vivid solid-yellow hero elsewhere on the same screen.

**What's raised but deliberately not done in this pass**, because it's IA/feature work,
not the visual/interaction polish this round was scoped to — flagged here so it isn't lost:

- Both reviewers, independently, want the digital ID card promoted to a full headline
  object on Home (card-shaped, not a text link) rather than the current "View ID card"
  link inside the MyCoverages tile. This is very likely right long-term — it's the single
  most-cited "what good insurance apps do" pattern in this session's own competitive
  research — but it's a real layout/IA change, not a styling fix, and deserves its own
  pass rather than being folded into a bug-fix cycle.
- MyClaims' populated state (one claim on file) leaves roughly two-thirds of the screen
  empty below the claim card — no status timeline, no "what happens next," no contact
  card. The empty *state* (zero claims) is already well-designed; the populated one needs
  the same care. Not attempted here — a real content/layout addition, not a fix.
- Status words on Home's own card grid ("· Lapsed", "Payment past due") still render as
  plain grey text rather than the icon+color pill used on MyCoverages/MyPayments
  themselves. Reusing that pill on Home's grid is a reasonable, contained next fix — flagged
  but not done this round given time spent on the blocking items above.
- MyCare's category chips still clip at the scrollable row's edge with no fade/scroll cue,
  and read as low-affordance (grey outline, no fill) — a real fix, deferred.
- A handful of `notable`/`minor` findings (Home's left-column grid gap where MyCoverages'
  taller card sets the row height; the admin tab strip still clipping mid-word with no
  scroll cue; "Add more coverage"'s button style differing between members depending on
  whether a more urgent action is present elsewhere on the same screen — confirmed
  intentional single-primary-CTA behavior, not a bug, same as logged earlier this session)
  are recorded in the review agents' own output rather than repeated verbatim here.

**Verdict at the point this session stopped:** both reviewers still return FAIL, on the
items above (the ID-card-as-hero and MyClaims-populated-state items are the two most
likely to keep failing a fresh review, since they're the largest and most clearly
IA-shaped). Every finding graded `blocking` across two full review rounds was fixed and
re-verified by screenshot. What's left is real, sourced from genuine competitive research,
and worth a dedicated next pass — but it's a different kind of work than this session's
"make it look and feel better" mandate, and shouldn't be rushed into the tail end of an
already-long session.

## Part 7: the deferred items, and four rounds of review

Picked up the five items Part 6 logged as deliberately deferred, then ran the review loop
to convergence. Two reviewers × four rounds against 144 screenshots (every screen ×
representative members × light/dark × 375/640).

**The ID card is now the headline object on Home**, not a text link inside the
MyCoverages tile. It renders a real card face — yellow band, wellabe mark, product type,
member name, policy number — spanning the full grid width, and taps through to the full
card. This was the "if only one thing gets fixed" recommendation from both reviewers
independently, sourced from the competitive research: the digital ID card is the single
most-praised feature across every insurer app looked at, specifically because those apps
surface it as something you *see*. It also let `.section-card--split` be deleted outright
— that component had caused two separate CSS bugs in as many rounds (a stretched card, a
truncated divider), and removing it is a net simplification, not just a feature swap.

**Everything else deferred from Part 6 also landed:** a condensed four-segment stage bar
on MyClaims list rows (reading from the same `STAGES` constant the full tracker uses, so
they can't disagree); status pills instead of grey text for bad states on Home; MyCare
chips given a real tappable treatment; the admin tab strip no longer clipping.

**The most instructive bug of the whole session** was the ID card in dark mode. Part 6
explicitly decided *not* to exempt `.idcard` from theming, reasoning it was "an app
surface, not a piece of mail." That was wrong, and the review caught it: in dark mode the
card's three-band structure (yellow header / white body / dark footer) collapsed to two
and it stopped reading as a card at all. The correct rule turned out to be the one already
applied to `.doc` — a facsimile of a physical object doesn't theme. Fixing it then
produced a *second*, worse bug: `.idcard--preview { color: inherit }` beat the pinned
`--color-text-primary` by source order, so the member's name and policy number inherited
the page's near-white text straight onto the now-white card face and vanished. Both
reviewers independently flagged that one as the single most important thing to fix. Worth
recording as a pattern: pinning tokens on a component only works if nothing inside it
re-opens the inheritance chain.

**Three attempts at a horizontal-scroll cue all failed, so the pattern was abandoned.** A
colour-matched gradient was invisible; a dark inset shadow was invisible on dark chrome; a
light inset shadow read as a bright smear over a mid-word clip. Both the MyCare chip strip
and the admin tab strip now **wrap** instead. The underlying lesson is that a horizontal
scroll affordance is genuinely hard to signal and this audience is the least likely to
discover a swipe — removing the need for the cue beat four rounds of trying to draw one.

**Also fixed across the rounds:** text inputs use the sunken token so they don't vanish
into their card in dark mode; segmented tabs carry a border so selection isn't hue-only;
the rewards meter stops going near-invisible cyan on the yellow panel; Home's "Needs your
attention" no longer carries good news (an unlocked offer now gets its own "Good news"
heading — putting a cross-sell under a header that means "something is wrong" is the
fastest way to make a senior audience distrust the header); April's MyPayments tile shows
the amount due alongside its pill; the cross-sell button on MyCoverages is secondary for
everyone rather than primary-for-some; one primary per card state on lapsed coverage; and
the ID card screen is titled "Member ID card" with a real `tel:` link to member services.

**Deliberately not done, and why.** Share / Save-to-wallet on the ID card screen: those
would be fabricated integrations, which CLAUDE.md forbids outright — the `tel:` link is
real (it hands off to the OS dialler) and the honest substitute for the rest is the
existing "you can also keep a screenshot" line. The brand reviewer accepted this
explicitly. Restructuring Home from eight equal cards into three or four large dashboard
tiles: still the reviewers' standing recommendation and still genuinely worth doing, but
it contradicts docs/01's stated "all eight section cards live on Home" and is IA surgery,
not the visual polish this work was scoped to. Same for adding a next-steps/timeline block
to the MyClaims list view. Both are logged here rather than done quietly.

**Where it ended.** Both reviewers' `blocking` findings were fixed and re-verified by
screenshot in every round. What remains in their reports is `notable` and below — mostly
the two IA items above, plus a tail of copy and density suggestions. The honest summary is
that the app cleared the bar it was failing (dark mode, brand presence, native feel,
legibility) and now sits against a bar that's about information architecture, which is a
different and larger piece of work.
