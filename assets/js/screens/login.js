import { login, getSession } from '../auth.js';
import { wellabeMark, icons } from '../icons.js';
import { preloadIllustrations, illustration, html, esc } from '../ui.js';

// Already signed in? Go straight through, so a reload never dumps someone back
// here (docs/04 §Auth).
const existing = getSession();
if (existing) location.replace(existing.role === 'admin' ? 'admin.html' : 'home.html');

document.getElementById('mark').innerHTML = wellabeMark();

// Same convention _page.js uses to signal first render — the login form is
// synchronously interactive with no async data gate, so it's ready immediately.
document.body.dataset.ready = '1';

preloadIllustrations(['phone-and-coffee']).then(() => {
  document.getElementById('art').innerHTML = illustration('phone-and-coffee');
});

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const submit = document.getElementById('submit');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.innerHTML = '';
  submit.disabled = true;
  submit.textContent = 'Signing in…';

  try {
    const result = await login(form.username.value, form.password.value);

    if (!result.ok) {
      // Deliberately does not say which field was wrong — docs/04 §Auth.
      showError("That username and password don't match. Please check both and try again.");
      return;
    }
    location.replace(result.user.role === 'admin' ? 'admin.html' : 'home.html');
  } catch (err) {
    console.error(err);
    showError("We couldn't reach Wellabe just now. Check your connection and try again.");
  } finally {
    submit.disabled = false;
    submit.textContent = 'Log In';
  }
});

function showError(message) {
  errorBox.innerHTML = html`<p class="field__error">${icons.alert()}<span>${esc(message)}</span></p>`;
  form.password.focus();
}
