# 04 — Core Features: Auth, MyInformation, MyCoverages, MyPayments, MyClaims

Every feature section below follows the same shape: what it is, what it must do, and the
acceptance criteria that define done. Acceptance criteria are meant to be checked
literally — if you can't point to the exact thing that satisfies one, it isn't met yet.

**Review process for every feature in this doc** (also stated once in `CLAUDE.md`, worth
repeating here): build against real Firestore data for the seeded members, verify every
acceptance criterion below by actually exercising it (log in as the relevant seeded member
and do the thing), then run the `visual-qa-reviewer` subagent per
`docs/07-testing-and-visual-qa.md` before considering the feature done.

---

## Auth (login + session)

The landing page is the login screen: Wellabe mark, a username field, a password field,
and a single "Log In" button. No "forgot password," no "sign up" — this is a closed demo
set of 8 members plus admin, and the copy shouldn't imply otherwise.

- Username and password matching is case-insensitive for both members and admin (per the
  brief, and per `docs/02-architecture.md`'s Auth section for how this is implemented).
- A successful member login routes to the member home dashboard; a successful admin login
  routes to the admin console (`docs/06-admin-console.md`) — visually distinct enough that
  no one could confuse the two.
- A failed login shows a clear, friendly inline error, not a browser alert, and does not
  reveal whether the username or the password was wrong.
- Session persists across a page reload (e.g., via `sessionStorage`/`localStorage` holding
  the logged-in `userId`) until an explicit "Log Out" action, available from the top app
  bar on every member and admin screen.

**Acceptance criteria**
- [ ] All 8 seeded members and the admin account can log in with `FirstName` / `Wellabe`
  (or `admin` / `wellabe`) in any letter-casing.
- [ ] Wrong credentials show an inline error and never route anywhere.
- [ ] Reloading the page while logged in keeps the member logged in and on a sensible
  screen (not bounced back to login).
- [ ] Log out is reachable in one tap/click from anywhere and returns to the login screen.

---

## MyInformation

Purpose: a single place to view and, within limits, edit personal information.

**Displays:** name, gender, date of birth, email, phone, preferred contact method, mailing
address. Layout uses the data-row component from `docs/01-design-system.md`.

**Editable directly, in place, saving immediately to Firestore:** email, phone, preferred
contact method, mailing address. Each field save gives immediate visual confirmation (inline
checkmark or toast) and the new value is what's shown on next load — no local-only edits.

**Not directly editable — gender and date of birth:** tapping either opens a short
explanation that changing this requires documentation, with a "Start a Request" action.
The action can be a simple confirmation ("Your request has been received; someone from
Wellabe will follow up") that logs a request record rather than a real workflow — the
brief doesn't need a full documentation-upload pipeline here, just the correct guardrail
and a believable next step. Do not let this field silently become editable.

**Acceptance criteria**
- [ ] Editing email, phone, preferred contact method, or address updates Firestore
  immediately and the admin console reflects the change for that member without a
  manual refresh workaround (a normal live-query or on-load re-read is fine).
- [ ] Attempting to change gender or DOB never results in a direct field edit — it always
  routes through the documentation-request explanation first.
- [ ] All fields are legible and editable comfortably at both breakpoints, with obviously
  large enough tap targets for an older user base.

---

## MyCoverages

Purpose: show what the member has, make it easy to understand, and make it easy to add
more.

**For each policy the member holds**, show: product name/plan name, a one-line plain-
English description of what it covers (from `policies.coverageSummary`), policy number,
status pill (Active/Lapsed, driven by `paidThroughDate` vs. today), and a "View ID Card"
action.

**ID card:** render as a designed on-screen card component (HTML/CSS, not a static
image) showing member name, policy number, product/plan name, and a customer service
number — styled to actually look like an insurance ID card, not a data table. This is one
of the artifacts most likely to get inspected closely in a live demo; it should look
finished.

**"Add More Coverage":** a clearly visible entry point (own card/section, not buried) that
leads to a simple product picker among the 6 Wellabe product lines the member doesn't
already hold, then a short enrollment flow **pre-filled** with the member's existing
MyInformation data, ending in a confirmation state (this can and should stop short of a
real underwriting flow — the brief calls for the appearance of a real self-serve
enrollment start, not real underwriting). At any point in this flow, a persistent
"Talk to an Agent" action must be visible (see below).

**"Talk to an Agent":** available from the Add More Coverage flow and from each policy's
detail view. For this prototype, it can open a simple contact card (phone number, hours)
rather than a live chat integration — make that explicit in the UI copy, don't imply a
live agent will actually respond.

**Acceptance criteria**
- [ ] Every seeded member's actual policy/policies render correctly, matching
  `docs/03-data-model-and-seed-data.md`'s per-member table (including Matt's two policies
  and April's lapsed status).
- [ ] The ID card looks like a designed artifact, correct for the logged-in member, at
  both breakpoints.
- [ ] Add More Coverage only offers products the member doesn't already hold, and the
  enrollment flow's fields are genuinely pre-filled from that member's MyInformation data.
- [ ] "Talk to an Agent" is reachable from both the policy detail view and the enrollment
  flow, and its copy doesn't overpromise what happens next.

---

## MyPayments

Purpose: let a member make a premium payment against any policy they hold.

**Flow:** pick a policy (if more than one) → enter an amount → choose card or bank →
enter card number (or select the bank account on file) → submit.

**Validation logic (must match exactly):**
- If paying by card, the entered card number's last 4 digits must match
  `users.cardOnFile.last4` for that member. A mismatch shows a clear failure message and
  does **not** write a successful payment record.
- A matching card produces a success toast/confirmation, writes a `payments` document with
  `status: "success"`, and updates the policy's `paidThroughDate` forward by however many
  billing periods the payment amount covers (simple math based on `premiumAmount` and
  `premiumFrequency" is fine — this doesn't need proration logic).
- Bank auto-draft setup is a separate, simple toggle/flow: member enters a bank account
  number, it's stored as `bankAccountOnFile`, `autopayEnabled` flips true on the policy,
  and future "payments" for that policy can be simulated as already-succeeded records on
  their due dates by `seed.js`/a small helper — no real recurring job is needed for a
  static-hosted prototype.
- State plainly in the UI, once, near the payment form: this is a demo payment flow with
  no real processor behind it. Don't hide that it's fake, but don't make it look
  unfinished either — the guardrail logic (card match required) should still feel real and
  well-built.

**Acceptance criteria**
- [ ] Paying with the correct last-4 card number succeeds, shows a success confirmation,
  and visibly updates the paid-through date shown elsewhere in the app (MyCoverages, home
  dashboard) without a page reload being required to see it update within the same session
  (a live Firestore listener or an on-navigate re-fetch both satisfy this).
- [ ] Paying with a non-matching card number fails with a clear message and creates no
  successful payment record.
- [ ] Setting up bank auto-draft persists to Firestore and is reflected on the policy.
- [ ] April's seeded lapsed/past-due state is visible and resolvable — paying successfully
  as April should bring her policy back to Active.

---

## MyClaims

Purpose: submit a claim with a photo, and track it through to resolution — the "pizza
tracker" experience described in the brief.

**Submission:** pick a policy → short description field → photo upload (device camera or
file picker) → submit. On submit: upload the photo to Cloud Storage, create a `claims`
document with `status: "Intake"` and a generated `claimNumber`, and show a confirmation
with that claim number.

**Tracker:** a horizontal or vertical step tracker showing **Intake → Processing →
Reviewing → Paid**, with the current stage clearly highlighted and past stages marked
complete, each with its timestamp from `statusHistory`. This is explicitly modeled on the
"pizza tracker" pattern the brief calls out — status must always be legible at a glance,
and a claim must never appear to skip a stage.

**Denial path:** when `status === "Denied"`, the tracker shows a distinct end state (not
just "Paid" recolored red) with the plain-language `deniedReason` and a clear next-step
action (e.g., "Request a Review" or "Talk to an Agent" — pick one and make it functional
enough to feel real, per the same standard as MyCoverages' agent contact). Debbie's seeded
denied claim is the test case for this.

**List view:** members with more than one claim (Matt) see a simple list, most recent
first, each row showing status pill + claim number + policy, tapping into the full tracker
detail.

**Acceptance criteria**
- [ ] Submitting a claim with a photo creates a real Firestore document and a real Cloud
  Storage upload, and immediately shows the new claim at "Intake."
- [ ] The tracker for Sara (Processing), Todd (Paid), and Debbie (Denied) each render
  correctly and distinctly for their seeded state.
- [ ] A denied claim shows a specific reason and a working next-step action, never a bare
  "Denied" with no explanation.
- [ ] Matt's two claims show correctly as a list, each opening its own correct tracker.
- [ ] No UI path allows a claim's status to move backward or skip a stage.
