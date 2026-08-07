// Seed content for MyMailbox — notices, documents, and Debbie's message thread.
//
// Split out of seed-data.js purely for size. Same rule applies: every date is an
// offset from `today`, and the copy is member-facing, so it is written the way the
// rest of the app is written — plain language, second person, short sentences,
// dates in full. This is the part an ELT will read word for word on a projector.

import { addDays, addMonths, toYmd, formatDate, formatMoney, PRODUCT_LABELS } from './format.js';

const at = (today, days) => addDays(today, days);
const ymd = (today, days) => toYmd(addDays(today, days));

export function buildMailbox({ put, today, year, policyById }) {
  const policiesFor = (member) => [...policyById.values()].filter((p) => p.member === member);

  /* ---- welcome notice and packet, for everyone ------------------------ */

  const MEMBER_KEYS = ['dave', 'sara', 'eric', 'april', 'debbie', 'dennis', 'todd', 'matt'];

  for (const key of MEMBER_KEYS) {
    const policies = policiesFor(key);
    const first = policies[0];
    const joined = at(today, -Math.abs(daysSince(first.effectiveDate, today)));

    put(`notices/notice-${key}-welcome`, {
      userId: `user-${key}`,
      type: 'welcome',
      subject: 'Welcome to your Wellabe account',
      body:
        'Everything Wellabe sends you now arrives here as well as in the mail. You can ' +
        'find your policy documents, payment receipts, and claim updates in MyMailbox at ' +
        'any time.\n\nYou can also ask us a question from here and we will follow up by ' +
        'phone or email.',
      actionLabel: 'See your coverage',
      actionTarget: 'coverages',
      documentId: `doc-${key}-welcome`,
      read: true,
      createdAt: joined,
    });

    put(`documents/doc-${key}-welcome`, {
      userId: `user-${key}`,
      policyId: first.id,
      category: 'policy',
      title: 'Welcome Packet',
      renderer: 'welcomePacket',
      payload: {
        planName: first.planName,
        policyNumber: first.policyNumber,
        effectiveDate: first.effectiveDate,
      },
      issuedDate: first.effectiveDate,
      createdAt: joined,
    });

    // One Outline of Coverage per policy — the document a member actually goes
    // looking for when they want to know what is covered.
    for (const p of policies) {
      put(`documents/doc-${p.id}-outline`, {
        userId: `user-${key}`,
        policyId: p.id,
        category: 'policy',
        title: `Outline of Coverage — ${p.planName}`,
        renderer: 'outlineOfCoverage',
        payload: {
          planName: p.planName,
          policyNumber: p.policyNumber,
          effectiveDate: p.effectiveDate,
          summary: p.coverageSummary,
          covers: p.whatItCovers.join(' | '),
        },
        issuedDate: p.effectiveDate,
        createdAt: at(today, -Math.abs(daysSince(p.effectiveDate, today))),
      });

      // A premium statement for each of the last two policy years, or one if the
      // policy is newer than that.
      const yearsHeld = Math.max(1, Math.min(2, Math.floor(daysSince(p.effectiveDate, today) / 365)));
      for (let i = 1; i <= yearsHeld; i++) {
        const periodsPerYear = { monthly: 12, quarterly: 4, annual: 1 }[p.premiumFrequency];
        const issued = addMonths(today, -12 * (i - 1) - monthsIntoYear(today));
        put(`documents/doc-${p.id}-statement-${year - i + 1}`, {
          userId: `user-${key}`,
          policyId: p.id,
          category: 'statement',
          title: `${year - i + 1} Premium Statement — ${p.planName}`,
          renderer: 'premiumStatement',
          payload: {
            planName: p.planName,
            policyNumber: p.policyNumber,
            statementYear: String(year - i + 1),
            premiumAmount: formatMoney(p.premiumAmount),
            frequency: p.premiumFrequency,
            annualTotal: formatMoney(p.premiumAmount * periodsPerYear),
          },
          issuedDate: toYmd(issued),
          createdAt: issued,
        });
      }
    }
  }

  /* ---- rate notices: Dave and Todd, the long-tenured Med Supp members --- */
  // The annual rate-adjustment letter is the single most common real Medigap
  // mailing, so leaving it out would be conspicuous to this audience.

  for (const key of ['dave', 'todd']) {
    const p = policiesFor(key)[0];
    const increase = key === 'dave' ? 6.4 : 5.9;
    const newPremium = Math.round(p.premiumAmount * (1 + increase / 100) * 100) / 100;
    const effective = addMonths(today, 2);

    put(`documents/doc-${key}-rate-${year}`, {
      userId: `user-${key}`,
      policyId: p.id,
      category: 'notice',
      title: `${year} Rate Adjustment Notice — ${p.planName}`,
      renderer: 'rateNotice',
      payload: {
        planName: p.planName,
        policyNumber: p.policyNumber,
        currentPremium: formatMoney(p.premiumAmount),
        newPremium: formatMoney(newPremium),
        percentChange: `${increase}%`,
        effectiveDate: toYmd(effective),
      },
      issuedDate: ymd(today, -24),
      createdAt: at(today, -24),
    });

    put(`notices/notice-${key}-rate`, {
      userId: `user-${key}`,
      type: 'rateNotice',
      subject: 'Your premium is changing on ' + formatDate(effective),
      body:
        `Each year we review what it costs to provide your ${PRODUCT_LABELS[p.product]} ` +
        `coverage. From ${formatDate(effective)}, your premium goes from ` +
        `${formatMoney(p.premiumAmount)} to ${formatMoney(newPremium)} — an increase of ` +
        `${increase}%.\n\nNothing else about your coverage changes, and you do not need ` +
        `to do anything. The full notice is in your documents.`,
      actionLabel: 'Read the full notice',
      actionTarget: 'mailbox',
      documentId: `doc-${key}-rate-${year}`,
      read: false,
      createdAt: at(today, -24),
    });
  }

  /* ---- April: the failed payment ---------------------------------------- */

  put('notices/notice-april-failed', {
    userId: 'user-april',
    type: 'paymentFailed',
    subject: 'We could not process your payment',
    body:
      'Your $58.00 payment for Short-Term Care policy WLB-STC-660411 did not go ' +
      'through, because the card details did not match the card we have on ' +
      'file.\n\nNothing was charged. Your coverage is now past due — you can bring it ' +
      'back to active from MyPayments whenever you are ready.',
    actionLabel: 'Make a payment',
    actionTarget: 'payments?policy=policy-april-stc',
    documentId: null,
    read: false,
    createdAt: at(today, -58),
  });

  /* ---- claim notices ----------------------------------------------------- */

  const CLAIM_NOTICES = [
    { key: 'sara', claim: 'claim-sara-hi', number: '00417', status: 'Processing', offset: -6 },
    { key: 'debbie', claim: 'claim-debbie-ci', number: '00418', status: 'Denied', offset: -22 },
    { key: 'todd', claim: 'claim-todd-ms', number: '00392', status: 'Paid', offset: -51 },
    { key: 'matt', claim: 'claim-matt-dental', number: '00404', status: 'Paid', offset: -44 },
    { key: 'matt', claim: 'claim-matt-hi', number: '00431', status: 'Reviewing', offset: -5 },
  ];

  /* Kept in step with noticeClaimAdvanced() in notices.js — a seeded notice and
     a live one for the same event must not be written in two different voices. */
  const CLAIM_SUBJECT = {
    Processing: "We're processing your claim",
    Reviewing: 'Your claim is under review',
    Paid: 'Your claim has been paid',
    Denied: 'Your claim was denied',
  };

  const CLAIM_BODY = {
    Processing: 'is now being processed. A claims specialist has picked it up, and we will let you know as soon as it moves to review.',
    Reviewing: 'is under review. This is the last stage before a decision, and it usually takes a few days.',
    Paid: 'has been paid. The payment is on its way to you.',
    Denied: 'has been denied. The reason is on the claim itself, along with what you can do next.',
  };

  for (const n of CLAIM_NOTICES) {
    put(`notices/notice-${n.claim}-${n.status.toLowerCase()}`, {
      userId: `user-${n.key}`,
      type: 'claimStatus',
      subject: CLAIM_SUBJECT[n.status],
      body: `Your claim CLM-${year}-${n.number} ${CLAIM_BODY[n.status]}`,
      actionLabel: 'View the details',
      actionTarget: `claims/${n.claim}`,
      documentId: null,
      read: n.offset < -30,
      createdAt: at(today, n.offset),
    });
  }

  /* ---- claim summary documents, for resolved claims ---------------------- */

  const SUMMARIES = [
    { key: 'debbie', claim: 'claim-debbie-ci', number: '00418', outcome: 'Denied', amount: '', offset: -22, plan: 'Critical Illness — $20,000' },
    { key: 'todd', claim: 'claim-todd-ms', number: '00392', outcome: 'Paid', amount: formatMoney(486.2), offset: -51, plan: 'Medicare Supplement Plan N' },
    { key: 'matt', claim: 'claim-matt-dental', number: '00404', outcome: 'Paid', amount: formatMoney(612.5), offset: -44, plan: 'Dental Choice Plus' },
  ];

  for (const s of SUMMARIES) {
    put(`documents/doc-${s.claim}-summary`, {
      userId: `user-${s.key}`,
      policyId: null,
      category: 'claim',
      title: `Claim Summary — CLM-${year}-${s.number}`,
      renderer: 'claimSummary',
      payload: {
        claimNumber: `CLM-${year}-${s.number}`,
        planName: s.plan,
        outcome: s.outcome,
        amountPaid: s.amount,
        decisionDate: ymd(today, s.offset),
      },
      issuedDate: ymd(today, s.offset),
      createdAt: at(today, s.offset),
    });
  }

  /* ---- Todd: the no-health-questions offer ------------------------------- */

  put('notices/notice-todd-offer', {
    userId: 'user-todd',
    type: 'coverage',
    subject: "You've unlocked a no-health-questions offer",
    body:
      'You have completed 82 of the last 100 days of daily challenges. That qualifies ' +
      'you to add Wellabe Hospital Indemnity coverage without answering any health ' +
      'questions.\n\nDemonstration only. Not an offer of insurance. Eligibility, ' +
      'availability and terms vary by state.',
    actionLabel: 'See the offer',
    actionTarget: 'coverages/add',
    documentId: null,
    read: false,
    createdAt: at(today, -12),
  });

  /* ---- Debbie's thread --------------------------------------------------- */
  // The only seeded thread with a Wellabe reply. It exists so the reply pattern is
  // visible live without the app ever fabricating one at runtime — firestore.rules
  // forbids a client writing a message attributed to Wellabe, and this is written
  // in seed mode.

  put('messageThreads/thread-debbie-review', {
    userId: 'user-debbie',
    topic: 'claims',
    subject: `Request a review — CLM-${year}-00418`,
    relatedTo: { section: 'claims', id: 'claim-debbie-ci' },
    status: 'answered',
    messages: [
      {
        from: 'member',
        body:
          'I would like this claim looked at again. My cardiologist told me I had a heart ' +
          'attack and that is why they placed the stent. Can you tell me exactly what ' +
          'paperwork you need from her office?',
        sentAt: at(today, -19),
      },
      {
        from: 'wellabe',
        body:
          'Thank you for getting in touch, Debbie. We need two things from your ' +
          "cardiologist's office: the troponin lab results from that admission, and the " +
          'discharge summary. Ask them to send both to claims@wellabe.example with your ' +
          `claim number, CLM-${year}-00418, on the cover page.\n\nOnce we have those we ` +
          'will reopen the review, and you will hear from us within ten business days.',
        sentAt: at(today, -17),
      },
    ],
    autoAckedAt: at(today, -19),
    lastMessageAt: at(today, -17),
    unreadByMember: false,
  });

  /* ---- Dennis stays deliberately sparse ---------------------------------- */
  // One notice and two documents in total — his welcome notice, his welcome packet
  // and his outline of coverage, all created above and nothing more. He is the test
  // case for "You're all caught up" looking designed rather than broken, so resist
  // the urge to give him something to look at.
}

function daysSince(ymdString, today) {
  const [y, m, d] = ymdString.split('-').map(Number);
  return Math.round((today - new Date(y, m - 1, d)) / 86400000);
}

function monthsIntoYear(today) {
  return today.getMonth();
}
