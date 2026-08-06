# 00 — Product Brief

## What this is

A working mobile-web prototype of the Wellabe member app: real functionality on the core
flows, a fake-but-convincing backend, deployed as a static site on GitHub Pages with
Firebase (Firestore + Storage) doing the data work. It is being built to demo to Wellabe's
ELT, and it needs to hold up in a live click-through, not just look good in screenshots.

## The company, for context

Wellabe is the unified brand (since 2023) for a group of life and health insurance
companies based in Des Moines, Iowa, tracing back to 1929. Wellabe serves a predominantly
senior/near-senior market with Medicare Supplement, Dental, Hospital Indemnity, Short-Term
Care, Critical Illness, and Preneed products. That member base matters for every design
decision downstream: favor clarity and larger touch targets over density, never assume
high digital fluency, and never let "delightful" come at the cost of "obvious."

## The goal

Wellabe's stated ambition is to be a leading digital insurance company by 2030. This app
prototype is a concrete step toward that: an app members open multiple times a week (not
just at renewal or claim time), that feels like the easiest app to use in the industry, and
that demonstrates real self-service depth across information, coverage, payments, claims,
rewards, and health engagement.

## Primary users

- **Members** — existing Wellabe policyholders, most in or near retirement, managing one
  or more of Wellabe's six product lines. Comfortable with smartphones but not necessarily
  with fine print or app conventions common in fintech-native audiences.
- **Admin/internal** — a separate, simplified login used for the ELT demo and internal
  review, to see all seeded data across every member and every collection.

## What "done" looks like for this build

- All seven member-facing sections work end to end against real Firestore data for all
  8 seeded demo members: MyInformation, MyCoverages, MyPayments, MyClaims, MyRewards,
  MyHealth, MyCare.
- The admin console shows every collection, every member, in a genuinely readable way —
  not a raw JSON dump.
- The app looks and feels cohesive, professional, and clearly "Wellabe" rather than a
  generic template, on both a small phone width and a larger phone/small-tablet width.
- The build went through the Phase 0 design-bible critique and the continuous adversarial
  visual QA loop described in `CLAUDE.md` — this isn't optional polish, it's part of the
  definition of done.
- Every acceptance criterion listed in `docs/04`, `docs/05`, and `docs/06` is met.

## What this explicitly is not

- Not a production app. No real payment processor, no real claims adjudication, no real
  fitness-tracker integration, no real provider directory, no production-grade auth.
  Every one of those is a believable simulation running on Firestore data.
- Not the final design. This is meant to get to roughly 80% in one pass, then get refined
  after real user testing with the ELT and beyond. Acceptance criteria describe "good
  enough to demo and iterate from," not "finished."

## Design north star

Every screen should be answerable against this single question, which is also the
standard the adversarial visual QA subagent uses:

> Does this look and feel like the best, easiest-to-use insurance industry mobile app?

If a feature technically works but a first-time user would hesitate, misread a status, or
feel talked down to or overwhelmed, it isn't done yet.
