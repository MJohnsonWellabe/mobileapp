# 01 — Design System

> **Status: aligned to the real Wellabe brand.** An earlier draft of this document carried
> a placeholder teal-green palette built from general insurance/health-brand research. Real
> assets were found in `/brand-assets/` — two PowerPoint decks whose embedded media are
> Wellabe's actual mark, brand palette, and illustration library, plus screenshots of
> Wellabe's own agent portal. The tokens below are derived from those. See
> `DECISIONS-LOG.md` → "Brand alignment" for what changed and why, and
> `scripts/extract-brand-assets.py` for how the shipped assets were derived from the decks.

## Design principles for this app

1. **Clarity beats density, every time.** This member base skews senior. Favor larger
   text, generous spacing, and one clear next action per screen over cramming in options.
2. **Never make someone guess a status.** Coverage active/past due/lapsed, payment
   paid-through date, claim stage, points balance — these should be readable in under two
   seconds, with color *and* an icon *and* a text label, never color alone.
3. **Warm, not clinical; confident, not salesy.** Insurance triggers anxiety by default.
   Copy and visuals should feel like a competent person who has time for you, not a
   corporate wall of text or a growth-hacked consumer app.
4. **Consistent shell, flexible content.** Navigation, header, and card patterns are
   identical across every section, so a member who learns one screen already understands
   the rest.
5. **One brand, one app.** Every screen should be unmistakably the same product. If a
   screen could be mistaken for something else, the design system isn't being followed.

## Brand foundations

Wellabe's visual identity, as read from `/brand-assets/`:

- **The mark** is a yellow double-`l` ligature — two joined loops, drawn from the `ll` in
  the lowercase "wellabe" wordmark. Shipped as `assets/img/wellabe-mark.svg`, traced to
  vector and filled with `currentColor` so one file serves both yellow-on-dark and
  ink-on-light.
- **Yellow is the brand color, and it is a *background* color.** Wellabe's own portal uses
  large yellow panels carrying black text. It is never a text color, a border, or a thin
  line on a light surface.
- **Illustration is black single-weight line art** — seniors, couples, families, pets,
  everyday objects — never photography. Fifteen pieces ship in
  `assets/img/illustrations/`, each traced to vector and inheriting `currentColor`. Every
  empty state and every section header draws from this set rather than from generic icons.

## Color tokens

Every value below is measured, not assumed. The contrast column gives the WCAG ratio
against `--color-background` (`#F3EFEC`), which is the worst case in this app — anything
that passes there passes on white too.

| Token | Value | Contrast on bg | Usage |
|---|---|---|---|
| `--color-brand-yellow` | `#EDC319` | **1.48 — never text** | The mark, accent bars, streak and progress rings, points/rewards emphasis, filled panels. Only ever a background, and only ever under `--color-text-primary` (10.6:1). |
| `--color-brand-yellow-tint` | `#FDF6DC` | — | Soft yellow surface for reward and milestone cards, and the Gold rewards tier chip (paired with `--color-text-primary`, never `--color-brand-yellow` itself, as chip text). |
| `--color-brand-teal` | `#15A5BB` | 2.58 — **decorative only** | Wellabe's bright teal. Fails the 3:1 floor for UI components, so it is a large-fill and illustration-tint color, never a control, a border, or text. |
| `--color-primary` | `#076874` | **5.67** | Deep teal derived from the brand teal. Every primary button, link, active state, and focus ring. White on it measures 6.48:1. |
| `--color-primary-pressed` | `#04525C` | — | Pressed/active state for primary controls. |
| `--color-primary-tint` | `#E4EFF1` | — | Selected rows, info panels, the admin console's table header fill. |
| `--color-success` | `#0F7A4A` | 4.71 | Active, paid, approved, completed. |
| `--color-warning` | `#A34A06` | 5.19 | Due soon, past due, pending, needs attention. |
| `--color-danger` | `#A81E16` | 6.42 | Lapsed, denied, failed. |
| `--color-tier-bronze` | `#8A5A2E` | 5.13 | Bronze rewards tier — text/icon only, on `--color-tier-bronze-tint`. |
| `--color-tier-bronze-tint` | `#F3E8DC` | — | Bronze tier chip background. |
| `--color-tier-silver` | `#5B6670` | 5.13 | Silver rewards tier — text/icon only, on `--color-tier-silver-tint`. |
| `--color-tier-silver-tint` | `#EDEFF0` | — | Silver tier chip background. |
| `--color-surface` | `#FFFFFF` | — | Card backgrounds. |
| `--color-background` | `#F3EFEC` | — | App background. Wellabe's warm off-white, not a neutral gray. |
| `--color-text-primary` | `#14181B` | 15.62 | Body text and headings. |
| `--color-text-secondary` | `#55606B` | 5.61 | Helper copy, metadata, de-emphasized labels. Passes AA, so it is safe for real content, not just decoration. |
| `--color-border` | `#E2DDD7` | — | Card borders and dividers. Warm, to match the background. |

**Warning is deliberately a burnt orange, not an amber.** The obvious "warning" color for an
insurance app is a yellow-amber, and that is exactly what this app cannot use: it would sit
a few degrees of hue from `--color-brand-yellow`, and a member would read a past-due badge
as brand decoration. `#A34A06` is unmistakably an alert.

Minimum contrast for all text: **4.5:1** (WCAG AA). Minimum for non-text UI components
(control borders, active indicators, focus rings): **3:1** (WCAG 1.4.11). Both are checked
against the table above, not assumed.

## Typography

- **Font:** a system-first sans-serif stack (`-apple-system, "Segoe UI", Roboto, Helvetica,
  Arial, sans-serif`). No web font — it would add load time and a point of failure for a
  demo, and Wellabe's brand font is not among the assets provided.
- **Base body size:** 17px minimum on mobile. This is a deliberate accessibility choice for
  this member base, not an oversight.
- **Scale:** 13 / 15 / 17 / 20 / 24 / 30 / 38px. Never an arbitrary one-off size.
- **Line height:** 1.5 for body copy, 1.25 for headings.
- **Weights:** 400 body, 600 emphasis and labels, 700 headings and active nav.
- **Never rely on weight or color alone to convey status** — pair with an icon and a label.

## Layout & responsiveness

- Two required breakpoints: **375px** (standard phone) and **430–600px** (large phone /
  small tablet, portrait). Both are hard acceptance criteria on every screen.
- Single-column layouts throughout at these two sizes. No multi-column forms.
- **Minimum touch target: 48×48px**, with at least 8px of visible spacing between adjacent
  targets. This is above WCAG 2.2's 24×24 AA floor and above the common 44×44 figure, and
  matches Material's 48dp. It is a deliberate choice for a member base with a meaningful
  share of reduced dexterity. Inline text links within body copy are the only exception,
  and they get 12px of vertical padding.
- Sticky primary actions must never be covered by the tab bar. Every scrollable container
  reserves clearance:
  ```css
  padding-bottom: calc(var(--nav-height) + env(safe-area-inset-bottom) + 16px);
  ```
- Content max-width of 560px, centered, at the two breakpoints above, so they don't
  produce uncomfortably long line lengths.
- **A third, additive tier at 640px+** (large phone / small tablet where there's
  genuinely extra room to use, not just extra margin): the shared container widens to
  720px app-wide, running text stays capped at 60ch so it doesn't get harder to read
  just because the screen got wider, and card-grid lists (currently just Home's "Your
  Wellabe" section) become two columns instead of one long column. Home additionally
  scales up its greeting, streak ring, and illustration so the extra width reads as
  "designed for this size," not "a phone layout with bigger margins." This tier is
  additive — it never changes what the two required breakpoints above look like.
- **Never set `user-scalable=no`.** Pinch-zoom must work everywhere, especially on the ID
  card and the document viewer.

## Navigation pattern

**Primary navigation is a persistent bottom tab bar of exactly five items**, visible on
every member screen.

| Tab | Destination |
|---|---|
| **Home** | Dashboard |
| **Coverage** | MyCoverages |
| **Claims** | MyClaims |
| **Pay** | MyPayments |
| **More** | Full-screen list: MyHealth · MyRewards · MyCare · MyInformation · Log Out |

An earlier draft ruled out a bottom bar on the grounds that seven sections is too many for
one, and then reached for a hamburger menu instead. Seven is indeed too many — but a
hamburger is the worst available answer for this audience. Hidden navigation is used
roughly 1.5× less than visible navigation on mobile, and discoverability is close to halved
by hiding a product's main navigation; persistent, always-visible tabs are specifically
what helps users with memory or cognitive load. Four destinations plus a "More" tab is the
pattern mainstream health-plan apps converge on, and it keeps the member's primary
destinations permanently on screen.

**"More" is a full-screen list, not a slide-out drawer or a bottom sheet.** Each row is a
full-width band, minimum 64px tall, with a leading icon, a 17px label, a one-line live
status ("12-day streak", "1,240 points", "Find a dentist near you"), and a chevron.

**The home dashboard remains the primary map.** All eight section cards live on Home, each
carrying a live status line. Home also carries a **"Today" card pinned at the top** with
the one challenge assigned for that day as an inline tappable checkbox plus the streak
ring — completing the daily habit takes zero navigation, which is what makes the "opens
the app multiple times a week" goal in `docs/00-product-brief.md` realistic. (One assigned
challenge per day, not a choice of five — see `docs/03`/`docs/05` and
`DECISIONS-LOG.md`.)

**Top app bar — three elements maximum, and never more:**

- **On Home:** the Wellabe mark (left); a badged mailbox icon and a text **"Log Out"**
  button (right).
- **On every other screen:** a **back control** on the left — a chevron *plus the word
  "Back"*, one 48px target, never a bare icon — with the screen title beside it, 20px
  semibold, single line, ellipsis-truncated; and the badged mailbox icon on the right.

That is the whole bar. No profile avatar (MyInformation is a Home card and a More row), no
hamburger (the tab bar replaces it). At 375px the fixed elements consume about 170px of the
343px available, leaving room for a title that doesn't truncate on any of the eight
sections. Log Out is one tap from Home and two from anywhere else.

### Navigation tokens

```css
--nav-height:         64px;   /* excludes safe-area inset */
--nav-icon-size:      26px;
--nav-label-size:     12px;
--topbar-height:      56px;
--tap-target-min:     48px;
--tap-target-spacing:  8px;
```

### Active tab state — four simultaneous signals, per principle 2

Never color alone: a **filled** icon rather than an outline, label weight 700 rather than
600, a 3px top indicator bar in `--color-primary`, and `aria-current="page"` so it is
announced as well as seen.

## Core components (build once, reuse everywhere)

- **Status pill** — colored background tint + icon + text label ("Active", "Past due",
  "In review", "Denied"). Never color-only, never an unlabeled dot.
- **Section card** — home dashboard: icon, title, one line of live status, chevron.
- **Data row** — label/value pair, used in MyInformation, MyCoverages, and the admin
  console. Identical alignment and spacing everywhere it appears.
- **Primary / secondary button** — one filled (`--color-primary`, white text) and one
  outlined (`--color-primary` border and text). There is no third style. Minimum 48px tall,
  full-width for primary actions on mobile.
- **Progress / streak ring** — MyHealth streak and challenge progress, reused for
  points-to-next-tier in MyRewards. Ring fill is `--color-brand-yellow`.
- **Toast** — confirmations. Auto-dismiss, also tap-dismissible, never covering the primary
  action underneath. A toast is *never* the only record of something that happened; the
  durable copy lives in MyMailbox.
- **Empty state** — an illustration from the brand set, a heading, one sentence, and where
  it makes sense one action. Every list screen has one. A blank region or a bare "0" is a
  defect.
- **Skeleton state** — every screen that reads Firestore shows shaped placeholders while
  loading, never a blank card or a layout that jumps when data lands.
- **Error / retry state** — every screen that reads Firestore has a designed failure state
  with a "Try again" action and plain-language copy ("We couldn't load your coverage just
  now."). This app is fully client-side and will be demoed over conference-room Wi-Fi;
  Firestore's `persistentLocalCache` is enabled so a dropped connection renders cached data
  rather than nothing.
- **Notice row** — MyMailbox: type icon, subject (bold when unread), two-line clamped
  preview, full date, and an unread marker that is a dot *and* a "New" pill.
- **Document row** — MyMailbox: document icon, full title, category pill, issue date,
  chevron.

## Imagery & content tone

- Section icons and status indicators are simple line icons consistent with the brand's
  line-art style — never photography.
- Illustrations come from `assets/img/illustrations/` and are used at section headers and in
  empty states. They inherit `currentColor`; the default treatment is
  `--color-text-primary` on a light surface, or `--color-brand-yellow` on a dark panel. Do
  not tint them arbitrarily.
- The **ID card** (MyCoverages) and the **document viewer** (MyMailbox) are the two
  exceptions to "keep it light" — both are meant to be inspected closely in the demo and
  must look like finished, printed artifacts.
- **Dates are always written in full** — "March 12, 2026". Never `3/12/26`, and never a
  relative-only "3d ago". This matters more for this audience than the space it costs.
- Microcopy: plain language, second person, short sentences. Avoid jargon where plain
  English exists; where a technical term is unavoidable ("paid-through date"), define it
  briefly the first time it appears on a screen.

## Definition of done for this design system itself

- Every color, type, and spacing value used anywhere in the app traces back to a token
  defined here — no inline one-off values.
- Every text/background pair in the shipped app meets 4.5:1, and every control border,
  active indicator, and focus ring meets 3:1.
- A component built for one section looks and behaves identically when reused in another.
- Brand yellow appears nowhere as text, a border, or a status color.
