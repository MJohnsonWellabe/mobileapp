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

import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
