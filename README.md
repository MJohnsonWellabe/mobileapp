# Wellabe Mobile App — Design Bible & Claude Code Prompt Package

This repo holds a complete "design bible" for building the Wellabe mobile app prototype
with Claude Code, plus the Firebase wiring and security rules it builds against. The app
itself is served as static files from this same root by GitHub Pages.

## What's in here

```
/ (repo root — also the GitHub Pages publish root)
├── CLAUDE.md                          ← Claude Code reads this automatically. Start here.
├── DECISIONS-LOG.md                   ← Living log Claude Code writes to as it makes decisions
├── .claude/agents/
│   ├── design-researcher.md           ← Subagent: critiques the design bible itself
│   └── visual-qa-reviewer.md          ← Subagent: adversarial screenshot review during build
├── docs/
│   ├── 00-product-brief.md            ← Vision, goals, personas, success criteria
│   ├── 01-design-system.md            ← Visual language, tokens, components, brand alignment
│   ├── 02-architecture.md             ← Tech stack, folder structure, Firebase/GitHub Pages wiring
│   ├── 03-data-model-and-seed-data.md ← Firestore schema + the 8 seeded demo users + admin
│   ├── 04-features-core.md            ← Auth, MyInformation, MyCoverages, MyPayments, MyClaims
│   ├── 05-features-engagement.md      ← MyRewards, MyHealth, MyCare
│   ├── 06-admin-console.md            ← The admin-only data-viewer experience
│   ├── 07-testing-and-visual-qa.md    ← Acceptance-testing process + the adversarial review loop
│   └── 08-agent-workflow.md           ← How/when the two subagents get invoked, and by whom
├── setup/
│   ├── FIREBASE-SETUP.md              ← Step-by-step for YOU to run once, by hand
│   └── GITHUB-SETUP.md                ← Step-by-step for YOU to run once, by hand
├── brand-assets/                      ← Screenshots and look-and-feel PPT (read-only input)
├── firestore.rules, storage.rules     ← Security rules; deployed by GitHub Actions
├── firebase.json, .firebaserc         ← Which rules deploy, and to which project
├── cors.json                          ← Bucket CORS, applied by hand only if needed
├── assets/js/firebase-config.js       ← Firebase web config (safe to commit)
├── assets/js/firebase-init.js         ← Initializes the SDK once; exports db + storage
├── tests/rules/                       ← Rules unit tests — `npm test`
└── .github/workflows/                 ← Tests then deploys the rules on push to main
```

Everything below `assets/` beyond the two Firebase files, plus `index.html`, `pages/`, and
`scripts/`, is what Claude Code builds. See `docs/02-architecture.md` for the target tree.

## How to use this

1. **You do the one-time human setup first.** Follow `setup/FIREBASE-SETUP.md` and
   `setup/GITHUB-SETUP.md` yourself — create the Firebase project, the Firestore database
   and Storage bucket, and the deploy service account (`FIREBASE-SETUP.md` §7). Claude Code
   takes over from there for all app code. It cannot deploy security rules itself — it has
   no Firebase credentials — so rules deploy through GitHub Actions once that service
   account secret exists.
2. **Drop your screenshots and the look-and-feel PPT into `/brand-assets/`** at the repo
   root before you start Claude Code, if you have them ready. `docs/01-design-system.md`
   currently contains a placeholder palette built from general insurance/health-brand
   research — it explicitly tells Claude Code to override those tokens with whatever it
   finds in `/brand-assets/` and to log the change. If you don't have assets ready yet,
   start anyway; you can drop them in and re-run the design-system step later.
3. **Point Claude Code at this folder** and literally say "Follow CLAUDE.md." Everything
   else — spawning the research subagent, fixing the weakest parts of the design bible,
   researching one omitted feature, building screen by screen, running the adversarial
   visual QA subagent, updating the decisions log — is already specified inside `CLAUDE.md`
   and the docs it points to.
4. **Expect iteration.** This is scoped to get you a strong first pass (the brief's own
   target is ~80% in one shot), not a finished product. The acceptance criteria in
   `docs/04` and `docs/05` are the bar for "done enough to demo," not "done forever."

## A few things worth knowing before you start

- **This is a prototype with a fake backend, on purpose.** Payments don't touch a real
  processor, claims don't hit a real adjudication engine, and login is a simple
  username/password lookup against Firestore — not production-grade auth. That's called
  out explicitly wherever it matters so nobody mistakes this for something it isn't.
- **The demo users are seeded on purpose to be uneven.** Dave, Sara, Eric, April, Debbie,
  Dennis, Todd, and Matt each get different coverage, claims, payment, rewards, and health
  states specifically so your ELT can each open the app and see a different slice of what
  it does. The exact seed spec is in `docs/03-data-model-and-seed-data.md`.
- **The visual QA subagent needs a way to take screenshots.** `docs/02-architecture.md`
  and `docs/07-testing-and-visual-qa.md` set up a small Playwright script for this. It's a
  dev-only tool and never ships to GitHub Pages.
