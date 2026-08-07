// Dark mode: a manual, in-app toggle (docs/01 §Layout & responsiveness), not just
// prefers-color-scheme. The actual theme-flip is CSS custom properties re-resolving
// under :root[data-theme='dark'] (tokens.css) — this module only ever touches the
// `data-theme` attribute, localStorage, and the theme-color meta tag.
//
// localStorage, not sessionStorage: auth.js's session-storage choice is about not
// leaving a demo device logged in as a specific member overnight — that reasoning is
// about identity. A theme preference carries no identity, and a demo where dark mode
// reverts on the next reload reads as a bug, not privacy hygiene. logout() does not
// (and must not) clear this key.
//
// Every page's <head> also carries an inline, synchronous boot snippet (byte-identical
// across all 13 HTML entry points) that duplicates the read-and-apply logic below,
// because this is a multi-page app with no router: every navigation is a real page
// load, so the attribute has to land on <html> before first paint, before this module
// (or anything else) has had a chance to run. This file is what the rest of the app
// (the More screen's toggle) calls after that first paint.

export const THEME_KEY = 'wellabe.theme';
const THEME_COLOR = { light: '#f3efec', dark: '#101417' };

/** The stored preference, or null if none has been set yet (i.e. the device is still
 *  following its system setting). Never throws — see the boot snippet for why. */
export function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/** The theme actually in effect right now, read from the DOM rather than storage —
 *  this is what render() should call, since theme isn't Firestore data and has no
 *  business in a screen's snapshot state. */
export function resolvedTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Set the attribute, persist it, and update the browser-chrome meta — in that order,
 *  so the visible page always changes before anything else does. */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* Safari private browsing, or a third-party-cookie-blocked context — the theme
     * still applies for this page view, it just won't survive a reload. */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

export function toggleTheme() {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
