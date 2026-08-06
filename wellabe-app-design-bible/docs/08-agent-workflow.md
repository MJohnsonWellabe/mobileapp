# 08 — Agent Workflow

This build uses two subagent definitions, both in `.claude/agents/`. This doc is the
detailed reference for how and when each gets invoked; `CLAUDE.md` has the short version
inline in the build phases. If the two ever disagree, `CLAUDE.md`'s phase ordering wins —
this doc exists to give the *reasoning* and exact prompts, not to override the sequence.

## `design-researcher` — Phase 0 only (two invocations)

This subagent exists to catch what one unreviewed pass at a design bible always misses.
It runs **before any app code is written**, not during or after the build — critiquing a
design bible is a different job from critiquing a running app (that's what
`visual-qa-reviewer` is for), and doing it first means fixes land in the spec instead of
as a rewrite later.

### Invocation 1 — weakest parts

Spawn with a prompt along these lines (adapt paths/specifics as needed, but keep the
instruction to read everything and be concrete):

> Read every file in `docs/` in full. This is the design bible for a Wellabe (life and
> health insurance) member app prototype, about to be built. Find the three weakest parts
> of this plan — vague sections, internal inconsistencies, likely-bad UX, missing or
> unverifiable acceptance criteria, anything that risks embarrassing whoever demos this to
> their ELT. Back your findings with real research into how comparable apps handle the
> same problem. For each of the three, give: what's weak, why it matters, and a concrete
> fix specific enough to apply directly to the docs.

Apply the fixes returned to the relevant `docs/*.md` files yourself — the subagent
proposes, the main session edits. Log each of the three in `DECISIONS-LOG.md` under
"Design bible self-review," briefly: what was weak, what changed.

### Invocation 2 — the omitted feature

Spawn with a prompt along these lines:

> Read every file in `docs/` in full, especially `docs/00-product-brief.md` and the
> feature specs. Research what comparable best-in-class insurance, health-insurance member
> portal, and health/wellness engagement apps commonly include that this brief does not.
> Propose the single addition that would most improve real-world user experience for this
> specific app and member base — one thing, chosen for leverage, not for ease. Write it at
> the same level of specificity as the existing feature docs, including a first pass at
> acceptance criteria, and say where it belongs in the existing doc structure.

Add the returned feature to the appropriate doc (`docs/04-features-core.md` or
`docs/05-features-engagement.md`, matching the subagent's own recommendation on where it
belongs, unless that recommendation is clearly wrong) in the same style as everything
already there — same heading structure, same acceptance-criteria checklist format. Log it
in `DECISIONS-LOG.md` under "Gap-fill addition."

### Why two separate invocations rather than one combined prompt

Each job benefits from full, undivided attention on `docs/` — the first pass is looking
for what's already there and wrong; the second is looking for what should be there and
isn't. Combining them tends to produce shallower answers on both. Two clean invocations,
each producing one focused, well-evidenced answer, is worth the extra call.

## `visual-qa-reviewer` — continuously through Phases 2–4

Unlike `design-researcher`, this one runs repeatedly, throughout the actual build, per the
process in `docs/07-testing-and-visual-qa.md`. The short version: screenshot a screen at
both breakpoints for whichever seeded member(s) exercise its interesting states, spawn the
subagent against those screenshots, treat a blocking finding as a hard stop, and run a
final full-app pass in Phase 4 before calling the build done.

Do not let this subagent see or discuss source code — its entire value comes from judging
only what a real user would actually see, which is also why it's deliberately given no
Edit/Write tools: it reviews and reports, it doesn't fix.

## Decisions log discipline

Every time either subagent's output leads to a real change — a doc edit, a new feature, a
UI fix — record it in `DECISIONS-LOG.md` as it happens, under the matching section header
that file already has. The goal is a log the human can skim in five minutes and understand
every non-obvious call that was made and why, not a transcript of every tool call.
