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
3. Choose a location close to you (any US region is fine for a demo). **This is permanent
   — a database location cannot be changed after creation.**
4. Start in **Production mode**. `firestore.rules` already exists in this repo and deploys
   automatically (see §7), so there is no window during which you need test mode.

   > **Why not test mode.** Test mode is literally
   > `allow read, write: if request.time < timestamp.date(YYYY, MM, DD);` with a date 30
   > days out. On that date every read and every write across the whole project starts
   > returning "Missing or insufficient permissions" — the app does not degrade, it stops.
   > That is a genuinely bad thing to discover during an ELT demo. If you have already
   > created the database in test mode, you do not need to recreate it; just make sure the
   > rules deploy in §7 has run, which replaces the test-mode rule entirely.

## 3. Create a Storage bucket

1. In the left nav, go to **Build → Storage**.
2. Click **Get started**, choose **Production mode**, and accept the default location
   (matching your Firestore region is simplest).
3. `storage.rules` in this repo deploys alongside `firestore.rules`.

   > Storage has its own separate 30-day test-mode fuse. Deploying only `firestore.rules`
   > and forgetting Storage produces a confusing failure a month later where the whole app
   > works except claim photo uploads.

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
   Authorized domains**. You don't need to set up any Firebase Auth sign-in methods.
2. Add the **host only** — `<your-github-username>.github.io`, or your custom domain. No
   `https://`, no trailing `/<repo-name>` path. Firebase's allowlist takes hosts, and it
   will reject a full URL.

   > **Set expectations about what this does.** This allowlist gates Firebase Auth sign-in
   > flows, and this project has no Firebase Auth. Adding the domain is harmless and worth
   > doing, but it will never fix a Firestore or Storage error. If uploads or reads fail,
   > the cause is security rules or bucket CORS (§8), not this list.

## 7. Rules deployment (automated — one-time setup)

`firestore.rules` and `storage.rules` live in this repo and deploy automatically via
GitHub Actions (`.github/workflows/deploy-firebase-rules.yml`) whenever they change on
`main`. The workflow runs the rules unit tests first and refuses to deploy if they fail.

That needs one credential, created once:

1. Go to the [service accounts page](https://console.cloud.google.com/iam-admin/serviceaccounts)
   for this project → **Create service account**. Name it `github-rules-deployer`.
2. Grant it two roles:
   - **Firebase Rules Admin** (`roles/firebaserules.admin`)
   - **Firebase Develop Admin** (`roles/firebase.developAdmin`)
3. Open the new service account → **Keys** → **Add key** → **Create new key** → **JSON**.
4. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
   Name it exactly `FIREBASE_SERVICE_ACCOUNT` and paste the whole JSON file as the value.
5. Delete the downloaded JSON from your machine. Never commit it — `.gitignore` blocks the
   common filenames, but the secret store is the only correct home for it.

To deploy by hand instead, from a checkout with the Firebase CLI installed and logged in:

```bash
firebase deploy --only firestore:rules,storage --project mobileapp-3dcda
```

### Seeding data once rules are live

The rules deliberately forbid writes the app itself would never make — creating member
documents, opening a claim already at "Paid", writing the rewards catalog. `seed.js` needs
exactly those. It is a browser script with the same (zero) privileges as the app, so the
rules cannot tell them apart. The switch is a config document only you can set:

1. Firestore console → create collection `_config`, document `seed`, with fields
   `enabled` (boolean) and `expiresAt` (timestamp). Leave `enabled` **false**.
2. To seed: set `enabled: true` and `expiresAt` to about an hour from now.
3. Run the seed page, confirm the document counts.
4. Set `enabled: false`.

No client can read or write `_config` — the rules deny it outright, and rules-internal
lookups bypass rules, which is what makes this work. The `expiresAt` field means a flag
left on by accident closes itself. Re-running `seed.js` with unchanged data needs no
switch at all: rewriting a field with an identical value is not a change, so idempotent
re-runs pass the normal rules.

## Handoff point

From here, Claude Code takes over: it builds against this project and loads the seed data
described in `docs/03-data-model-and-seed-data.md`. Claude Code cannot deploy rules
directly — it has no Firebase credentials and `firebase login` needs a human — which is
why §7 routes deployment through GitHub Actions instead.

## If something doesn't work

- **"Missing or insufficient permissions" errors in the app** almost always mean
  `firestore.rules` hasn't been deployed yet, or was deployed with a rule that's stricter
  than the app currently expects — this is Claude Code's to fix, not yours, but it's worth
  knowing what that error means if you see it during a demo.
- **A "CORS error" on a Storage upload is more often a rules denial than a CORS problem.**
  A 403 from Storage carries no CORS headers, so the browser reports it as CORS. Check the
  Firebase console → Storage → Rules playground first.

## 8. Bucket CORS (only if you actually hit it)

Uploads through the Firebase Web SDK normally work with no bucket CORS config at all,
because the SDK talks to `firebasestorage.googleapis.com`. You need this when the app does
a direct `fetch()`/XHR against a `storage.googleapis.com` object URL, draws a claim photo
into a `<canvas>`, or downloads one as a blob.

`cors.json` is committed at the repo root. Run this from
[Cloud Shell](https://console.cloud.google.com/) so you don't need a local install:

```bash
gsutil cors set cors.json gs://mobileapp-3dcda.firebasestorage.app
gsutil cors get gs://mobileapp-3dcda.firebasestorage.app
```

Edit `cors.json` first if your Pages origin differs from the one listed. Origins are exact
matches: scheme included, **no trailing slash**, and a custom domain is a separate origin
that must be listed on its own line.
