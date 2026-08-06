# CLAUDE.md — Wellabe Mobile App Prototype

You are building a working HTML/CSS/JS mobile-web prototype of the **Wellabe** member
app, deployed via **GitHub Pages**, backed by **Firebase** (Firestore + Storage). This
file is your entry point and orchestration plan. The `docs/` folder is your design bible.
Read it before writing code — it is not optional background reading, it is the spec.

Do not ask the human clarifying questions about product intent before starting. Every
open question you'd normally ask is either answered in `docs/`, or is explicitly flagged
in `docs/08-agent-workflow.md` as something to resolve yourself via the research subagent.
If you hit a real ambiguity `docs/` doesn't cover, make the most reasonable call, note it
in `DECISIONS-LOG.md`, and keep moving.

## Read order

1. `docs/00-product-brief.md` — why this exists, who it's for, what "done" means
2. `docs/01-design-system.md` — look and feel (check `/brand-assets/` first, see below)
3. `docs/02-architecture.md` — stack, folder layout, Firebase wiring, deployment
4. `docs/03-data-model-and-seed-data.md` — Firestore schema and the 8 seeded users + admin
5. `docs/04-features-core.md` and `docs/05-features-engagement.md` — every screen, with
   acceptance criteria
6. `docs/06-admin-console.md` — the admin data-viewer
7. `docs/07-testing-and-visual-qa.md` — how you prove a feature is actually done
8. `docs/08-agent-workflow.md` — full detail on the two phases below

## Brand assets check (do this before Phase 0)

Check for a `/brand-assets/` folder at the repo root (screenshots, a PPT, logos, color
references). `docs/01-design-system.md` ships with a **placeholder** palette and type
system built from general insurance/insurtech design research — it is explicitly marked
as a placeholder. If `/brand-assets/` exists and has content:

- Extract exact colors, type, spacing, and component style cues from it.
- Overwrite the placeholder tokens in `docs/01-design-system.md` with what you find.
- Log the change in `DECISIONS-LOG.md` under a "Brand alignment" entry.

If `/brand-assets/` is empty or missing, proceed with the placeholder system as-is and
note in `DECISIONS-LOG.md` that brand assets weren't available yet — the palette should
be easy to swap later since it's expressed as design tokens, not hardcoded everywhere.

## Phase 0 — Critique the design bible itself, before writing app code

This step exists because a design bible written in one pass, without engineering and UX
pushback, always has weak spots. Fix them before they're baked into code.

1. Spawn the `design-researcher` subagent (defined in `.claude/agents/design-researcher.md`)
   with the "weakest parts" prompt from `docs/08-agent-workflow.md` §1. It will read all of
   `docs/` and return the three weakest parts of the current design with concrete fixes.
2. Apply the fixes directly to the relevant `docs/*.md` files.
3. Record what was weak, what changed, and why in `DECISIONS-LOG.md` under "Design bible
   self-review."
4. Spawn `design-researcher` again with the "gap" prompt from `docs/08-agent-workflow.md`
   §2. It will research what similar apps do that this brief leaves out, and propose the
   single addition that would most improve the experience.
5. Add that feature to the appropriate doc (most likely `docs/04` or `docs/05`) with its
   own acceptance criteria, in the same style as everything else there.
6. Record the addition and its rationale in `DECISIONS-LOG.md` under "Gap-fill addition."

Do not skip straight to coding. This phase is short but it is the difference between a
design bible that was reviewed and one that wasn't.

## Phase 1 — Scaffold

Follow `docs/02-architecture.md` exactly for folder structure, file naming, and the
Firebase config wiring. Confirm `firebase-config.js` (or equivalent) is present with the
values the human already dropped in per `setup/FIREBASE-SETUP.md` — if it's missing or
still has placeholder values, stop and tell the human what you need, since you cannot
generate real Firebase credentials yourself.

Build the login screen and the routing shell first (see `docs/04-features-core.md` §Auth).
Nothing else works without it.

## Phase 2 — Build feature by feature

Build in this order. Each one has a **Definition of Done** in its doc — do not move to
the next feature until the current one clears both its written acceptance criteria *and*
a visual QA pass (see Phase 3, run continuously, not just at the end).

1. MyInformation (`docs/04-features-core.md`)
2. MyCoverages (`docs/04-features-core.md`)
3. MyPayments (`docs/04-features-core.md`)
4. MyClaims (`docs/04-features-core.md`)
5. MyRewards (`docs/05-features-engagement.md`)
6. MyHealth (`docs/05-features-engagement.md`)
7. MyCare (`docs/05-features-engagement.md`)
8. Admin console (`docs/06-admin-console.md`)
9. Seed data load for all 8 members + admin (`docs/03-data-model-and-seed-data.md`)

Within each feature, build the Firestore-backed real behavior, not a static mock —
acceptance criteria in `docs/04`/`docs/05` require actual read/write against Firestore
for the demo users to feel real when the ELT clicks around.

## Phase 3 — Adversarial visual QA (continuous, not a one-time gate)

After every screen or major UI state is buildable end to end, run it through the
`visual-qa-reviewer` subagent (`.claude/agents/visual-qa-reviewer.md`), per the process in
`docs/07-testing-and-visual-qa.md`. It looks only at rendered screenshots — phone width
and a larger phone/small-tablet width — and answers one question: **does this look and
feel like the best, easiest-to-use insurance app in the industry?** Fix anything it flags
before calling a screen done. Log recurring issues (not every individual fix) in
`DECISIONS-LOG.md` under "Visual QA patterns" so later screens don't repeat them.

## Phase 4 — Final pass

1. Re-run `visual-qa-reviewer` across the full app, both breakpoints, all 8 member seed
   states plus admin.
2. Confirm every acceptance criterion in `docs/04`, `docs/05`, and `docs/06` is met.
3. Confirm the seed data in `docs/03-data-model-and-seed-data.md` matches exactly —
   8 named members with deliberately varied states, plus the admin login.
4. Write a short closing summary at the bottom of `DECISIONS-LOG.md`: what's solid, what's
   intentionally thin (and why), and what you'd tackle first in the next iteration.
5. Do **not** touch anything under `setup/` or run any `git push`, GitHub Pages deploy
   steps, or repo/organization-level GitHub configuration — the human owns that per
   `setup/GITHUB-SETUP.md`. You may and should commit your work locally with clear,
   incremental commit messages as you go.

## Ground rules throughout

- **Never fabricate a real integration.** Fitness tracker sync, bank/card payment
  processing, and provider directories are explicitly fake per `docs/04`/`docs/05` — build
  believable fake data flows through Firestore, not calls to real third-party APIs.
- **Every self-service edit in MyInformation must actually persist to Firestore** and be
  reflected immediately in the UI and in what the admin console shows for that member.
- **Respect the guardrails**, especially: no changing gender/DOB without a documentation
  step, no payment success without a matching card on file, no rewards redemption that
  would take a points balance negative, no claim skipping intake state.
- **Keep it responsive.** Every screen must hold up on a small phone width and a large
  phone/small-tablet width — this is a hard acceptance criterion, not a nice-to-have.
- **Update `DECISIONS-LOG.md` as you go**, not retroactively. It's the record of every
  non-trivial judgment call for the human to review later.
