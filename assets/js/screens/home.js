// Home dashboard: the Today card, then a card per section with live status.
//
// Everything here is driven by listeners rather than one-shot reads, because Home
// is the screen most likely to be open when something changes elsewhere — pay a
// premium, come back, and the coverage card has to already say Active.

import { requireMember } from '../auth.js';
import { renderShell, watchMailboxBadge } from '../app-shell.js';
import {
  subscribeUser,
  subscribePolicies,
  subscribeClaims,
  subscribeRewardsAccount,
  subscribeHealthProfile,
  subscribeHealthLogs,
  subscribeNotices,
} from '../data.js';
import {
  coverageStatus,
  formatDate,
  formatPoints,
  toYmd,
  startOfToday,
  plural,
  PRODUCT_LABELS,
  deriveHealthStats,
} from '../format.js';
import { html, esc, mount, on, sectionCard, skeletonList, toast, preloadIllustrations, illustration } from '../ui.js';
import { icons } from '../icons.js';
import { attentionItems } from '../notices.js';
import { toggleChallenge, challengeForDate } from '../features/health.js';

const session = requireMember();
if (session) start(session);

function start(session) {
  renderShell({ tab: 'home' });
  watchMailboxBadge(session.userId);

  const app = document.getElementById('app');
  app.innerHTML = skeletonList(5);

  const state = {
    user: null,
    policies: null,
    claims: null,
    rewards: null,
    health: null,
    logs: null,
    notices: null,
  };
  let busy = false;

  const ready = () =>
    state.user && state.policies && state.claims && state.rewards && state.logs && state.notices;

  const paint = () => {
    if (!ready()) return;
    window.__wellabeUser = state.user;
    mount(app, render(state));
    document.body.dataset.ready = '1';
  };

  subscribeUser(session.userId, (u) => ((state.user = u), paint()));
  subscribePolicies(session.userId, (p) => ((state.policies = p), paint()));
  subscribeClaims(session.userId, (c) => ((state.claims = c), paint()));
  subscribeRewardsAccount(session.userId, (r) => ((state.rewards = r ?? {}), paint()));
  subscribeHealthProfile(session.userId, (h) => ((state.health = h ?? {}), paint()));
  subscribeHealthLogs(session.userId, (l) => ((state.logs = l), paint()));
  subscribeNotices(session.userId, (n) => ((state.notices = n), paint()));

  preloadIllustrations(['family-couch']).then(paint);

  on(app, 'click', '[data-challenge]', async (event, el) => {
    if (busy) return;
    busy = true;
    el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    try {
      const result = await toggleChallenge({
        userId: session.userId,
        challengeId: el.dataset.challenge,
        logsByDate: state.logs,
        profile: state.health,
      });
      if (result.newlyQualified) {
        toast("You've unlocked a no-health-questions offer — see MyHealth.");
      } else if (result.creditedPoints > 0) {
        toast(`+${result.creditedPoints} points`);
      }
    } catch (err) {
      console.error(err);
      toast("We couldn't save that just now. Please try again.", { tone: 'error' });
    } finally {
      busy = false;
    }
  });
}

function render(state) {
  const { user, policies, claims, rewards, logs } = state;
  const today = startOfToday();
  const stats = deriveHealthStats(logs, today);
  const todayLog = logs[toYmd(today)]?.challengesCompleted ?? [];
  const attention = attentionItems({ policies, user, health: stats, today });
  const unread = state.notices.filter((n) => !n.read).length;

  return html`
    <div>
      <h1 class="home-greeting">Hello, ${esc(user.firstName)}</h1>
      <p class="home-sub">${esc(coverageLine(policies, today))}</p>
    </div>

    ${attention.length ? attentionCard(attention) : ''} ${todayCard(stats, todayLog, today)}

    <div>
      <h2 class="section-heading">Your Wellabe</h2>
      <div class="section-grid">
        ${sectionCard({
          href: 'pages/my-mailbox.html',
          icon: 'mailbox',
          title: 'MyMailbox',
          status: unread ? plural(unread, 'new message') : "You're all caught up",
          badge: unread ? String(unread) : null,
        })}
        ${sectionCard({
          href: 'pages/my-coverages.html',
          icon: 'shield',
          title: 'MyCoverages',
          status: coverageStatusLine(policies, today),
        })}
        ${sectionCard({
          href: 'pages/my-claims.html',
          icon: 'claim',
          title: 'MyClaims',
          status: claimsLine(claims),
        })}
        ${sectionCard({
          href: 'pages/my-payments.html',
          icon: 'card',
          title: 'MyPayments',
          status: paymentsLine(policies, today),
        })}
        ${sectionCard({
          href: 'pages/my-rewards.html',
          icon: 'gift',
          title: 'MyRewards',
          status: `${formatPoints(rewards.pointsBalance ?? 0)} points · ${esc(rewards.tier ?? 'Bronze')}`,
        })}
        ${sectionCard({
          href: 'pages/my-health.html',
          icon: 'heart',
          title: 'MyHealth',
          status: stats.currentStreakDays
            ? `${plural(stats.currentStreakDays, 'day')} in a row`
            : 'Start a streak today',
        })}
        ${sectionCard({
          href: 'pages/my-care.html',
          icon: 'stethoscope',
          title: 'MyCare',
          status: 'Compare doctors, dentists and more',
        })}
        ${sectionCard({
          href: 'pages/my-information.html',
          icon: 'person',
          title: 'MyInformation',
          status: 'Your contact details and address',
        })}
      </div>
    </div>

    <div class="illustration" style="opacity:.35;max-width:320px" aria-hidden="true">
      ${illustration('family-couch')}
    </div>
  `;
}

/** The derived "needs your attention" group, shown at the top of Home as well as in
 *  MyMailbox. Never stored — see notices.js. */
function attentionCard(items) {
  return html`<div class="stack-sm">
    <h2 class="section-heading">Needs your attention</h2>
    ${items.map(
      (item) => html`<div class="card stack-sm">
        <div class="notice-banner notice-banner--${item.tone === 'accent' ? 'info' : item.tone}">
          ${icons.alert()}
          <span><strong>${esc(item.title)}</strong><br />${esc(item.body)}</span>
        </div>
        <a class="btn btn--primary btn--block" href="${esc(targetHref(item.actionTarget))}"
          >${esc(item.actionLabel)}</a
        >
      </div>`,
    )}
  </div>`;
}

function todayCard(stats, todayLog, today) {
  // One assigned challenge per day, not a checklist of all five — see
  // DECISIONS-LOG.md. `done` is 0 or 1.
  const challenge = challengeForDate(today);
  const done = todayLog.includes(challenge.id) ? 1 : 0;
  const circumference = 2 * Math.PI * 30;

  return html`<div class="today-card">
    <div class="today-card__head">
      <div class="ring">
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle class="ring__track" cx="36" cy="36" r="30" />
          <circle
            class="ring__value"
            cx="36"
            cy="36"
            r="30"
            stroke-dasharray="${(done * circumference).toFixed(1)} ${circumference.toFixed(1)}"
          />
        </svg>
        <span class="ring__label">
          <span class="ring__number">${stats.currentStreakDays}</span>
          <span class="ring__unit">day${stats.currentStreakDays === 1 ? '' : 's'}</span>
        </span>
      </div>
      <div class="today-card__copy">
        <div class="today-card__title">Today's challenge</div>
        <div class="today-card__meta">
          ${done ? 'Complete. Today counts toward your streak.' : 'Complete it to count today.'}
        </div>
      </div>
    </div>
    <ul class="challenge-list">
      <li>
        <button
          class="challenge"
          type="button"
          data-challenge="${challenge.id}"
          aria-pressed="${done === 1}"
        >
          <span class="challenge__box" aria-hidden="true">${icons.check()}</span>
          <span class="challenge__label">${esc(challenge.label)}</span>
        </button>
      </li>
    </ul>
  </div>`;
}

/* ------------------------------------------------------- status lines ----- */

function coverageLine(policies, today) {
  if (!policies.length) return 'You have no coverage on file.';
  const lapsed = policies.filter((p) => coverageStatus(p, today).key !== 'active');
  if (lapsed.length) return 'One of your policies needs attention.';
  return `You're covered. ${plural(policies.length, 'policy', 'policies')} active.`;
}

function coverageStatusLine(policies, today) {
  if (!policies.length) return 'Nothing on file yet';
  if (policies.length === 1) {
    const p = policies[0];
    const s = coverageStatus(p, today);
    return `${PRODUCT_LABELS[p.product]} · ${s.label}`;
  }
  const worst = policies
    .map((p) => coverageStatus(p, today))
    .sort((a, b) => tone(b) - tone(a))[0];
  return `${plural(policies.length, 'policy', 'policies')} · ${worst.label}`;
}

const tone = (s) => ({ active: 0, pastDue: 1, lapsed: 2 })[s.key];

function claimsLine(claims) {
  if (!claims.length) return 'No claims — file one any time';
  const open = claims.filter((c) => !['Paid', 'Denied'].includes(c.status));
  if (open.length) return `${plural(open.length, 'claim')} in progress`;
  return `${plural(claims.length, 'claim')}, all resolved`;
}

function paymentsLine(policies, today) {
  if (!policies.length) return 'Nothing due';
  const soonest = [...policies].sort((a, b) =>
    a.paidThroughDate.localeCompare(b.paidThroughDate),
  )[0];
  const status = coverageStatus(soonest, today);
  if (status.key !== 'active') return 'Payment past due';
  return `Paid through ${formatDate(soonest.paidThroughDate)}`;
}

function targetHref(target) {
  const [route, queryString] = target.split('?');
  const [section, id] = route.split('/');
  const map = {
    coverages: 'pages/my-coverages.html',
    payments: 'pages/my-payments.html',
    claims: 'pages/my-claims.html',
    rewards: 'pages/my-rewards.html',
    health: 'pages/my-health.html',
  };
  const page = map[section] ?? 'home.html';
  if (section === 'coverages' && id === 'add') return `${page}?add=1`;
  return queryString ? `${page}?${queryString}` : page;
}
