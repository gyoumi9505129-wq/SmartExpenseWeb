import { collection, getDocs } from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type { EventExpense, Member, Transaction } from "./types";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function isCondolenceCategory(category: string | null | undefined): boolean {
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
