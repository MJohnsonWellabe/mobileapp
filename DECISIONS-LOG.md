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

*(Filled in during the brand-assets check, if `/brand-assets/` had content — otherwise
note here that placeholder tokens were used and brand assets weren't yet available.)*

## Design bible self-review (Phase 0, weakest-parts pass)

*(Filled in by the `design-researcher` subagent's first pass — three weakest parts found,
what changed in `docs/` to fix each, and why.)*

## Gap-fill addition (Phase 0, omitted-feature pass)

*(Filled in by the `design-researcher` subagent's second pass — the one thing the brief
left out, the research behind why it matters, and where it landed in the docs.)*

## Feature-level judgment calls

*(One entry per feature, only when a real judgment call was made — not for every routine
implementation choice already specified in the docs.)*

## Visual QA patterns

*(Recurring issues the `visual-qa-reviewer` subagent flagged more than once, and the fix
applied so later screens don't repeat them — not a log of every individual screenshot
review.)*

## Closing summary

*(Filled in at the end of Phase 4: what's solid, what's intentionally thin and why, and
what to tackle first in the next iteration.)*
