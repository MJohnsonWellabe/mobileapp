// MyRewards — points balance and tier, a store, ways to earn, and history.
//
// The hard rule: a redemption can never take the balance negative. That is checked
// here before the write, and again in firestore.rules, where pointsBalance >= 0 is
// enforced even when the client uses increment(-cost) — Firestore applies numeric
// transforms before evaluating request.resource, so the rule sees the result.
//
// Points are one ledger shared with MyHealth. Completing a challenge credits the
// same rewardsAccounts/rewardsTransactions documents this screen reads, which is the
// cross-feature link docs/05 asks to be verified explicitly.

import { page } from './_page.js';
import {
  subscribeRewardsAccount,
  subscribeRewardsTransactions,
  getRewardsCatalog,
  setRewardsAccount,
  addRewardsTransaction,
  setRewardsTransaction,
  rewardsTransactionExists,
  serverTimestamp,
} from '../data.js';
import { formatDate, formatPoints, tierFor, toYmd, startOfToday } from '../format.js';
import { html, esc, button, toast, on, emptyState } from '../ui.js';
import { icons } from '../icons.js';
import { noticeRewardRedeemed } from '../notices.js';

const TIER_THRESHOLDS = { Bronze: 0, Silver: 2000, Gold: 5000 };

page({
  title: 'MyRewards',
  tab: 'more',
  ready: ['account', 'transactions', 'catalog'],
  illustrations: ['open-book', 'thinking-at-computer'],

  subscribe(session, update) {
    subscribeRewardsAccount(session.userId, (account) =>
      update({ account: account ?? { pointsBalance: 0, lifetimePointsEarned: 0, tier: 'Bronze' } }),
    );
    subscribeRewardsTransactions(session.userId, (transactions) => update({ transactions }));
    getRewardsCatalog().then((catalog) => update({ catalog }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-redeem]', (event, el) => {
      const { catalog } = getState();
      ctx.view.confirm = catalog.find((i) => i.id === el.dataset.redeem);
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-action="cancel"]', () => {
      ctx.view.confirm = null;
      ctx.repaint();
    });

    on(app, 'click', '[data-action="confirm-redeem"]', async () => {
      const { account } = getState();
      const item = ctx.view.confirm;
      if (!item) return;

      // The same check as the button's disabled state, deliberately repeated. The
      // rule is about the write, not about whether the button looks clickable.
      if (account.pointsBalance < item.cost) {
        toast("You don't have enough points for that yet.", { tone: 'error' });
        return;
      }

      try {
        await addRewardsTransaction({
          userId: ctx.session.userId,
          type: 'spend',
          amount: item.cost,
          reason: `Redeemed: ${item.name}`,
          timestamp: serverTimestamp(),
        });
        await setRewardsAccount(ctx.session.userId, {
          userId: ctx.session.userId,
          pointsBalance: account.pointsBalance - item.cost,
          lifetimePointsEarned: account.lifetimePointsEarned ?? 0,
          tier: tierFor(account.lifetimePointsEarned ?? 0),
        });
        await noticeRewardRedeemed({
          userId: ctx.session.userId,
          itemName: item.name,
          cost: item.cost,
        });
        ctx.view.confirm = null;
        ctx.repaint();
        // This exact pattern is specified in docs/05 — not a generic "success".
        toast(`You've been enrolled in ${item.name}!`);
      } catch (err) {
        console.error(err);
        toast("We couldn't complete that. Please try again.", { tone: 'error' });
      }
    });

    on(app, 'click', '[data-earn]', async (event, el) => {
      const { catalog, account } = getState();
      const item = catalog.find((i) => i.id === el.dataset.earn);
      if (!item) return;

      // Deterministic ID so an activity can only ever credit once, however many
      // times someone taps it.
      const txId = `${ctx.session.userId}_earn_${item.id}`;
      if (await rewardsTransactionExists(txId)) {
        toast("You've already earned points for that one.");
        return;
      }
      try {
        await setRewardsTransaction(txId, {
          userId: ctx.session.userId,
          type: 'earn',
          amount: item.cost,
          reason: `${item.category === 'Video' ? 'Watched' : 'Read'}: ${item.name}`,
          timestamp: serverTimestamp(),
        });
        const lifetime = (account.lifetimePointsEarned ?? 0) + item.cost;
        await setRewardsAccount(ctx.session.userId, {
          userId: ctx.session.userId,
          pointsBalance: account.pointsBalance + item.cost,
          lifetimePointsEarned: lifetime,
          tier: tierFor(lifetime),
        });
        toast(`+${item.cost} points`);
      } catch (err) {
        console.error(err);
        toast("We couldn't credit that. Please try again.", { tone: 'error' });
      }
    });
  },

  render(state, ctx) {
    const { account, transactions, catalog } = state;
    if (ctx.view.confirm) return confirmView(ctx.view.confirm, account);

    const store = catalog.filter((i) => i.kind === 'redeem').sort((a, b) => a.cost - b.cost);
    const earn = catalog.filter((i) => i.kind === 'earn');
    const earned = new Set(
      transactions.filter((t) => t.type === 'earn').map((t) => t.reason.replace(/^(Watched|Read): /, '')),
    );
    // A member shouldn't be offered a "Redeem" button for something they already
    // redeemed (visual QA finding) — one-time rewards, not a subscription re-buy.
    const redeemed = new Set(
      transactions.filter((t) => t.type === 'spend').map((t) => t.reason.replace(/^Redeemed: /, '')),
    );

    return html`
      ${balanceCard(account)}

      <div class="stack-sm">
        <h2 class="section-heading">Rewards store</h2>
        ${store.map((item) => storeCard(item, account, redeemed.has(item.name)))}
      </div>

      <div class="stack-sm">
        <h2 class="section-heading">Earn more points</h2>
        ${earn.map((item) => earnCard(item, earned.has(item.name)))}
        <p class="disclosure">
          You also earn points automatically — a bonus on each policy anniversary, and points
          for every daily challenge you complete in MyHealth.
        </p>
      </div>

      <div class="stack-sm">
        <h2 class="section-heading">Recent activity</h2>
        ${transactions.length
          ? html`<div class="card card--flush">${transactions.map(historyRow)}</div>
              <p class="disclosure">
                Showing your most recent activity. Earlier earning and redeeming is folded
                into the lifetime and balance totals above.
              </p>`
          : emptyState({
              art: 'thinking-at-computer',
              title: 'Nothing here yet',
              body: 'Read an article or complete a daily challenge and your points will show up here.',
            })}
      </div>
    `;
  },
});

/** Bronze/Silver/Gold each get their own look — see docs/01 and DECISIONS-LOG.md
 *  for why they can't all just be the yellow pill with different text. */
function tierPillClass(tier) {
  return { Bronze: 'pill--tier-bronze', Silver: 'pill--tier-silver', Gold: 'pill--tier-gold' }[tier] ??
    'pill--tier-bronze';
}

function balanceCard(account) {
  const lifetime = account.lifetimePointsEarned ?? 0;
  const next = lifetime >= TIER_THRESHOLDS.Gold ? null : lifetime >= TIER_THRESHOLDS.Silver ? 'Gold' : 'Silver';
  const toGo = next ? TIER_THRESHOLDS[next] - lifetime : 0;
  const pct = next ? Math.min(1, lifetime / TIER_THRESHOLDS[next]) : 1;

  return html`<div class="card card--accent-solid stack-sm">
    <div class="balance">
      <span class="balance__number">${formatPoints(account.pointsBalance ?? 0)}</span>
      <span class="balance__unit">points to spend</span>
    </div>
    <div class="tier">
      <span class="pill ${tierPillClass(account.tier)}">${icons.starFilled()}${esc(account.tier ?? 'Bronze')}</span>
      ${next
        ? html`<span class="card__meta">${formatPoints(toGo)} more lifetime points to reach ${next}</span>`
        : html`<span class="card__meta">You're at the top tier.</span>`}
    </div>
    <div class="meter"><span class="meter__fill" style="width:${(pct * 100).toFixed(0)}%"></span></div>
    <p class="disclosure">
      Your tier is based on lifetime points earned (${formatPoints(lifetime)} so far), and it
      never goes down. Your spendable balance above is different — that's the one redeeming
      an item lowers.
    </p>
  </div>`;
}

function storeCard(item, account, alreadyRedeemed) {
  const affordable = (account.pointsBalance ?? 0) >= item.cost;
  const short = item.cost - (account.pointsBalance ?? 0);

  return html`<div class="card stack-sm">
    <div style="display:flex;justify-content:space-between;gap:var(--space-3);align-items:flex-start">
      <div>
        <h3 class="card__title">${esc(item.name)}</h3>
        <p class="card__meta">${esc(item.description)}</p>
      </div>
      <span class="pill pill--neutral" style="align-self:flex-start"
        >${formatPoints(item.cost)}</span
      >
    </div>
    ${alreadyRedeemed
      ? html`<span class="pill pill--success">${icons.checkCircle()}Redeemed</span>`
      : affordable
        ? html`<button class="btn btn--primary btn--block" data-redeem="${esc(item.id)}">
            Redeem for ${formatPoints(item.cost)} points
          </button>`
        : html`<p class="reward-locked">${icons.lock()} ${formatPoints(short)} more points needed</p>
            <p class="card__meta" style="text-align:center">
              Keep completing daily challenges and you'll get there.
            </p>`}
  </div>`;
}

function earnCard(item, alreadyEarned) {
  return html`<div class="card stack-sm">
    <div style="display:flex;gap:var(--space-3);align-items:flex-start">
      <span style="color:var(--color-primary);flex:none">${icons.book()}</span>
      <div style="flex:1;min-width:0">
        <h3 class="card__title">${esc(item.name)}</h3>
        <p class="card__meta">${esc(item.description)}</p>
      </div>
      <span class="pill pill--accent" style="align-self:flex-start">+${item.cost}</span>
    </div>
    ${alreadyEarned
      ? html`<span class="pill pill--success">${icons.checkCircle()}Completed</span>`
      : html`<button class="btn btn--secondary btn--block" data-earn="${esc(item.id)}">
          Mark as ${item.category === 'Video' ? 'watched' : 'read'}
        </button>`}
  </div>`;
}

function historyRow(tx) {
  const earn = tx.type === 'earn';
  return html`<div class="history-row">
    <span class="history-row__body">
      <span>${esc(tx.reason)}</span>
      <span class="history-row__date">${formatDate(tx.timestamp)}</span>
    </span>
    <span class="history-row__amount history-row__amount--${earn ? 'earn' : 'spend'}">
      ${earn ? '+' : '−'}${formatPoints(tx.amount)}
    </span>
  </div>`;
}

function confirmView(item, account) {
  return html`<div class="card stack">
    <h2>Redeem ${esc(item.name)}?</h2>
    <p>${esc(item.description)}</p>
    <div class="data-row">
      <span class="data-row__label">Cost</span>
      <span class="data-row__value">${formatPoints(item.cost)} points</span>
    </div>
    <div class="data-row">
      <span class="data-row__label">Your balance afterwards</span>
      <span class="data-row__value">${formatPoints(account.pointsBalance - item.cost)} points</span>
    </div>
    <p class="disclosure">
      This is a demonstration. No membership is actually purchased or activated.
    </p>
    ${button('Yes, redeem it', { action: 'confirm-redeem', block: true })}
    ${button('Not yet', { action: 'cancel', variant: 'secondary', block: true })}
  </div>`;
}
