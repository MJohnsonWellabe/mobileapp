// The admin console — a read-only viewer over every collection, for internal and
// ELT eyes (docs/06).
//
// Two things it must get right, both of which are acceptance criteria:
//
//   * No raw userId appears anywhere. Every row joins the member's name in.
//   * Coverage status comes from the same coverageStatus() helper the member app
//     uses. Two sources of truth would visibly contradict each other thirty seconds
//     apart when someone pays as April and then opens this screen.
//
// It is a viewer. There are no write actions here by design.

import { requireAdmin, logout } from '../auth.js';
import {
  getAllMembers,
  getAllPolicies,
  getAllPayments,
  getAllClaims,
  getAllRewardsAccounts,
  getAllRewardsTransactions,
  getAllHealthProfiles,
  getAllNotices,
  getAllThreads,
} from '../data.js';
import {
  coverageStatus,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPoints,
  PRODUCT_LABELS,
  startOfToday,
  plural,
} from '../format.js';
import { html, esc, mount, on, skeletonRows, errorState } from '../ui.js';
import { icons, wellabeMark } from '../icons.js';

const TABS = [
  ['members', 'Members'],
  ['coverages', 'Coverages'],
  ['payments', 'Payments'],
  ['claims', 'Claims'],
  ['rewards', 'Rewards'],
  ['health', 'Health'],
  ['mailbox', 'Mailbox'],
];

const session = requireAdmin();
if (session) start();

async function start() {
  document.body.insertAdjacentHTML(
    'afterbegin',
    html`
      <header class="admin-topbar">
        <span class="admin-topbar__mark" aria-hidden="true">${wellabeMark()}</span>
        <span class="admin-topbar__title">Wellabe — internal console</span>
        <button class="admin-topbar__logout" type="button" id="admin-logout">Log Out</button>
      </header>
      <nav class="admin-tabs" id="admin-tabs" aria-label="Sections"></nav>
    `,
  );

  document.getElementById('admin-logout').addEventListener('click', () => {
    logout();
    location.replace('index.html');
  });

  const app = document.getElementById('app');
  app.innerHTML = skeletonRows(8);

  const view = { tab: 'members', memberId: null };
  let data;

  try {
    const [members, policies, payments, claims, rewards, txs, health, notices, threads] =
      await Promise.all([
        getAllMembers(),
        getAllPolicies(),
        getAllPayments(),
        getAllClaims(),
        getAllRewardsAccounts(),
        getAllRewardsTransactions(),
        getAllHealthProfiles(),
        getAllNotices(),
        getAllThreads(),
      ]);
    data = { members, policies, payments, claims, rewards, txs, health, notices, threads };
  } catch (err) {
    console.error(err);
    mount(app, errorState("We couldn't load the console data."));
    document.body.dataset.ready = '1';
    return;
  }

  // One place that turns a userId into a readable name, so "never show a raw
  // userId" is structural rather than something to remember on every table.
  const nameOf = (userId) =>
    data.members.find((m) => m.id === userId)?.firstName ?? userId.replace('user-', '');

  const tabsEl = document.getElementById('admin-tabs');

  const paintTabs = () => {
    tabsEl.innerHTML = TABS.map(
      ([id, label]) =>
        `<button class="admin-tab" data-tab="${id}" ${view.tab === id ? 'aria-current="page"' : ''}>${label}</button>`,
    ).join('');
  };

  const paint = () => {
    paintTabs();
    mount(app, render(view, data, nameOf));
    document.body.dataset.ready = '1';
  };

  tabsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    view.tab = button.dataset.tab;
    window.scrollTo(0, 0);
    paint();
  });

  on(app, 'click', '[data-member]', (event, el) => {
    view.memberId = el.dataset.member;
    window.scrollTo(0, 0);
    paint();
  });

  on(app, 'click', '[data-action="clear-filter"]', () => {
    view.memberId = null;
    paint();
  });

  paint();
}

/* ------------------------------------------------------------ render ----- */

function render(view, data, nameOf) {
  const { memberId } = view;
  const today = startOfToday();
  const only = (rows) => (memberId ? rows.filter((r) => r.userId === memberId) : rows);

  const filterBar = memberId
    ? html`<div class="admin-filter">
        ${icons.person()}
        <span
          >Showing <strong>${esc(nameOf(memberId))}</strong> only, across every tab.</span
        >
        <button class="btn btn--secondary" data-action="clear-filter" style="margin-left:auto">
          Show everyone
        </button>
      </div>`
    : '';

  const body = {
    members: () => membersTab(data, nameOf, today, memberId),
    coverages: () => coveragesTab(only(data.policies), nameOf, today),
    payments: () => paymentsTab(only(data.payments), nameOf, data.policies),
    claims: () => claimsTab(only(data.claims), nameOf),
    rewards: () => rewardsTab(only(data.rewards), only(data.txs), nameOf, memberId, data),
    health: () => healthTab(only(data.health), nameOf, memberId, data),
    mailbox: () => mailboxTab(only(data.notices), only(data.threads), nameOf),
  }[view.tab]();

  return filterBar + body;
}

function section(title, count, unit, inner, many) {
  return html`<h2 class="admin-section-title">${esc(title)}</h2>
    <p class="admin-count">${plural(count, unit, many)}</p>
    ${inner}`;
}

function table(headers, rows) {
  return html`<table class="admin-table">
    <thead>
      <tr>
        ${headers.map((h) => html`<th>${esc(h)}</th>`)}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

function pill(label, tone, icon = 'checkCircle') {
  return html`<span class="pill pill--${tone}">${icons[icon]()}${esc(label)}</span>`;
}

const memberLink = (id, name) =>
  html`<button class="admin-name" data-member="${esc(id)}">${esc(name)}</button>`;

/* -------------------------------------------------------------- tabs ----- */

function membersTab(data, nameOf, today, memberId) {
  const members = memberId ? data.members.filter((m) => m.id === memberId) : data.members;

  const summary = (m) => {
    const policies = data.policies.filter((p) => p.userId === m.id);
    const worst = policies
      .map((p) => coverageStatus(p, today))
      .sort((a, b) => ({ active: 0, pastDue: 1, lapsed: 2 })[b.key] - ({ active: 0, pastDue: 1, lapsed: 2 })[a.key])[0];
    const soonest = [...policies].sort((a, b) => a.paidThroughDate.localeCompare(b.paidThroughDate))[0];
    const rewards = data.rewards.find((r) => r.id === m.id);
    const health = data.health.find((h) => h.id === m.id);
    return { policies, worst, soonest, rewards, health };
  };

  return section(
    'Members',
    members.length,
    'member',
    html`
      ${table(
        ['Member', 'Products', 'Coverage', 'Paid through', 'Points', 'Tier', 'Streak'],
        members.map((m) => {
          const s = summary(m);
          return html`<tr>
            <td>${memberLink(m.id, m.firstName)}</td>
            <td>${s.policies.map((p) => esc(PRODUCT_LABELS[p.product])).join(', ') || '—'}</td>
            <td>${s.worst ? pill(s.worst.label, s.worst.tone, s.worst.tone === 'success' ? 'checkCircle' : 'alert') : '—'}</td>
            <td>${s.soonest ? formatDate(s.soonest.paidThroughDate) : '—'}</td>
            <td>${formatPoints(s.rewards?.pointsBalance ?? 0)}</td>
            <td>${esc(s.rewards?.tier ?? '—')}</td>
            <td>${s.health?.currentStreakDays ?? 0} days</td>
          </tr>`;
        }),
      )}
      <div class="admin-cards">
        ${members.map((m) => {
          const s = summary(m);
          return html`<div class="admin-card">
            <div class="admin-card__head">
              ${memberLink(m.id, m.firstName)}
              ${s.worst ? pill(s.worst.label, s.worst.tone, s.worst.tone === 'success' ? 'checkCircle' : 'alert') : ''}
            </div>
            <div class="card__meta">
              ${s.policies.map((p) => esc(PRODUCT_LABELS[p.product])).join(', ') || 'No coverage'}<br />
              Paid through ${s.soonest ? formatDate(s.soonest.paidThroughDate) : '—'} ·
              ${formatPoints(s.rewards?.pointsBalance ?? 0)} pts (${esc(s.rewards?.tier ?? '—')}) ·
              ${s.health?.currentStreakDays ?? 0}-day streak
            </div>
          </div>`;
        })}
      </div>
    `,
  );
}

function coveragesTab(policies, nameOf, today) {
  return section(
    'Coverages',
    policies.length,
    'policy',
    coveragesBody(policies, nameOf, today),
    'policies',
  );
}

function coveragesBody(policies, nameOf, today) {
  return (
    table(
      ['Member', 'Product', 'Plan', 'Policy number', 'Status', 'Paid through', 'Premium', 'Autopay'],
      policies.map((p) => {
        const s = coverageStatus(p, today);
        return html`<tr>
          <td>${memberLink(p.userId, nameOf(p.userId))}</td>
          <td>${esc(PRODUCT_LABELS[p.product])}</td>
          <td>${esc(p.planName)}</td>
          <td>${esc(p.policyNumber)}</td>
          <td>${pill(s.label, s.tone, s.tone === 'success' ? 'checkCircle' : 'alert')}</td>
          <td>${formatDate(p.paidThroughDate)}</td>
          <td>${formatMoney(p.premiumAmount)} ${esc(p.premiumFrequency)}</td>
          <td>${p.autopayEnabled ? 'On' : 'Off'}</td>
        </tr>`;
      }),
    ) +
    html`<div class="admin-cards">
      ${policies.map((p) => {
        const s = coverageStatus(p, today);
        return html`<div class="admin-card">
          <div class="admin-card__head">
            ${memberLink(p.userId, nameOf(p.userId))}
            ${pill(s.label, s.tone, s.tone === 'success' ? 'checkCircle' : 'alert')}
          </div>
          <div class="card__meta">
            ${esc(p.planName)} · ${esc(p.policyNumber)}<br />
            Paid through ${formatDate(p.paidThroughDate)} · ${formatMoney(p.premiumAmount)}
            ${esc(p.premiumFrequency)} · autopay ${p.autopayEnabled ? 'on' : 'off'}
          </div>
        </div>`;
        })}
      </div>`
  );
}

function paymentsTab(payments, nameOf, policies) {
  const planOf = (id) => policies.find((p) => p.id === id)?.planName ?? '—';
  return section(
    'Payments',
    payments.length,
    'payment',
    table(
      ['Date', 'Member', 'Policy', 'Amount', 'Method', 'Status'],
      payments.map(
        (p) => html`<tr>
          <td>${formatDate(p.timestamp)}</td>
          <td>${memberLink(p.userId, nameOf(p.userId))}</td>
          <td>${esc(planOf(p.policyId))}</td>
          <td>${formatMoney(p.amount)}</td>
          <td>${p.method === 'bank' ? 'Bank' : 'Card'} ····${esc(p.last4)}</td>
          <td>
            ${p.status === 'success'
              ? pill('Paid', 'success')
              : pill('Failed', 'danger', 'alert')}
          </td>
        </tr>`,
      ),
    ) +
      html`<div class="admin-cards">
        ${payments.map(
          (p) => html`<div class="admin-card">
            <div class="admin-card__head">
              ${memberLink(p.userId, nameOf(p.userId))}
              ${p.status === 'success' ? pill('Paid', 'success') : pill('Failed', 'danger', 'alert')}
            </div>
            <div class="card__meta">
              ${formatMoney(p.amount)} · ${formatDate(p.timestamp)}<br />
              ${esc(planOf(p.policyId))} · ${p.method === 'bank' ? 'Bank' : 'Card'} ····${esc(p.last4)}
            </div>
          </div>`,
        )}
      </div>`,
  );
}

function claimsTab(claims, nameOf) {
  const stage = (status) =>
    ({
      Intake: ['Intake', 'info', 'clock'],
      Processing: ['Processing', 'info', 'clock'],
      Reviewing: ['In review', 'warning', 'clock'],
      Paid: ['Paid', 'success', 'checkCircle'],
      Denied: ['Denied', 'danger', 'alert'],
    })[status];

  return section(
    'Claims',
    claims.length,
    'claim',
    table(
      ['Claim', 'Member', 'Product', 'Filed', 'Stage', 'Amount'],
      claims.map((c) => {
        const [label, tone, icon] = stage(c.status);
        return html`<tr>
          <td>${esc(c.claimNumber)}</td>
          <td>${memberLink(c.userId, nameOf(c.userId))}</td>
          <td>${esc(PRODUCT_LABELS[c.product])}</td>
          <td>${formatDate(c.submittedAt)}</td>
          <td>${pill(label, tone, icon)}</td>
          <td>${c.paidAmount != null ? formatMoney(c.paidAmount) : '—'}</td>
        </tr>`;
      }),
    ) +
      html`<div class="admin-cards">
        ${claims.map((c) => {
          const [label, tone, icon] = stage(c.status);
          return html`<div class="admin-card">
            <div class="admin-card__head">
              <strong>${esc(c.claimNumber)}</strong>${pill(label, tone, icon)}
            </div>
            <div class="card__meta">
              ${memberLink(c.userId, nameOf(c.userId))} · ${esc(PRODUCT_LABELS[c.product])}<br />
              Filed ${formatDate(c.submittedAt)}
              ${c.paidAmount != null ? ` · paid ${formatMoney(c.paidAmount)}` : ''}
            </div>
            ${c.deniedReason ? html`<p class="card__meta">${esc(c.deniedReason)}</p>` : ''}
          </div>`;
        })}
      </div>`,
  );
}

function rewardsTab(accounts, txs, nameOf, memberId, data) {
  const list = memberId ? accounts.filter((a) => a.id === memberId) : data.rewards;
  return html`
    ${section(
      'Rewards accounts',
      list.length,
      'account',
      table(
        ['Member', 'Balance', 'Lifetime earned', 'Tier'],
        list.map(
          (a) => html`<tr>
            <td>${memberLink(a.id, nameOf(a.id))}</td>
            <td>${formatPoints(a.pointsBalance)}</td>
            <td>${formatPoints(a.lifetimePointsEarned ?? 0)}</td>
            <td>${esc(a.tier)}</td>
          </tr>`,
        ),
      ) +
        html`<div class="admin-cards">
          ${list.map(
            (a) => html`<div class="admin-card">
              <div class="admin-card__head">
                ${memberLink(a.id, nameOf(a.id))}<strong>${formatPoints(a.pointsBalance)} pts</strong>
              </div>
              <div class="card__meta">
                ${esc(a.tier)} · ${formatPoints(a.lifetimePointsEarned ?? 0)} earned lifetime
              </div>
            </div>`,
          )}
        </div>`,
    )}
    <h2 class="admin-section-title" style="margin-top:var(--space-6)">Transactions</h2>
    <p class="admin-count">${plural(txs.length, 'transaction')}</p>
    ${table(
      ['Date', 'Member', 'Type', 'Amount', 'Reason'],
      txs
        .slice(0, 100)
        .map(
          (t) => html`<tr>
            <td>${formatDate(t.timestamp)}</td>
            <td>${memberLink(t.userId, nameOf(t.userId))}</td>
            <td>${t.type === 'earn' ? 'Earned' : 'Spent'}</td>
            <td>${t.type === 'earn' ? '+' : '−'}${formatPoints(t.amount)}</td>
            <td>${esc(t.reason)}</td>
          </tr>`,
        ),
    )}
    <div class="admin-cards">
      ${txs.slice(0, 100).map(
        (t) => html`<div class="admin-card">
          <div class="admin-card__head">
            ${memberLink(t.userId, nameOf(t.userId))}
            <strong>${t.type === 'earn' ? '+' : '−'}${formatPoints(t.amount)}</strong>
          </div>
          <div class="card__meta">${esc(t.reason)} · ${formatDate(t.timestamp)}</div>
        </div>`,
      )}
    </div>
  `;
}

function healthTab(profiles, nameOf, memberId, data) {
  const list = memberId ? profiles.filter((p) => p.id === memberId) : data.health;
  const qualifying = list.filter((p) => p.qualifiesForGuaranteedIssue);

  return html`
    ${qualifying.length
      ? html`<div class="admin-filter">
          ${icons.star()}
          <span>
            <strong
              >${plural(qualifying.length, 'member')} currently
              ${qualifying.length === 1 ? 'qualifies' : 'qualify'} for the no-health-questions
              offer:</strong
            >
            ${qualifying.map((p) => esc(nameOf(p.id))).join(', ')}
          </span>
        </div>`
      : ''}
    ${section(
      'Health profiles',
      list.length,
      'profile',
      table(
        ['Member', 'Current streak', 'Longest', 'Days in 100-day window', 'Qualifies', 'Tracker'],
        list.map(
          (p) => html`<tr>
            <td>${memberLink(p.id, nameOf(p.id))}</td>
            <td>${p.currentStreakDays} days</td>
            <td>${p.longestStreakDays} days</td>
            <td>${p.challengeDaysCompletedInWindow} of 100</td>
            <td>
              ${p.qualifiesForGuaranteedIssue
                ? pill('Qualifies', 'success')
                : pill('Not yet', 'neutral', 'clock')}
            </td>
            <td>${esc(p.connectedTracker ?? 'None')}</td>
          </tr>`,
        ),
      ) +
        html`<div class="admin-cards">
          ${list.map(
            (p) => html`<div class="admin-card">
              <div class="admin-card__head">
                ${memberLink(p.id, nameOf(p.id))}
                ${p.qualifiesForGuaranteedIssue
                  ? pill('Qualifies', 'success')
                  : pill('Not yet', 'neutral', 'clock')}
              </div>
              <div class="card__meta">
                ${p.currentStreakDays}-day streak (longest ${p.longestStreakDays}) ·
                ${p.challengeDaysCompletedInWindow} of 100 · ${esc(p.connectedTracker ?? 'no tracker')}
              </div>
            </div>`,
          )}
        </div>`,
    )}
  `;
}

function mailboxTab(notices, threads, nameOf) {
  // Open threads first: an internal viewer's first question is "who is waiting on
  // us" (docs/06).
  const sorted = [...threads].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1));
  const unreadBy = {};
  for (const n of notices) if (!n.read) unreadBy[n.userId] = (unreadBy[n.userId] ?? 0) + 1;

  return html`
    ${section(
      'Message threads',
      sorted.length,
      'thread',
      sorted.length
        ? table(
            ['Member', 'Subject', 'Topic', 'Status', 'Last message'],
            sorted.map(
              (t) => html`<tr>
                <td>${memberLink(t.userId, nameOf(t.userId))}</td>
                <td>${esc(t.subject)}</td>
                <td>${esc(t.topic)}</td>
                <td>
                  ${t.status === 'open'
                    ? pill('Open', 'warning', 'clock')
                    : pill('Answered', 'success')}
                </td>
                <td>${formatDateTime(t.lastMessageAt)}</td>
              </tr>`,
            ),
          ) +
            html`<div class="admin-cards">
              ${sorted.map(
                (t) => html`<div class="admin-card">
                  <div class="admin-card__head">
                    ${memberLink(t.userId, nameOf(t.userId))}
                    ${t.status === 'open' ? pill('Open', 'warning', 'clock') : pill('Answered', 'success')}
                  </div>
                  <div class="card__meta">
                    ${esc(t.subject)} · ${formatDate(t.lastMessageAt)}
                  </div>
                </div>`,
              )}
            </div>`
        : html`<p class="card__meta">No member has written in yet.</p>`,
    )}

    <h2 class="admin-section-title" style="margin-top:var(--space-6)">Notices</h2>
    <p class="admin-count">
      ${plural(notices.length, 'notice')} ·
      ${Object.keys(unreadBy).length
        ? `unread: ${Object.entries(unreadBy)
            .map(([id, n]) => `${nameOf(id)} (${n})`)
            .join(', ')}`
        : 'all read'}
    </p>
    ${table(
      ['Date', 'Member', 'Type', 'Subject', 'Read'],
      notices
        .slice(0, 100)
        .map(
          (n) => html`<tr>
            <td>${formatDate(n.createdAt)}</td>
            <td>${memberLink(n.userId, nameOf(n.userId))}</td>
            <td>${esc(n.type)}</td>
            <td>${esc(n.subject)}</td>
            <td>${n.read ? 'Read' : pill('Unread', 'danger', 'alert')}</td>
          </tr>`,
        ),
    )}
    <div class="admin-cards">
      ${notices.slice(0, 100).map(
        (n) => html`<div class="admin-card">
          <div class="admin-card__head">
            ${memberLink(n.userId, nameOf(n.userId))}
            ${n.read ? '' : pill('Unread', 'danger', 'alert')}
          </div>
          <div class="card__meta">${esc(n.subject)} · ${formatDate(n.createdAt)}</div>
        </div>`,
      )}
    </div>
  `;
}
