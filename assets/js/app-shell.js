// The app shell: top bar, bottom tab bar, log out, and the mailbox badge.
//
// Every screen is its own .html file (docs/02 §Folder structure), which keeps
// deep-linking trivial for the screenshot tool, makes reload-persistence free, and
// gives correct back-button behaviour with no router to write. The usual cost of
// multi-page — duplicating the chrome across a dozen files — is avoided by making
// each page a short stub that calls renderShell() and gets the chrome injected.

import { icons, wellabeMark } from './icons.js';
import { html, esc } from './ui.js';
import { getSession, logout } from './auth.js';
import { subscribeNotices, subscribePolicies } from './data.js';
import { attentionItems } from './notices.js';

/** Four destinations plus More. Seven sections is too many for a tab bar and a
 *  hamburger is the worst option for this audience — see docs/01 §Navigation. */
const TABS = [
  { id: 'home', label: 'Home', href: 'home.html', icon: 'home' },
  { id: 'coverage', label: 'Coverage', href: 'pages/my-coverages.html', icon: 'shield' },
  { id: 'claims', label: 'Claims', href: 'pages/my-claims.html', icon: 'claim' },
  { id: 'pay', label: 'Pay', href: 'pages/my-payments.html', icon: 'card' },
  { id: 'more', label: 'More', href: 'pages/more.html', icon: 'grid' },
];

/**
 * Render the chrome and return a handle.
 *
 * @param {object} opts
 * @param {string} opts.title      screen title; omitted on Home, which shows the mark
 * @param {string} opts.tab        which tab is current
 * @param {string} opts.base       relative path to the repo root ('' or '../')
 * @param {string} opts.back       href for the back control; omitted on Home
 * @param {boolean} opts.noNav     hide the tab bar (login, admin, document viewer)
 */
export function renderShell({ title, tab, base = '', back, noNav = false } = {}) {
  const isHome = !back;

  document.body.insertAdjacentHTML(
    'afterbegin',
    html`
      <header class="topbar">
        ${isHome
          ? html`<a class="topbar__mark" href="${base}home.html" aria-label="Wellabe home">
                <span aria-hidden="true">${wellabeMark()}</span>
                <span class="topbar__wordmark">wellabe</span>
              </a>
              <span class="topbar__spacer"></span>`
          : html`<button class="topbar__back" type="button" data-shell="back">
                ${icons.chevronLeft()}Back
              </button>
              <h1 class="topbar__title">${esc(title ?? '')}</h1>`}
        <a
          class="topbar__action"
          href="${base}pages/my-mailbox.html"
          aria-label="MyMailbox"
          data-shell="mailbox"
        >
          ${icons.mailbox()}
          <span class="topbar__badge" data-shell="badge" hidden>0</span>
        </a>
        ${isHome
          ? html`<button class="topbar__action" type="button" data-shell="logout">
              ${icons.logout()}Log Out
            </button>`
          : ''}
      </header>
    `,
  );

  if (!noNav) {
    document.body.insertAdjacentHTML(
      'beforeend',
      html`
        <nav class="tabbar" aria-label="Main">
          ${TABS.map(
            (t) => html`<a
              class="tabbar__item"
              href="${base}${t.href}"
              ${t.id === tab ? 'aria-current="page"' : ''}
            >
              ${t.id === tab ? icons[`${t.icon}Filled`]() : icons[t.icon]()}
              <span>${t.label}</span>
            </a>`,
          )}
        </nav>
      `,
    );
  }

  document.querySelector('[data-shell="logout"]')?.addEventListener('click', () => {
    logout();
    location.replace(`${base}index.html`);
  });

  document.querySelector('[data-shell="back"]')?.addEventListener('click', () => {
    // A screen with an open sub-view (a claim detail, an ID card, a payment form)
    // handles Back itself, so the member gets one Back control rather than two
    // stacked ones doing different things.
    if (backHandler?.()) return;
    // history.back() when we actually came from somewhere in the app, so the
    // control matches what the browser's own back button would do; otherwise fall
    // through to the declared destination, which matters for deep links and for
    // the screenshot tool.
    if (history.length > 1 && document.referrer.startsWith(location.origin)) history.back();
    else location.href = back === true ? `${base}home.html` : back;
  });

  return { base };
}

/**
 * Keep the mailbox badge live on every screen.
 *
 * The count is unread stored notices plus derived "needs your attention" items, so
 * it matches what MyMailbox actually shows. Both inputs are listeners, because a
 * payment made on another screen has to clear April's past-due item here without a
 * reload.
 */
export function watchMailboxBadge(userId) {
  const badge = document.querySelector('[data-shell="badge"]');
  if (!badge) return () => {};

  // Unread notices only. An earlier version added the derived attention items on
  // top, which made the badge disagree with the MyMailbox card on the same screen.
  let unread = 0;

  const paint = () => {
    const total = unread;
    badge.hidden = total === 0;
    badge.textContent = total > 9 ? '9+' : String(total);
    document
      .querySelector('[data-shell="mailbox"]')
      ?.setAttribute('aria-label', total ? `MyMailbox, ${total} unread` : 'MyMailbox');
  };

  const stopNotices = subscribeNotices(
    userId,
    (notices) => {
      unread = notices.filter((n) => !n.read).length;
      paint();
    },
    () => {},
  );

  return stopNotices;
}

/** Retitle the top bar for a sub-view that is a destination in its own right
 *  (the ID card, reached directly from Home) rather than a detail pane of the
 *  screen whose name the bar already carries. No-ops on screens with no title
 *  element, e.g. Home. */
export function setTitle(title) {
  const el = document.querySelector('.topbar__title');
  if (el) el.textContent = title;
}

/** Registered by _page.js. Returns true when it consumed the Back press. */
let backHandler = null;
export function setBackHandler(fn) {
  backHandler = fn;
}

export function currentSessionOr(redirectBase = '') {
  const session = getSession();
  if (!session) location.replace(`${redirectBase}index.html`);
  return session;
}
