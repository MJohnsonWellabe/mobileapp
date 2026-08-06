// MyHealth — daily challenges, streaks, badges, and the 80/100 offer.
//
// Every number on this screen is recomputed from healthDailyLog on load and written
// back to healthProfiles, so the Home card, this screen and the admin console cannot
// disagree (docs/05).
//
// A broken streak is handled without shame. April's screen leads with her personal
// best and an invitation, never a bare 0 and never the words "lost" or "broken" —
// punitive framing after a missed day drives people to abandon a habit rather than
// resume it, which is the opposite of what this feature is for.

import { page } from './_page.js';
import { subscribeHealthProfile, subscribeHealthLogs, subscribePolicies } from '../data.js';
import {
  deriveHealthStats,
  toYmd,
  startOfToday,
  addDays,
  plural,
  formatDate,
  WINDOW_DAYS,
  WINDOW_QUALIFY_DAYS,
} from '../format.js';
import { html, esc, toast, on, illustration } from '../ui.js';
import { icons } from '../icons.js';
import { toggleChallenge, connectTracker, persistStats, challengeForDate } from '../features/health.js';

const TRACKERS = ['Apple Health', 'Fitbit', 'Garmin', 'Samsung Health'];

page({
  title: 'MyHealth',
  tab: 'more',
  ready: ['profile', 'logs', 'policies'],
  illustrations: ['walking-dog', 'walking-man'],

  subscribe(session, update) {
    subscribePolicies(session.userId, (policies) => update({ policies }));
    subscribeHealthProfile(session.userId, (profile) => update({ profile: profile ?? {} }));
    subscribeHealthLogs(session.userId, (logs) => update({ logs }));
  },

  events(app, ctx, getState) {
    let busy = false;

    on(app, 'click', '[data-challenge]', async (event, el) => {
      if (busy) return;
      busy = true;
      el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      const { logs, profile } = getState();
      try {
        const result = await toggleChallenge({
          userId: ctx.session.userId,
          challengeId: el.dataset.challenge,
          logsByDate: logs,
          profile,
        });
        if (result.newlyQualified) toast("You've unlocked a no-health-questions offer!");
        else if (result.creditedPoints > 0) toast(`+${result.creditedPoints} points`);
      } catch (err) {
        console.error(err);
        toast("We couldn't save that just now. Please try again.", { tone: 'error' });
      } finally {
        busy = false;
      }
    });

    on(app, 'click', '[data-connect]', (event, el) => {
      ctx.view.connecting = el.dataset.connect === 'open' ? true : null;
      ctx.repaint();
    });

    on(app, 'click', '[data-tracker]', async (event, el) => {
      const { profile } = getState();
      try {
        await connectTracker(ctx.session.userId, profile, `${el.dataset.tracker} (connected)`);
        ctx.view.connecting = null;
        ctx.repaint();
        toast(`${el.dataset.tracker} connected.`);
      } catch (err) {
        console.error(err);
        toast("We couldn't connect that. Please try again.", { tone: 'error' });
      }
    });
  },

  render(state, ctx) {
    const { profile, logs, policies } = state;
    const today = startOfToday();
    const stats = deriveHealthStats(logs, today);
    const todayLog = logs[toYmd(today)]?.challengesCompleted ?? [];

    // Keep the stored cache in step with what is on screen, without blocking paint.
    if (
      profile.currentStreakDays !== stats.currentStreakDays ||
      profile.challengeDaysCompletedInWindow !== stats.challengeDaysCompletedInWindow
    ) {
      persistStats({
        userId: ctx.session.userId,
        stats,
        profile,
        offerShown: profile.guaranteedIssueOfferShown,
      }).catch(() => {});
    }

    if (ctx.view.connecting) return connectView();

    const hasHI = policies.some((p) => p.product === 'hospitalIndemnity');

    return html`
      ${streakCard(stats, profile)} ${challengesCard(todayLog, today)}
      ${stats.qualifiesForGuaranteedIssue && !hasHI ? offerCard(stats, today) : windowCard(stats)}
      ${trackerCard(profile)} ${badgesCard(profile)}
    `;
  },
});

function streakCard(stats, profile) {
  const broken = stats.currentStreakDays === 0 && (profile.longestStreakDays ?? 0) > 0;
  const never = stats.currentStreakDays === 0 && !(profile.longestStreakDays > 0);
  const circumference = 2 * Math.PI * 46;
  const pct = Math.min(1, stats.currentStreakDays / Math.max(7, stats.longestStreakDays || 7));

  return html`<div class="card stack-sm" style="text-align:center">
    <div class="ring ring--lg" style="margin:0 auto">
      <svg viewBox="0 0 108 108" aria-hidden="true">
        <circle class="ring__track" cx="54" cy="54" r="46" />
        <circle
          class="ring__value"
          cx="54"
          cy="54"
          r="46"
          stroke-dasharray="${(pct * circumference).toFixed(1)} ${circumference.toFixed(1)}"
        />
      </svg>
      <span class="ring__label">
        <span class="ring__number">${stats.currentStreakDays}</span>
        <span class="ring__unit">day${stats.currentStreakDays === 1 ? '' : 's'}</span>
      </span>
    </div>

    ${broken
      ? html`<h2>Welcome back</h2>
          <p>
            Your longest streak was ${plural(profile.longestStreakDays, 'day')}. Complete today's
            challenge to start a new one.
          </p>`
      : never
        ? html`<h2>Let's get started</h2>
            <p>Complete today's challenge and your streak begins.</p>`
        : html`<h2>${plural(stats.currentStreakDays, 'day')} in a row</h2>
            <p class="card__meta">
              Your longest streak is ${plural(Math.max(stats.longestStreakDays, profile.longestStreakDays ?? 0), 'day')}.
            </p>`}
  </div>`;
}

function challengesCard(todayLog, today) {
  // One assigned challenge per day, not a checklist of all five — see
  // DECISIONS-LOG.md.
  const challenge = challengeForDate(today);
  const done = todayLog.includes(challenge.id);
  return html`<div class="today-card">
    <div class="today-card__copy" style="margin-bottom:var(--space-3)">
      <div class="today-card__title">Today's challenge</div>
      <div class="today-card__meta">
        ${done ? 'Complete. Today counts toward your streak.' : 'Complete it to count today.'}
      </div>
    </div>
    <ul class="challenge-list">
      <li>
        <button class="challenge" type="button" data-challenge="${challenge.id}" aria-pressed="${done}">
          <span class="challenge__box" aria-hidden="true">${icons.check()}</span>
          <span class="challenge__label">
            ${esc(challenge.label)}<br /><span style="font-size:var(--text-sm);color:var(--color-text-secondary)"
              >${esc(challenge.detail)}</span
            >
          </span>
        </button>
      </li>
    </ul>
  </div>`;
}

/** The offer. Note the copy: "no health questions", never "guaranteed issue" —
 *  see docs/05 and DECISIONS-LOG.md for why that phrase is not used on screen. */
function offerCard(stats, today) {
  const expires = addDays(today, 60);
  return html`<div class="card card--celebrate stack-sm">
    <span class="card__eyebrow">${icons.starFilled()} Unlocked</span>
    <h2>You've unlocked a no-health-questions offer</h2>
    <p>
      You've completed ${stats.challengeDaysCompletedInWindow} of the last ${WINDOW_DAYS} days of
      daily challenges. That qualifies you to add Wellabe Hospital Indemnity coverage without
      answering any health questions.
    </p>
    <p class="card__meta"><em>This offer is available through ${formatDate(expires)}.</em></p>
    <a class="btn btn--primary btn--block" href="my-coverages.html?add=1">See the offer</a>
    <p class="disclosure">
      Demonstration only. Not an offer of insurance. Eligibility, availability, and terms vary
      by state.
    </p>
  </div>`;
}

function windowCard(stats) {
  const pct = Math.min(1, stats.challengeDaysCompletedInWindow / WINDOW_QUALIFY_DAYS);
  const toGo = Math.max(0, WINDOW_QUALIFY_DAYS - stats.challengeDaysCompletedInWindow);
  return html`<div class="card stack-sm">
    <h3 class="card__title">Your 100-day progress — ${WINDOW_QUALIFY_DAYS} days unlock an offer</h3>
    <p class="card__meta">
      ${stats.challengeDaysCompletedInWindow} of the last ${WINDOW_DAYS} days counted toward the
      ${WINDOW_QUALIFY_DAYS}-day target.
      ${toGo ? `${plural(toGo, 'more day')} ${toGo === 1 ? 'unlocks' : 'unlock'} a no-health-questions coverage offer.` : ''}
    </p>
    <div class="meter"><span class="meter__fill" style="width:${(pct * 100).toFixed(0)}%"></span></div>
  </div>`;
}

function trackerCard(profile) {
  return profile.connectedTracker
    ? html`<div class="card stack-sm">
        <h3 class="card__title">Your tracker</h3>
        <span class="pill pill--success">${icons.checkCircle()}${esc(profile.connectedTracker)}</span>
        <p class="card__meta">
          Your steps and activity come in automatically. You can still check anything off by
          hand.
        </p>
      </div>`
    : html`<div class="card stack-sm">
        <div class="illustration" style="max-width:200px;opacity:.5" aria-hidden="true">
          ${illustration('walking-man')}
        </div>
        <h3 class="card__title">Connect a fitness tracker</h3>
        <p class="card__meta">
          Link a tracker and your steps and activity fill themselves in. You don't need one to
          take part.
        </p>
        <button class="btn btn--secondary btn--block" data-connect="open">Connect a tracker</button>
      </div>`;
}

function connectView() {
  return html`<div class="card stack">
    <h2>Connect a tracker</h2>
    <p>Choose the app or device you use.</p>
    ${TRACKERS.map(
      (t) => html`<button class="btn btn--secondary btn--block" data-tracker="${esc(t)}">${esc(t)}</button>`,
    )}
    <p class="disclosure">
      This is a demonstration. Nothing actually connects to a device, and no health data
      leaves your phone.
    </p>
    <button class="btn btn--secondary btn--block" data-connect="close">Cancel</button>
  </div>`;
}

function badgesCard(profile) {
  const badges = profile.badges ?? [];
  return html`<div class="card stack-sm">
    <h3 class="card__title">Badges</h3>
    ${badges.length
      ? html`<div class="badges">
          ${badges.map(
            (b) => html`<span class="badge">${icons.starFilled()}${esc(b)}</span>`,
          )}
        </div>`
      : html`<p class="card__meta">
          Your first badge arrives after seven days in a row. It's closer than it sounds.
        </p>`}
  </div>`;
}
