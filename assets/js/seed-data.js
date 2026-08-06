// The seed content for all 8 demo members plus admin, as pure data.
//
// This module imports nothing from Firebase. That is deliberate: two transports
// consume it — assets/js/seed.js (browser, Firebase SDK) and scripts/seed-node.mjs
// (Node, Firestore REST) — and neither the content nor the date maths should be
// written twice. It also means the same addMonths/parseYmd the app uses at runtime
// is what generated the data, so the two can't drift.
//
// EVERY DATE IS AN OFFSET FROM `today`. A literal date string in here is a bug.
// docs/03 explains why at length; the short version is that seeding happens weeks
// before the demo, and hardcoded dates make Todd's 100-day window roll past his 82
// credited days, silently deleting the one thing the brief says must be visibly
// actionable. Values are Date objects and YYYY-MM-DD strings; each transport
// converts to its own timestamp representation.

import { addDays, addMonths, toYmd, startOfToday, tierFor, POINTS_PER_CHALLENGE } from './format.js';
import { buildMailbox } from './seed-mailbox.js';

const at = (today, days) => addDays(today, days);
const ymd = (today, days) => toYmd(addDays(today, days));
const atHour = (today, days, hour) => {
  const d = addDays(today, days);
  d.setHours(hour, (hour * 7) % 60, 0, 0);
  return d;
};

/* ============================================================ members ====== */

/** Everyone gets paper on by default. Opt-out, never opt-in — docs/04 §MyMailbox. */
const allPaper = () => ({
  bills: { paper: true, email: true },
  claims: { paper: true, email: false },
  policy: { paper: true, email: false },
  rewards: { paper: true, email: false },
});

const MEMBERS = [
  {
    key: 'dave',
    firstName: 'Dave',
    lastName: 'Whitfield',
    gender: 'Male',
    dob: '1948-04-12',
    email: 'dave.whitfield@example.com',
    phone: '(515) 555-0142',
    preferredContactMethod: 'email',
    address: { street: '1200 Grand Avenue', city: 'Des Moines', state: 'IA', zip: '50309' },
    cardOnFile: { brand: 'Visa', last4: '4242', expMonth: 7, expYear: 2029 },
    bankAccountOnFile: { bankName: 'Midwest Heritage Bank', last4: '8830' },
    createdOffsetDays: -365 * 6,
  },
  {
    key: 'sara',
    firstName: 'Sara',
    lastName: 'Delgado',
    gender: 'Female',
    dob: '1959-09-30',
    email: 'sara.delgado@example.com',
    phone: '(515) 555-0178',
    preferredContactMethod: 'phone',
    address: { street: '4417 Ingersoll Avenue', city: 'Des Moines', state: 'IA', zip: '50312' },
    cardOnFile: { brand: 'Visa', last4: '1881', expMonth: 4, expYear: 2028 },
    bankAccountOnFile: null,
    createdOffsetDays: -125,
  },
  {
    key: 'eric',
    firstName: 'Eric',
    lastName: 'Halvorsen',
    gender: 'Male',
    dob: '1955-02-17',
    email: 'eric.halvorsen@example.com',
    phone: '(319) 555-0110',
    preferredContactMethod: 'email',
    address: { street: '82 Riverview Drive', city: 'Cedar Rapids', state: 'IA', zip: '52403' },
    cardOnFile: { brand: 'Mastercard', last4: '5309', expMonth: 11, expYear: 2027 },
    bankAccountOnFile: { bankName: 'Hills Bank', last4: '2264' },
    createdOffsetDays: -365 * 2,
  },
  {
    key: 'april',
    firstName: 'April',
    lastName: 'Nkemdirim',
    gender: 'Female',
    dob: '1951-11-08',
    email: 'april.n@example.com',
    phone: '(712) 555-0193',
    preferredContactMethod: 'mail',
    address: { street: '915 Pierce Street', city: 'Sioux City', state: 'IA', zip: '51101' },
    // She has a valid card on purpose. docs/03 explains: the mismatch is
    // demonstrated live by typing the wrong digits, and her acceptance criterion
    // requires that a real payment restores her policy.
    cardOnFile: { brand: 'Mastercard', last4: '7413', expMonth: 3, expYear: 2028 },
    bankAccountOnFile: null,
    createdOffsetDays: -365 * 3,
  },
  {
    key: 'debbie',
    firstName: 'Debbie',
    lastName: 'Fournier',
    gender: 'Female',
    dob: '1953-06-21',
    email: 'debbie.fournier@example.com',
    phone: '(563) 555-0166',
    preferredContactMethod: 'email',
    address: { street: '338 Brady Street', city: 'Davenport', state: 'IA', zip: '52803' },
    cardOnFile: { brand: 'Visa', last4: '6620', expMonth: 9, expYear: 2029 },
    bankAccountOnFile: null,
    createdOffsetDays: -365 * 4,
  },
  {
    key: 'dennis',
    firstName: 'Dennis',
    lastName: 'Kowalczyk',
    gender: 'Male',
    dob: '1944-01-16',
    email: 'dkowalczyk@example.com',
    phone: '(641) 555-0124',
    preferredContactMethod: 'mail',
    address: { street: '27 North 3rd Street', city: 'Marshalltown', state: 'IA', zip: '50158' },
    cardOnFile: { brand: 'Visa', last4: '3105', expMonth: 6, expYear: 2027 },
    bankAccountOnFile: null,
    createdOffsetDays: -365 * 9,
  },
  {
    key: 'todd',
    firstName: 'Todd',
    lastName: 'Brennan',
    gender: 'Male',
    dob: '1957-05-03',
    email: 'todd.brennan@example.com',
    phone: '(515) 555-0135',
    preferredContactMethod: 'email',
    address: { street: '6604 Douglas Avenue', city: 'Urbandale', state: 'IA', zip: '50322' },
    cardOnFile: { brand: 'Visa', last4: '9074', expMonth: 2, expYear: 2030 },
    bankAccountOnFile: { bankName: 'Bankers Trust', last4: '4451' },
    createdOffsetDays: -365 * 3,
  },
  {
    key: 'matt',
    firstName: 'Matt',
    lastName: 'Oyelaran',
    gender: 'Male',
    dob: '1962-08-14',
    email: 'matt.oyelaran@example.com',
    phone: '(515) 555-0187',
    preferredContactMethod: 'email',
    address: { street: '1103 Walnut Street', city: 'West Des Moines', state: 'IA', zip: '50265' },
    cardOnFile: { brand: 'Mastercard', last4: '2318', expMonth: 12, expYear: 2028 },
    bankAccountOnFile: { bankName: 'Bankers Trust', last4: '7702' },
    createdOffsetDays: -365 * 5,
  },
];

/* =========================================================== policies ====== */

/** Offsets are relative to today; `paidThroughOffsetDays` is what drives every
 *  coverage pill in the app, because status is derived from it and never read
 *  from the stored field (docs/03). */
const POLICIES = [
  {
    id: 'policy-dave-medsupp',
    member: 'dave',
    product: 'medSupp',
    planName: 'Medicare Supplement Plan G',
    policyNumber: 'WLB-MS-104829',
    effectiveOffsetDays: -365 * 6,
    paidThroughOffsetDays: 27,
    premiumAmount: 148.5,
    premiumFrequency: 'monthly',
    autopayEnabled: true,
    coverageSummary:
      'Picks up most of what Original Medicare leaves you to pay — hospital and doctor ' +
      'costs alike, apart from your yearly Part B deductible.',
    whatItCovers: [
      'Part A hospital deductible and coinsurance',
      'Part B coinsurance and copayments',
      'The first three pints of blood each year',
      'Skilled nursing facility coinsurance',
      'Foreign travel emergency care, up to plan limits',
    ],
  },
  {
    id: 'policy-sara-hi',
    member: 'sara',
    product: 'hospitalIndemnity',
    planName: 'Hospital Indemnity — Essential',
    policyNumber: 'WLB-HI-233104',
    effectiveOffsetDays: -122,
    paidThroughOffsetDays: 18,
    premiumAmount: 62.0,
    premiumFrequency: 'monthly',
    autopayEnabled: false,
    coverageSummary:
      'Pays you a fixed cash amount for each day you spend in the hospital, on top of ' +
      'whatever your other coverage pays.',
    whatItCovers: [
      '$300 for each day admitted to hospital',
      '$600 for each day in intensive care',
      'A $500 lump sum on first admission each year',
      'Ambulance transport, up to plan limits',
    ],
  },
  {
    id: 'policy-eric-dental',
    member: 'eric',
    product: 'dental',
    planName: 'Dental Choice',
    policyNumber: 'WLB-DN-518702',
    effectiveOffsetDays: -365 * 2,
    paidThroughOffsetDays: 55,
    premiumAmount: 41.75,
    premiumFrequency: 'monthly',
    autopayEnabled: true,
    coverageSummary:
      'Covers cleanings and check-ups in full from day one, and shares the cost of ' +
      'fillings, crowns and dentures.',
    whatItCovers: [
      'Two cleanings and exams a year, no waiting period',
      '80% of fillings and simple extractions',
      '50% of crowns, bridges and dentures',
      '$1,500 annual maximum benefit',
    ],
  },
  {
    id: 'policy-april-stc',
    member: 'april',
    product: 'shortTermCare',
    planName: 'Short-Term Care — 360 Day',
    policyNumber: 'WLB-STC-660411',
    effectiveOffsetDays: -365 * 3,
    // Exactly two months in the past. Not arbitrary: it makes periodsOwed come to
    // 3 under the MyPayments formula, so paying the preselected amount lands her
    // paid-through date one month into the future and the policy genuinely returns
    // to Active. Change this and you must change docs/03 and docs/04 with it.
    paidThroughOffsetMonths: -2,
    premiumAmount: 58.0,
    premiumFrequency: 'monthly',
    autopayEnabled: false,
    status: 'lapsed',
    coverageSummary:
      'Pays toward nursing home, assisted living or home health care for up to a year — ' +
      'the gap most people hit before long-term care coverage begins.',
    whatItCovers: [
      '$150 a day toward nursing home care',
      '$150 a day toward assisted living',
      '$100 a day toward home health care',
      'Up to 360 days of benefits',
    ],
  },
  {
    id: 'policy-debbie-ci',
    member: 'debbie',
    product: 'criticalIllness',
    planName: 'Critical Illness — $20,000',
    policyNumber: 'WLB-CI-407255',
    effectiveOffsetDays: -365 * 4,
    paidThroughOffsetDays: 74,
    premiumAmount: 96.0,
    premiumFrequency: 'quarterly',
    autopayEnabled: false,
    coverageSummary:
      'Pays a single lump sum straight to you if you are diagnosed with a covered ' +
      'condition — yours to spend on anything, including the bills insurance does not touch.',
    whatItCovers: [
      '$20,000 lump sum on a covered diagnosis',
      'Heart attack, stroke and major organ failure',
      'Invasive cancer, at 100% of the benefit',
      'Carcinoma in situ, at 25% of the benefit',
    ],
  },
  {
    id: 'policy-dennis-preneed',
    member: 'dennis',
    product: 'preneed',
    planName: 'Preneed Whole Life',
    policyNumber: 'WLB-PN-118093',
    effectiveOffsetDays: -365 * 9,
    paidThroughOffsetDays: 212,
    premiumAmount: 420.0,
    premiumFrequency: 'annual',
    autopayEnabled: false,
    coverageSummary:
      'A small whole life policy set aside to cover funeral costs, so the arrangements ' +
      'you have chosen are paid for and your family is not asked to find the money.',
    whatItCovers: [
      '$12,000 benefit paid to your funeral home',
      'Premiums that never increase',
      'Coverage that cannot be cancelled once in force',
      'Benefit payable within 24 hours of a claim',
    ],
  },
  {
    id: 'policy-todd-medsupp',
    member: 'todd',
    product: 'medSupp',
    planName: 'Medicare Supplement Plan N',
    policyNumber: 'WLB-MS-771620',
    effectiveOffsetDays: -365 * 3,
    paidThroughOffsetDays: 21,
    premiumAmount: 121.3,
    premiumFrequency: 'monthly',
    autopayEnabled: true,
    coverageSummary:
      'Covers most of what Original Medicare leaves behind, in exchange for a small ' +
      'copay at some doctor and emergency room visits.',
    whatItCovers: [
      'Part A hospital deductible and coinsurance',
      'Part B coinsurance, after copays of up to $20',
      'Skilled nursing facility coinsurance',
      'Foreign travel emergency care, up to plan limits',
    ],
  },
  {
    id: 'policy-matt-dental',
    member: 'matt',
    product: 'dental',
    planName: 'Dental Choice Plus',
    policyNumber: 'WLB-DN-902133',
    effectiveOffsetDays: -365 * 5,
    paidThroughOffsetDays: 33,
    premiumAmount: 44.9,
    premiumFrequency: 'monthly',
    autopayEnabled: true,
    coverageSummary:
      'Full cover for cleanings and exams, with a larger annual maximum for the bigger ' +
      'work when it comes up.',
    whatItCovers: [
      'Two cleanings and exams a year, no waiting period',
      '80% of fillings and simple extractions',
      '50% of crowns, bridges and implants',
      '$2,500 annual maximum benefit',
    ],
  },
  {
    id: 'policy-matt-hi',
    member: 'matt',
    product: 'hospitalIndemnity',
    planName: 'Hospital Indemnity — Preferred',
    policyNumber: 'WLB-HI-902134',
    effectiveOffsetDays: -365 * 2,
    paidThroughOffsetDays: 61,
    premiumAmount: 68.5,
    premiumFrequency: 'monthly',
    autopayEnabled: false,
    coverageSummary:
      'Pays you cash for every day you spend in hospital, whatever your other coverage ' +
      'already pays.',
    whatItCovers: [
      '$400 for each day admitted to hospital',
      '$800 for each day in intensive care',
      'A $750 lump sum on first admission each year',
      'Outpatient surgery benefit of $250',
    ],
  },
];

/* ============================================================= claims ====== */

const CLAIMS = [
  {
    id: 'claim-sara-hi',
    member: 'sara',
    policyId: 'policy-sara-hi',
    product: 'hospitalIndemnity',
    number: '00417',
    description:
      'Two nights at Mercy One Des Moines after a fall at home. Admitted through the ' +
      'emergency room on a Tuesday evening.',
    stages: [
      { status: 'Intake', offsetDays: -11 },
      { status: 'Processing', offsetDays: -6 },
    ],
  },
  {
    id: 'claim-debbie-ci',
    member: 'debbie',
    policyId: 'policy-debbie-ci',
    product: 'criticalIllness',
    number: '00418',
    description: 'Claim for a cardiac event treated at University of Iowa Hospitals in March.',
    stages: [
      { status: 'Intake', offsetDays: -48 },
      { status: 'Processing', offsetDays: -41 },
      { status: 'Reviewing', offsetDays: -30 },
      { status: 'Denied', offsetDays: -22 },
    ],
    deniedReason:
      'The records we received describe a procedure to place a stent, but they do not ' +
      'confirm a heart attack. Your policy pays for a heart attack, not for a stent on ' +
      'its own. If your cardiologist can send us the lab results from that admission, we ' +
      'will look at this again.',
  },
  {
    id: 'claim-todd-ms',
    member: 'todd',
    policyId: 'policy-todd-medsupp',
    product: 'medSupp',
    number: '00392',
    description: 'Part B coinsurance for an outpatient knee arthroscopy in February.',
    stages: [
      { status: 'Intake', offsetDays: -72 },
      { status: 'Processing', offsetDays: -66 },
      { status: 'Reviewing', offsetDays: -58 },
      { status: 'Paid', offsetDays: -51 },
    ],
    paidAmount: 486.2,
  },
  {
    id: 'claim-matt-dental',
    member: 'matt',
    policyId: 'policy-matt-dental',
    product: 'dental',
    number: '00404',
    description: 'Crown on a lower right molar, plus the exam and x-ray that went with it.',
    stages: [
      { status: 'Intake', offsetDays: -63 },
      { status: 'Processing', offsetDays: -57 },
      { status: 'Reviewing', offsetDays: -49 },
      { status: 'Paid', offsetDays: -44 },
    ],
    paidAmount: 612.5,
  },
  {
    id: 'claim-matt-hi',
    member: 'matt',
    policyId: 'policy-matt-hi',
    product: 'hospitalIndemnity',
    number: '00431',
    description: 'One night admitted for observation after chest pain. Discharged the next day.',
    stages: [
      { status: 'Intake', offsetDays: -17 },
      { status: 'Processing', offsetDays: -12 },
      { status: 'Reviewing', offsetDays: -5 },
    ],
  },
];

/* ============================================================ rewards ====== */

const REWARDS = {
  dave: { lifetime: 2450, balance: 1180 },
  sara: { lifetime: 640, balance: 340 },
  eric: { lifetime: 2100, balance: 900 },
  april: { lifetime: 520, balance: 210 },
  debbie: { lifetime: 2680, balance: 1420 },
  dennis: { lifetime: 150, balance: 150 },
  todd: { lifetime: 7400, balance: 4120 },
  matt: { lifetime: 9100, balance: 6250 },
};

const CATALOG = [
  {
    id: 'reward-silversneakers',
    kind: 'redeem',
    name: 'SilverSneakers Membership',
    description: 'A full year of gym access and fitness classes at thousands of locations.',
    cost: 2500,
    category: 'Fitness',
  },
  {
    id: 'reward-weightwatchers',
    kind: 'redeem',
    name: 'WW (Weight Watchers) Membership',
    description: 'Six months of the WW digital program, including the app and workshops.',
    cost: 2000,
    category: 'Nutrition',
  },
  {
    id: 'reward-audible',
    kind: 'redeem',
    name: 'Audible Membership',
    description: 'Three months of Audible, with one title a month to keep.',
    cost: 1200,
    category: 'Leisure',
  },
  {
    id: 'reward-giftcard-25',
    kind: 'redeem',
    name: '$25 Gift Card',
    description: 'Your choice of Target, Walmart, or a grocery card mailed to your address.',
    cost: 1000,
    category: 'Gift card',
  },
  {
    id: 'reward-fitbit',
    kind: 'redeem',
    name: 'Fitness Tracker',
    description: 'A wrist tracker that counts steps and sleep, shipped to you.',
    cost: 4500,
    category: 'Fitness',
  },
  {
    id: 'earn-medsupp-explained',
    kind: 'earn',
    name: 'Understanding Your Medicare Supplement Plan',
    description: 'A six-minute video on what Plan G and Plan N actually pay for.',
    cost: 150,
    category: 'Video',
  },
  {
    id: 'earn-fall-prevention',
    kind: 'earn',
    name: 'Six Ways to Prevent a Fall at Home',
    description: 'A short read on the changes that make the biggest difference.',
    cost: 100,
    category: 'Article',
  },
  {
    id: 'earn-dental-whole-health',
    kind: 'earn',
    name: 'Why Your Dentist Asks About Your Heart',
    description: 'How oral health and cardiovascular health are connected.',
    cost: 100,
    category: 'Article',
  },
  {
    id: 'earn-medication-review',
    kind: 'earn',
    name: 'Getting the Most From Your Annual Medication Review',
    description: 'What to bring, what to ask, and why it is worth booking.',
    cost: 150,
    category: 'Video',
  },
];

/* =============================================================== care ====== */

const PROVIDERS = [
  ['Prairie Trail Family Dentistry', 'Dentist', 'Ankeny', 'IA', 145, 4.8, 3.2],
  ['Grand Avenue Dental Care', 'Dentist', 'Des Moines', 'IA', 120, 4.6, 1.4],
  ['Riverbend Dental Associates', 'Dentist', 'Des Moines', 'IA', 180, 4.3, 4.7],
  ['Westside Smile Studio', 'Dentist', 'West Des Moines', 'IA', 165, 4.9, 6.1],
  ['Heartland Dental Group', 'Dentist', 'Urbandale', 'IA', 110, 4.1, 5.5],
  ['Ingersoll Primary Care', 'Primary Care', 'Des Moines', 'IA', 160, 4.7, 2.1],
  ['Wakonda Family Medicine', 'Primary Care', 'Des Moines', 'IA', 140, 4.4, 3.8],
  ['Northwest Internal Medicine', 'Primary Care', 'Johnston', 'IA', 175, 4.8, 7.3],
  ['Clive Health Partners', 'Primary Care', 'Clive', 'IA', 155, 4.2, 5.9],
  ['Beaverdale Medical Clinic', 'Primary Care', 'Des Moines', 'IA', 130, 4.5, 2.9],
  ['Capital City Physical Therapy', 'Physical Therapy', 'Des Moines', 'IA', 95, 4.9, 1.9],
  ['Motion Works PT', 'Physical Therapy', 'West Des Moines', 'IA', 110, 4.6, 5.2],
  ['Ankeny Sports & Spine', 'Physical Therapy', 'Ankeny', 'IA', 125, 4.4, 8.4],
  ['Riverfront Rehabilitation', 'Physical Therapy', 'Des Moines', 'IA', 85, 4.2, 3.1],
  ['Des Moines Eye Associates', 'Optometry', 'Des Moines', 'IA', 90, 4.7, 2.4],
  ['Clearview Vision Center', 'Optometry', 'Urbandale', 'IA', 75, 4.5, 5.8],
  ['Heartland Optical', 'Optometry', 'Ankeny', 'IA', 70, 4.0, 7.9],
  ['Prairie Audiology', 'Hearing', 'West Des Moines', 'IA', 210, 4.8, 6.0],
  ['Iowa Hearing Center', 'Hearing', 'Des Moines', 'IA', 185, 4.3, 2.6],
  ['Midwest Hearing Associates', 'Hearing', 'Clive', 'IA', 240, 4.6, 5.4],
  ['Cornerstone Dermatology', 'Dermatology', 'West Des Moines', 'IA', 205, 4.7, 6.3],
  ['Des Moines Skin Clinic', 'Dermatology', 'Des Moines', 'IA', 190, 4.4, 2.2],
  ['Prairie Dermatology Group', 'Dermatology', 'Ankeny', 'IA', 225, 4.9, 8.1],
];

const PROVIDER_HOURS = 'Monday to Friday, 8:00 AM – 5:00 PM';

/* =========================================================== health ======== */

/** Streak shapes per member, all relative to today. `endOffset: -1` means the run
 *  ends yesterday, so the streak is live but today is still open — a presenter can
 *  complete today's challenges on stage and watch the number move. */
const HEALTH = {
  dave: { run: 12, endOffset: -1, tracker: 'Apple Health (connected)', badges: ['7-Day Streak', 'First 5K Steps'] },
  sara: { run: 3, endOffset: -1, tracker: 'Apple Health (connected)', badges: ['First 5K Steps'] },
  eric: { run: 0, tracker: null, badges: [] },
  // Ends 40 days ago: current streak 0, longest 14. Her screen has to read as
  // encouraging rather than as a reset-to-zero (docs/05).
  april: { run: 14, endOffset: -40, tracker: 'Fitbit (connected)', badges: ['7-Day Streak', 'Two Weeks Strong'] },
  debbie: { run: 20, endOffset: -1, tracker: 'Apple Health (connected)', badges: ['7-Day Streak', 'Two Weeks Strong'] },
  dennis: { run: 0, tracker: null, badges: [] },
  matt: {
    run: 45,
    endOffset: -1,
    tracker: 'Garmin (connected)',
    badges: ['7-Day Streak', 'Two Weeks Strong', '30-Day Streak', 'First 5K Steps'],
  },
  // Todd is the 82-of-100 case. Built from runs with gaps between them rather than
  // randomly scattered days: 82 random days out of 99 produces a longest streak of
  // about 11, which would contradict any badge above two weeks and would look
  // nothing like how a real person uses a habit app. These five runs total exactly
  // 82 credited days across exactly 99, ending yesterday — so his current streak is
  // 14, his longest is 22, and TODAY is deliberately left empty so a presenter can
  // complete it live and watch 82 become 83.
  todd: {
    runs: [22, 18, 16, 12, 14],
    gaps: [5, 4, 4, 4],
    tracker: 'Apple Health (connected)',
    badges: ['7-Day Streak', 'Two Weeks Strong', '80-Day Challenger'],
  },
};

const CHALLENGE_IDS = ['steps5k', 'calories400', 'stairs10', 'activity10min', 'mindfulness'];

/** Deterministic pseudo-random, so re-running the seed produces identical documents
 *  and the idempotency requirement in docs/03 actually holds. */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function challengesForDay(rand, minCount) {
  const count = minCount + Math.floor(rand() * (5 - minCount + 1));
  const pool = [...CHALLENGE_IDS];
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(...pool.splice(Math.floor(rand() * pool.length), 1));
  return picked;
}

/* ============================================================= build ======= */

/**
 * Build every seed document.
 *
 * @param {Date} today anchor date; defaults to local midnight
 * @returns {Map<string, object>} Firestore path -> document data
 */
export function buildSeed(today = startOfToday()) {
  const out = new Map();
  const put = (path, data) => out.set(path, data);
  const year = today.getFullYear();

  /* ---- users ---------------------------------------------------------- */

  for (const m of MEMBERS) {
    put(`users/user-${m.key}`, {
      firstName: m.firstName,
      usernameLower: m.key,
      role: 'member',
      gender: m.gender,
      dob: m.dob,
      email: m.email,
      phone: m.phone,
      preferredContactMethod: m.preferredContactMethod,
      address: m.address,
      cardOnFile: m.cardOnFile,
      bankAccountOnFile: m.bankAccountOnFile,
      deliveryPreferences: allPaper(),
      createdAt: at(today, m.createdOffsetDays),
    });
  }

  // The admin's address is a placeholder rather than empty: addressValid() in
  // firestore.rules requires a non-empty street and city, a two-letter state and a
  // five-digit zip, so an all-empty address is rejected outright. See docs/03.
  put('users/user-admin', {
    firstName: 'Admin',
    usernameLower: 'admin',
    role: 'admin',
    email: '',
    phone: '',
    preferredContactMethod: 'email',
    address: { street: 'Internal account', city: 'Des Moines', state: 'IA', zip: '50309' },
    createdAt: at(today, -365 * 6),
  });

  /* ---- policies ------------------------------------------------------- */

  const policyById = new Map();
  for (const p of POLICIES) {
    const paidThroughDate =
      p.paidThroughOffsetMonths != null
        ? toYmd(addMonths(today, p.paidThroughOffsetMonths))
        : ymd(today, p.paidThroughOffsetDays);
    const data = {
      userId: `user-${p.member}`,
      product: p.product,
      planName: p.planName,
      policyNumber: p.policyNumber,
      status: p.status ?? 'active',
      effectiveDate: ymd(today, p.effectiveOffsetDays),
      paidThroughDate,
      premiumAmount: p.premiumAmount,
      premiumFrequency: p.premiumFrequency,
      autopayEnabled: p.autopayEnabled,
      coverageSummary: p.coverageSummary,
      whatItCovers: p.whatItCovers,
    };
    put(`policies/${p.id}`, data);
    policyById.set(p.id, { id: p.id, ...data, member: p.member });
  }

  /* ---- payments ------------------------------------------------------- */
  // Two to four months of history per policy, so the ledger looks lived-in rather
  // than like a single snapshot.

  for (const p of POLICIES) {
    const member = MEMBERS.find((m) => m.key === p.member);
    const periodMonths = { monthly: 1, quarterly: 3, annual: 12 }[p.premiumFrequency];
    const count = p.premiumFrequency === 'annual' ? 2 : p.premiumFrequency === 'quarterly' ? 3 : 4;

    for (let i = count; i >= 1; i--) {
      const when = addMonths(today, -i * periodMonths);
      const resulting = toYmd(addMonths(when, periodMonths));
      put(`payments/pay-${p.id}-${i}`, {
        userId: `user-${p.member}`,
        policyId: p.id,
        amount: p.premiumAmount,
        method: p.autopayEnabled && member.bankAccountOnFile ? 'bank' : 'card',
        last4:
          p.autopayEnabled && member.bankAccountOnFile
            ? member.bankAccountOnFile.last4
            : member.cardOnFile.last4,
        status: 'success',
        resultingPaidThroughDate: resulting,
        timestamp: when,
      });
    }
  }

  // April's failed payment — the seeded record behind her past-due state. The live
  // mismatch demo comes from typing the wrong digits at the form; this is the
  // history that explains how she got here.
  put('payments/pay-april-failed', {
    userId: 'user-april',
    policyId: 'policy-april-stc',
    amount: 58.0,
    method: 'card',
    last4: '1111',
    status: 'failed',
    timestamp: at(today, -58),
  });

  /* ---- claims --------------------------------------------------------- */

  for (const c of CLAIMS) {
    const last = c.stages[c.stages.length - 1];
    const data = {
      userId: `user-${c.member}`,
      policyId: c.policyId,
      product: c.product,
      claimNumber: `CLM-${year}-${c.number}`,
      description: c.description,
      status: last.status,
      // Real times of day, not midnight — a tracker that says every stage happened
      // at 12:00 AM reads as fake at a glance.
      statusHistory: c.stages.map((s, i) => ({
        status: s.status,
        timestamp: atHour(today, s.offsetDays, 9 + ((i * 3) % 8)),
      })),
      submittedAt: atHour(today, c.stages[0].offsetDays, 9),
    };
    if (c.deniedReason) data.deniedReason = c.deniedReason;
    if (c.paidAmount != null) data.paidAmount = c.paidAmount;
    put(`claims/${c.id}`, data);
  }

  /* ---- rewards -------------------------------------------------------- */

  for (const item of CATALOG) put(`rewardsCatalog/${item.id}`, item);

  for (const m of MEMBERS) {
    const r = REWARDS[m.key];
    put(`rewardsAccounts/user-${m.key}`, {
      userId: `user-${m.key}`,
      pointsBalance: r.balance,
      lifetimePointsEarned: r.lifetime,
      tier: tierFor(r.lifetime),
    });
  }

  // A believable earn/spend history. Volume scales with the member's lifetime
  // total, so Todd and Matt read as rich and Dennis reads as just getting started.
  const HISTORY = {
    dave: [
      ['earn', 150, 'Watched: Understanding Your Medicare Supplement Plan', -74],
      ['earn', 500, 'Policy anniversary bonus', -61],
      ['earn', 100, 'Read: Six Ways to Prevent a Fall at Home', -40],
      ['spend', 1000, 'Redeemed: $25 Gift Card', -33],
      ['earn', 120, '7-day streak milestone', -9],
    ],
    sara: [
      ['earn', 250, 'Welcome bonus', -118],
      ['earn', 100, 'Read: Why Your Dentist Asks About Your Heart', -35],
      ['earn', 30, 'Daily challenges completed', -3],
    ],
    eric: [
      ['earn', 500, 'Policy anniversary bonus', -96],
      ['earn', 150, 'Watched: Getting the Most From Your Annual Medication Review', -70],
      ['spend', 1200, 'Redeemed: Audible Membership', -52],
      ['earn', 250, 'Welcome bonus', -365 * 2 + 4],
    ],
    april: [
      ['earn', 250, 'Welcome bonus', -365 * 3 + 6],
      ['earn', 140, 'Daily challenges completed', -47],
      ['earn', 50, '7-day streak milestone', -45],
    ],
    debbie: [
      ['earn', 500, 'Policy anniversary bonus', -88],
      ['earn', 150, 'Watched: Understanding Your Medicare Supplement Plan', -55],
      ['spend', 1000, 'Redeemed: $25 Gift Card', -41],
      ['earn', 200, 'Daily challenges completed', -14],
      ['earn', 50, '7-day streak milestone', -7],
    ],
    dennis: [['earn', 150, 'Welcome bonus', -365 * 9 + 12]],
    todd: [
      ['earn', 500, 'Policy anniversary bonus', -120],
      ['earn', 150, 'Watched: Understanding Your Medicare Supplement Plan', -101],
      ['earn', 250, '80-day challenge milestone', -12],
      ['spend', 2000, 'Redeemed: WW (Weight Watchers) Membership', -66],
      ['spend', 1200, 'Redeemed: Audible Membership', -28],
      ['earn', 300, 'Daily challenges completed', -19],
      ['earn', 100, 'Read: Six Ways to Prevent a Fall at Home', -6],
    ],
    matt: [
      ['earn', 500, 'Policy anniversary bonus', -145],
      ['earn', 150, 'Watched: Getting the Most From Your Annual Medication Review', -110],
      ['spend', 2500, 'Redeemed: SilverSneakers Membership', -87],
      ['earn', 400, 'Daily challenges completed', -44],
      ['earn', 50, '7-day streak milestone', -30],
      ['earn', 100, 'Read: Why Your Dentist Asks About Your Heart', -16],
      ['spend', 1000, 'Redeemed: $25 Gift Card', -5],
    ],
  };

  for (const [key, rows] of Object.entries(HISTORY)) {
    rows.forEach(([type, amount, reason, offset], i) => {
      put(`rewardsTransactions/tx-${key}-${i}`, {
        userId: `user-${key}`,
        type,
        amount,
        reason,
        timestamp: at(today, offset),
      });
    });
  }

  /* ---- care providers -------------------------------------------------- */

  PROVIDERS.forEach(([name, serviceType, city, state, costEstimate, starRating, distanceMiles], i) => {
    put(`careProviders/provider-${i + 1}`, {
      name,
      serviceType,
      city,
      state,
      costEstimate,
      starRating,
      distanceMiles,
      phone: `(515) 555-0${200 + i}`,
      hours: PROVIDER_HOURS,
      address: `${100 + i * 7} ${['Main', 'Oak', 'Elm', 'Grand', 'Locust'][i % 5]} Street`,
    });
  });

  /* ---- health ---------------------------------------------------------- */

  for (const m of MEMBERS) {
    const spec = HEALTH[m.key];
    const rand = seededRandom(m.key.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
    const creditedDates = [];

    if (spec.runs) {
      // Walk backwards from yesterday: a run of credited days, then a gap, and so
      // on. Deterministic, so a re-seed produces byte-identical documents.
      let offset = -1;
      spec.runs.forEach((length, i) => {
        for (let d = 0; d < length; d++) creditedDates.push(offset--);
        offset -= spec.gaps[i] ?? 0;
      });
    } else if (spec.run > 0) {
      for (let i = 0; i < spec.run; i++) creditedDates.push(spec.endOffset - i);
    }

    for (const offset of creditedDates) {
      // One challenge is enough to credit a day, so seeded days run from 1 to 5 —
      // which is also what real usage looks like, rather than everyone heroically
      // completing most of the list every day.
      const challenges = challengesForDay(rand, 1);
      put(`healthDailyLog/user-${m.key}_${ymd(today, offset)}`, {
        userId: `user-${m.key}`,
        date: ymd(today, offset),
        challengesCompleted: challenges,
        pointsEarned: challenges.length * POINTS_PER_CHALLENGE,
      });
    }

    // The stored profile is a cache of what the app recomputes from the logs above
    // on every load (docs/05). Seeding it from the same source is what keeps the
    // two from disagreeing on first paint.
    const credited = new Set(creditedDates.map((o) => ymd(today, o)));
    const stats = deriveFromDates(credited, today);
    put(`healthProfiles/user-${m.key}`, {
      userId: `user-${m.key}`,
      currentStreakDays: stats.currentStreakDays,
      longestStreakDays: stats.longestStreakDays,
      badges: spec.badges,
      challengeDaysCompletedInWindow: stats.challengeDaysCompletedInWindow,
      qualifiesForGuaranteedIssue: stats.qualifiesForGuaranteedIssue,
      guaranteedIssueOfferShown: stats.qualifiesForGuaranteedIssue,
      connectedTracker: spec.tracker,
    });
  }

  /* ---- mailbox --------------------------------------------------------- */

  buildMailbox({ put, today, year, policyById });

  return out;
}

/** Same derivation the app uses, kept local so this module stays import-light. */
function deriveFromDates(creditedSet, today) {
  const dates = [...creditedSet].sort();
  const has = (d) => creditedSet.has(toYmd(d));

  let cursor = has(today) ? today : has(addDays(today, -1)) ? addDays(today, -1) : null;
  let currentStreakDays = 0;
  while (cursor && has(cursor)) {
    currentStreakDays += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    const cur = new Date(d.slice(0, 4), Number(d.slice(5, 7)) - 1, d.slice(8, 10));
    run = prev && Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = cur;
  }

  const windowStart = toYmd(addDays(today, -99));
  const todayYmd = toYmd(today);
  const inWindow = dates.filter((d) => d >= windowStart && d <= todayYmd).length;

  return {
    currentStreakDays,
    longestStreakDays: Math.max(longest, currentStreakDays),
    challengeDaysCompletedInWindow: inWindow,
    qualifiesForGuaranteedIssue: inWindow >= 80,
  };
}

export { MEMBERS, POLICIES, CLAIMS, CATALOG };
