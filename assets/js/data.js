// The one place Firestore collection and field names are spelled.
//
// Every feature module goes through here. Two reasons: a schema change touches one
// file, and the choice between a live listener and a one-shot read gets made once,
// deliberately, rather than per feature.
//
// The rule for that choice:
//   * subscribe*  — anything with cross-screen effects. A payment moves the
//     paid-through date on MyCoverages AND the home dashboard; a MyHealth challenge
//     credits the same points ledger MyRewards reads. docs/04 and docs/05 require
//     those to update without a page reload, so they are onSnapshot.
//   * get*        — static reference data (rewardsCatalog, careProviders) and
//     one-off lookups. No listener to leak.

import { db } from './firebase-init.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment,
} from '../vendor/firebase.js';

export { serverTimestamp, Timestamp, increment, doc, collection, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, orderBy, limit };
export { db };

const withId = (snap) => ({ id: snap.id, ...snap.data() });
const listOf = (snap) => snap.docs.map(withId);

/* ============================================================= users ======= */

/** Login lookup. Open read is unavoidable with no Firebase Auth — see
 *  docs/02-architecture.md and the firestore.rules header. */
export async function findUserByUsername(usernameLower) {
  const snap = await getDocs(
    query(collection(db, 'users'), where('usernameLower', '==', usernameLower), limit(1)),
  );
  return snap.empty ? null : withId(snap.docs[0]);
}

export async function getUser(userId) {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? withId(snap) : null;
}

export function subscribeUser(userId, cb, onError) {
  return onSnapshot(doc(db, 'users', userId), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export async function getAllMembers() {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'member')));
  return listOf(snap).sort((a, b) => a.firstName.localeCompare(b.firstName));
}

/** firestore.rules only permits these six fields to change on a client write —
 *  gender, dob, role, firstName and usernameLower are absent from its allow-list,
 *  which is what makes the MyInformation guardrail real rather than cosmetic. */
export function updateUserFields(userId, fields) {
  return updateDoc(doc(db, 'users', userId), fields);
}

/* ========================================================== policies ======= */

export function subscribePolicies(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'policies'), where('userId', '==', userId)),
    (s) => cb(listOf(s)),
    onError,
  );
}

export async function getPolicies(userId) {
  return listOf(await getDocs(query(collection(db, 'policies'), where('userId', '==', userId))));
}

export async function getAllPolicies() {
  return listOf(await getDocs(collection(db, 'policies')));
}

export function createPolicy(policyId, data) {
  return setDoc(doc(db, 'policies', policyId), data);
}

/** Only paidThroughDate, status and autopayEnabled may change, and
 *  paidThroughDate is monotonic — both enforced in firestore.rules. */
export function updatePolicy(policyId, fields) {
  return updateDoc(doc(db, 'policies', policyId), fields);
}

/* ========================================================== payments ======= */

export function subscribePayments(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'payments'), where('userId', '==', userId)),
    (s) => cb(sortByTimeDesc(listOf(s), 'timestamp')),
    onError,
  );
}

export async function getAllPayments() {
  return sortByTimeDesc(listOf(await getDocs(collection(db, 'payments'))), 'timestamp');
}

export function createPayment(data) {
  return addDoc(collection(db, 'payments'), data);
}

/* ============================================================ claims ======= */

export function subscribeClaims(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'claims'), where('userId', '==', userId)),
    (s) => cb(sortByTimeDesc(listOf(s), 'submittedAt')),
    onError,
  );
}

export function subscribeClaim(claimId, cb, onError) {
  return onSnapshot(doc(db, 'claims', claimId), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export async function getAllClaims() {
  return sortByTimeDesc(listOf(await getDocs(collection(db, 'claims'))), 'submittedAt');
}

export function createClaim(claimId, data) {
  return setDoc(doc(db, 'claims', claimId), data);
}

export function updateClaim(claimId, fields) {
  return updateDoc(doc(db, 'claims', claimId), fields);
}

/* =========================================================== rewards ======= */

export function subscribeRewardsAccount(userId, cb, onError) {
  return onSnapshot(doc(db, 'rewardsAccounts', userId), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export async function getRewardsAccount(userId) {
  const snap = await getDoc(doc(db, 'rewardsAccounts', userId));
  return snap.exists() ? withId(snap) : null;
}

export function setRewardsAccount(userId, data) {
  return setDoc(doc(db, 'rewardsAccounts', userId), data, { merge: true });
}

export function subscribeRewardsTransactions(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'rewardsTransactions'), where('userId', '==', userId)),
    (s) => cb(sortByTimeDesc(listOf(s), 'timestamp')),
    onError,
  );
}

export async function getAllRewardsAccounts() {
  return listOf(await getDocs(collection(db, 'rewardsAccounts')));
}

export async function getAllRewardsTransactions() {
  return sortByTimeDesc(listOf(await getDocs(collection(db, 'rewardsTransactions'))), 'timestamp');
}

export function addRewardsTransaction(data) {
  return addDoc(collection(db, 'rewardsTransactions'), data);
}

/** Deterministic ID so a challenge can only ever credit once per day, however
 *  many times it is toggled (docs/05 §MyHealth idempotency). */
export function setRewardsTransaction(txId, data) {
  return setDoc(doc(db, 'rewardsTransactions', txId), data);
}

export async function rewardsTransactionExists(txId) {
  return (await getDoc(doc(db, 'rewardsTransactions', txId))).exists();
}

/** Shared reference data — read-only for the app, so a one-shot read is right. */
export async function getRewardsCatalog() {
  return listOf(await getDocs(collection(db, 'rewardsCatalog')));
}

/* ============================================================ health ======= */

export function subscribeHealthProfile(userId, cb, onError) {
  return onSnapshot(doc(db, 'healthProfiles', userId), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export function setHealthProfile(userId, data) {
  return setDoc(doc(db, 'healthProfiles', userId), data, { merge: true });
}

export async function getAllHealthProfiles() {
  return listOf(await getDocs(collection(db, 'healthProfiles')));
}

/** Daily logs for a member. The composite document ID is `${userId}_${date}`, which
 *  firestore.rules checks against the body — so both fields are immutable for free. */
export function subscribeHealthLogs(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'healthDailyLog'), where('userId', '==', userId)),
    (s) => {
      const byDate = {};
      for (const d of s.docs) byDate[d.data().date] = withId(d);
      cb(byDate);
    },
    onError,
  );
}

export function setHealthLog(userId, date, data) {
  return setDoc(doc(db, 'healthDailyLog', `${userId}_${date}`), { userId, date, ...data });
}

/* ============================================================== care ======= */

export async function getCareProviders() {
  return listOf(await getDocs(collection(db, 'careProviders')));
}

/* =================================================== change requests ======= */

export function createChangeRequest(data) {
  return addDoc(collection(db, 'changeRequests'), data);
}

export async function getAllChangeRequests() {
  return sortByTimeDesc(listOf(await getDocs(collection(db, 'changeRequests'))), 'submittedAt');
}

/* ========================================================== mailbox ======== */

export function subscribeNotices(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'notices'), where('userId', '==', userId)),
    (s) => cb(sortByTimeDesc(listOf(s), 'createdAt')),
    onError,
  );
}

export function createNotice(data) {
  return addDoc(collection(db, 'notices'), data);
}

/** The rules allow exactly one client mutation here: read false -> true. */
export function markNoticeRead(noticeId) {
  return updateDoc(doc(db, 'notices', noticeId), { read: true });
}

export async function getAllNotices() {
  return sortByTimeDesc(listOf(await getDocs(collection(db, 'notices'))), 'createdAt');
}

export function subscribeDocuments(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'documents'), where('userId', '==', userId)),
    (s) => cb(listOf(s).sort((a, b) => String(b.issuedDate).localeCompare(String(a.issuedDate)))),
    onError,
  );
}

export async function getDocumentById(documentId) {
  const snap = await getDoc(doc(db, 'documents', documentId));
  return snap.exists() ? withId(snap) : null;
}

export function createDocument(documentId, data) {
  return setDoc(doc(db, 'documents', documentId), data);
}

export function subscribeThreads(userId, cb, onError) {
  return onSnapshot(
    query(collection(db, 'messageThreads'), where('userId', '==', userId)),
    (s) => cb(sortByTimeDesc(listOf(s), 'lastMessageAt')),
    onError,
  );
}

export function subscribeThread(threadId, cb, onError) {
  return onSnapshot(doc(db, 'messageThreads', threadId), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export function createThread(data) {
  return addDoc(collection(db, 'messageThreads'), data);
}

export function updateThread(threadId, fields) {
  return updateDoc(doc(db, 'messageThreads', threadId), fields);
}

export async function getAllThreads() {
  return sortByTimeDesc(listOf(await getDocs(collection(db, 'messageThreads'))), 'lastMessageAt');
}

/* ============================================================= util ======== */

/** Firestore can't order by a field that some documents write with
 *  serverTimestamp() and haven't resolved yet, and adding orderBy to a filtered
 *  query needs a composite index the human would have to create in the console.
 *  Sorting client-side avoids both; these result sets are demo-sized. */
function sortByTimeDesc(rows, field) {
  return rows.sort((a, b) => timeValue(b[field]) - timeValue(a[field]));
}

function timeValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return new Date(value).getTime() || 0;
}
