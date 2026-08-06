// Boilerplate every section screen shares: guard the session, draw the chrome,
// subscribe to what the screen needs, and repaint when any of it changes.
//
// The repaint model is deliberately dumb — re-render the whole screen from state on
// every snapshot. At this data size that is imperceptible, and it removes the entire
// class of bug where one surface updates and another doesn't. The cost is losing
// focus and scroll on re-render, which `preserve` below handles for the two cases
// that actually matter (an open text field, and scroll position).

import { requireMember } from '../auth.js';
import { renderShell, watchMailboxBadge, setBackHandler } from '../app-shell.js';
import { mount, on, skeletonList, errorState } from '../ui.js';

const BASE = '../';

/**
 * @param {object} opts
 * @param {string} opts.title    screen title for the top bar
 * @param {string} opts.tab      which bottom tab is current
 * @param {(state, ctx) => string} opts.render
 * @param {(session, update) => void} opts.subscribe  wire up listeners; call
 *        update(partialState) as data arrives
 * @param {string[]} opts.ready  state keys that must be present before first paint
 * @param {(app, ctx) => void} [opts.events]  delegated handlers, wired once
 * @param {string[]} [opts.illustrations]  preloaded before first paint
 */
export function page({ title, tab, render, subscribe, ready, events, illustrations = [], subViewKeys = ['mode', 'openClaim', 'openPolicy', 'done', 'submitted', 'locked', 'openNotice', 'openDocument', 'openThread'] }) {
  const session = requireMember(BASE);
  if (!session) return;

  renderShell({ title, tab, base: BASE, back: `${BASE}home.html` });
  watchMailboxBadge(session.userId);

  const app = document.getElementById('app');
  app.innerHTML = skeletonList(4);

  const state = {};
  let failed = null;

  const ctx = {
    session,
    base: BASE,
    /** Re-render now. Screens call this after a local-only change (a tab switch,
     *  an opened editor) that isn't worth a round trip. */
    repaint: () => paint(),
    /** Screen-local view state, preserved across snapshot repaints. */
    view: {},
  };

  function paint() {
    if (failed) {
      mount(app, errorState(failed));
      document.body.dataset.ready = '1';
      return;
    }
    if (!ready.every((k) => state[k] !== undefined)) return;

    const active = document.activeElement;
    const focusKey = active?.dataset?.focusKey ?? null;
    const selectionStart = active?.selectionStart;
    const scroll = window.scrollY;

    mount(app, render(state, ctx));
    document.body.dataset.ready = '1';

    if (focusKey) {
      const restored = app.querySelector(`[data-focus-key="${focusKey}"]`);
      if (restored) {
        restored.focus();
        if (selectionStart != null && restored.setSelectionRange) {
          try {
            restored.setSelectionRange(selectionStart, selectionStart);
          } catch {
            /* not a text input */
          }
        }
      }
    }
    if (scroll) window.scrollTo(0, scroll);
  }

  const update = (patch) => {
    Object.assign(state, patch);
    window.__wellabeUser = state.user ?? window.__wellabeUser;
    paint();
  };

  ctx.fail = (message) => {
    failed = message;
    paint();
  };

  if (illustrations.length) {
    import('../ui.js').then(({ preloadIllustrations }) =>
      preloadIllustrations(illustrations, `${BASE}assets/img/illustrations/`).then(paint),
    );
  }

  // Screens declare which view keys mean "a sub-view is open"; the shell's Back
  // then closes the sub-view instead of leaving the section.
  setBackHandler(() => {
    const open = subViewKeys.some((k) => ctx.view[k]);
    if (!open) return false;
    for (const k of subViewKeys) ctx.view[k] = null;
    ctx.view.error = null;
    window.scrollTo(0, 0);
    paint();
    return true;
  });

  if (events) events(app, ctx, () => state);
  on(app, 'click', '[data-action="retry"]', () => location.reload());

  subscribe(session, update, ctx);
  return ctx;
}

/** Read a query parameter — used for deep links like ?policy=... and ?id=... */
export function param(name) {
  return new URLSearchParams(location.search).get(name);
}
