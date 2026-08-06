// Login and session.
//
// ---------------------------------------------------------------------------
// THIS IS NOT AUTHENTICATION, AND IT IS NOT MEANT TO BE.
//
// Every member's password is the literal string "Wellabe" and the admin's is
// "wellabe" — public knowledge by design, because this is a closed demo for a
// known set of nine logins. The check below runs in client JavaScript against a
// world-readable Firestore collection. Anyone can read every member's data, and
// anyone can write any valid document on any member's behalf. That is acceptable
// only because every record is fabricated.
//
// Firebase Auth was deliberately not used: it expects an email or a federated
// identity, so a shared-password scheme would mean synthesising fake emails for
// no security benefit. The full reasoning is in docs/02-architecture.md
// §"Why no real Firebase Auth" and DECISIONS-LOG.md §"Security posture".
//
// DO NOT CARRY THIS PATTERN INTO ANYTHING REAL.
// ---------------------------------------------------------------------------

import { findUserByUsername } from './data.js';

const SESSION_KEY = 'wellabe.session';
const MEMBER_PASSWORD = 'wellabe';
const ADMIN_PASSWORD = 'wellabe';

/**
 * Attempt a login. Returns { ok: true, user } or { ok: false }.
 *
 * The failure result deliberately carries no reason. Telling someone which of the
 * two fields was wrong is a real-world information leak, and docs/04 §Auth requires
 * the inline error not to distinguish them.
 */
export async function login(username, password) {
  const usernameLower = String(username ?? '').trim().toLowerCase();
  const supplied = String(password ?? '').trim().toLowerCase();
  if (!usernameLower || !supplied) return { ok: false };

  const user = await findUserByUsername(usernameLower);
  if (!user) return { ok: false };

  const expected = user.role === 'admin' ? ADMIN_PASSWORD : MEMBER_PASSWORD;
  if (supplied !== expected) return { ok: false };

  // sessionStorage, not localStorage: a demo laptop passed around a boardroom
  // should not leave someone logged in as Dave in a new tab tomorrow. It still
  // survives a page reload, which is what docs/04 §Auth requires.
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, role: user.role, firstName: user.firstName }));
  return { ok: true, user };
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Guard for every member screen. Returns the session, or redirects to login and
 * returns null — callers should bail out when it returns null.
 *
 * `base` is the relative path back to the repo root, which differs between a page
 * at the root and one in /pages/. Relative paths throughout are what keep the app
 * working under the GitHub Pages /mobileapp/ subpath.
 */
export function requireMember(base = '') {
  const session = getSession();
  if (!session) {
    location.replace(`${base}index.html`);
    return null;
  }
  if (session.role === 'admin') {
    location.replace(`${base}admin.html`);
    return null;
  }
  return session;
}

export function requireAdmin(base = '') {
  const session = getSession();
  if (!session) {
    location.replace(`${base}index.html`);
    return null;
  }
  if (session.role !== 'admin') {
    location.replace(`${base}home.html`);
    return null;
  }
  return session;
}
