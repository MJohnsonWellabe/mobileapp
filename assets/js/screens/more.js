// The "More" tab: a full-screen list, not a drawer or a bottom sheet.
//
// docs/01 §Navigation settles the earlier "slide-out or bottom-sheet" question in
// favour of this, because a full-screen list of full-width bands is the easiest
// thing to hit and the easiest thing to read for this member base.

import { page } from './_page.js';
import {
  subscribeRewardsAccount,
  subscribeHealthProfile,
  subscribeHealthLogs,
  subscribeUser,
} from '../data.js';
import { deriveHealthStats, formatPoints, plural } from '../format.js';
import { html, esc } from '../ui.js';
import { icons } from '../icons.js';
import { logout } from '../auth.js';

page({
  title: 'More',
  tab: 'more',
  ready: ['rewards', 'logs', 'user'],

  subscribe(session, update) {
    subscribeUser(session.userId, (user) => update({ user }));
    subscribeRewardsAccount(session.userId, (rewards) => update({ rewards: rewards ?? {} }));
    subscribeHealthProfile(session.userId, (health) => update({ health: health ?? {} }));
    subscribeHealthLogs(session.userId, (logs) => update({ logs }));
  },

  events(app) {
    app.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="logout"]')) {
        logout();
        location.replace('../index.html');
      }
    });
  },

  render(state) {
    const stats = deriveHealthStats(state.logs);
    const rows = [
      {
        href: 'my-health.html',
        icon: 'heart',
        label: 'MyHealth',
        status: stats.currentStreakDays
          ? `${plural(stats.currentStreakDays, 'day')} in a row`
          : 'Start a streak today',
      },
      {
        href: 'my-rewards.html',
        icon: 'gift',
        label: 'MyRewards',
        status: `${formatPoints(state.rewards.pointsBalance ?? 0)} points · ${state.rewards.tier ?? 'Bronze'}`,
      },
      {
        href: 'my-care.html',
        icon: 'stethoscope',
        label: 'MyCare',
        status: 'Find a dentist, doctor or therapist near you',
      },
      {
        href: 'my-information.html',
        icon: 'person',
        label: 'MyInformation',
        status: esc(state.user.email || 'Your contact details'),
      },
      {
        href: 'my-mailbox.html',
        icon: 'mailbox',
        label: 'MyMailbox',
        status: 'Notices, documents, and messages',
      },
    ];

    return html`
      <div class="more-list">
        ${rows.map(
          (r) => html`<a class="more-row" href="${r.href}">
            <span class="more-row__icon">${icons[r.icon]()}</span>
            <span class="more-row__body">
              <span class="more-row__label">${esc(r.label)}</span>
              <span class="more-row__status">${esc(r.status)}</span>
            </span>
            <span class="more-row__chevron">${icons.chevronRight()}</span>
          </a>`,
        )}
      </div>

      <div class="more-list">
        <button class="more-row" type="button" data-action="logout">
          <span class="more-row__icon">${icons.logout()}</span>
          <span class="more-row__body">
            <span class="more-row__label">Log Out</span>
            <span class="more-row__status">Signed in as ${esc(state.user.firstName)}</span>
          </span>
        </button>
      </div>

      <p class="disclosure" style="text-align:center">
        Wellabe member app — demonstration build. All information shown is made up.
      </p>
    `;
  },
});
