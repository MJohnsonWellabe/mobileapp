# Firebase Setup — Human Steps

Do this once, by hand, before pointing Claude Code at the repo. Everything after step 6 —
security rules, any schema changes, ongoing config — is Claude Code's job per
`docs/02-architecture.md`. You are creating the project and handing over the keys, not
maintaining it.

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in
   with the Google account you want to own this project.
2. Click **Add project**. Name it something like `wellabe-app-prototype`.
3. You can decline Google Analytics for this project — it's not needed for the prototype.
4. Wait for project creation to finish, then continue into the project's console.

## 2. Create a Firestore database

1. In the left nav, go to **Build → Firestore Database**.
2. Click **Create database**.
3. Choose a location close to you (any US region is fine for a demo).
4. Start in **Test mode** for now — Claude Code will replace this with real security
   rules (`firestore.rules`, per `docs/02-architecture.md`) as one of its first steps.
   Test mode alone is fine for the short window before that happens, but don't leave the
   project sitting in test mode indefinitely once the build is underway.

## 3. Create a Storage bucket

1. In the left nav, go to **Build → Storage**.
2. Click **Get started**, accept the default location (matching your Firestore region is
   simplest), and again start in test mode for the same reason as above.

## 4. Register a web app and get your config

1. In the left nav, click the gear icon → **Project settings**.
2. Under "Your apps," click the web icon (`</>`) to add a web app.
3. Give it a nickname (e.g., `wellabe-web`). You do not need Firebase Hosting here — this
   project is deployed via GitHub Pages, not Firebase Hosting.
4. Firebase will show you a config object that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "wellabe-app-prototype.firebaseapp.com",
     projectId: "wellabe-app-prototype",
     storageBucket: "wellabe-app-prototype.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

5. Copy this whole object.

## 5. Drop the config into the repo

1. In the repo (after the GitHub setup in `setup/GITHUB-SETUP.md`, or even before — this
   file doesn't need to exist for the repo to be created), create
   `assets/js/firebase-config.js` with:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",           // paste your real values here
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

2. This file is safe to commit for a prototype like this — a Firebase web config is not a
   secret in the way a server-side API key is; access control is enforced by Firestore/
   Storage security rules, not by hiding this object. (If you'd rather not commit it
   anyway, add it to `.gitignore` and just make sure it exists locally before running
   Claude Code — but then remember Claude Code can't see it either unless it's present on
   disk in the working directory it's operating in.)

## 6. Add your GitHub Pages domain to authorized domains

1. Still in the Firebase console, go to **Build → Authentication → Settings →
   Authorized domains** (you don't need to actually set up Firebase Auth methods — this
   allowlist is still worth configuring since some Firebase web SDK calls check it).
2. Add your GitHub Pages URL once you know it (typically
   `<your-github-username>.github.io`, or your custom domain if you set one up per
   `setup/GITHUB-SETUP.md`).

## Handoff point

From here, Claude Code takes over: it will write and deploy `firestore.rules` and Storage
rules, build against this project, and load the seed data described in
`docs/03-data-model-and-seed-data.md`. If Claude Code needs the Firebase CLI to deploy
rules directly (rather than you pasting them into the console yourself), you may be asked
to run `npm install -g firebase-tools`, `firebase login`, and `firebase init` once
interactively, since the login step requires a human in the loop — Claude Code will tell
you exactly when and why if it needs this.

## If something doesn't work

- **"Missing or insufficient permissions" errors in the app** almost always mean
  `firestore.rules` hasn't been deployed yet, or was deployed with a rule that's stricter
  than the app currently expects — this is Claude Code's to fix, not yours, but it's worth
  knowing what that error means if you see it during a demo.
- **CORS-looking errors on Storage uploads** are usually an authorized-domains or bucket
  CORS-configuration issue — flag it to Claude Code; some of that (bucket-level CORS) may
  require the `gsutil`/`gcloud` CLI and could need you to run one command it gives you,
  since it touches project-level cloud config outside the repo.
