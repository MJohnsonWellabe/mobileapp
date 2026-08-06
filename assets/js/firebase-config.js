// Firebase web app configuration for the Wellabe member-app prototype.
//
// These values come from the Firebase console (Project settings -> Your apps)
// for project `mobileapp-3dcda`, per setup/FIREBASE-SETUP.md step 4.
//
// This object is safe to commit. A Firebase web config is an identifier, not a
// secret — access control is enforced by firestore.rules and storage.rules, not
// by hiding these values. That is only true once those rules are deployed; see
// the security note in setup/FIREBASE-SETUP.md.
//
// `databaseURL` is deliberately omitted. The console emits it by default, but
// nothing in this project uses Realtime Database — all structured data lives in
// Firestore per docs/02-architecture.md.
export const firebaseConfig = {
  apiKey: "AIzaSyD0osqjUmINjUIjz6x7m8HkJpAvwbGvS8E",
  authDomain: "mobileapp-3dcda.firebaseapp.com",
  projectId: "mobileapp-3dcda",
  storageBucket: "mobileapp-3dcda.firebasestorage.app",
  messagingSenderId: "80995801925",
  appId: "1:80995801925:web:c34b5037e3362161937c2c",
};
