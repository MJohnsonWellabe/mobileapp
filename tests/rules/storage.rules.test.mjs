// Rules unit tests for storage.rules.
//
// Run:  npm run test:storage-rules
//
// Covers the claim-photo path contract from docs/02 §Firebase wiring item 5:
// claims/{userId}/{claimId}/{fileName}, images only, write-once.

import { test, before, after, describe } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { ref, uploadBytes, getBytes } from "firebase/storage";

let testEnv;
let st;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const IMG = { contentType: "image/png" };
const EXISTING = "claims/user-sara/claim-sara-001/1754500000000-receipt.png";

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "wellabe-storage-rules-test",
    storage: {
      rules: readFileSync(new URL("../../storage.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
  st = testEnv.unauthenticatedContext().storage(
    "gs://wellabe-storage-rules-test.firebasestorage.app"
  );
});

after(async () => {
  await testEnv?.cleanup();
});

describe("claim photo uploads", () => {
  test("a well-formed claim photo uploads", async () => {
    await assertSucceeds(uploadBytes(ref(st, EXISTING), PNG, IMG));
  });

  test("the uploaded photo is readable (the app renders photoUrl)", async () => {
    await assertSucceeds(getBytes(ref(st, EXISTING)));
  });

  // Load-bearing: an overwrite is classified as `create`, not `update`, so this
  // is enforced by `resource == null` rather than by `allow update: if false`.
  test("an existing claim photo cannot be overwritten", async () => {
    await assertFails(uploadBytes(ref(st, EXISTING), PNG, IMG));
  });

  test("a member-id segment not matching user-* is rejected", async () => {
    await assertFails(
      uploadBytes(ref(st, "claims/sara/claim-sara-002/a.png"), PNG, IMG)
    );
  });

  test("a non-image content type is rejected", async () => {
    await assertFails(
      uploadBytes(ref(st, "claims/user-sara/claim-sara-003/evil.pdf"), PNG, {
        contentType: "application/pdf",
      })
    );
  });

  test("a path outside claims/** is rejected", async () => {
    await assertFails(uploadBytes(ref(st, "random/anywhere.png"), PNG, IMG));
  });
});
