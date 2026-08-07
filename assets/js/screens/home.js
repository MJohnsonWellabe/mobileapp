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
  amountDue,
  coverageStatus,
  formatDate,
  formatMoney,
  formatPoints,
  toYmd,
  startOfToday,
  plural,
  PRODUCT_LABELS,
  deriveHealthStats,
} from '../format.js';
import { html, esc, mount, on, sectionCard, skeletonList, toast, preloadIllustrations, illustration } from '../ui.js';
import { icons, wellabeMark } from '../icons.js';
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
  const attention = attentionItems({ policies, claims, user, health: stats, today });
  const unread = state.notices.filter((n) => !n.read).length;

  return html`
    <div class="home-hero">
      <h1 class="home-greeting">Hello, ${esc(user.firstName)}</h1>
      <p class="home-sub">${esc(coverageLine(policies, today))}</p>
    </div>

    ${attention.length ? attentionCard(attention) : ''} ${todayCard(stats, todayLog, today)}

    <div>
      <h2 class="section-heading">Your Wellabe</h2>
      <div class="section-grid">
        ${idCardTile(policies, user, today)}
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
          ...coverageCardProps(policies, today),
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
          ...paymentsCardProps(policies, today),
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
          status: 'Find care near you',
        })}
        ${sectionCard({
          href: 'pages/my-information.html',
          icon: 'person',
          title: 'MyInformation',
          status: 'Contact details and address',
        })}
      </div>
    </div>

    <div class="illustration" aria-hidden="true">
      ${illustration('family-couch')}
    </div>
  `;
}

/** The derived "needs your attention" group, shown at the top of Home as well as in
 *  MyMailbox. Never stored — see notices.js. */
function attentionCard(items) {
  // "Needs your attention" has to mean "something is wrong." An unlocked
  // reward arriving under that header taught members to brace for a problem
  // and then handed them a cross-sell — the fastest way to make a senior
  // audience stop trusting the header entirely (visual QA finding). Good news
  // gets its own heading; the accent tone is the app's existing marker for it.
  const good = items.filter((i) => i.tone === 'accent');
  const bad = items.filter((i) => i.tone !== 'accent');
  return html`${bad.length ? attentionGroup('Needs your attention', bad) : ''}
  ${good.length ? attentionGroup('Good news', good) : ''}`;
}

function attentionGroup(heading, items) {
  return html`<div class="stack-sm">
    <h2 class="section-heading">${esc(heading)}</h2>
    ${items.map(
      (item) => html`<div class="card stack-sm">
        <div class="notice-banner notice-banner--${item.tone === 'accent' ? 'info' : item.tone}">
          ${item.tone === 'accent' ? icons.starFilled() : icons.alert()}
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
  // The ring shows streak PROGRESS (same formula as MyHealth's ring, so the two
  // never disagree) — not today's checkbox state. It used to fill only on
  // `done`, so it looked identical (a bare dot) whether the streak was 0 days
  // or 45; the checkbox row below already carries "did I do today's yet."
  const pct = Math.min(1, stats.currentStreakDays / Math.max(7, stats.longestStreakDays || 7));

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
            stroke-dasharray="${(pct * circumference).toFixed(1)} ${circumference.toFixed(1)}"
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

/** The digital ID card, as the headline object on Home rather than a link
 *  buried in a list.
 *
 *  Competitive research this session was unanimous that this is the single
 *  most-loved feature in every insurer app reviewed, and specifically because
 *  it's surfaced as something you can *see*, not a text link you have to know
 *  to look for. So it gets a real card face — the same yellow band and fields
 *  as the full view in my-coverages.js — spanning the full width of the grid.
 *
 *  Defaults to the first active policy (or just the first, if none are
 *  active) when a member holds more than one; a shortcut has to point
 *  somewhere concrete, and the full MyCoverages list is one tap away for the
 *  rest. */
function idCardTile(policies, user, today) {
  if (!policies.length) return '';
  const policy = policies.find((p) => coverageStatus(p, today).key === 'active') ?? policies[0];
  return html`<a
    class="idcard idcard--preview"
    href="pages/my-coverages.html?view=card&id=${esc(policy.id)}"
  >
    <span class="idcard__top">
      <span class="idcard__mark" aria-hidden="true">${wellabeMark()}</span>
      <span class="idcard__brand">wellabe</span>
      <span class="idcard__type">${esc(PRODUCT_LABELS[policy.product])}</span>
    </span>
    <span class="idcard--preview__body">
      <span class="idcard__field">
        <span class="idcard__label">Member</span>
        <span class="idcard__value idcard__value--lg">${esc(user.firstName)}</span>
      </span>
      <span class="idcard__field">
        <span class="idcard__label">Policy number</span>
        <span class="idcard__value idcard__value--mono">${esc(policy.policyNumber)}</span>
      </span>
    </span>
    <span class="idcard--preview__foot">
      ${icons.card()} <span>View your ID card</span>
      <span class="idcard--preview__chevron">${icons.chevronRight()}</span>
    </span>
  </a>`;
}

/* ------------------------------------------------------- status lines ----- */

function coverageLine(policies, today) {
  if (!policies.length) return 'You have no coverage on file.';
  const lapsed = policies.filter((p) => coverageStatus(p, today).key !== 'active');
  if (lapsed.length) return 'One of your policies needs attention.';
  return `You're covered. ${plural(policies.length, 'policy', 'policies')} active.`;
}

/** sectionCard() props for MyCoverages.
 *
 *  The status word is always a pill — green for Active, amber for past due,
 *  red for lapsed — rather than plain text with a middot separator. Two
 *  reasons: Home used to render "Lapsed" in the identical grey as "Active",
 *  so the one card that needed attention looked like the seven that didn't;
 *  and the middot form wrapped badly in a narrow grid column, orphaning
 *  "· Active" onto its own line behind a leading dot that read as a typo.
 *  A pill can't do either. */
function coverageCardProps(policies, today) {
  if (!policies.length) return { status: 'Nothing on file yet' };
  const single = policies.length === 1;
  const worst = single
    ? coverageStatus(policies[0], today)
    : policies.map((p) => coverageStatus(p, today)).sort((a, b) => tone(b) - tone(a))[0];
  const prefix = single
    ? PRODUCT_LABELS[policies[0].product]
    : plural(policies.length, 'policy', 'policies');

  return {
    status: worst.label,
    statusPrefix: prefix,
    statusTone:
      worst.key === 'active' ? 'success' : worst.key === 'lapsed' ? 'danger' : 'warning',
  };
}

const tone = (s) => ({ active: 0, pastDue: 1, lapsed: 2 })[s.key];

function claimsLine(claims) {
  if (!claims.length) return 'No claims — file one any time';
  const open = claims.filter((c) => !['Paid', 'Denied'].includes(c.status));
  if (open.length) return `${plural(open.length, 'claim')} in progress`;
  return `${plural(claims.length, 'claim')}, all resolved`;
}

/** sectionCard() props for MyPayments — same good/bad split as coverage. */
function paymentsCardProps(policies, today) {
  if (!policies.length) return { status: 'Nothing due' };
  const soonest = [...policies].sort((a, b) =>
    a.paidThroughDate.localeCompare(b.paidThroughDate),
  )[0];
  const status = coverageStatus(soonest, today);
  if (status.key !== 'active') {
    // The amount matters most on the one card that has a problem — an earlier
    // pass shipped the pill alone here, which left the member with something
    // wrong seeing LESS information than the members with nothing wrong
    // (visual QA finding).
    return {
      status: 'Past due',
      statusTone: 'warning',
      statusPrefix: formatMoney(amountDue(soonest, today).amount),
    };
  }
  // Non-breaking spaces so the date never splits mid-date on a narrow card
  // column ("September 3," on one line, "2026" orphaned on the next).
  return { status: `Paid through ${formatDate(soonest.paidThroughDate).replace(/ /g, ' ')}` };
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
