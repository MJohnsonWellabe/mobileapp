// Firebase web app configuration.
//
// >>> THESE ARE PLACEHOLDERS. The app will not connect until they are replaced. <<<
//
// Per docs/02-architecture.md §Firebase wiring item 1, placeholder text here is a
// deliberate stop signal: do not guess these values, and do not proceed with the
// build until real ones are in place.
//
// Where to get them:
//   Firebase console -> gear icon -> Project settings -> Your apps -> (your web app)
//   -> SDK setup and configuration -> Config
// Copy the values from that object into the fields below. See setup/FIREBASE-SETUP.md §4.
//
// On committing this: a Firebase web config is NOT a secret. It is shipped to every
// browser that loads the app, so it cannot be hidden and there is no point trying.
// Access control comes from firestore.rules and storage.rules, plus an HTTP-referrer
// restriction on the API key in Google Cloud -> APIs & Services -> Credentials.
// Restrict the key to your GitHub Pages host; that is what actually limits its use.
//
// `databaseURL` is intentionally absent. The console emits it by default, but nothing
// in this project uses Realtime Database — all structured data is in Firestore.
export const firebaseConfig = {
  // The only value that was removed. Paste the apiKey from the console here —
  // ideally a freshly created, referrer-restricted one, since the previous key is
  // still retrievable from this repo's public git history.
  apiKey: "REPLACE_WITH_YOUR_API_KEY",

  // These are plain identifiers, not credentials, and are correct for this project.
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
