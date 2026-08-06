// Rules unit tests for firestore.rules.
//
// Run:  npm run test:rules
// (wraps `firebase emulators:exec --only firestore`, so no live project is
// touched and no credentials are needed)
//
// These cover the invariants docs/03 and docs/04 call out by name — the claim
// state machine, the pointsBalance floor, gender/dob immutability, the
// payment/resultingPaidThroughDate pairing — plus the seed-mode switch.
// They are deliberately not exhaustive on shape validation.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

let testEnv;
let db; // unauthenticated client — the only kind this app ever has

const SEED_DOC = "_config/seed";

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "wellabe-rules-test",
    firestore: {
      rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  db = testEnv.unauthenticatedContext().firestore();
});

after(async () => {
  await testEnv?.cleanup();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Write documents with rules bypassed, to set up preconditions. */
async function seedRaw(writes) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const raw = ctx.firestore();
    for (const [path, data] of Object.entries(writes)) {
      await setDoc(doc(raw, path), data);
    }
  });
}

async function setSeedMode(enabled, expiresAt = new Date(Date.now() + 3600_000)) {
  await seedRaw({ [SEED_DOC]: { enabled, expiresAt } });
}

const validUser = (over = {}) => ({
  firstName: "Dave",
  usernameLower: "dave",
  role: "member",
  gender: "Male",
  dob: "1948-04-12",
  email: "dave@example.com",
  phone: "515-555-0142",
  preferredContactMethod: "email",
  address: { street: "1200 Grand Ave", city: "Des Moines", state: "IA", zip: "50309" },
  cardOnFile: { brand: "Visa", last4: "4242", expMonth: 7, expYear: 2029 },
  bankAccountOnFile: null,
  createdAt: new Date("2019-03-01"),
  ...over,
});

const validClaim = (over = {}) => ({
  userId: "user-sara",
  policyId: "policy-sara-hi",
  product: "hospitalIndemnity",
  claimNumber: "CLM-2026-00417",
  description: "Overnight hospital stay, two nights.",
  status: "Intake",
  statusHistory: [{ status: "Intake", timestamp: new Date("2026-06-01") }],
  submittedAt: new Date("2026-06-01"),
  ...over,
});

const validPayment = (over = {}) => ({
  userId: "user-dave",
  policyId: "policy-dave-medsupp",
  amount: 148.5,
  method: "card",
  last4: "4242",
  status: "success",
  resultingPaidThroughDate: "2026-09-30",
  timestamp: new Date("2026-08-01"),
  ...over,
});

const validPolicy = (over = {}) => ({
  userId: "user-dave",
  product: "medSupp",
  planName: "Medicare Supplement Plan G",
  policyNumber: "WLB-MS-104829",
  status: "active",
  effectiveDate: "2019-03-01",
  paidThroughDate: "2026-08-31",
  premiumAmount: 148.5,
  premiumFrequency: "monthly",
  autopayEnabled: true,
  coverageSummary: "Covers what Medicare Part A and B leave behind.",
  whatItCovers: ["Part A deductible", "Part B coinsurance"],
  ...over,
});

// ---------------------------------------------------------------------------

describe("users — gender/dob immutability (docs/04 guardrail)", () => {
  before(async () => {
    await setSeedMode(false);
    await seedRaw({ "users/user-dave": validUser() });
  });

  test("email is freely editable", async () => {
    await assertSucceeds(
      updateDoc(doc(db, "users/user-dave"), { email: "new@example.com" })
    );
  });

  test("address is freely editable", async () => {
    await assertSucceeds(
      updateDoc(doc(db, "users/user-dave"), {
        address: { street: "9 New St", city: "Ames", state: "IA", zip: "50010" },
      })
    );
  });

  test("dob cannot be changed by a plain field edit", async () => {
    await assertFails(updateDoc(doc(db, "users/user-dave"), { dob: "1950-01-01" }));
  });

  test("gender cannot be changed by a plain field edit", async () => {
    await assertFails(updateDoc(doc(db, "users/user-dave"), { gender: "Female" }));
  });

  test("role cannot be self-promoted to admin", async () => {
    await assertFails(updateDoc(doc(db, "users/user-dave"), { role: "admin" }));
  });

  test("a member document cannot be created outside seed mode", async () => {
    await assertFails(setDoc(doc(db, "users/user-newbie"), validUser()));
  });

  test("a member document cannot be deleted", async () => {
    await assertFails(deleteDoc(doc(db, "users/user-dave")));
  });

  test("login lookup can read any user", async () => {
    await assertSucceeds(getDoc(doc(db, "users/user-dave")));
  });
});

describe("rewardsAccounts — pointsBalance floor (docs/03, named invariant)", () => {
  before(async () => {
    await setSeedMode(false);
    await seedRaw({
      "rewardsAccounts/user-todd": {
        pointsBalance: 500,
        tier: "Gold",
        lifetimePointsEarned: 4200,
      },
    });
  });

  test("a redemption that leaves a non-negative balance succeeds", async () => {
    await assertSucceeds(
      updateDoc(doc(db, "rewardsAccounts/user-todd"), { pointsBalance: 100 })
    );
  });

  test("a redemption that would go negative is rejected", async () => {
    await assertFails(
      updateDoc(doc(db, "rewardsAccounts/user-todd"), { pointsBalance: -50 })
    );
  });

  test("an account cannot be created with a negative balance", async () => {
    await assertFails(
      setDoc(doc(db, "rewardsAccounts/user-matt"), {
        pointsBalance: -1,
        tier: "Gold",
      })
    );
  });

  test("tier must be one of the three known values", async () => {
    await assertFails(
      updateDoc(doc(db, "rewardsAccounts/user-todd"), { tier: "Platinum" })
    );
  });

  test("a mislabelled userId field is rejected", async () => {
    await assertFails(
      setDoc(doc(db, "rewardsAccounts/user-eric"), {
        pointsBalance: 10,
        tier: "Silver",
        userId: "user-dave",
      })
    );
  });
});

describe("claims — state machine (CLAUDE.md guardrail)", () => {
  before(async () => {
    await setSeedMode(false);
    await seedRaw({
      "claims/claim-intake": validClaim(),
      "claims/claim-reviewing": validClaim({
        status: "Reviewing",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
          { status: "Reviewing", timestamp: new Date("2026-06-05") },
        ],
      }),
    });
  });

  test("a new claim must start at Intake", async () => {
    await assertSucceeds(setDoc(doc(db, "claims/claim-new-ok"), validClaim()));
  });

  test("a new claim cannot be opened mid-stream outside seed mode", async () => {
    await assertFails(
      setDoc(
        doc(db, "claims/claim-new-bad"),
        validClaim({
          status: "Processing",
          statusHistory: [
            { status: "Intake", timestamp: new Date("2026-06-01") },
            { status: "Processing", timestamp: new Date("2026-06-03") },
          ],
        })
      )
    );
  });

  test("Intake advances to Processing", async () => {
    await assertSucceeds(
      updateDoc(doc(db, "claims/claim-intake"), {
        status: "Processing",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
        ],
      })
    );
  });

  test("Intake cannot skip straight to Reviewing", async () => {
    await seedRaw({ "claims/claim-skip": validClaim() });
    await assertFails(
      updateDoc(doc(db, "claims/claim-skip"), {
        status: "Reviewing",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Reviewing", timestamp: new Date("2026-06-05") },
        ],
      })
    );
  });

  test("a claim cannot move backward", async () => {
    await assertFails(
      updateDoc(doc(db, "claims/claim-reviewing"), {
        status: "Processing",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
        ],
      })
    );
  });

  test("Denied requires a deniedReason", async () => {
    await seedRaw({
      "claims/claim-deny-bad": validClaim({
        status: "Reviewing",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
          { status: "Reviewing", timestamp: new Date("2026-06-05") },
        ],
      }),
    });
    await assertFails(
      updateDoc(doc(db, "claims/claim-deny-bad"), {
        status: "Denied",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
          { status: "Reviewing", timestamp: new Date("2026-06-05") },
          { status: "Denied", timestamp: new Date("2026-06-08") },
        ],
      })
    );
  });

  test("Denied with a deniedReason succeeds", async () => {
    await seedRaw({
      "claims/claim-deny-ok": validClaim({
        status: "Reviewing",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
          { status: "Reviewing", timestamp: new Date("2026-06-05") },
        ],
      }),
    });
    await assertSucceeds(
      updateDoc(doc(db, "claims/claim-deny-ok"), {
        status: "Denied",
        deniedReason: "This service isn't covered under a Critical Illness policy.",
        statusHistory: [
          { status: "Intake", timestamp: new Date("2026-06-01") },
          { status: "Processing", timestamp: new Date("2026-06-03") },
          { status: "Reviewing", timestamp: new Date("2026-06-05") },
          { status: "Denied", timestamp: new Date("2026-06-08") },
        ],
      })
    );
  });

  test("paidAmount cannot be set on a claim that is not Paid", async () => {
    await assertFails(
      updateDoc(doc(db, "claims/claim-reviewing"), { paidAmount: 900 })
    );
  });
});

describe("payments — append-only ledger, coverage cannot be extended by a failure", () => {
  before(async () => {
    await setSeedMode(false);
  });

  test("a successful payment records a resultingPaidThroughDate", async () => {
    await assertSucceeds(setDoc(doc(db, "payments/pay-ok"), validPayment()));
  });

  test("a failed payment must not carry a resultingPaidThroughDate", async () => {
    await assertFails(
      setDoc(
        doc(db, "payments/pay-bad"),
        validPayment({ status: "failed", resultingPaidThroughDate: "2026-09-30" })
      )
    );
  });

  test("a failed payment with no resulting date is fine (April's seeded failure)", async () => {
    await assertSucceeds(
      setDoc(
        doc(db, "payments/pay-failed"),
        validPayment({
          userId: "user-april",
          status: "failed",
          resultingPaidThroughDate: null,
        })
      )
    );
  });

  test("a payment cannot be edited after the fact", async () => {
    await assertFails(updateDoc(doc(db, "payments/pay-ok"), { amount: 1 }));
  });

  test("a payment cannot be deleted", async () => {
    await assertFails(deleteDoc(doc(db, "payments/pay-ok")));
  });
});

describe("policies — coverage never rewinds", () => {
  before(async () => {
    await setSeedMode(false);
    await seedRaw({ "policies/policy-dave-medsupp": validPolicy() });
  });

  test("paying forward pushes paidThroughDate", async () => {
    await assertSucceeds(
      updateDoc(doc(db, "policies/policy-dave-medsupp"), {
        paidThroughDate: "2026-09-30",
      })
    );
  });

  test("paidThroughDate cannot be moved into the past", async () => {
    await assertFails(
      updateDoc(doc(db, "policies/policy-dave-medsupp"), {
        paidThroughDate: "2025-01-01",
      })
    );
  });

  test("premiumAmount is not client-editable", async () => {
    await assertFails(
      updateDoc(doc(db, "policies/policy-dave-medsupp"), { premiumAmount: 1 })
    );
  });
});

describe("healthDailyLog — composite ID must match its contents", () => {
  before(async () => {
    await setSeedMode(false);
  });

  test("a log whose ID matches userId_date is accepted", async () => {
    await assertSucceeds(
      setDoc(doc(db, "healthDailyLog/user-todd_2026-08-06"), {
        userId: "user-todd",
        date: "2026-08-06",
        challengesCompleted: ["steps5k", "mindfulness"],
        pointsEarned: 20,
      })
    );
  });

  test("a log whose ID disagrees with its userId is rejected", async () => {
    await assertFails(
      setDoc(doc(db, "healthDailyLog/user-todd_2026-08-06"), {
        userId: "user-matt",
        date: "2026-08-06",
        challengesCompleted: [],
        pointsEarned: 0,
      })
    );
  });
});

describe("shared reference data is read-only for the app", () => {
  before(async () => {
    await setSeedMode(false);
    await seedRaw({
      "rewardsCatalog/item-silversneakers": { title: "SilverSneakers", points: 500 },
      "careProviders/provider-1": { name: "Des Moines Dental", serviceType: "Dentist" },
    });
  });

  test("the catalog can be read", async () => {
    await assertSucceeds(getDoc(doc(db, "rewardsCatalog/item-silversneakers")));
  });

  test("the catalog cannot be written outside seed mode", async () => {
    await assertFails(
      setDoc(doc(db, "rewardsCatalog/item-hacked"), { title: "Free money" })
    );
  });

  test("providers cannot be written outside seed mode", async () => {
    await assertFails(setDoc(doc(db, "careProviders/provider-2"), { name: "X" }));
  });
});

describe("_config/seed is invisible and untouchable from a client", () => {
  before(async () => {
    await setSeedMode(false);
  });

  test("a client cannot read the seed flag", async () => {
    await assertFails(getDoc(doc(db, SEED_DOC)));
  });

  test("a client cannot flip the seed flag", async () => {
    await assertFails(setDoc(doc(db, SEED_DOC), { enabled: true, expiresAt: new Date() }));
  });
});

describe("seed mode unlocks exactly what the seeder needs", () => {
  test("with the flag off, a mid-stream claim is rejected", async () => {
    await setSeedMode(false);
    await assertFails(
      setDoc(
        doc(db, "claims/claim-seed-1"),
        validClaim({
          status: "Paid",
          paidAmount: 1200,
          statusHistory: [
            { status: "Intake", timestamp: new Date("2026-05-01") },
            { status: "Processing", timestamp: new Date("2026-05-03") },
            { status: "Reviewing", timestamp: new Date("2026-05-05") },
            { status: "Paid", timestamp: new Date("2026-05-09") },
          ],
        })
      )
    );
  });

  test("with the flag on, the same write succeeds", async () => {
    await setSeedMode(true);
    await assertSucceeds(
      setDoc(
        doc(db, "claims/claim-seed-1"),
        validClaim({
          status: "Paid",
          paidAmount: 1200,
          statusHistory: [
            { status: "Intake", timestamp: new Date("2026-05-01") },
            { status: "Processing", timestamp: new Date("2026-05-03") },
            { status: "Reviewing", timestamp: new Date("2026-05-05") },
            { status: "Paid", timestamp: new Date("2026-05-09") },
          ],
        })
      )
    );
  });

  test("seed mode relaxes lifecycle but NOT consistency: Denied still needs a reason", async () => {
    await setSeedMode(true);
    await assertFails(
      setDoc(
        doc(db, "claims/claim-seed-2"),
        validClaim({
          status: "Denied",
          statusHistory: [
            { status: "Intake", timestamp: new Date("2026-05-01") },
            { status: "Processing", timestamp: new Date("2026-05-03") },
            { status: "Reviewing", timestamp: new Date("2026-05-05") },
            { status: "Denied", timestamp: new Date("2026-05-09") },
          ],
        })
      )
    );
  });

  test("seed mode can create users", async () => {
    await setSeedMode(true);
    await assertSucceeds(setDoc(doc(db, "users/user-sara"), validUser({
      firstName: "Sara",
      usernameLower: "sara",
    })));
  });

  test("an expired seed flag does not grant seed powers", async () => {
    await setSeedMode(true, new Date(Date.now() - 60_000));
    await assertFails(setDoc(doc(db, "users/user-eric"), validUser({
      firstName: "Eric",
      usernameLower: "eric",
    })));
  });

  test("idempotent re-run: rewriting identical values needs no seed mode", async () => {
    await setSeedMode(false);
    const dave = validUser();
    await seedRaw({ "users/user-dave-idem": dave });
    // seed.js re-run writes the exact same document — diff() sees no affected
    // keys, so the strict update rule passes without the console switch.
    await assertSucceeds(setDoc(doc(db, "users/user-dave-idem"), dave, { merge: true }));
  });
});

describe("unmodelled collections are denied by default", () => {
  before(async () => {
    await setSeedMode(false);
  });

  test("a typo'd collection name fails loudly", async () => {
    await assertFails(setDoc(doc(db, "payment/oops"), { amount: 1 }));
  });
});
