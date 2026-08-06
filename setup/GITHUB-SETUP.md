# GitHub Setup — Human Steps

You mentioned you're comfortable doing the repo creation and Pages deploy setup yourself —
this doc is here anyway so the exact steps and the one non-obvious gotcha
(`docs/02-architecture.md`'s note about the `/docs` folder) are written down in one place,
in case you want to double check anything or hand this off to someone else.

## 1. Create the repository

1. On GitHub, create a new repository (e.g., `wellabe-app-prototype`). Public or private
   both work with GitHub Pages; private repos need Pages available on your plan tier
   (it is on all current paid tiers and on public repos for free — check your account if
   you're on a legacy free-private-repo setup).
2. Clone it locally, or use GitHub's web upload/Codespaces — whatever you're used to.

## 2. Add this design bible package

1. Copy the entire contents of the design-bible package into the **root** of the repo, so
   `CLAUDE.md` sits at the repo root and not nested one level down — Claude Code looks for
   it there, and GitHub Pages needs the root free to serve the app from.
2. Commit and push.

> **Already done in this repo.** The package was originally uploaded into a nested
> `wellabe-app-design-bible/` folder and has since been moved up to the root. Nothing to do
> here unless you are setting up a fresh repo from the package.

## 3. Drop in your brand assets (optional, but do this before running Claude Code if you can)

Create a `/brand-assets` folder at the repo root and drop in your screenshots and the PPT
with the look-and-feel art direction. `docs/01-design-system.md` and `CLAUDE.md` both
explicitly check for this folder and will use it to override the placeholder visual system
if it's there.

## 4. Enable GitHub Pages

1. In the repo, go to **Settings → Pages**.
2. Under "Build and deployment," set **Source** to "Deploy from a branch."
3. Set the branch to whichever branch will hold the finished app (commonly `main`) and the
   folder to **`/ (root)`**.

   > **Important:** do **not** choose the `/docs` folder option here. This repo already
   > has its own `docs/` folder — that's the design bible, not the deployable app. The app
   > itself (`index.html`, `assets/`, etc., per `docs/02-architecture.md`'s folder layout)
   > lives at the repo root, so "root" is the correct Pages source, not "docs."

4. Save. GitHub will give you a URL, typically
   `https://<your-username>.github.io/<repo-name>/`.

## 5. Add that host to Firebase's authorized domains

Once you have the Pages URL, go back to `setup/FIREBASE-SETUP.md` §6 and add it there.

Add the **host only** — `<your-username>.github.io` — not the full URL from step 4.
Firebase's allowlist takes hosts and will reject a value carrying a scheme or a
`/<repo-name>` path.

Note that this list gates Firebase Auth sign-in flows, and this project has no Firebase
Auth. It is worth setting correctly, but it is not what makes Firestore or Storage work,
and it will not fix a permissions error. See `setup/FIREBASE-SETUP.md` §6 and §8.

## 6. Handing off to Claude Code

From here, Claude Code builds and commits the actual app files into this same repo. It
will not touch repository settings, branch protection, Pages configuration, or anything
else at the GitHub account/org level — that's intentionally left to you, per `CLAUDE.md`.
If Claude Code's environment can push directly to this repo (e.g., it has git configured
with your credentials), it will commit as it goes; if not, it will leave everything
committed locally for you to push yourself. Either way, check that Pages actually
redeploys after each push you care about seeing live — GitHub Pages builds are usually
near-instant but can occasionally lag a minute or two behind a push.

## If a build step ever gets added

`docs/02-architecture.md` prefers no build step (plain static files) but leaves the door
open if a real need comes up. If that happens, Claude Code should tell you plainly, and
you'll need to either add a GitHub Actions workflow to build before deploying (GitHub's
Pages settings has a "GitHub Actions" source option for exactly this) or have Claude Code
commit the built output directly. Don't let this happen silently — if you notice a
`package.json` with a `build` script that the currently-configured Pages source doesn't
run, that's the signal something changed and Pages config needs to change with it.
