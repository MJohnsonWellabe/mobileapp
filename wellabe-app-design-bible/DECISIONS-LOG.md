# Decisions Log

This file is a running record of non-trivial judgment calls made while building the
Wellabe app prototype. Claude Code appends to it throughout the build per `CLAUDE.md`.
It is not a commit log — it's a record of *why*, for the human to skim later.

Keep entries short: what the situation was, what was decided, and why. Use the section
headers below as they come up; add new ones if a build phase needs a category that isn't
listed.

---

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
