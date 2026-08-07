// MyCare — shop for care the way you'd shop for anything else.
//
// The brief is explicit that this should feel like shopping, not like a phone book:
// star rating and cost are as visually prominent as the name, and both are visible
// on the result card without opening the detail view.

import { page } from './_page.js';
import { getCareProviders } from '../data.js';
import { html, esc, dataRow, button, toast, on, emptyState, illustration } from '../ui.js';
import { icons } from '../icons.js';

const SORTS = [
  ['rating', 'Best rated'],
  ['cost', 'Lowest cost'],
  ['distance', 'Closest'],
];

page({
  title: 'MyCare',
  tab: 'more',
  ready: ['providers'],
  illustrations: ['holding-hands', 'thinking-at-computer', 'video-call'],
  subViewKeys: ['openProvider', 'requested'],

  subscribe(session, update, ctx) {
    ctx.view.sort = 'rating';
    getCareProviders().then((providers) => update({ providers }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-service]', (event, el) => {
      ctx.view.service = el.dataset.service === ctx.view.service ? null : el.dataset.service;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-sort]', (event, el) => {
      ctx.view.sort = el.dataset.sort;
      ctx.repaint();
    });

    on(app, 'input', 'input[name="q"]', (event, el) => {
      ctx.view.query = el.value;
      ctx.repaint();
    });

    on(app, 'click', '[data-provider]', (event, el) => {
      ctx.view.openProvider = el.dataset.provider;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-action="request"]', (event, el) => {
      const { providers } = getState();
      ctx.view.requested = providers.find((p) => p.id === el.dataset.id)?.name ?? 'this provider';
      window.scrollTo(0, 0);
      ctx.repaint();
    });
  },

  render(state, ctx) {
    const { providers } = state;
    const v = ctx.view;

    if (v.requested) return requestedView(v.requested);
    if (v.openProvider) {
      const provider = providers.find((p) => p.id === v.openProvider);
      if (provider) return detailView(provider);
    }

    const services = [...new Set(providers.map((p) => p.serviceType))].sort();
    const query = (v.query ?? '').trim().toLowerCase();

    let results = providers;
    if (v.service) results = results.filter((p) => p.serviceType === v.service);
    if (query)
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.serviceType.toLowerCase().includes(query) ||
          p.city.toLowerCase().includes(query),
      );
    results = sortProviders(results, v.sort);

    const searching = Boolean(v.service || query);

    return html`
      <div class="card stack-sm">
        <h2 class="card__title">Find care near you</h2>
        <label class="field">
          <span class="sr-only">Search providers</span>
          <input
            class="input"
            name="q"
            type="search"
            placeholder="Search care near you"
            value="${esc(v.query ?? '')}"
            data-focus-key="q"
          />
        </label>
        <div class="chips">
          ${services.map(
            (s) => html`<button class="chip" data-service="${esc(s)}" aria-pressed="${v.service === s}">
              ${esc(s)}
            </button>`,
          )}
        </div>
      </div>

      ${searching
        ? html`
            <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-2);flex-wrap:wrap">
              <span class="section-heading" style="margin:0"
                >${results.length} ${results.length === 1 ? 'result' : 'results'}</span
              >
              <div class="chips">
                ${SORTS.map(
                  ([id, label]) => html`<button class="chip" data-sort="${id}" aria-pressed="${v.sort === id}">
                    ${label}
                  </button>`,
                )}
              </div>
            </div>
            ${results.length
              ? results.map(providerCard)
              : emptyState({
                  art: 'thinking-at-computer',
                  title: 'Nothing matched that',
                  body: 'Try a different service type, or clear the search to see everyone.',
                })}
          `
        : emptyState({
            art: 'holding-hands',
            title: 'What kind of care are you looking for?',
            body: 'Pick a service above to compare cost, ratings and distance before you book.',
          })}
    `;
  },
});

function providerCard(p) {
  return html`<button class="card stack-sm" data-provider="${esc(p.id)}" style="width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer">
    <div>
      <h3 class="card__title">${esc(p.name)}</h3>
      <p class="card__meta">${esc(p.serviceType)} · ${esc(p.city)}, ${esc(p.state)}</p>
    </div>
    <div class="provider-stats">
      <span class="provider-stat">
        <span class="provider-stat__value">${icons.starFilled()}${p.starRating.toFixed(1)}</span>
        <span class="provider-stat__label">Rating</span>
      </span>
      <span class="provider-stat">
        <span class="provider-stat__value">$${p.costEstimate}</span>
        <span class="provider-stat__label">Typical visit</span>
      </span>
      <span class="provider-stat">
        <span class="provider-stat__value">${p.distanceMiles} mi</span>
        <span class="provider-stat__label">Away</span>
      </span>
    </div>
  </button>`;
}

function detailView(p) {
  return html`
    <div class="card stack-sm">
      <h2>${esc(p.name)}</h2>
      <p class="card__meta">${esc(p.serviceType)}</p>
      <div class="provider-stats">
        <span class="provider-stat">
          <span class="provider-stat__value">${icons.starFilled()}${p.starRating.toFixed(1)}</span>
          <span class="provider-stat__label">Rating</span>
        </span>
        <span class="provider-stat">
          <span class="provider-stat__value">$${p.costEstimate}</span>
          <span class="provider-stat__label">Typical visit</span>
        </span>
        <span class="provider-stat">
          <span class="provider-stat__value">${p.distanceMiles} mi</span>
          <span class="provider-stat__label">Away</span>
        </span>
      </div>
    </div>

    <div class="card">
      <h3 class="section-heading">Getting there</h3>
      ${dataRow('Address', `${p.address}, ${p.city}, ${p.state}`)}
      ${dataRow('Phone', p.phone)} ${dataRow('Hours', p.hours)}
    </div>

    <div class="card stack-sm">
      <h3 class="card__title">Book a visit</h3>
      <p class="card__meta">
        Send a request and the practice will call you back to agree a time.
      </p>
      <button class="btn btn--primary btn--block" data-action="request" data-id="${esc(p.id)}">
        Request an appointment
      </button>
      <p class="disclosure">
        This is a demonstration. No appointment request is actually sent, and nobody will
        call you.
      </p>
    </div>
  `;
}

function requestedView(name) {
  return html`<div class="card stack">
    <div class="illustration" style="max-width:200px;opacity:.5" aria-hidden="true">
      ${illustration('video-call')}
    </div>
    <span class="pill pill--success">${icons.checkCircle()}Request sent</span>
    <h2>We've passed your request to ${esc(name)}</h2>
    <p>
      Someone from the practice will call you within two business days to agree a time that
      works for you.
    </p>
    <p class="disclosure">
      This is a demonstration. No request was actually sent and nobody will call.
    </p>
  </div>`;
}

function sortProviders(list, sort) {
  const copy = [...list];
  if (sort === 'cost') return copy.sort((a, b) => a.costEstimate - b.costEstimate);
  if (sort === 'distance') return copy.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return copy.sort((a, b) => b.starRating - a.starRating);
}
