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
- [ ] Log out is one tap from Home and at most two taps from any other screen
  (More → Log Out), and returns to the login screen with session storage cleared. (An
  earlier version of this criterion said "one tap from anywhere"; that is not achievable
  alongside a top app bar that stays legible at 375px — see `docs/01` §Navigation.)
- [ ] The top app bar contains at most three interactive elements at 375px, and the screen
  title is never truncated on any section screen.
- [ ] The bottom tab bar is present and correctly highlighted on every member screen at
  both breakpoints, and no sticky action button is ever overlapped by it.

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
status pill, and a "View ID Card" action. The pill comes from the shared
`coverageStatus(policy)` helper defined in `docs/03` — Active / Past due / Lapsed, derived
from `paidThroughDate` alone. No screen reads `policies.status` to render a pill.

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
detail view. It opens a contact card with a phone number and hours, and — because a
dead-end contact card is a weak answer — a **"Send a message instead"** action that routes
into the MyMailbox composer with the topic and `relatedTo` pre-filled. Copy must not imply
a live agent responds in the app.

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

**Flow:** pick a policy (if more than one) → choose an amount from a preselected list →
confirm the card on file (or the bank account on file) → submit.

**Amount selection — never an empty dollar field.** A radio list, first option preselected:

- **"Amount due now — $174.00"** (preselected default)
- **"One premium period — $58.00"** (shown only when it differs from the amount due)
- **"Another amount"** — selecting this, and only this, reveals a numeric field
  (`inputmode="decimal"`)

An empty amount field is both a decision and a typing task on a phone keypad, for a member
who mostly wants to pay what they owe. Every mainstream insurer bill-pay flow defaults to
the amount due and treats "other" as the exception.

**The period math — implement exactly this.** It is what makes April's criterion below
reachable at all:

```
periodMonths = { monthly: 1, quarterly: 3, annual: 12 }[policy.premiumFrequency]
monthsBehind = monthsBetween(policy.paidThroughDate, today)   // negative if paid ahead
periodsOwed  = max(1, floor(monthsBehind / periodMonths) + 1)
amountDueNow = periodsOwed × policy.premiumAmount
```

`periodsOwed` always lands the new paid-through date strictly in the future, for a current
policy and a lapsed one alike. On success:

```
periodsPaid        = floor(amountPaid / policy.premiumAmount)   // must be >= 1 to submit
newPaidThroughDate = addMonths(policy.paidThroughDate, periodsPaid × periodMonths)
```

Anchor on `paidThroughDate`, never on `today` — that is what makes catching up on arrears
restore continuous coverage instead of leaving a gap. The earlier version of this spec said
"forward by however many billing periods the payment amount covers", which for a policy two
months in arrears advances the date to *still in the past*: the app would show "Payment
successful" and the coverage pill would stay red. That is the worst moment this demo can
produce, and it was the specified behavior.

**Reinstatement rule.** If the policy is currently lapsed, "Another amount" may not be less
than `amountDueNow` — partial payment does not reinstate a lapsed policy in the real world,
and this audience knows that. Blocking copy, inline under the field:

> "To restore this policy, the full past-due amount of $174.00 is required. Enter $174.00 or
> more, or choose 'Amount due now' above."

**Card confirmation — do not ask for a full card number.** Show the card on file as a card
row ("Visa ending in 4471, exp 09/28") and require the member to confirm it by re-entering
**the last four digits only**: one 4-digit field, `inputmode="numeric"`, `maxlength="4"`,
minimum 56px tall, 24px text, centered. Keying 16 digits on a phone to have 4 of them
checked is the worst of both worlds — high mis-tap cost for the member, and a clumsier live
demo of the guardrail.

Mismatch copy, inline below the field, with the field outlined in `--color-danger` and an
icon beside it — never color alone:

> "That doesn't match the card we have on file. Check the last four digits and try again.
> **Nothing was charged.**"

Do not restate the correct last 4 in the error. A mismatch must not write a `payments`
document with `status: "success"`.

**Bank auto-draft** is a separate, simple flow: the member enters a bank account number, it
is stored as `bankAccountOnFile`, and `autopayEnabled` flips true on the policy. Future
"payments" are simulated as already-succeeded records on their due dates by `seed.js` — no
real recurring job, which a static-hosted prototype could not run anyway.

**Demo disclosure**, shown once, directly above the Submit button, 15px
`--color-text-secondary`:

> "This is a demonstration. No card is charged and no payment is sent to a bank."

Don't hide that it's fake, and don't make it look unfinished either — the guardrail logic
should still feel real and well built.

**On success**, write the `payments` document, update the policy, show the toast, **and
write a `paymentReceived` notice** so the member has a durable receipt in MyMailbox rather
than a confirmation that vanishes in four seconds. A failed card write gets a
`paymentFailed` notice the same way.

**Acceptance criteria**
- [ ] The amount step opens with "Amount due now" preselected and a real dollar figure
  computed by the formula above — never an empty field.
- [ ] Confirming the correct last 4 digits succeeds, writes a `payments` document with
  `status: "success"` and a non-null `resultingPaidThroughDate`, and the new paid-through
  date is visible on MyCoverages and the home dashboard without a page reload.
- [ ] Entering four digits that do not match `cardOnFile.last4` shows the inline mismatch
  message and writes **no** document with `status: "success"`. Verify by querying
  `payments` for that member, not by trusting the UI.
- [ ] **April, end to end:** logged in as April, MyCoverages reads "Lapsed"; the amount step
  preselects three monthly periods; paying that amount moves `paidThroughDate` strictly
  into the future; MyCoverages, the home dashboard, **and the admin console Members tab**
  all read "Active" afterward, with no manual data edit in between.
- [ ] Paying "Another amount" below the past-due total on a lapsed policy is blocked at the
  form — Submit never becomes enabled.
- [ ] Setting up bank auto-draft persists `bankAccountOnFile` and flips `autopayEnabled`
  true on the policy, visible in the admin console.
- [ ] A successful payment and a failed payment each produce a matching notice in
  MyMailbox within the same session.

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
action: **"Request a review"**, which opens the MyMailbox composer with topic `claims`,
`relatedTo` set to this claim, and a pre-filled subject. That makes the next step
functional rather than decorative. Debbie's seeded denied claim is the test case, and her
seeded thread means the reply pattern is visible live.

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

---

## MyMailbox

> **Added in Phase 0** as the gap-fill feature, per `CLAUDE.md`. See `DECISIONS-LOG.md` →
> "Gap-fill addition" for the research behind it.

Purpose: the one place a member can find anything Wellabe has sent them, and the one place
they can ask Wellabe a question.

Everywhere else in this app the member acts and the app confirms with a toast that
disappears. Payment success, claim submission, reward redemption, enrollment — all four are
specified as transient confirmations, and `docs/01` specifies toasts as auto-dismiss. So a
member who taps away, whose screen times out, or who simply wants to check tomorrow that
the payment went through has nowhere to look. MyMailbox is where those confirmations, and
everything Wellabe originates, persist. It is also the only thing in the app that gives a
member a reason to open it when nothing is due and they don't use the health features —
which is Dennis, Eric, and April.

The paper-mail metaphor is deliberate: Wellabe already mails these people notices, and
"Mailbox" is a concrete, unambiguous word. Do not rename it to Notification Center, Inbox,
or Communications.

**Screen 1 — Mailbox.** Title "MyMailbox", subtitle "Everything Wellabe sends you, in one
place." Two segmented tabs, **Notices** (default) and **Documents**, plus a persistent
secondary button, **"Ask Wellabe a question."**

The Notices tab has two groups, in this order:

- **Needs your attention** — *derived at render time from live data, never stored.*
  Recomputed from `policies` and `users` on every load so it self-clears the moment the
  condition resolves. In priority order:
  - `paidThroughDate` in the past → danger pill. "Your Short-Term Care coverage is past
    due. Pay $174.00 to bring it back to active." → MyPayments, that policy preselected.
  - `paidThroughDate` within 30 days and `autopayEnabled === false` → warning pill. "Your
    next Medicare Supplement premium of $128.40 is due March 12, 2026." → MyPayments.
  - `cardOnFile` expiring within 60 days → warning. "The card ending in 4412 expires next
    month. Update it so your autopay doesn't stop." → MyPayments.
  - `qualifiesForGuaranteedIssue === true` and not yet enrolled → accent pill. "You've
    unlocked a no-health-questions offer." → MyCoverages Add More Coverage, pre-filled.
  - If none apply, hide the group and show one centered line at the top of Notices:
    **"You're all caught up."** with a check icon. Dennis is the test case — this must look
    designed, not empty.
- **Recent** — stored `notices`, reverse-chronological. Each row uses the notice-row
  component from `docs/01`. Unread is a filled dot **and** a "New" pill, never color alone.
  Dates in full ("March 12, 2026"). A **"Mark all as read"** action sits at the top right
  and offers undo.

**Never persist a condition notice.** The moment someone writes "premium due soon" to
Firestore for convenience, the mailbox starts showing a past-due warning for a policy that
was paid ten minutes ago. Derived items are derived; stored notices record things that
actually happened.

**Screen 2 — Notice detail.** Subject as the page heading, full date and time, body at
17px/1.5. Exactly one primary button, from `actionLabel`/`actionTarget`, deep-linking into
the owning section ("Pay $128.40 now", "View claim CLM-2026-00417"). One secondary action,
**"Ask a question about this"**, opening the composer with topic and `relatedTo`
pre-filled. Opening the screen sets `read: true` immediately.

**Screen 3 — Documents tab.** A horizontal chip filter — All · Policy · Statements ·
Claims · Notices · Tax — over a list grouped by year, newest first, using the document-row
component. Every filter chip has its own designed empty state ("No tax documents yet. Your
first one arrives in January."), never a blank list.

**Screen 4 — Document viewer.** Documents render from Firestore data, not stored files.
Each `documents` doc carries a `renderer` and a `payload`; the viewer draws a designed,
letter-proportioned artifact — Wellabe letterhead, member name and address block, policy
number, body, footer — held to the same standard as the ID card in MyCoverages, because
this is the other thing an ELT viewer will pinch-zoom into. Two actions: **"Save or print"**
calls `window.print()` against a dedicated print stylesheet (a real PDF through the OS print
dialog — no PDF library, no build step, no backend), and **"Email me a copy"**, whose
confirmation is honest: *"In the live app this emails a copy to dave@example.com. This demo
doesn't send real email."*

**Screen 5 — Ask Wellabe a question.** Topic as four large tappable cards (Billing ·
Claims · Coverage · Something else) — cards, not a `<select>`, because dropdowns are one of
the specific controls that degrade for older users on touch. Subject auto-fills from topic
plus context and stays editable. One textarea, 17px, minimum 6 rows. "Send" writes a
`messageThreads` document with a single member message, `status: "open"`, and
`autoAckedAt`.

**Screen 6 — Thread view.** Member messages right-aligned, Wellabe replies left-aligned
behind the Wellabe mark. Under a thread with no reply, render a system line from
`autoAckedAt`: *"Received August 6, 2026 at 2:14 PM. A Wellabe representative will follow up
by phone or email."* followed, in `--color-text-secondary`, by *"This is a demo. No message
is actually sent to Wellabe."* **Never fabricate a Wellabe reply at runtime.** Debbie's
seeded thread carries a real two-message exchange so the reply pattern is visible live
without pretending anyone is on the other end.

**Screen 7 — Delivery preferences.** Reached from the bottom of the Mailbox screen and from
MyInformation, where `preferredContactMethod` already lives. Four rows — Bills & payments ·
Claim updates · Policy & rate notices · Rewards & health — each with a fixed,
non-toggleable "In your Mailbox: always" line plus two toggles, "Also mail me paper" and
"Also email me". **Paper defaults to on for every category and is opt-out only.** Standing
copy above the toggles, verbatim:

> **You'll always get paper copies of anything the law requires us to mail.** Turning off
> paper here only affects the extra reminders. You can turn it back on any time.

This is not fussiness. A large majority of consumers still prefer paper specifically for
insurance, and quietly defaulting a 78-year-old to paperless is both a real-world harm and
a compliance problem. Selecting paperless never fires a celebratory toast.

**Where notices come from — two classes, and the distinction is load-bearing:**

- **Event notices are written by the feature module that caused the event**, inline in the
  same code path as its primary write. `my-payments.js` writes `paymentReceived` /
  `paymentFailed`; `my-claims.js` writes `claimStatus` on submit and on every stage
  advance; `my-rewards.js` writes one on redemption; `my-health.js` writes the offer notice
  the first time `qualifiesForGuaranteedIssue` flips true. This is what makes the demo feel
  alive: pay as April, open MyMailbox, the receipt is already there. The shared writer
  lives in `assets/js/notices.js`, which must exist **before** those four modules are
  written or all four get retrofitted.
- **Condition notices are derived at render**, as above, and never written.

**Home and app bar.** MyMailbox is the eighth section card on Home with a live status line
("2 new" / "You're all caught up"), and the top app bar carries a badged mailbox icon on
every member screen, so unread is visible without returning home (`docs/01` §Navigation).

**Acceptance criteria**
- [ ] MyMailbox appears as a Home card with a live unread count and as a badged icon in the
  top app bar on every member screen; the count matches unread `notices` plus derived
  attention items, at both breakpoints.
- [ ] Making a successful payment as **April** writes a `paymentReceived` notice visible in
  MyMailbox without a page reload, and her derived "past due" item disappears from "Needs
  your attention" in the same session.
- [ ] Submitting a claim writes a `claimStatus` notice in the same action, and the notice's
  action button opens that claim's tracker.
- [ ] Opening a notice flips `read` to `true` in Firestore and decrements the badge
  immediately. "Mark all as read" clears every unread notice in one tap, with undo.
- [ ] Every notice's action button lands on the correct destination — verify all seven
  `type` values against at least one seeded member each.
- [ ] **Dennis** (one notice, two documents, no attention items) renders a clean "You're all
  caught up" state that looks designed. **Matt** (two policies, two claims) renders a
  multi-policy mailbox that stays scannable.
- [ ] Every document opens in the viewer, renders member-correct data, and looks like a real
  Wellabe artifact rather than a data table — at both breakpoints *and* in print preview.
- [ ] `window.print()` from the viewer produces a clean page: no app chrome, no nav, no
  buttons, nothing clipped.
- [ ] Sending a message creates a `messageThreads` document, and the thread shows the
  timestamped receipt line plus the explicit demo disclaimer. No Wellabe reply is ever
  fabricated at runtime.
- [ ] **Debbie's** seeded thread shows a two-message exchange with a Wellabe reply, reachable
  both from MyMailbox and from the "Request a review" action on her denied claim.
- [ ] "Talk to an Agent" and the denied-claim next step both route into the composer with
  topic and `relatedTo` pre-filled — neither is a dead end.
- [ ] Delivery preferences persist to `users.deliveryPreferences`, every paper toggle seeds
  **on**, and no path turns paper off without an explicit member tap.
- [ ] Dates in notices and documents are always written in full; no numeric-only or
  relative-only dates appear anywhere in this section.
