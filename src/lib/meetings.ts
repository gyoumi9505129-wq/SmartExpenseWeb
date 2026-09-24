import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type { Meeting, Member, Transaction, UserProfile } from "./types";
import { canAccessMeeting, isSystemAdmin } from "./roles";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

export function mapMeeting(id: string, data: DocumentData): Meeting {
  return {
    id,
    name: asString(data.name),
    description: asString(data.description),
    slogan: asString(data.slogan),
    ownerUid: asString(data.ownerUid),
    adminUid: asString(data.adminUid),
    sharedWith: asStringArray(data.sharedWith),
    inactiveMemberUids: asStringArray(data.inactiveMemberUids),
    inactiveMemberReasons: asStringMap(data.inactiveMemberReasons),
    invitedEmails: asStringArray(data.invitedEmails),
    initialBalance: asNumber(data.initialBalance),
    currentBalance: asNumber(data.currentBalance),
    duesPaymentMethod: asString(data.duesPaymentMethod),
  };
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(getFirebaseDb(), COLLECTIONS.USER_PROFILES, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: asString(data.uid) || snap.id,
    email: asString(data.email),
    displayName: asString(data.displayName),
    phone: asString(data.phone),
    profileCompleted: data.profileCompleted === true,
  };
}

/** 참여 중인 모임 목록 (시스템관리자는 전체) */
export async function fetchAccessibleMeetings(
  uid: string,
  email: string | null
): Promise<Meeting[]> {
  const db = getFirebaseDb();
  const meetingsRef = collection(db, COLLECTIONS.MEETINGS);

  if (isSystemAdmin(email)) {
    const all = await getDocs(meetingsRef);
    return all.docs
      .map((d) => mapMeeting(d.id, d.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  const [sharedSnap, ownedSnap] = await Promise.all([
    getDocs(query(meetingsRef, where("sharedWith", "array-contains", uid))),
    getDocs(query(meetingsRef, where("ownerUid", "==", uid))),
  ]);

  const byId = new Map<string, Meeting>();
  for (const d of [...sharedSnap.docs, ...ownedSnap.docs]) {
    byId.set(d.id, mapMeeting(d.id, d.data()));
  }

  // 지정 운영관리자 모임도 포함 (adminUid == uid)
  // 전체 list는 rules상 가능하나 비용 고려해 owned/shared 우선. admin은 별도 조회.
  const adminSnap = await getDocs(
    query(meetingsRef, where("adminUid", "==", uid))
  );
  for (const d of adminSnap.docs) {
    byId.set(d.id, mapMeeting(d.id, d.data()));
  }

  return [...byId.values()]
    .filter((m) => canAccessMeeting(uid, email, m))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function fetchMeeting(meetingId: string): Promise<Meeting | null> {
  const snap = await getDoc(doc(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId));
  if (!snap.exists()) return null;
  return mapMeeting(snap.id, snap.data());
}

export async function fetchMembers(meetingId: string): Promise<Member[]> {
  const snap = await getDocs(
    collection(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId, COLLECTIONS.MEMBERS)
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: asString(data.name),
        status: asString(data.status) || "ACTIVE",
        joinDate: asString(data.joinDate),
        phone: asString(data.phone),
        email: asString(data.email),
        role: asString(data.role) || "GENERAL",
        linkedUid: asString(data.linkedUid),
        residenceRegion: asString(data.residenceRegion),
      } satisfies Member;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/**
 * 장부 전체 조회. 건수·잔액 SSOT 이므로 임의 상한으로 자르지 않는다.
 * @param limitCount 지정 시에만 최신 N건으로 제한 (목록 미리보기용)
 */
export async function fetchTransactions(
  meetingId: string,
  limitCount?: number
): Promise<Transaction[]> {
  const snap = await getDocs(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.TRANSACTIONS
    )
  );
  const rows = snap.docs.map((d) => {
    const data = d.data();
    const income =
      typeof data.incomeAmount === "number"
        ? data.incomeAmount
        : typeof data.amount === "number" && asString(data.type).toUpperCase() === "INCOME"
          ? data.amount
          : 0;
    const expense =
      typeof data.expenseAmount === "number"
        ? data.expenseAmount
        : typeof data.amount === "number" && asString(data.type).toUpperCase() === "EXPENSE"
          ? data.amount
          : 0;
    return {
      id: d.id,
      date: asString(data.date) || asString(data.transactionDate),
      type: asString(data.type),
      category: asString(data.category),
      description: asString(data.description) || asString(data.memo) || asString(data.note),
      amount: typeof data.amount === "number" ? data.amount : Math.max(income, expense),
      incomeAmount: income,
      expenseAmount: expense,
      memberId: asString(data.memberId) || null,
      note: asString(data.note) || null,
      linkedDuesDetailId: asString(data.linkedDuesDetailId) || null,
    } satisfies Transaction;
  });
  rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
  });
  if (limitCount != null && limitCount > 0) {
    return rows.slice(0, limitCount);
  }
  return rows;
}
