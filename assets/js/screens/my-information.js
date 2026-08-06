// MyInformation — view and, within limits, edit personal details.
//
// The guardrail is the point of this screen. Email, phone, contact preference and
// address save straight to Firestore. Gender and date of birth cannot be edited at
// all: tapping either opens an explanation and files a changeRequests document.
// That is enforced twice over — this screen never renders an input for them, and
// firestore.rules leaves both fields out of the allow-list for a client update, so
// a write would be rejected even if the UI were bypassed.

import { page, param } from './_page.js';
import {
  subscribeUser,
  updateUserFields,
  createChangeRequest,
  serverTimestamp,
} from '../data.js';
import { formatDate, titleCase } from '../format.js';
import { html, esc, dataRow, dataRowButton, button, toast, on } from '../ui.js';
import { icons } from '../icons.js';

const CONTACT_METHODS = [
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['mail', 'Mail'],
];

const LOCKED_COPY = {
  gender: {
    title: 'Changing your gender on file',
    body:
      'We can update this, but we need a document to do it — a corrected birth certificate, ' +
      'a court order, a passport, or a driver’s licence showing the change. Start a request ' +
      'here and someone from Wellabe will call you to talk through what works best.',
  },
  dob: {
    title: 'Changing your date of birth',
    body:
      'Your date of birth affects what you pay, so we need to see a document before we can ' +
      'change it — a birth certificate, a passport, or a driver’s licence. Start a request ' +
      'here and someone from Wellabe will call you about the next step.',
  },
};

page({
  title: 'MyInformation',
  tab: 'more',
  ready: ['user'],
  illustrations: ['table-tablet'],

  subscribe(session, update, ctx) {
    ctx.view.editing = param('edit');
    subscribeUser(session.userId, (user) => update({ user }));
  },

  events(app, ctx, getState) {
    on(app, 'click', '[data-edit]', (event, el) => {
      ctx.view.editing = el.dataset.edit;
      ctx.view.locked = null;
      ctx.repaint();
    });

    on(app, 'click', '[data-locked]', (event, el) => {
      ctx.view.locked = el.dataset.locked;
      ctx.view.editing = null;
      ctx.repaint();
    });

    on(app, 'click', '[data-action="cancel"]', () => {
      ctx.view.editing = null;
      ctx.view.locked = null;
      ctx.repaint();
    });

    on(app, 'submit', 'form[data-field]', async (event, form) => {
      event.preventDefault();
      const field = form.dataset.field;
      const { user } = getState();

      const value =
        field === 'address'
          ? {
              street: form.street.value.trim(),
              city: form.city.value.trim(),
              state: form.state.value.trim().toUpperCase(),
              zip: form.zip.value.trim(),
            }
          : form.value.value.trim();

      const problem = validate(field, value);
      if (problem) {
        ctx.view.error = problem;
        ctx.repaint();
        return;
      }

      try {
        await updateUserFields(user.id, { [field]: value });
        ctx.view.editing = null;
        ctx.view.error = null;
        ctx.repaint();
        toast('Saved.');
      } catch (err) {
        console.error(err);
        ctx.view.error = "We couldn't save that. Please check it and try again.";
        ctx.repaint();
      }
    });

    on(app, 'submit', 'form[data-request]', async (event, form) => {
      event.preventDefault();
      const field = form.dataset.request;
      const { user } = getState();
      try {
        await createChangeRequest({
          userId: user.id,
          field,
          currentValue: String(user[field] ?? ''),
          requestedValue: form.value.value.trim(),
          status: 'open',
          note: form.note.value.trim() || null,
          submittedAt: serverTimestamp(),
        });
        ctx.view.locked = null;
        ctx.view.requested = field;
        ctx.repaint();
      } catch (err) {
        console.error(err);
        toast("We couldn't send that request. Please try again.", { tone: 'error' });
      }
    });
  },

  render(state, ctx) {
    const { user } = state;
    const { editing, locked, error, requested } = ctx.view;

    if (locked) return lockedPanel(locked, user);

    return html`
      ${requested
        ? html`<div class="notice-banner notice-banner--info">
            ${icons.checkCircle()}
            <span
              ><strong>Your request has been received.</strong> Someone from Wellabe will
              follow up with you about your ${requested === 'dob' ? 'date of birth' : 'gender'}.
            </span>
          </div>`
        : ''}

      <div class="card">
        <h2 class="section-heading">About you</h2>
        ${dataRow('Name', user.firstName)}
        ${dataRowButton('Gender', user.gender ?? '—', { data: { locked: 'gender' } })}
        ${dataRowButton('Date of birth', user.dob ? formatDate(user.dob) : '—', {
          data: { locked: 'dob' },
        })}
        <p class="field__hint" style="margin-top:var(--space-2)">
          ${icons.lock()} Gender and date of birth need a document before we can change them.
          Tap either one to start.
        </p>
      </div>

      <div class="card">
        <h2 class="section-heading">How we reach you</h2>
        ${editing === 'email'
          ? editForm('email', 'Email', user.email, error, { type: 'email' })
          : dataRowButton('Email', user.email || 'Not set', { data: { edit: 'email' } })}
        ${editing === 'phone'
          ? editForm('phone', 'Phone', user.phone, error, { type: 'tel' })
          : dataRowButton('Phone', user.phone || 'Not set', { data: { edit: 'phone' } })}
        ${editing === 'preferredContactMethod'
          ? contactMethodForm(user.preferredContactMethod)
          : dataRowButton('Preferred contact', titleCase(user.preferredContactMethod), {
              data: { edit: 'preferredContactMethod' },
            })}
      </div>

      <div class="card">
        <h2 class="section-heading">Mailing address</h2>
        ${editing === 'address'
          ? addressForm(user.address, error)
          : dataRowButton('Address', '', {
              valueHtml: addressLines(user.address),
              data: { edit: 'address' },
            })}
      </div>

      <a class="btn btn--secondary btn--block" href="my-mailbox.html?view=preferences">
        ${icons.mailbox()} Delivery preferences
      </a>
    `;
  },
});

/* ------------------------------------------------------------ pieces ----- */

function addressLines(address) {
  if (!address) return '—';
  return `${esc(address.street)}<br>${esc(address.city)}, ${esc(address.state)} ${esc(address.zip)}`;
}

function editForm(field, label, value, error, { type = 'text' } = {}) {
  return html`<form class="stack-sm" data-field="${field}" style="padding:var(--space-3) 0">
    <label class="field__label" for="f-${field}">${esc(label)}</label>
    <input
      class="input ${error ? 'input--invalid' : ''}"
      id="f-${field}"
      name="value"
      type="${type}"
      value="${esc(value ?? '')}"
      data-focus-key="${field}"
      autofocus
    />
    ${error ? html`<p class="field__error">${icons.alert()}<span>${esc(error)}</span></p>` : ''}
    <div style="display:flex;gap:var(--space-2)">
      ${button('Save', { type: 'submit' })} ${button('Cancel', { variant: 'secondary', action: 'cancel' })}
    </div>
  </form>`;
}

function contactMethodForm(current) {
  return html`<form class="stack-sm" data-field="preferredContactMethod" style="padding:var(--space-3) 0">
    <span class="field__label">How would you like us to reach you?</span>
    ${CONTACT_METHODS.map(
      ([value, label]) => html`<label class="choice">
        <input type="radio" name="value" value="${value}" ${current === value ? 'checked' : ''} />
        <span class="choice__body"><span class="choice__title">${label}</span></span>
      </label>`,
    )}
    <div style="display:flex;gap:var(--space-2)">
      ${button('Save', { type: 'submit' })} ${button('Cancel', { variant: 'secondary', action: 'cancel' })}
    </div>
  </form>`;
}

function addressForm(address, error) {
  const a = address ?? { street: '', city: '', state: '', zip: '' };
  return html`<form class="stack-sm" data-field="address" style="padding:var(--space-3) 0">
    <label class="field" for="f-street">
      <span class="field__label">Street</span>
      <input class="input" id="f-street" name="street" value="${esc(a.street)}" data-focus-key="street" />
    </label>
    <label class="field" for="f-city">
      <span class="field__label">City</span>
      <input class="input" id="f-city" name="city" value="${esc(a.city)}" data-focus-key="city" />
    </label>
    <label class="field" for="f-state">
      <span class="field__label">State</span>
      <input
        class="input"
        id="f-state"
        name="state"
        maxlength="2"
        value="${esc(a.state)}"
        data-focus-key="state"
        style="text-transform:uppercase"
      />
    </label>
    <label class="field" for="f-zip">
      <span class="field__label">ZIP code</span>
      <input
        class="input"
        id="f-zip"
        name="zip"
        inputmode="numeric"
        maxlength="5"
        value="${esc(a.zip)}"
        data-focus-key="zip"
      />
    </label>
    ${error ? html`<p class="field__error">${icons.alert()}<span>${esc(error)}</span></p>` : ''}
    <div style="display:flex;gap:var(--space-2)">
      ${button('Save', { type: 'submit' })} ${button('Cancel', { variant: 'secondary', action: 'cancel' })}
    </div>
  </form>`;
}

/** The documentation guardrail. There is no path from here to a plain field edit —
 *  the only action is filing a request. */
function lockedPanel(field, user) {
  const copy = LOCKED_COPY[field];
  const current = field === 'dob' ? formatDate(user.dob) : user.gender;

  return html`
    <div class="card stack">
      <h2>${esc(copy.title)}</h2>
      <p>${esc(copy.body)}</p>
      ${dataRow('On file now', current ?? '—')}

      <form class="stack-sm" data-request="${field}">
        <label class="field" for="req-value">
          <span class="field__label"
            >${field === 'dob' ? 'What should it say?' : 'What should it say?'}</span
          >
          <input
            class="input"
            id="req-value"
            name="value"
            required
            placeholder="${field === 'dob' ? 'YYYY-MM-DD' : 'For example, Female'}"
            data-focus-key="req-value"
          />
        </label>
        <label class="field" for="req-note">
          <span class="field__label">Anything else we should know? (optional)</span>
          <textarea class="textarea" id="req-note" name="note" rows="4" style="min-height:110px"></textarea>
        </label>
        <p class="disclosure">
          This starts a request. Nothing on your record changes until we have seen your
          document.
        </p>
        <div style="display:flex;gap:var(--space-2)">
          ${button('Start a request', { type: 'submit' })}
          ${button('Cancel', { variant: 'secondary', action: 'cancel' })}
        </div>
      </form>
    </div>
  `;
}

function validate(field, value) {
  if (field === 'email' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    return 'That email address does not look right. Check it and try again.';
  if (field === 'phone' && value && value.replace(/\D/g, '').length < 10)
    return 'A phone number needs at least 10 digits.';
  if (field === 'address') {
    if (!value.street) return 'Please enter a street address.';
    if (!value.city) return 'Please enter a city.';
    if (!/^[A-Za-z]{2}$/.test(value.state)) return 'Use the two-letter state code, like IA.';
    if (!/^\d{5}$/.test(value.zip)) return 'A ZIP code is five digits.';
  }
  return null;
}
