# 01 — Design System

> **Status: placeholder, pending brand assets.** Everything in this doc is a reasonable
> starting point built from general insurance/health-brand and senior-audience UX research
> — it is *not* sourced from Wellabe's actual brand guidelines, because none were available
> when this was written. Per `CLAUDE.md`, check `/brand-assets/` first. If real screenshots,
> a PPT, or brand references are there, extract the real palette, type, and component style
> from them and overwrite the tokens below — then log the change in `DECISIONS-LOG.md`.
> Everything is expressed as tokens specifically so this swap is mechanical, not a rewrite.

## Design principles for this app

1. **Clarity beats density, every time.** This member base skews senior. Favor larger
   text, generous spacing, and one clear next action per screen over cramming in options.
2. **Never make someone guess a status.** Coverage active/lapsed, payment paid-through
   date, claim stage, points balance — these should be readable in under two seconds,
   with color *and* text label, never color alone.
3. **Warm, not clinical; confident, not salesy.** Insurance triggers anxiety by default.
   Copy and visuals should feel like a competent person who has time for you, not a
   corporate wall of text or a growth-hacked consumer app.
4. **Consistent shell, flexible content.** Navigation, header, and card patterns should be
   identical across all seven sections so a member who learns one screen already
   understands the rest — this mirrors how real insurers keep claims/policy/payment UI
   patterns consistent across product lines even when the underlying data differs.
5. **One brand, seven sections.** Every screen should be unmistakably the same app. If a
   screen could be mistaken for a different product, the design system isn't being
   followed.

## Placeholder color tokens

Named semantically, not by hex, so the swap-in of real brand colors only touches this
table.

| Token | Placeholder value | Usage |
|---|---|---|
| `--color-primary` | `#0B6E5C` (deep teal-green) | Primary brand color: headers, primary buttons, active nav, brand marks. Teal-green reads as health + trust without the coldness of pure blue. |
| `--color-primary-dark` | `#054A3D` | Pressed states, high-emphasis text on light backgrounds |
| `--color-secondary` | `#1B3A5C` (deep navy) | Secondary emphasis, admin console chrome, headers on data-heavy screens |
| `--color-accent` | `#E8823D` (warm amber-orange) | Rewards, streaks, badges, "new" indicators, points — the one warm, energetic color in the system, used sparingly so it stays meaningful |
| `--color-success` | `#1E8E5A` | Paid, approved, active, completed |
| `--color-warning` | `#B8860B` | Due soon, pending, needs attention |
| `--color-danger` | `#B3261E` | Lapsed, denied, failed, overdue |
| `--color-surface` | `#FFFFFF` | Card backgrounds |
| `--color-background` | `#F5F7F6` | App background |
| `--color-text-primary` | `#1A2027` | Body text — meets WCAG AA on `--color-surface` and `--color-background` |
| `--color-text-secondary` | `#5B6470` | De-emphasized text, helper copy |
| `--color-border` | `#DDE3E0` | Card borders, dividers |

Minimum contrast ratio for all text/background pairs: **4.5:1** (WCAG AA), checked, not
assumed — this matters more than usual given the member base.

## Typography

- **Font:** a system-first sans-serif stack (`-apple-system, "Segoe UI", Roboto, Helvetica,
  Arial, sans-serif`) unless brand assets specify a web font — a licensed brand font adds
  load time and risk for a prototype with no payoff if it's not actually Wellabe's font.
- **Base body size:** 17px minimum on mobile (larger than the common 14–16px default) —
  this is a deliberate accessibility choice for the member base, not an oversight.
- **Scale:** use a consistent modular scale (e.g., 14 / 17 / 20 / 24 / 30px) and never an
  arbitrary one-off size.
- **Line height:** minimum 1.4 for body copy.
- **Never rely on font weight alone to convey status** — pair with color and an icon or
  label.

## Layout & responsiveness

- Design and test at two breakpoints minimum: **~375px** (standard phone) and **~430–600px**
  (large phone / small tablet, portrait). Both are hard acceptance criteria on every
  screen — see each feature's Definition of Done.
- Single-column layouts throughout. No multi-column forms.
- Bottom tab bar for the 7 member sections is off the table as primary nav (7 items is too
  many for a bottom bar to stay legible/thumb-friendly at this text size) — see Navigation
  below for the pattern to use instead.
- Minimum touch target: 44×44px, with visible spacing between adjacent targets — never
  place two tappable elements close enough to mis-tap on a phone.
- Sticky primary actions (e.g., "Submit Payment," "Submit Claim") must never be covered by
  the nav bar or another element at any breakpoint — this is one of the most common real
  bugs the adversarial visual QA subagent should be checking for.

## Navigation pattern

- A persistent top app bar: Wellabe mark, screen title, and a profile/avatar icon that
  opens MyInformation.
- Primary navigation between the 7 sections lives in a **home/dashboard grid** (a card per
  section: MyInformation, MyCoverages, MyPayments, MyClaims, MyRewards, MyHealth, MyCare),
  plus a slide-out or bottom-sheet menu accessible from the top bar for direct jumps
  between sections without returning home every time.
- Each section's own screen keeps a persistent "back to home" affordance in the top bar.
- The home dashboard is also where at-a-glance status lives: paid-through date, current
  streak, points balance, any claim in progress — see `docs/04`/`docs/05` for exact
  content per card. This is what makes the app worth opening daily rather than only when
  something's due.

## Core components (build once, reuse everywhere)

- **Status pill** — colored background + icon + label (e.g., "Active," "Paid Through
  4/12/26," "In Review"). Never color-only.
- **Section card** — used on the home dashboard: icon, title, one line of live status,
  chevron.
- **Data row** — label/value pair used throughout MyInformation, MyCoverages, admin
  console. Consistent alignment and spacing everywhere it appears.
- **Primary/secondary button** — one filled (primary teal) and one outlined (secondary)
  style, used consistently; never invent a third button style.
- **Progress/streak ring or bar** — used in MyHealth for daily streak and challenge
  progress; reused in MyRewards for points-to-next-tier if applicable.
- **Toast notification** — used for confirmations (payment success, reward redeemed, claim
  submitted) — auto-dismiss, but also dismissible by tap, and never blocking the primary
  action underneath it.
- **Empty state** — every list-type screen (claims, transaction history, points history)
  needs a designed empty state, not a blank screen, for members who genuinely have none yet.

## Imagery & content tone

- Use simple, friendly line icons, not photographic imagery, for section icons and status
  indicators — keeps the app feeling light and fast rather than stock-photo generic.
- Fake ID cards (MyCoverages) and provider photos (MyCare) are the exception — those
  should look like real, polished artifacts, since they're meant to be inspected closely
  in the demo. See `docs/04`/`docs/05` for exact content requirements.
- Microcopy tone: plain language, second person, short sentences. Avoid insurance jargon
  where a plain-English equivalent exists; where a technical term is unavoidable (e.g.,
  "paid-through date"), define it briefly the first time it appears on a screen.

## Definition of done for this design system itself

- Every color/type/spacing value used anywhere in the app traces back to a token defined
  here (or added here, if a real need arises) — no inline one-off values.
- If brand assets were found, this doc reflects them, not the placeholder table above, and
  the swap is logged in `DECISIONS-LOG.md`.
- A component built for one section (e.g., the status pill) looks and behaves identically
  when reused in another — this is what the visual QA subagent checks for cohesion.
