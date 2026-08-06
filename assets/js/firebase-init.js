// Single Firebase entry point. Every feature module imports `db` and `storage`
// from here — do not call initializeApp() anywhere else (docs/02-architecture.md
// §Firebase wiring, item 2).
//
// Imports come from assets/vendor/firebase.js, a committed bundle of the npm SDK,
// rather than from the gstatic CDN. See scripts/vendor-firebase.mjs for why, and
// DECISIONS-LOG.md → "Vendored Firebase SDK". Regenerate with:
//     npm run vendor:firebase
import {
  initializeApp,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  getStorage,
  connectFirestoreEmulator,
  connectStorageEmulator,
} from '../vendor/firebase.js';

import { firebaseConfig, FIRESTORE_DATABASE_ID } from './firebase-config.js';

// Fail loudly and early rather than letting a placeholder config produce a wall of
// confusing permission errors three screens into the app.
if (Object.values(firebaseConfig).some((v) => String(v).startsWith('REPLACE_WITH_'))) {
  throw new Error(
    'Firebase is not configured: assets/js/firebase-config.js still has placeholder ' +
      'values. Copy the real config from the Firebase console — see ' +
      'setup/FIREBASE-SETUP.md section 4.',
  );
}

export const app = initializeApp(firebaseConfig);

// The emulator is opt-in per page load and never reachable from the deployed site:
// it only engages on localhost/127.0.0.1, and only when explicitly asked for via
// ?emulator=1 or a sticky flag in localStorage. scripts/dev.mjs sets the flag so the
// screenshot runs and the whole Phase 2 build can work against the emulator without
// writing to the real project. See docs/07.
const isLocalhost = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const params = new URLSearchParams(location.search);
if (params.has('emulator')) {
  localStorage.setItem('wellabe.emulator', params.get('emulator') === '0' ? '0' : '1');
}
export const USE_EMULATOR =
  isLocalhost && localStorage.getItem('wellabe.emulator') === '1';

// persistentLocalCache, not the default memory cache. This app is fully client-side
// and gets demoed over conference-room Wi-Fi; with the persistent cache a dropped
// connection re-renders yesterday's data instead of an empty screen
// (docs/01-design-system.md → Error / retry state). Single-tab manager is correct
// here — nothing in this app coordinates across tabs, and the multi-tab manager
// costs a leader election on every load.
//
// Skipped under the emulator: persistence there mostly produces confusing stale
// reads after the emulator's data is reset between runs.
export const db = initializeFirestore(
  app,
  USE_EMULATOR ? {} : { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) },
  FIRESTORE_DATABASE_ID === '(default)' ? undefined : FIRESTORE_DATABASE_ID,
);

export const storage = getStorage(app);

if (USE_EMULATOR) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  console.info('[wellabe] Using the Firebase emulator suite on 127.0.0.1.');
}
