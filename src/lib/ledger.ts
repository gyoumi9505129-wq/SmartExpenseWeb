import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { computeOperatingBalance } from "./balance";
import { getFirebaseDb } from "./firebase";
import { fetchTransactions } from "./meetings";
import { COLLECTIONS } from "./paths";
import type { Transaction } from "./types";

export type LedgerInput = {
  date: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  description: string;
  amount: number;
  memberId?: string | null;
  linkedDuesDetailId?: string | null;
};

function toPayload(input: LedgerInput) {
  const amount = Math.max(0, Math.floor(input.amount));
  const incomeAmount = input.type === "INCOME" ? amount : 0;
  const expenseAmount = input.type === "EXPENSE" ? amount : 0;
  return {
    date: input.date,
    type: input.type,
    category: input.category,
    description: input.description,
    note: input.description,
    amount,
    incomeAmount,
    expenseAmount,
    memberId: input.memberId ?? null,
    linkedDuesDetailId: input.linkedDuesDetailId ?? null,
  };
}

/** 전체 장부로 잔액을 다시 합산해 meetings.currentBalance 에 기록 (앱과 동일 SSOT) */
export async function syncMeetingBalance(
  meetingId: string,
  initialBalance: number | null = 0
): Promise<number> {
  const txs = await fetchTransactions(meetingId);
  const fresh = computeOperatingBalance(txs, initialBalance);
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId), {
    currentBalance: fresh,
  });
  return fresh;
}

export async function createTransaction(
  meetingId: string,
  input: LedgerInput
): Promise<string> {
  const payload = toPayload(input);
  const ref = await addDoc(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.TRANSACTIONS
    ),
    payload
  );
  await syncMeetingBalance(meetingId);
  return ref.id;
}

export async function updateTransaction(
  meetingId: string,
  previous: Transaction,
  input: LedgerInput
): Promise<void> {
  const payload = toPayload(input);
  await updateDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.TRANSACTIONS,
      previous.id
    ),
    payload
  );
  await syncMeetingBalance(meetingId);
}

export async function deleteTransaction(
  meetingId: string,
  previous: Transaction
): Promise<void> {
  await deleteTransactionById(meetingId, previous.id);
}

export async function deleteTransactionById(
  meetingId: string,
  transactionId: string
): Promise<void> {
  if (!transactionId) return;
  await deleteDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.TRANSACTIONS,
      transactionId
    )
  );
  await syncMeetingBalance(meetingId);
}
