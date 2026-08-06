// Single Firebase entry point. Every feature module imports `db` and `storage`
// from here — do not call initializeApp() anywhere else (docs/02-architecture.md
// §Firebase wiring, item 2).
//
// Imports use the gstatic CDN rather than a bare `firebase/app` specifier. This
// project has no build step (docs/02-architecture.md §Stack), so bare specifiers
// would not resolve in the browser. Keep the version pinned and identical across
// all three imports — mixing SDK versions produces confusing runtime errors.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";

import { firebaseConfig, FIRESTORE_DATABASE_ID } from "./firebase-config.js";

// Fail loudly and early rather than letting a placeholder config produce a wall of
// confusing permission errors three screens into the app.
if (Object.values(firebaseConfig).some((v) => String(v).startsWith("REPLACE_WITH_"))) {
  throw new Error(
    "Firebase is not configured: assets/js/firebase-config.js still has placeholder " +
      "values. Copy the real config from the Firebase console — see " +
      "setup/FIREBASE-SETUP.md section 4."
  );
}

export const app = initializeApp(firebaseConfig);

// getFirestore(app) targets "(default)". Pass an explicit ID only for a named database.
export const db =
  FIRESTORE_DATABASE_ID === "(default)"
    ? getFirestore(app)
    : getFirestore(app, FIRESTORE_DATABASE_ID);

export const storage = getStorage(app);
