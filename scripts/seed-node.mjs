// Seed loader, Node side.
//
//   node scripts/seed-node.mjs --emulator          load the local emulator
//   node scripts/seed-node.mjs --project           load the real Firebase project
//   node scripts/seed-node.mjs --project --verify   read back and report, write nothing
//   node scripts/seed-node.mjs --admin             load the real project via a service
//                                                    account, ignoring _config/seed
//   node scripts/seed-node.mjs --admin --verify    read back the real project as admin
//
// This is the transport the build uses. The human-facing one is seed.html, which
// runs assets/js/seed.js in a browser with the Firebase SDK. Both consume the same
// assets/js/seed-data.js, so the documents are identical either way — only the wire
// format differs.
//
// Why two: Chromium in the build container cannot reach Firestore at all
// (ERR_CONNECTION_RESET with or without the egress proxy) while Node and curl both
// get 200, so a browser-only seeder could never be verified from here.
//
// Against the emulator this sends `Authorization: Bearer owner`, which the Firestore
// emulator treats as rules-bypassing — so local seeding needs no _config/seed flag.
// Against the real project with `--project` it sends no credentials at all and the
// rules apply in full, exactly as they would for the browser seeder, which means the
// flag must be on (setup/FIREBASE-SETUP.md §7).
//
// `--admin` is the third path: a service-account key (path from
// GOOGLE_APPLICATION_CREDENTIALS) mints an IAM-scoped OAuth token, and IAM-authenticated
// requests bypass Firestore security rules entirely — rules only ever govern
// client-SDK/anonymous access. That means no _config/seed dance and no console step;
// it also means this mode must never be reachable from anything the rules unit tests
// exercise, and the key must never be committed (.gitignore covers common
// service-account filenames, but keep the key file outside the repo entirely).
//
// Individual PATCH requests, never a :commit batch. seedMode() costs up to 4
// document access calls; a single write has a budget of 10, but a batch shares 20
// across every document in it, so a batched seed fails wholesale. docs/03 spells
// this out.

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { buildSeed } from '../assets/js/seed-data.js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const useAdmin = args.includes('--admin');

// Node's fetch does not read proxy environment variables, so requests to the real
// project need an explicit dispatcher. It must NOT be installed for the emulator:
// setGlobalDispatcher applies to every request including 127.0.0.1, and the relay
// rejects plain-HTTP absolute-form requests with a 405 that reads like a Firestore
// error rather than a proxy one.
if (!useEmulator && process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
}
const verifyOnly = args.includes('--verify');
const CHUNK = 25;

const config = readConfig();
const projectId = useEmulator ? 'mobileapp-3dcda' : config.projectId;
const base = useEmulator
  ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
// --rules runs against the emulator as an ordinary anonymous client, so
// firestore.rules applies in full. This is the rehearsal for the one human-gated
// step in the whole build: it proves every one of the 373 documents satisfies the
// deployed shape contracts before anyone is asked to flip _config/seed on the real
// project. Without it, a single bad field would only surface after the human had
// already opened the console.
const rulesMode = args.includes('--rules');
const authQuery = useEmulator || useAdmin ? '' : `?key=${config.apiKey}`;
const headers = await buildHeaders();
const ownerHeaders = { 'content-type': 'application/json', authorization: 'Bearer owner' };

async function buildHeaders() {
  if (useAdmin) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        '--admin needs GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON key ' +
          '(Cloud Datastore User role is enough — see setup/FIREBASE-SETUP.md §7)',
      );
    }
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore'] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    return { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  }
  if (useEmulator && !rulesMode) {
    return { 'content-type': 'application/json', authorization: 'Bearer owner' };
  }
  return { 'content-type': 'application/json' };
}

/** Pull the web config out of the committed JS module without importing it —
 *  it has no Node-friendly export path and this avoids a second source of truth. */
function readConfig() {
  const src = readFileSync(new URL('../assets/js/firebase-config.js', import.meta.url), 'utf8');
  const pick = (key) => src.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
  return { projectId: pick('projectId'), apiKey: pick('apiKey') };
}

/* ------------------------------------------------ JS value -> REST Value -- */

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number')
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object')
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error(`cannot encode ${typeof v}`);
}

const toFields = (data) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)]));

/* ---------------------------------------------------------------- write -- */

async function writeDoc(path, data) {
  // PATCH with no updateMask replaces the document, which is what setDoc() does —
  // and is what makes a re-run idempotent rather than additive.
  const res = await fetch(`${base}/${path}${authQuery}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}\n    ${body.slice(0, 400)}`);
  }
}

async function countCollection(name) {
  const res = await fetch(`${base}/${name}${authQuery}${authQuery ? '&' : '?'}pageSize=300`, { headers });
  if (!res.ok) return `error ${res.status}`;
  const json = await res.json();
  return (json.documents ?? []).length;
}

/* ----------------------------------------------------------------- main -- */

if (useAdmin && useEmulator) {
  throw new Error('--admin and --emulator are mutually exclusive');
}

const seed = buildSeed();
const collections = [...new Set([...seed.keys()].map((p) => p.split('/')[0]))];

const targetLabel = useEmulator
  ? 'EMULATOR 127.0.0.1:8080'
  : `LIVE PROJECT ${projectId}${useAdmin ? ' (admin)' : ''}`;
console.log(`target:   ${targetLabel}`);
console.log(`documents: ${seed.size} across ${collections.length} collections\n`);

if (verifyOnly) {
  for (const name of collections.sort()) {
    console.log(`  ${name.padEnd(22)} ${await countCollection(name)}`);
  }
  process.exit(0);
}

// In rules mode the seeder has to earn its privileges the same way the browser
// seeder does — by the flag, not by a bypass token. Set it with the owner token
// (no client can write _config), run, then close it again.
if (rulesMode) {
  console.log('rules mode: enabling _config/seed for one hour, rules enforced\n');
  await fetch(`${base}/_config/seed`, {
    method: 'PATCH',
    headers: ownerHeaders,
    body: JSON.stringify({
      fields: toFields({ enabled: true, expiresAt: new Date(Date.now() + 3600_000) }),
    }),
  });
}

const entries = [...seed.entries()];
const failures = [];
let done = 0;

for (let i = 0; i < entries.length; i += CHUNK) {
  const chunk = entries.slice(i, i + CHUNK);
  const results = await Promise.allSettled(chunk.map(([path, data]) => writeDoc(path, data)));
  results.forEach((r, j) => {
    if (r.status === 'rejected') failures.push(`${chunk[j][0]}: ${r.reason.message}`);
  });
  done += chunk.length;
  process.stdout.write(`\r  wrote ${done}/${entries.length}`);
}
process.stdout.write('\n');

if (rulesMode) {
  await fetch(`${base}/_config/seed`, {
    method: 'PATCH',
    headers: ownerHeaders,
    body: JSON.stringify({ fields: toFields({ enabled: false, expiresAt: new Date(0) }) }),
  });
  console.log('rules mode: _config/seed closed again');
}

if (failures.length) {
  console.error(`\n${failures.length} write(s) failed:\n`);
  for (const f of failures.slice(0, 10)) console.error('  ' + f);
  if (failures.length > 10) console.error(`  ...and ${failures.length - 10} more`);
  console.error(
    '\nA "Missing or insufficient permissions" here while seed mode is ON is a shape\n' +
      'violation, not a permissions problem — see docs/03.',
  );
  process.exit(1);
}

console.log('\nseeded. counts now:');
for (const name of collections.sort()) {
  console.log(`  ${name.padEnd(22)} ${await countCollection(name)}`);
}
