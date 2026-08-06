# 07 — Testing & Visual QA Process

This app is tested in two different ways, and both are required — one proves the feature
*works*, the other proves it *looks and feels right*. Neither substitutes for the other.

## 1. Functional acceptance testing

Every feature doc (`docs/04-features-core.md`, `docs/05-features-engagement.md`,
`docs/06-admin-console.md`) ends in a literal checklist. "Testing" a feature means
actually doing the thing described, as the specific seeded member called out, and
confirming the real result in Firestore/the UI — not reasoning about whether the code
*should* work. Concretely:

- Log in as the seeded member the criterion names (e.g., "log in as April, let a card
  payment with a mismatched last-4 fail, confirm no `payments` document with
  `status: "success"` was written").
- For anything with cross-feature effects (a MyPayments success updating MyCoverages'
  paid-through date; a MyHealth challenge crediting MyRewards' points), confirm the second
  surface actually reflects the change, not just the first.
- Re-run `seed.js` occasionally as you build to confirm it stays idempotent — a common
  failure mode is a schema change in one feature module quietly breaking what an earlier
  feature module expected from seed data.

Do not mark a feature's acceptance criteria complete in your own working notes until
you've done this for every checkbox, for every seeded member named in that criterion.

## 2. Adversarial visual QA (the `visual-qa-reviewer` subagent)

Functional correctness doesn't catch a button sitting on top of another button, text
overflowing a card, or an admin screen that looks like a different product than the
member app. That's what this loop is for, and it runs continuously through the build, not
just at the end (see `CLAUDE.md` Phase 3 and Phase 4).

### The screenshot tool

`/scripts/screenshot.mjs` (Node + Playwright) is the only way the `visual-qa-reviewer`
subagent sees the app — it never reads source code. Build it early, in Phase 1, alongside
the scaffold, since every later phase depends on it:

- Starts a local static server against the repo root.
- Accepts a target (a page path, and optionally which seeded member to log in as first)
  and a list of breakpoints.
- For each breakpoint (see `docs/01-design-system.md`: ~375px and ~430–600px), sets the
  viewport, navigates, waits for content to settle, and saves a PNG to a gitignored
  `/scripts/output/` folder with a filename that encodes the screen, member, and
  breakpoint (e.g., `my-claims_debbie_375.png`).
- Supports **a third target for the MyMailbox document viewer: print preview**, captured
  with Playwright's `page.emulateMedia({ media: 'print' })`. A document that looks right on
  screen and drags app chrome, navigation, or a clipped page into the printout is a defect,
  and it is invisible to a normal screenshot.
- Should be runnable for a single screen ("just show me MyClaims as Debbie at both
  sizes") or for a batch (used in the Phase 4 full-app pass).

### Running a review

1. After a screen or major UI state is buildable end to end, run `screenshot.mjs` for it,
   for the relevant seeded member(s) — pick whichever seeded member(s) best exercise that
   screen's interesting states (e.g., MyClaims should be screenshotted as Sara, Todd, *and*
   Debbie, since each shows a different tracker state).
2. Spawn `visual-qa-reviewer` (`.claude/agents/visual-qa-reviewer.md`) and point it at
   those screenshots.
3. Treat a `FAIL` verdict as blocking — fix every "blocking" finding before moving on. Use
   judgment on "notable"/"minor" findings, but don't accumulate a backlog of them; a
   handful of small issues across many screens adds up to exactly the "doesn't feel
   professional" outcome this loop exists to prevent.
4. If the same kind of issue shows up on a second, unrelated screen, treat it as a pattern
   (a shared component problem, not a one-off) — fix the shared component/CSS rule once,
   and add a short note to `DECISIONS-LOG.md` under "Visual QA patterns" so it doesn't
   recur on the screens you haven't built yet.

### Phase 4 full pass

Before considering the build done, run the screenshot tool across every screen, every
relevant seeded member state (all 8 members plus admin, at minimum touching every state
called out in `docs/03-data-model-and-seed-data.md`'s per-member table), at both
breakpoints, and run `visual-qa-reviewer` across the full set. Every screen must come back
`PASS` before the closing summary in `DECISIONS-LOG.md` is written.

## What "done" means, restated

A feature is done when its functional acceptance criteria are literally verified against
real data for the members that matter to it, *and* its screens have cleared a
`visual-qa-reviewer` `PASS` at both breakpoints. Either one alone is not done.
