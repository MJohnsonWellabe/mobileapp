// The seed loader, browser side. Run it from seed.html — a dev page that is never
// linked from the app.
//
// Three constraints from firestore.rules shape how this is written (docs/03):
//
//   1. INDIVIDUAL setDoc() CALLS, NEVER writeBatch() OR runTransaction().
//      seedMode() costs up to 4 document access calls. A single-document write has
//      a budget of 10, but a batch or transaction shares a budget of 20 across
//      every document in it — so a batched seed of 373 documents fails wholesale,
//      not partially. Chunked Promise.all over individual writes is the shape.
//   2. _config/seed.enabled must be true while this runs. No client can read or
//      write that document; only the Firebase console can (setup/FIREBASE-SETUP.md
//      §7). A byte-identical re-run needs no flag at all, because rewriting a field
//      with the same value affects no keys.
//   3. Every document must satisfy the shape contracts, which are stricter than the
//      tables in docs/03. A failure reporting "Missing or insufficient permissions"
//      while the flag is on is a shape violation, not a permissions problem.
//
// The content itself lives in seed-data.js, which this shares with
// scripts/seed-node.mjs so the two transports cannot drift.

import { db } from './firebase-init.js';
import { doc, setDoc } from '../vendor/firebase.js';
import { buildSeed } from './seed-data.js';

const CHUNK = 25;

export async function runSeed({ onProgress = () => {}, onDone = () => {} } = {}) {
  const seed = buildSeed();
  const entries = [...seed.entries()];
  const failures = [];
  let done = 0;

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map(([path, data]) => {
        const parts = path.split('/');
        return setDoc(doc(db, parts[0], parts[1]), data);
      }),
    );
    results.forEach((r, j) => {
      if (r.status === 'rejected') {
        failures.push({ path: chunk[j][0], message: r.reason?.message ?? String(r.reason) });
      }
    });
    done += chunk.length;
    onProgress(done, entries.length, failures.length);
  }

  const counts = {};
  for (const path of seed.keys()) {
    const collection = path.split('/')[0];
    counts[collection] = (counts[collection] ?? 0) + 1;
  }

  onDone({ total: entries.length, failures, counts });
  return { total: entries.length, failures, counts };
}
