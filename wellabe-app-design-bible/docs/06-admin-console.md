# 06 — Admin Console

Purpose: a single login (`admin`/`wellabe`) that gives internal/ELT viewers a clean,
readable view into everything stored across every collection, for every member — this is
explicitly a different audience and a different job than the member-facing app, and it
should look and feel different, not like a member screen with extra fields.

## Structure

A tab (or sidebar, at the larger breakpoint) per data domain, not per raw collection name
— organize for readability, the way a real internal ops tool would, not as a literal
Firestore collection browser:

- **Members** — every `users` document (member role only), as a table/list: name, product(s)
  held, coverage status, paid-through date, points balance/tier, current health streak.
  This is the "everyone at a glance" view and should be the default tab.
- **Coverages** — every `policies` document across every member, with member name joined
  in (never show a raw `userId` with no readable name next to it anywhere in this console).
- **Payments** — every `payments` document across every member, most recent first, with
  status clearly visible (success/failed).
- **Claims** — every `claims` document across every member, with its current stage visible
  using the same status-pill component style as the member app (reuse the component, don't
  reinvent a second style for admin).
- **Rewards** — `rewardsAccounts` balances/tiers per member, plus a browsable
  `rewardsTransactions` feed across everyone.
- **Health** — `healthProfiles` per member, including who currently qualifies for the
  guaranteed-issue offer (this should be trivially visible — an ops/underwriting viewer
  would specifically want this at a glance).

## Design requirements

- Reuse the design tokens and shared components from `docs/01-design-system.md` — this is
  still a Wellabe-branded surface, just a denser, table-oriented one, using
  `--color-secondary` (navy) as the dominant chrome color to visually distinguish it from
  the member app's teal-forward look without looking like an unrelated product.
  Tables are the right default here, unlike the rest of the app.
- Every table/list must be actually readable at a glance — sensible column widths, a clear
  header row, and status shown with the same pill component used member-side, not a raw
  string.
- No editing from the admin console is required by the brief — this is a viewer, not a
  back-office tool. Don't build write actions here unless a later iteration specifically
  asks for them.
- Include a simple way to filter/jump to a single member's full picture across domains
  (e.g., tapping a member's name in the Members tab filters every other tab to that
  member) — this is worth the small extra build effort because it's exactly what an ELT
  viewer will want to do in the live demo: "show me everything about Sara."

## Acceptance criteria

- [ ] Every one of the 8 seeded members' data is visible and correctly attributed across
  every relevant tab.
- [ ] Status information (coverage active/lapsed, payment success/failed, claim stage)
  uses the same pill component and colors as the member-facing app.
- [ ] The admin login never sees or is offered any of the seven member-facing sections —
  it's a genuinely separate experience, reachable only via the admin/wellabe login.
- [ ] Tapping into a single member from the Members tab filters the rest of the console to
  that member, and there's a clear way back to the full view.
- [ ] The console holds up at both breakpoints from `docs/01-design-system.md` — tables can
  reasonably become stacked card-per-row at the narrow breakpoint if a literal table
  doesn't fit; that's expected, not a bug.
