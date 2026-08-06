// MyMailbox — notices, documents, and messages. The insurer-to-member half of the
// app (docs/04 §MyMailbox).
//
// The load-bearing distinction: "Needs your attention" is DERIVED on every render
// from live policy and user data and never written to Firestore, while "Recent" is
// stored event notices. Persist a condition notice and the mailbox starts showing a
// past-due warning for a policy that was paid ten minutes ago.

import { page, param } from './_page.js';
import {
  subscribeNotices,
  subscribeDocuments,
  subscribeThreads,
  subscribePolicies,
  subscribeUser,
  markNoticeRead,
  createThread,
  updateThread,
  updateUserFields,
  serverTimestamp,
  Timestamp,
} from '../data.js';
import { formatDate, formatDateTime, startOfToday, toDate } from '../format.js';
import { html, esc, button, toast, on, emptyState, illustration } from '../ui.js';
import { icons } from '../icons.js';
import { attentionItems, resolveTarget } from '../notices.js';
import { renderDocument } from '../features/documents.js';

const TOPICS = [
  ['billing', 'Billing', 'A payment, a premium, or your bill'],
  ['claims', 'Claims', 'A claim you have filed'],
  ['coverage', 'Coverage', 'What you have, or adding more'],
  ['other', 'Something else', "Anything that doesn't fit above"],
];

const CATEGORIES = [
  ['all', 'All'],
  ['policy', 'Policy'],
  ['statement', 'Statements'],
  ['claim', 'Claims'],
  ['notice', 'Notices'],
  ['tax', 'Tax'],
];

const PREF_ROWS = [
  ['bills', 'Bills & payments'],
  ['claims', 'Claim updates'],
  ['policy', 'Policy & rate notices'],
  ['rewards', 'Rewards & health'],
];

page({
  title: 'MyMailbox',
  tab: 'more',
  ready: ['notices', 'documents', 'threads', 'policies', 'user'],
  illustrations: ['thinking-at-computer', 'video-call'],
  subViewKeys: ['mode', 'openNotice', 'openDocument', 'openThread'],

  subscribe(session, update, ctx) {
    ctx.view.tab = 'notices';
    ctx.view.category = 'all';
    if (param('view') === 'preferences') ctx.view.mode = 'preferences';
    if (param('compose')) {
      ctx.view.mode = 'compose';
      ctx.view.topic = param('compose');
      ctx.view.relatedId = param('claim');
      ctx.view.subject = param('subject');
    }
    subscribeUser(session.userId, (user) => update({ user }));
    subscribePolicies(session.userId, (policies) => update({ policies }));
    subscribeNotices(session.userId, (notices) => update({ notices }));
    subscribeDocuments(session.userId, (documents) => update({ documents }));
    subscribeThreads(session.userId, (threads) => update({ threads }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-tab]', (event, el) => {
      ctx.view.tab = el.dataset.tab;
      ctx.repaint();
    });

    on(app, 'click', '[data-category]', (event, el) => {
      ctx.view.category = el.dataset.category;
      ctx.repaint();
    });

    on(app, 'click', '[data-notice]', async (event, el) => {
      const { notices } = getState();
      const notice = notices.find((n) => n.id === el.dataset.notice);
      ctx.view.openNotice = el.dataset.notice;
      window.scrollTo(0, 0);
      ctx.repaint();
      if (notice && !notice.read) {
        try {
          await markNoticeRead(notice.id);
        } catch (err) {
          console.error(err);
        }
      }
    });

    on(app, 'click', '[data-document]', (event, el) => {
      ctx.view.openDocument = el.dataset.document;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-thread]', (event, el) => {
      ctx.view.openThread = el.dataset.thread;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-mode]', (event, el) => {
      ctx.view.mode = el.dataset.mode;
      ctx.view.topic = el.dataset.topic ?? ctx.view.topic;
      window.scrollTo(0, 0);
      ctx.repaint();
    });

    on(app, 'click', '[data-action="print"]', () => window.print());

    on(app, 'click', '[data-action="email-copy"]', () => {
      const { user } = getState();
      toast(
        `In the live app this emails a copy to ${user.email}. This demo doesn't send real email.`,
        { duration: 7000 },
      );
    });

    on(app, 'click', '[data-action="mark-all"]', async () => {
      const { notices } = getState();
      const unread = notices.filter((n) => !n.read);
      try {
        await Promise.all(unread.map((n) => markNoticeRead(n.id)));
        toast(`${unread.length} marked as read.`);
      } catch (err) {
        console.error(err);
      }
    });

    on(app, 'click', '[data-topic]', (event, el) => {
      ctx.view.topic = el.dataset.topic;
      ctx.repaint();
    });

    on(app, 'submit', 'form[data-compose]', async (event, form) => {
      event.preventDefault();
      const { user } = getState();
      const body = form.body.value.trim();
      if (body.length < 3) {
        ctx.view.error = 'Please write your question first.';
        return ctx.repaint();
      }
      const now = Timestamp.now();
      try {
        // The rules forbid a client creating a thread that already carries a
        // Wellabe reply, so this is the only legal shape: one member message.
        await createThread({
          userId: user.id,
          topic: ctx.view.topic ?? 'other',
          subject: form.subject.value.trim() || 'A question for Wellabe',
          relatedTo: ctx.view.relatedId
            ? { section: 'claims', id: ctx.view.relatedId }
            : null,
          status: 'open',
          messages: [{ from: 'member', body, sentAt: now }],
          autoAckedAt: now,
          lastMessageAt: now,
          unreadByMember: false,
        });
        ctx.view.mode = null;
        ctx.view.tab = 'messages';
        ctx.view.error = null;
        ctx.repaint();
        toast('Your message has been sent.');
      } catch (err) {
        console.error(err);
        ctx.view.error = "We couldn't send that. Please try again.";
        ctx.repaint();
      }
    });

    on(app, 'submit', 'form[data-reply]', async (event, form) => {
      event.preventDefault();
      const { threads } = getState();
      const thread = threads.find((t) => t.id === form.dataset.reply);
      const body = form.body.value.trim();
      if (!thread || body.length < 2) return;
      try {
        await updateThread(thread.id, {
          messages: [...thread.messages, { from: 'member', body, sentAt: Timestamp.now() }],
          lastMessageAt: Timestamp.now(),
        });
        form.reset();
      } catch (err) {
        console.error(err);
        toast("We couldn't send that. Please try again.", { tone: 'error' });
      }
    });

    on(app, 'change', 'input[data-pref]', async (event, el) => {
      const { user } = getState();
      const [key, kind] = el.dataset.pref.split('.');
      const prefs = structuredClone(user.deliveryPreferences ?? {});
      prefs[key] = { ...prefs[key], [kind]: el.checked };
      try {
        await updateUserFields(user.id, { deliveryPreferences: prefs });
        // No celebratory toast for choosing paperless — docs/04 is explicit.
        if (el.checked) toast('Saved.');
      } catch (err) {
        console.error(err);
        toast("We couldn't save that. Please try again.", { tone: 'error' });
      }
    });
  },

  render(state, ctx) {
    const { notices, documents, threads, policies, user } = state;
    const v = ctx.view;

    if (v.mode === 'preferences') return preferencesView(user);
    if (v.mode === 'compose') return composeView(ctx);
    if (v.openDocument) {
      const document_ = documents.find((d) => d.id === v.openDocument);
      if (document_) return documentView(document_, user);
    }
    if (v.openNotice) {
      const notice = notices.find((n) => n.id === v.openNotice);
      if (notice) return noticeView(notice, ctx);
    }
    if (v.openThread) {
      const thread = threads.find((t) => t.id === v.openThread);
      if (thread) return threadView(thread);
    }

    const attention = attentionItems({ policies, user, today: startOfToday() });

    return html`
      <div class="segmented" role="tablist">
        ${[
          ['notices', 'Notices'],
          ['documents', 'Documents'],
          ['messages', 'Messages'],
        ].map(
          ([id, label]) => html`<button
            class="segmented__item"
            role="tab"
            data-tab="${id}"
            aria-selected="${v.tab === id}"
          >
            ${label}
          </button>`,
        )}
      </div>

      ${v.tab === 'documents'
        ? documentsTab(documents, v.category)
        : v.tab === 'messages'
          ? messagesTab(threads)
          : noticesTab(notices, attention)}

      <button class="btn btn--secondary btn--block" data-mode="compose">
        ${icons.send()} Ask Wellabe a question
      </button>
      <button class="btn btn--secondary btn--block" data-mode="preferences">
        ${icons.mailbox()} Delivery preferences
      </button>
    `;
  },
});

/* -------------------------------------------------------------- tabs ----- */

function noticesTab(notices, attention) {
  const unread = notices.filter((n) => !n.read).length;

  return html`
    ${attention.length
      ? html`<div class="stack-sm">
          <h2 class="section-heading">Needs your attention</h2>
          ${attention.map(
            (item) => html`<div class="card stack-sm">
              <div class="notice-banner notice-banner--${item.tone === 'accent' ? 'info' : item.tone}">
                ${icons.alert()}
                <span><strong>${esc(item.title)}</strong><br />${esc(item.body)}</span>
              </div>
              <a class="btn btn--primary btn--block" href="${esc(resolveTarget(item.actionTarget, '../') ?? '#')}"
                >${esc(item.actionLabel)}</a
              >
            </div>`,
          )}
        </div>`
      : html`<div class="notice-banner notice-banner--info">
          ${icons.checkCircle()}<span>You're all caught up.</span>
        </div>`}

    <div class="stack-sm">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-3)">
        <h2 class="section-heading" style="margin:0">Recent</h2>
        ${unread
          ? html`<button
              class="linkish"
              type="button"
              data-action="mark-all"
            >
              Mark all as read
            </button>`
          : ''}
      </div>
      ${notices.length
        ? html`<div class="card card--flush">${notices.map(noticeRow)}</div>`
        : emptyState({
            art: 'thinking-at-computer',
            title: 'Nothing here yet',
            body: 'Anything Wellabe sends you will arrive here.',
          })}
    </div>
  `;
}

function noticeRow(notice) {
  return html`<button class="notice-row" data-notice="${esc(notice.id)}">
    <span class="notice-row__icon">${icons[noticeIcon(notice.type)]()}</span>
    <span class="notice-row__body">
      <span class="notice-row__subject ${notice.read ? '' : 'is-unread'}">${esc(notice.subject)}</span>
      <span class="notice-row__preview">${esc(notice.body)}</span>
      <span class="notice-row__date">${formatDate(notice.createdAt)}</span>
    </span>
    ${notice.read
      ? ''
      : html`<span class="pill pill--danger" style="align-self:flex-start;margin-top:2px">
          <span class="dot" aria-hidden="true"></span>New
        </span>`}
  </button>`;
}

function documentsTab(documents, category) {
  const shown = category === 'all' ? documents : documents.filter((d) => d.category === category);
  const byYear = {};
  for (const d of shown) {
    const year = String(d.issuedDate).slice(0, 4);
    (byYear[year] ??= []).push(d);
  }

  return html`
    <div class="chips">
      ${CATEGORIES.map(
        ([id, label]) => html`<button
          class="chip"
          data-category="${id}"
          aria-pressed="${category === id}"
        >
          ${label}
        </button>`,
      )}
    </div>
    ${shown.length
      ? Object.keys(byYear)
          .sort((a, b) => b.localeCompare(a))
          .map(
            (year) => html`<div class="stack-sm">
              <h2 class="section-heading">${year}</h2>
              <div class="card card--flush">
                ${byYear[year].map(
                  (d) => html`<button class="notice-row" data-document="${esc(d.id)}">
                    <span class="notice-row__icon">${icons.document()}</span>
                    <span class="notice-row__body">
                      <span class="notice-row__subject">${esc(d.title)}</span>
                      <span class="notice-row__date">${formatDate(d.issuedDate)}</span>
                    </span>
                    <span class="pill pill--neutral" style="align-self:flex-start;margin-top:2px">${esc(categoryLabel(d.category))}</span>
                  </button>`,
                )}
              </div>
            </div>`,
          )
      : emptyState({
          art: 'thinking-at-computer',
          title: emptyDocTitle(category),
          body: emptyDocBody(category),
        })}
  `;
}

function messagesTab(threads) {
  return threads.length
    ? html`<div class="card card--flush">
        ${threads.map(
          (t) => html`<button class="notice-row" data-thread="${esc(t.id)}">
            <span class="notice-row__icon">${icons.send()}</span>
            <span class="notice-row__body">
              <span class="notice-row__subject">${esc(t.subject)}</span>
              <span class="notice-row__preview">${esc(t.messages[t.messages.length - 1].body)}</span>
              <span class="notice-row__date">${formatDate(t.lastMessageAt)}</span>
            </span>
            <span class="pill pill--${t.status === 'answered' ? 'success' : 'info'}" style="align-self:flex-start;margin-top:2px"
              >${t.status === 'answered' ? icons.checkCircle() : icons.clock()}${t.status === 'answered' ? 'Answered' : 'Open'}</span
            >
          </button>`,
        )}
      </div>`
    : emptyState({
        art: 'video-call',
        title: 'No messages yet',
        body: "If there's something you want to ask, start here and we'll follow up by phone or email.",
      });
}

/* ------------------------------------------------------------- views ----- */

function noticeView(notice, ctx) {
  const href = resolveTarget(notice.actionTarget, '../');
  return html`<div class="card stack">
    <div>
      <h2>${esc(notice.subject)}</h2>
      <p class="card__meta">${formatDateTime(notice.createdAt)}</p>
    </div>
    ${notice.body
      .split('\n\n')
      .map((para) => html`<p>${esc(para)}</p>`)}
    ${notice.documentId
      ? html`<button class="btn btn--secondary btn--block" data-document="${esc(notice.documentId)}">
          ${icons.document()} Open the document
        </button>`
      : ''}
    ${notice.actionLabel && href
      ? html`<a class="btn btn--primary btn--block" href="${esc(href)}">${esc(notice.actionLabel)}</a>`
      : ''}
    <button class="btn btn--secondary btn--block" data-mode="compose">
      ${icons.send()} Ask a question about this
    </button>
  </div>`;
}

function documentView(doc, user) {
  return html`
    <div class="doc-actions">
      ${button('Save or print', { action: 'print', icon: 'print' })}
      ${button('Email me a copy', { action: 'email-copy', variant: 'secondary' })}
    </div>
    ${renderDocument(doc, user)}
  `;
}

function threadView(thread) {
  return html`
    <div class="card stack-sm">
      <h2>${esc(thread.subject)}</h2>
      <p class="card__meta">${formatDate(thread.lastMessageAt)}</p>
    </div>

    <div class="stack-sm">
      ${thread.messages.map(
        (m) => html`<div class="bubble bubble--${m.from}">
          ${m.from === 'wellabe'
            ? html`<span class="bubble__who">${icons.mailbox()} Wellabe</span>`
            : ''}
          <p style="margin:0;white-space:pre-wrap">${esc(m.body)}</p>
          <span class="bubble__time">${formatDateTime(m.sentAt)}</span>
        </div>`,
      )}
    </div>

    ${thread.messages.every((m) => m.from === 'member')
      ? html`<div class="card stack-sm">
          <p style="margin:0">
            <strong>Received ${formatDateTime(thread.autoAckedAt ?? thread.lastMessageAt)}.</strong>
            A Wellabe representative will follow up by phone or email.
          </p>
          <p class="disclosure" style="margin:0">
            This is a demo. No message is actually sent to Wellabe.
          </p>
        </div>`
      : ''}

    <form class="card stack-sm" data-reply="${esc(thread.id)}">
      <label class="field">
        <span class="field__label">Add to this conversation</span>
        <textarea class="textarea" name="body" rows="4" data-focus-key="reply"></textarea>
      </label>
      ${button('Send', { type: 'submit', icon: 'send' })}
    </form>
  `;
}

function composeView(ctx) {
  const topic = ctx.view.topic;
  const chosen = TOPICS.find(([id]) => id === topic);

  return html`<form class="card stack" data-compose>
    <h2>Ask Wellabe a question</h2>

    <div>
      <span class="field__label">What's it about?</span>
      <div class="topic-grid">
        ${TOPICS.map(
          ([id, label, hint]) => html`<button
            type="button"
            class="topic-card"
            data-topic="${id}"
            aria-pressed="${topic === id}"
          >
            <span class="topic-card__label">${label}</span>
            <span class="topic-card__hint">${hint}</span>
          </button>`,
        )}
      </div>
    </div>

    <label class="field">
      <span class="field__label">Subject</span>
      <input
        class="input"
        name="subject"
        value="${esc(ctx.view.subject ?? (chosen ? `A question about ${chosen[1].toLowerCase()}` : ''))}"
        data-focus-key="subject"
      />
    </label>

    <label class="field">
      <span class="field__label">Your message</span>
      <textarea class="textarea" name="body" rows="6" data-focus-key="body"></textarea>
    </label>

    ${ctx.view.error
      ? html`<p class="field__error">${icons.alert()}<span>${esc(ctx.view.error)}</span></p>`
      : ''}
    <p class="disclosure">
      This is a demonstration. Nothing is actually sent to Wellabe, and nobody will reply.
    </p>
    ${button('Send', { type: 'submit', block: true, icon: 'send' })}
  </form>`;
}

function preferencesView(user) {
  const prefs = user.deliveryPreferences ?? {};
  return html`
    <div class="card stack">
      <h2>Delivery preferences</h2>
      <div class="notice-banner notice-banner--info">
        ${icons.alert()}
        <span>
          <strong>You'll always get paper copies of anything the law requires us to mail.</strong>
          Turning off paper here only affects the extra reminders. You can turn it back on any
          time.
        </span>
      </div>

      ${PREF_ROWS.map(([key, label]) => {
        const p = prefs[key] ?? { paper: true, email: false };
        return html`<div class="pref-group">
          <h3 class="card__title">${label}</h3>
          <p class="card__meta">In your Mailbox: always</p>
          <label class="switch-row">
            <span>Also mail me paper</span>
            <input type="checkbox" data-pref="${key}.paper" ${p.paper ? 'checked' : ''} />
          </label>
          <label class="switch-row">
            <span>Also email me</span>
            <input type="checkbox" data-pref="${key}.email" ${p.email ? 'checked' : ''} />
          </label>
        </div>`;
      })}
    </div>
  `;
}

/* ------------------------------------------------------------ helpers ---- */

function noticeIcon(type) {
  return {
    paymentReceived: 'card',
    paymentFailed: 'alert',
    claimStatus: 'claim',
    coverage: 'shield',
    rateNotice: 'document',
    rewards: 'gift',
    welcome: 'mailbox',
  }[type] ?? 'mailbox';
}

const categoryLabel = (c) =>
  ({ policy: 'Policy', statement: 'Statement', claim: 'Claim', notice: 'Notice', tax: 'Tax' })[c] ?? c;

function emptyDocTitle(category) {
  return category === 'tax' ? 'No tax documents yet' : 'Nothing here yet';
}

function emptyDocBody(category) {
  return category === 'tax'
    ? 'Your first one arrives in January.'
    : 'Documents Wellabe sends you will be filed here.';
}
