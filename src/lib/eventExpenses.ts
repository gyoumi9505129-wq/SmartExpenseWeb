import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type { EventExpense, Member, Transaction } from "./types";

/** 앱 EventSubCategory.all 과 동일 */
export const EVENT_SUB_CATEGORIES = [
  "본인 결혼",
  "자녀 결혼",
  "부모 회갑/고희",
  "출산",
  "자녀 돌",
  "부모상",
  "본인상",
  "배우자상",
  "기타",
] as const;

export const CONDOLENCE_CATEGORY = "경조사비 (회원 화환, 축의금/조의금 등)";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function isCondolenceCategory(
  category: string | null | undefined
): boolean {
  if (!category) return false;
  const c = category.trim();
  return (
    c.startsWith("경조사비") ||
    c === "경조비" ||
    c.includes("경조사")
  );
}

export async function fetchEventExpenses(
  meetingId: string
): Promise<EventExpense[]> {
  const snap = await getDocs(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.EVENT_EXPENSES
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      memberId: asString(data.memberId),
      date: asString(data.date),
      eventSubCategory: asString(data.eventSubCategory) || "기타",
      amount: asNumber(data.amount),
      note: asString(data.note),
      linkedTransactionId: asString(data.linkedTransactionId) || null,
      isSeedOnly: data.isSeedOnly === true,
    } satisfies EventExpense;
  });
}

async function findEventExpenseByTransactionId(
  meetingId: string,
  transactionId: string
): Promise<{ id: string } | null> {
  if (!transactionId) return null;
  const snap = await getDocs(
    query(
      collection(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.EVENT_EXPENSES
      ),
      where("linkedTransactionId", "==", transactionId)
    )
  );
  const d = snap.docs[0];
  return d ? { id: d.id } : null;
}

/**
 * 장부 경조사비 지출 ↔ eventExpenses 실시간 동기화 (앱 EventExpenseRepository.syncFromLedgerTransaction)
 */
export async function syncEventExpenseFromLedger(params: {
  meetingId: string;
  transactionId: string;
  memberId: string;
  date: string;
  amount: number;
  note: string;
  eventSubCategory?: string;
}): Promise<void> {
  const {
    meetingId,
    transactionId,
    memberId,
    date,
    amount,
    note,
    eventSubCategory = "기타",
  } = params;
  if (!memberId || amount <= 0 || !transactionId) return;

  const existing = await findEventExpenseByTransactionId(
    meetingId,
    transactionId
  );
  const payload = {
    memberId,
    date,
    eventSubCategory: eventSubCategory.trim() || "기타",
    amount: Math.floor(amount),
    note: note || "",
    linkedTransactionId: transactionId,
    isSeedOnly: false,
  };

  if (existing) {
    await updateDoc(
      doc(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.EVENT_EXPENSES,
        existing.id
      ),
      payload
    );
  } else {
    await addDoc(
      collection(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.EVENT_EXPENSES
      ),
      payload
    );
  }
}

/** 장부 삭제 시 연결 경조 도메인 행 제거 */
export async function deleteEventExpenseByTransactionId(
  meetingId: string,
  transactionId: string
): Promise<void> {
  const existing = await findEventExpenseByTransactionId(
    meetingId,
    transactionId
  );
  if (!existing) return;
  await deleteDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.EVENT_EXPENSES,
      existing.id
    )
  );
}

/**
 * 클라우드 `eventExpenses`가 비어 있으면 장부 경조사비 지출로 집계 (조회용 폴백).
 */
export function eventExpensesFromLedger(
  transactions: Transaction[]
): EventExpense[] {
  return transactions
    .filter(
      (tx) =>
        isCondolenceCategory(tx.category) &&
        (tx.expenseAmount > 0 || tx.amount > 0) &&
        Boolean(tx.memberId)
    )
    .map((tx) => ({
      id: `ledger-${tx.id}`,
      memberId: tx.memberId || "",
      date: tx.date,
      eventSubCategory: "기타",
      amount: tx.expenseAmount || tx.amount || 0,
      note: tx.note || tx.description || "",
      linkedTransactionId: tx.id,
      isSeedOnly: false,
    }));
}

export type MemberEventSummary = {
  memberId: string;
  memberName: string;
  memberStatus: string;
  totalAmount: number;
  details: {
    date: string;
    eventSubCategory: string;
    amount: number;
    note: string;
  }[];
};

export function buildEventSummaries(
  expenses: EventExpense[],
  members: Member[]
): { total: number; members: MemberEventSummary[] } {
  const nameById = new Map(members.map((m) => [m.id, m]));
  const byMember = new Map<string, EventExpense[]>();

  for (const row of expenses) {
    if (!row.memberId || row.amount <= 0) continue;
    const list = byMember.get(row.memberId) || [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  const summaries: MemberEventSummary[] = [];
  let total = 0;

  for (const [memberId, rows] of byMember) {
    const member = nameById.get(memberId);
    const details = [...rows]
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      })
      .map((r) => ({
        date: r.date,
        eventSubCategory: r.eventSubCategory || "미분류",
        amount: r.amount,
        note: r.note,
      }));
    const sum = details.reduce((acc, d) => acc + d.amount, 0);
    total += sum;
    summaries.push({
      memberId,
      memberName: member?.name || "(회원 없음)",
      memberStatus: member?.status || "ACTIVE",
      totalAmount: sum,
      details,
    });
  }

  summaries.sort((a, b) => {
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    return a.memberName.localeCompare(b.memberName, "ko");
  });

  return { total, members: summaries };
}
