// Firebase web app configuration for project mobileapp-3dcda.
// Source: Firebase console -> Project settings -> Your apps -> SDK setup and
// configuration -> Config. See setup/FIREBASE-SETUP.md §4.
//
// This is safe to commit, and in fact has to be: a Firebase web config ships to
// every browser that loads the app, so it cannot be hidden. It is an identifier,
// not a credential. Access control comes from firestore.rules and storage.rules.
//
// Worth doing when convenient: add an HTTP-referrer restriction to this key in
// Google Cloud -> APIs & Services -> Credentials, limited to the GitHub Pages host
// and localhost. That is what actually narrows where the key can be used, and it
// matters here because this key is also present in this public repo's git history.
//
// `databaseURL` is intentionally absent. The console emits it by default because the
// project has a Realtime Database instance, but nothing in this project uses RTDB —
// all structured data is in Firestore per docs/02-architecture.md.
export const firebaseConfig = {
  apiKey: "AIzaSyD0osqjUmINjUIjz6x7m8HkJpAvwbGvS8E",
  authDomain: "mobileapp-3dcda.firebaseapp.com",
  projectId: "mobileapp-3dcda",
  storageBucket: "mobileapp-3dcda.firebasestorage.app",
  messagingSenderId: "80995801925",
  appId: "1:80995801925:web:c34b5037e3362161937c2c",
};

// If your Firestore database is NOT the default one, set its ID here and pass it to
// getFirestore(app, FIRESTORE_DATABASE_ID) in firebase-init.js. Leave as "(default)"
// for a normal setup — a database created through the Firebase console's standard
// flow is always "(default)".
export const FIRESTORE_DATABASE_ID = "(default)";
