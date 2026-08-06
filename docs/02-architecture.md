# 02 — Architecture

## Stack

- **Frontend:** Plain HTML/CSS/JavaScript (ES modules), no build step required, so it
  deploys to GitHub Pages as static files with zero pipeline. A lightweight framework
  (Alpine.js or Preact via CDN/ESM) is fine *if* it meaningfully reduces repetition across
  seven similar-but-different sections — do not introduce a bundler/build toolchain
  (webpack, Vite, etc.) unless there is no other reasonable way forward, since it adds
  deployment complexity the brief doesn't need. If you do add one, document the exact
  build/deploy change in `setup/GITHUB-SETUP.md`'s "if a build step is added" section
  rather than silently changing what the human already set up.
- **Backend:** Firebase — **Firestore** (all structured data), **Cloud Storage** (claim
  photos, ID card images if generated as files rather than inline SVG/HTML).
  **No Cloud Functions and no real Firebase Auth** — see Auth below for why, and note the
  tradeoff explicitly in `DECISIONS-LOG.md` when you build it.
- **Hosting:** GitHub Pages, serving the static frontend directly. Firebase is reached
  entirely from client-side JS via the Firebase Web SDK (CDN or npm+bundle, per the
  no-build-step preference above — CDN `<script type="module">` imports from
  `firebasejs` are the simplest path and are preferred).

## Why no real Firebase Auth

Real Firebase Auth expects an email or federated identity. This brief calls for username =
first name, password = "Wellabe" for every member, case-insensitively, plus a separate
`admin`/`wellabe` login — that's a shared-password demo credential scheme, not real
authentication. Building it on top of Firebase Auth would require synthesizing fake emails
and would add complexity with no security benefit, since the "password" is public
knowledge by design for this demo. Instead:

- Store each user (8 members + admin) as a document in a `users` collection with a
  lowercase `usernameLower` field and a `role` field (`"member"` or `"admin"`).
- The login screen looks up `usernameLower` + checks the password against a fixed demo
  value, case-insensitively, entirely in client JS against Firestore.
- **This is explicitly not secure and is not meant to be.** State this plainly in
  `docs/03-data-model-and-seed-data.md` and in code comments at the login implementation:
  Firestore security rules for this prototype should still prevent a member from writing
  another member's documents (each member document write is scoped to its own `uid`/`memberId`
  field match), but read access for login lookup is necessarily open. Do not present this
  pattern as something to carry into a production build.

## Folder structure

```
/ (repo root — this is also the GitHub Pages publish root)
├── index.html                  # login screen
├── home.html                   # dashboard after login (member)
├── admin.html                  # admin console shell
├── /assets
│   ├── /css
│   │   └── tokens.css          # design tokens from docs/01-design-system.md
│   │   └── components.css      # shared components (status pill, card, button, etc.)
│   ├── /js
│   │   ├── firebase-config.js  # values from setup/FIREBASE-SETUP.md — the human fills
│   │   │                       # this in once; treat placeholder values here as a signal
│   │   │                       # to stop and ask, per CLAUDE.md Phase 1
│   │   ├── firebase-init.js    # SDK init, exports firestore/storage handles
│   │   ├── auth.js             # login/session logic described above
│   │   ├── seed.js             # one-time seed script for the 8 members + admin (dev tool,
│   │   │                       # not linked from the live app — run manually, once)
│   │   └── /features
│   │       ├── my-information.js
│   │       ├── my-coverages.js
│   │       ├── my-payments.js
│   │       ├── my-claims.js
│   │       ├── my-rewards.js
│   │       ├── my-health.js
│   │       └── my-care.js
│   └── /icons, /img            # line icons, fake ID card assets, provider photos
├── /pages                      # one HTML file per section screen (or per-section folder
│                                # if a section needs multiple screens/states)
├── /brand-assets                # human-provided screenshots/PPT — read-only input, never
│                                # shipped as app content, gitignore the raw PPT if large
├── /scripts
│   └── screenshot.mjs           # Playwright script for the visual QA loop — dev tool only,
│                                # never referenced by the live app, see docs/07
├── /tests
│   └── /rules                   # unit tests for the two rules files, run against the
│                                # Firebase emulator — dev only, `npm test`
├── /.github/workflows
│   └── deploy-firebase-rules.yml # tests then deploys both rulesets on push to main
├── docs/                        # this design bible — ships in the repo but is not part of
│                                # the live app; useful for the ELT/dev team to browse too
├── firebase.json, .firebaserc   # which rules files deploy, and to which project
├── cors.json                    # bucket CORS, applied by hand only if needed (§8 of setup)
├── storage.rules                # Cloud Storage rules — claim photo uploads
└── firestore.rules              # Firestore security rules
```

`firestore.rules` and `storage.rules` are drafted by Claude Code and deployed by the
GitHub Actions workflow above — Claude Code has no Firebase credentials and cannot deploy
them directly. See `setup/FIREBASE-SETUP.md` §7 for the one-time service-account setup.

Adjust file-per-screen granularity as needed once you see how much markup each section
actually needs — the important constraint is the top-level shape (root-served static site,
`assets/js/features/*` one module per section, `docs/` and `setup/` untouched by the app
itself), not the exact file count.

## Firebase wiring

1. `firebase-config.js` holds the config object the human pastes in from the Firebase
   console (see `setup/FIREBASE-SETUP.md`). Never invent placeholder-looking real-looking
   keys — if this file is missing or still has literal placeholder text, stop and say so.
2. `firebase-init.js` initializes the app once and exports the Firestore and Storage
   handles every feature module imports from — don't re-initialize per screen.
3. Firestore structure is defined in `docs/03-data-model-and-seed-data.md`. Read it in
   full before writing any feature module that touches data.
4. `firestore.rules` and `storage.rules` are drafted by Claude Code and deployed by
   `.github/workflows/deploy-firebase-rules.yml` on push to `main`. The human's one-time
   jobs are project creation and creating the deploy service account
   (`setup/FIREBASE-SETUP.md` §7).
5. Claim photo uploads go to Cloud Storage at `claims/{userId}/{claimId}/{fileName}`;
   store the resulting download URL on the claim's Firestore document, not the raw file.
   File names must be unique per upload — `storage.rules` makes a claim photo write-once,
   so an overwrite is rejected rather than silently replacing evidence.
6. **Security posture, stated plainly:** with no Firebase Auth, `request.auth` is always
   null, so the rules cannot enforce "member A may not write member B's documents." They
   enforce document shape, enum values, the claim state machine, the non-negative points
   balance, and gender/DOB immutability — everything that does not require identity. All
   reads are open, because login queries `users.usernameLower` and the admin console reads
   every collection from the same anonymous session. Seed fabricated data only. The full
   reasoning is in the header comment of `firestore.rules` and in `DECISIONS-LOG.md`.

## Deployment model

- GitHub Pages serves directly from the repo (root or `/docs`-as-pages is a GitHub Pages
  convention that would collide with this repo's own `/docs` folder — **do not use GitHub
  Pages' "serve from /docs" option**; serve from the repo root or a dedicated
  non-conflicting branch/folder per whatever the human set up in `setup/GITHUB-SETUP.md`).
- No CI/build step is required if the no-build-step preference above holds. If Pages is
  configured to build from a branch, a straight static-file push is sufficient.
- Firebase project's **Authorized domains** (Firebase console → Authentication → Settings)
  should include the GitHub Pages **host** — `<username>.github.io`, not the full URL.
  Be clear about what this does and doesn't do: it gates Firebase Auth sign-in flows only,
  and this project has no Firebase Auth. It will never cause or fix a Firestore or Storage
  error. A Storage upload that fails and *looks* like CORS is almost always a security
  rules denial (a 403 carries no CORS headers, so the browser mislabels it); genuine
  bucket-level CORS is handled by `cors.json` and the `gsutil` command in
  `setup/FIREBASE-SETUP.md` §8, which the human runs since it is project-level cloud
  config outside the repo.

## Dev-only screenshot tooling (for the visual QA loop)

`/scripts/screenshot.mjs` — a small Playwright (Node) script that:
- Launches a local static server against the repo root (e.g., `npx serve` or Python's
  `http.server`) pointed at whichever page/state needs review.
- Navigates to it, logs in as a specified seed member if needed, and captures a PNG at
  both breakpoints defined in `docs/01-design-system.md`.
- Saves screenshots to a gitignored `/scripts/output/` folder for the `visual-qa-reviewer`
  subagent to read.

This tool never ships to GitHub Pages and is not linked from any real app page — it exists
purely to give the visual QA subagent something to look at. See
`docs/07-testing-and-visual-qa.md` for the exact review process built around it.

## Definition of done for architecture

- The app runs entirely as static files against a real Firebase project with no build
  step (or a documented, justified one).
- Every feature module reads/writes real Firestore data — nothing in the shipped app is a
  hardcoded mock once `docs/03`'s seed data has been loaded.
- The screenshot tooling works locally and produces usable input for the visual QA subagent.
