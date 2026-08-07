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
