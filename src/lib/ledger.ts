import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import {
  FIRST_LEDGER_YEAR,
  buildYearBalancesFromTransactions,
  computeOperatingBalance,
  needsYearBalanceRebuild,
  resolveYearOpening,
  sanitizeInitialBalance,
  yearFromIsoDate,
} from "./balance";
import { currentSystemYear } from "./duesSync";
import { getFirebaseDb } from "./firebase";
import {
  fetchMeeting,
  fetchTransactionById,
  fetchTransactions,
  fetchTransactionsForYear,
} from "./meetings";
import { COLLECTIONS } from "./paths";
import type { Meeting, Transaction, YearBalances } from "./types";

export type LedgerInput = {
  date: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  description: string;
  amount: number;
  memberId?: string | null;
  linkedDuesDetailId?: string | null;
};

export type BalanceSyncResult = {
  currentBalance: number;
  yearBalances: YearBalances;
  initialBalance: number;
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

async function persistBalances(
  meetingId: string,
  result: BalanceSyncResult
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId), {
    currentBalance: result.currentBalance,
    initialBalance: result.initialBalance,
    yearBalances: result.yearBalances,
  });
}

/**
 * 연도 단위 BS 이월로 yearBalances + currentBalance 를 재계산·저장.
 * - fromYear 이전 연도 맵은 유지하고, fromYear~toYear 만 다시 밟는다.
 * - 특수 작업(백업 복원·강제 재정산)도 동일 경로.
 */
export async function syncMeetingBalancesFromYear(
  meetingId: string,
  fromYear: number,
  options?: {
    initialBalance?: number | null;
    existingYearBalances?: YearBalances;
    toYear?: number;
  }
): Promise<BalanceSyncResult> {
  const meeting = await fetchMeeting(meetingId);
  if (!meeting) throw new Error("모임을 찾을 수 없습니다.");

  const initial = sanitizeInitialBalance(
    options?.initialBalance ?? meeting.initialBalance
  );
  const toYear = options?.toYear ?? Math.max(currentSystemYear(), fromYear);
  const startYear = Math.max(FIRST_LEDGER_YEAR, fromYear);

  const yearBalances: YearBalances = {
    ...(options?.existingYearBalances ?? meeting.yearBalances ?? {}),
  };

  // fromYear 이후 옛 항목 제거 후 재기록 (삭제된 연도 잔액 잔존 방지)
  for (const key of Object.keys(yearBalances)) {
    const y = Number(key);
    if (Number.isFinite(y) && y >= startYear) {
      delete yearBalances[key];
    }
  }

  let opening = resolveYearOpening(startYear, yearBalances, initial);

  for (let year = startYear; year <= toYear; year += 1) {
    const yearTxs = await fetchTransactionsForYear(meetingId, year);
    if (yearTxs.length === 0 && year < toYear) {
      // 중간 빈 연도: 맵에 남기지 않고 opening 유지
      continue;
    }
    const closing = computeOperatingBalance(yearTxs, opening);
    yearBalances[String(year)] = {
      openingBalance: opening,
      closingBalance: closing,
    };
    opening = closing;
  }

  // 현재 연도 키가 없으면(전표 없음) 직전 기말을 현재 연도 기초=기말로 기록
  const cy = currentSystemYear();
  if (!yearBalances[String(cy)]) {
    const open = resolveYearOpening(cy, yearBalances, initial);
    yearBalances[String(cy)] = {
      openingBalance: open,
      closingBalance: open,
    };
  }

  const years = Object.keys(yearBalances)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
  const currentBalance =
    years.length > 0
      ? yearBalances[String(years[0]!)]!.closingBalance
      : initial;

  const result: BalanceSyncResult = {
    currentBalance,
    yearBalances,
    initialBalance: initial,
  };
  await persistBalances(meetingId, result);
  return result;
}

/**
 * 전 기간 잔액 재구축.
 * 전체 전표 1회 조회로 연도 맵을 만든다 (연도별 N회 RTT보다 초기/복구에 유리).
 * CRUD 후 부분 갱신은 syncMeetingBalancesFromYear 를 쓴다.
 */
export async function rebuildMeetingYearBalances(
  meetingId: string,
  initialBalance?: number | null
): Promise<BalanceSyncResult> {
  return rebuildMeetingYearBalancesFromAllTxs(meetingId, initialBalance);
}

/**
 * 전체 전표를 한 번에 읽어 검증용으로 재계산 (단위 테스트·감사).
 * 운영 화면 경로에서는 쓰지 않는다.
 */
export async function rebuildMeetingYearBalancesFromAllTxs(
  meetingId: string,
  initialBalance?: number | null
): Promise<BalanceSyncResult> {
  const meeting = await fetchMeeting(meetingId);
  if (!meeting) throw new Error("모임을 찾을 수 없습니다.");
  const initial = sanitizeInitialBalance(
    initialBalance ?? meeting.initialBalance
  );
  const txs = await fetchTransactions(meetingId);
  const built = buildYearBalancesFromTransactions(txs, initial, {
    fromYear: FIRST_LEDGER_YEAR,
    toYear: currentSystemYear(),
  });
  // 현재 연도 보장
  const cy = currentSystemYear();
  if (!built.yearBalances[String(cy)]) {
    const open = resolveYearOpening(cy, built.yearBalances, initial);
    built.yearBalances[String(cy)] = {
      openingBalance: open,
      closingBalance: open,
    };
    built.currentBalance = open;
  }
  const result: BalanceSyncResult = {
    currentBalance: built.currentBalance,
    yearBalances: built.yearBalances,
    initialBalance: initial,
  };
  await persistBalances(meetingId, result);
  return result;
}

/** @deprecated 이름 호환 — 연도 이월 전체 재구축 */
export async function syncMeetingBalance(
  meetingId: string,
  initialBalance: number | null = 0
): Promise<number> {
  const result = await rebuildMeetingYearBalances(meetingId, initialBalance);
  return result.currentBalance;
}

/** yearBalances 부재·불일치 시 한 번 재구축. meeting 을 넘기면 재조회 생략. */
export async function ensureMeetingYearBalances(
  meetingId: string,
  knownMeeting?: Meeting | null
): Promise<BalanceSyncResult | null> {
  const meeting = knownMeeting ?? (await fetchMeeting(meetingId));
  if (!meeting) return null;
  if (
    !needsYearBalanceRebuild(meeting.yearBalances, meeting.currentBalance)
  ) {
    return {
      currentBalance: meeting.currentBalance ?? 0,
      yearBalances: meeting.yearBalances || {},
      initialBalance: sanitizeInitialBalance(meeting.initialBalance),
    };
  }
  return rebuildMeetingYearBalancesFromAllTxs(
    meetingId,
    meeting.initialBalance
  );
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
  const year = yearFromIsoDate(payload.date) ?? currentSystemYear();
  await syncMeetingBalancesFromYear(meetingId, year);
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
  const prevYear = yearFromIsoDate(previous.date) ?? currentSystemYear();
  const nextYear = yearFromIsoDate(payload.date) ?? currentSystemYear();
  await syncMeetingBalancesFromYear(
    meetingId,
    Math.min(prevYear, nextYear)
  );
}

export async function deleteTransaction(
  meetingId: string,
  previous: Transaction
): Promise<void> {
  await deleteTransactionById(meetingId, previous.id, previous.date);
}

export async function deleteTransactionById(
  meetingId: string,
  transactionId: string,
  knownDate?: string
): Promise<void> {
  if (!transactionId) return;
  let year = yearFromIsoDate(knownDate || "") ?? null;
  if (year == null) {
    const existing = await fetchTransactionById(meetingId, transactionId);
    year = yearFromIsoDate(existing?.date || "") ?? currentSystemYear();
  }
  await deleteDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.TRANSACTIONS,
      transactionId
    )
  );
  await syncMeetingBalancesFromYear(meetingId, year);
}
