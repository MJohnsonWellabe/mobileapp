// The shared render layer. Template literals plus a handful of component
// functions — no framework, no build step.
//
// The point of this module is that the eight sections compose from the same parts
// instead of each growing its own dialect of "card" and "pill". If a screen needs
// markup that isn't here and would be reused, add it here rather than inline.
//
// Interpolated values go through `esc` unless the name says otherwise (`...Html`).

import { icons } from './icons.js';
import { escapeHtml as esc } from './format.js';

export { escapeHtml as esc } from './format.js';

/** Tag for readability at call sites; also joins arrays without commas, so
 *  `${items.map(row)}` does the obvious thing. */
export function html(strings, ...values) {
  return strings.reduce(
    (out, str, i) =>
      out + str + (i < values.length ? (Array.isArray(values[i]) ? values[i].join('') : values[i] ?? '') : ''),
    '',
  );
}

export function mount(target, markup) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  el.innerHTML = markup;
  return el;
}

/** Event delegation. One listener per screen beats one per row, and it survives
 *  re-renders, which matters because every screen re-renders on snapshot. */
export function on(root, eventName, selector, handler) {
  const el = typeof root === 'string' ? document.querySelector(root) : root;
  el.addEventListener(eventName, (event) => {
    const match = event.target.closest(selector);
    if (match && el.contains(match)) handler(event, match);
  });
}

/* ======================================================= components ======== */

const TONE_ICON = {
  success: 'checkCircle',
  warning: 'alert',
  danger: 'alert',
  info: 'clock',
  neutral: 'clock',
  accent: 'star',
};

/** Status pill: tinted background + icon + text label. Never colour alone. */
export function pill(label, tone = 'neutral', iconName) {
  return html`<span class="pill pill--${tone}"
    >${icons[iconName ?? TONE_ICON[tone] ?? 'clock']()}${esc(label)}</span
  >`;
}

export function dataRow(label, value, { valueHtml, id } = {}) {
  return html`<div class="data-row"${id ? ` id="${esc(id)}"` : ''}>
    <span class="data-row__label">${esc(label)}</span>
    <span class="data-row__value">${valueHtml ?? esc(value)}</span>
  </div>`;
}

/** Tappable data row — used where a row opens an editor or detail screen.
 *  `data` takes arbitrary data-* attributes, so a caller can hang whatever hook it
 *  delegates on off the row: dataRowButton('Gender', v, { data: { locked: 'gender' } }). */
export function dataRowButton(label, value, { action, valueHtml, disabled, data = {} } = {}) {
  return html`<button
    class="data-row"
    type="button"
    ${action ? `data-action="${esc(action)}"` : ''}
    ${dataAttrs(data)}
    ${disabled ? 'disabled' : ''}
  >
    <span class="data-row__label">${esc(label)}</span>
    <span class="data-row__value"
      >${valueHtml ?? esc(value)}
      <span class="data-row__chevron" aria-hidden="true">${icons.chevronRight()}</span></span
    >
  </button>`;
}

/** Serialise { locked: 'gender' } to `data-locked="gender"`, camelCase to kebab. */
export function dataAttrs(data) {
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${esc(v)}"`)
    .join(' ');
}

/**
 * @param {object} opts
 * @param {string} [opts.statusPrefix]  plain text shown before the pill, e.g. a
 *        product name. Only used with `statusTone`.
 * @param {string} [opts.statusTone]    when set, `status` renders as a pill in
 *        this tone instead of plain text. Reserved for states a member has to
 *        act on (lapsed coverage, a past-due payment) — the same icon+colour
 *        treatment those states already get on their own screens, so Home
 *        doesn't quietly render "Lapsed" in the identical grey as "Active".
 */
export function sectionCard({ href, icon, title, status, badge, statusPrefix, statusTone }) {
  return html`<a class="section-card" href="${esc(href)}">
    <span class="section-card__icon">${icons[icon]()}</span>
    <span class="section-card__body">
      <span class="section-card__title">${esc(title)}</span>
      <span class="section-card__status">
        ${statusTone
          ? html`${statusPrefix ? html`${esc(statusPrefix)} ` : ''}${pill(status, statusTone)}`
          : esc(status)}
      </span>
    </span>
    ${badge ? html`<span class="pill pill--danger">${esc(badge)}</span>` : ''}
    <span class="section-card__chevron">${icons.chevronRight()}</span>
  </a>`;
}

export function button(label, { action, variant = 'primary', block, icon, type = 'button', href, disabled } = {}) {
  const cls = `btn btn--${variant}${block ? ' btn--block' : ''}`;
  const inner = `${icon ? icons[icon]() : ''}${esc(label)}`;
  if (href) return html`<a class="${cls}" href="${esc(href)}">${inner}</a>`;
  return html`<button
    class="${cls}"
    type="${type}"
    ${action ? `data-action="${esc(action)}"` : ''}
    ${disabled ? 'disabled' : ''}
  >
    ${inner}
  </button>`;
}

/** The track-and-thumb visual for a role="switch" control. The switch semantics
 *  (role="switch", aria-checked, the click handler) belong on the caller's
 *  element — usually a whole row, per docs/01's tap-target rules — so the whole
 *  band is the hit area rather than a 52px puck. Purely decorative here, hence
 *  aria-hidden; [aria-checked='true'] on the ANCESTOR is what drives the
 *  on/off look (see .switch/.switch__thumb in components.css). */
export function switchTrack() {
  return html`<span class="switch" aria-hidden="true"><span class="switch__thumb"></span></span>`;
}

/**
 * Empty state: illustration, heading, one sentence, optionally one action.
 * Every list screen gets one. A blank region or a bare "0" is a defect, and the
 * seeded members most likely to expose it — Dennis and April — are judged as
 * harshly as the full ones.
 */
export function emptyState({ art, title, body, actionHtml }) {
  return html`<div class="empty">
    ${art ? html`<div class="empty__art">${illustration(art)}</div>` : ''}
    <p class="empty__title">${esc(title)}</p>
    ${body ? html`<p class="empty__body">${esc(body)}</p>` : ''}
    ${actionHtml ?? ''}
  </div>`;
}

/** Illustrations are fetched once and cached, then inlined so they inherit
 *  currentColor. `preloadIllustrations()` warms the cache before first paint. */
const illoCache = new Map();

export async function preloadIllustrations(names, base = 'assets/img/illustrations/') {
  await Promise.all(
    names.map(async (name) => {
      if (illoCache.has(name)) return;
      try {
        const res = await fetch(`${base}${name}.svg`);
        illoCache.set(name, res.ok ? await res.text() : '');
      } catch {
        illoCache.set(name, '');
      }
    }),
  );
}

export function illustration(name) {
  return illoCache.get(name) ?? '';
}

export function skeletonList(count = 3) {
  return html`<div class="stack" aria-hidden="true">
    ${Array.from({ length: count }, () => '<div class="skeleton skeleton--card"></div>')}
  </div>`;
}

export function skeletonRows(count = 5) {
  return html`<div class="card" aria-hidden="true">
    <div class="skeleton skeleton--title"></div>
    ${Array.from({ length: count }, () => '<div class="skeleton skeleton--line"></div>')}
  </div>`;
}

/** Designed failure state with a working retry — this app reads Firestore live
 *  over conference-room Wi-Fi, so "it didn't load" needs a real screen. */
export function errorState(message = "We couldn't load this just now.") {
  return html`<div class="error-state stack">
    <p class="empty__title">${esc(message)}</p>
    <p class="empty__body">Check your connection and try again.</p>
    ${button('Try again', { action: 'retry', variant: 'secondary' })}
  </div>`;
}

export function banner(text, tone = 'info', iconName) {
  return html`<div class="notice-banner notice-banner--${tone}">
    ${icons[iconName ?? (tone === 'info' ? 'alert' : 'alert')]()}<span>${esc(text)}</span>
  </div>`;
}

/* ============================================================ toast ======== */

/**
 * Auto-dismissing, also tap-dismissible, never blocking what's underneath.
 * A toast is never the only record of something that happened — anything worth
 * confirming also writes a notice into MyMailbox (docs/04 §MyMailbox).
 */
export function toast(message, { tone = 'success', duration = 5000 } = {}) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }

  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = `${icons[tone === 'error' ? 'alert' : 'checkCircle']()}<span>${esc(message)}</span>`;
  el.addEventListener('click', () => el.remove());
  region.append(el);

  const timer = setTimeout(() => el.remove(), duration);
  el.addEventListener('click', () => clearTimeout(timer));
  return el;
}

/* ============================================================ money ======== */

/** Parses a user-typed dollar amount without trusting Number() on "$1,234.50". */
export function parseAmount(value) {
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
