import {
  addDoc,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { moneyNumber, todayIsoDate } from "./format";
import {
  buildDuesPaymentNote,
  detailRemaining,
  REGULAR_DUES_CATEGORY,
} from "./duesSync";
import { createTransaction, deleteTransaction, deleteTransactionById, type LedgerInput } from "./ledger";
import { fetchTransactions } from "./meetings";
import { COLLECTIONS } from "./paths";
import type {
  DuesDetail,
  DuesPayment,
  DuesRecord,
  Member,
  Transaction,
  UnpaidDuesOption,
} from "./types";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function mapDetail(raw: Record<string, unknown>): DuesDetail {
  const paymentsRaw = Array.isArray(raw.payments) ? raw.payments : [];
  const payments: DuesPayment[] = [];
  for (const item of paymentsRaw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    payments.push({
      payDate: asString(p.payDate),
      amount: moneyNumber(p.amount),
      linkedTransactionId:
        typeof p.linkedTransactionId === "string"
          ? p.linkedTransactionId
          : null,
    });
  }

  const amount = moneyNumber(raw.amount);
  const paymentSum = payments
    .filter((p) => p.amount > 0)
    .reduce((s, p) => s + p.amount, 0);
  // payments[] 가 있으면 paidAmount 보다 우선 (분납 이력 누락 방지)
  const paidAmount = Math.max(moneyNumber(raw.paidAmount), paymentSum);
  const isExcluded = raw.isExcluded === true;
  const isPaid =
    !isExcluded &&
    (raw.isPaid === true || (amount > 0 && paidAmount >= amount));

  return {
    id: asString(raw.id) || crypto.randomUUID(),
    termLabel: asString(raw.termLabel) || "연간",
    amount,
    paidAmount,
    isPaid,
    isExcluded,
    payDate:
      asString(raw.payDate) ||
      payments
        .filter((p) => p.payDate)
        .sort((a, b) => a.payDate.localeCompare(b.payDate))
        .at(-1)?.payDate ||
      "",
    payments,
  };
}

function statusOf(paid: number, target: number, excluded: boolean): string {
  if (excluded) return "제외";
  if (target <= 0) return "미설정";
  if (paid >= target) return "완납";
  if (paid > 0) return "분납";
  return "미납";
}

function serializeDetails(details: DuesDetail[]) {
  return details.map((d) => ({
    id: d.id,
    termLabel: d.termLabel,
    amount: d.amount,
    paidAmount: d.paidAmount,
    isPaid: d.isPaid,
    isExcluded: d.isExcluded,
    payDate: d.payDate,
    payments: d.payments.map((p) => ({
      payDate: p.payDate,
      amount: p.amount,
      linkedTransactionId: p.linkedTransactionId ?? null,
    })),
  }));
}

function defaultDetails(
  paymentMethod: string,
  year: number,
  totalTargetAmount: number,
  termDates?: { firstHalf?: string; secondHalf?: string; yearly?: string }
): DuesDetail[] {
  const method = paymentMethod.toUpperCase();
  if (method === "HALF_YEARLY") {
    const half = Math.floor(totalTargetAmount / 2);
    const second = totalTargetAmount - half;
    return [
      {
        id: crypto.randomUUID(),
        termLabel: "상반기",
        amount: half,
        paidAmount: 0,
        isPaid: false,
        isExcluded: false,
        payDate: termDates?.firstHalf || `${year}-01-01`,
        payments: [],
      },
      {
        id: crypto.randomUUID(),
        termLabel: "하반기",
        amount: second,
        paidAmount: 0,
        isPaid: false,
        isExcluded: false,
        payDate: termDates?.secondHalf || `${year}-07-01`,
        payments: [],
      },
    ];
  }
  return [
    {
      id: crypto.randomUUID(),
      termLabel: "연간",
      amount: totalTargetAmount,
      paidAmount: 0,
      isPaid: false,
      isExcluded: false,
      payDate: termDates?.yearly || `${year}-01-01`,
      payments: [],
    },
  ];
}

export async function fetchDues(
  meetingId: string,
  members: Member[]
): Promise<DuesRecord[]> {
  const snap = await getDocs(
    collection(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId, COLLECTIONS.DUES)
  );
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return snap.docs
    .map((d) => {
      const data = d.data();
      const detailsRaw = Array.isArray(data.details) ? data.details : [];
      const details = detailsRaw
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          return mapDetail(item as Record<string, unknown>);
        })
        .filter((x): x is DuesDetail => x != null);
      const memberId = asString(data.memberId);
      const totalTargetAmount = moneyNumber(data.totalTargetAmount);
      const paidFromDetails = details.reduce((s, x) => s + x.paidAmount, 0);
      const paidAmount =
        paidFromDetails > 0
          ? paidFromDetails
          : details.reduce(
              (s, x) => s + x.payments.reduce((ps, p) => ps + p.amount, 0),
              0
            );
      const excluded = details.length > 0 && details.every((x) => x.isExcluded);
      return {
        id: d.id,
        memberId,
        memberName: nameById.get(memberId) || memberId || "(회원 없음)",
        year: moneyNumber(data.year),
        totalTargetAmount,
        paymentMethod: asString(data.paymentMethod) || "YEARLY",
        details,
        paidAmount,
        status: statusOf(paidAmount, totalTargetAmount, excluded),
      } satisfies DuesRecord;
    })
    .sort((a, b) => b.year - a.year || a.memberName.localeCompare(b.memberName, "ko"));
}

export function listUnpaidOptionsForMember(
  dues: DuesRecord[],
  memberId: string
): UnpaidDuesOption[] {
  const out: UnpaidDuesOption[] = [];
  for (const row of dues) {
    if (row.memberId !== memberId) continue;
    for (const detail of row.details) {
      const remaining = detailRemaining(detail);
      if (remaining <= 0 || detail.isPaid) continue;
      out.push({
        duesId: row.id,
        detailId: detail.id,
        memberId: row.memberId,
        memberName: row.memberName,
        year: row.year,
        termLabel: detail.termLabel,
        amount: detail.amount,
        paidAmount: detail.paidAmount,
        remaining,
      });
    }
  }
  return out.sort(
    (a, b) => a.year - b.year || a.termLabel.localeCompare(b.termLabel, "ko")
  );
}

export function unpaidOptionLabel(opt: UnpaidDuesOption): string {
  if (opt.paidAmount > 0 && opt.remaining > 0) {
    return `${opt.year}년 ${opt.termLabel} · 잔여 ${opt.remaining.toLocaleString("ko-KR")}원`;
  }
  return `${opt.year}년 ${opt.termLabel} · ${opt.amount.toLocaleString("ko-KR")}원`;
}

export type DuesTermPaymentInput = {
  termLabel: string;
  /** 제외 회차 */
  isExcluded?: boolean;
  payDate?: string;
  /** true면 잔여(또는 전액) 완납 */
  markFullyPaid?: boolean;
  /** 부분 납부 금액(완납이 아닐 때) */
  additionalAmount?: number;
};

export async function createOrUpdateDues(params: {
  meetingId: string;
  duesId?: string;
  /** 수정 시 기존 회비(분납 이력 유지). 없으면 duesId 기준 신규 details 생성 */
  existing?: DuesRecord | null;
  memberId: string;
  memberName?: string;
  year: number;
  totalTargetAmount: number;
  paymentMethod?: string;
  termDates?: { firstHalf?: string; secondHalf?: string; yearly?: string };
  /** 등록/수정 시 이번에 반영할 회차별 납부(완납·부분납·제외) */
  termPayments?: DuesTermPaymentInput[];
}): Promise<string> {
  const {
    meetingId,
    duesId,
    existing,
    memberId,
    memberName = "",
    year,
    totalTargetAmount,
    paymentMethod = "HALF_YEARLY",
    termDates,
    termPayments,
  } = params;
  const db = getFirebaseDb();
  const col = collection(db, COLLECTIONS.MEETINGS, meetingId, COLLECTIONS.DUES);
  const name = memberName || existing?.memberName || "";

  // 기존 회비면 details·분납 이력을 유지한 채 메타만 갱신
  let details: DuesDetail[] =
    existing?.details.map((d) => ({
      ...d,
      payments: [...d.payments],
    })) ??
    defaultDetails(paymentMethod, year, totalTargetAmount, termDates);

  if (termPayments?.length) {
    const byLabel = new Map(termPayments.map((t) => [t.termLabel, t]));
    details = details.map((d) => {
      const tip = byLabel.get(d.termLabel);
      if (!tip) return d;
      if (tip.isExcluded) {
        return {
          ...d,
          isExcluded: true,
          isPaid: false,
          // 제외 시에도 기존 분납 이력은 남기지 않음(앱과 동일하게 미납 처리)
          paidAmount: 0,
          payDate: "",
          payments: [],
        };
      }
      return {
        ...d,
        isExcluded: false,
        payDate: tip.payDate || d.payDate,
      };
    });
  }

  let id = duesId || existing?.id;
  if (id) {
    await updateDoc(doc(col, id), {
      memberId,
      year,
      totalTargetAmount,
      paymentMethod: existing?.paymentMethod || paymentMethod,
      details: serializeDetails(details),
    });
  } else {
    const ref = await addDoc(col, {
      memberId,
      year,
      totalTargetAmount,
      paymentMethod,
      details: serializeDetails(details),
    });
    id = ref.id;
  }

  // 이번에 입력한 납부분만 장부 연동 (이미 납부된 금액은 remaining 에서 제외)
  if (termPayments?.length) {
    const draftRecord: DuesRecord = {
      id,
      memberId,
      memberName: name,
      year,
      totalTargetAmount,
      paymentMethod: existing?.paymentMethod || paymentMethod,
      details,
      paidAmount: details.reduce((s, d) => s + d.paidAmount, 0),
      status: "미납",
    };
    for (const tip of termPayments) {
      if (tip.isExcluded) continue;
      const detail = details.find((d) => d.termLabel === tip.termLabel);
      if (!detail || detail.isExcluded) continue;
      const remaining = Math.max(0, detail.amount - detail.paidAmount);
      if (remaining <= 0) continue;
      let payAmt = 0;
      if (tip.markFullyPaid) payAmt = remaining;
      else if (tip.additionalAmount && tip.additionalAmount > 0) {
        payAmt = Math.min(tip.additionalAmount, remaining);
      }
      if (payAmt <= 0) continue;
      const payDate = tip.payDate || todayIsoDate();
      const txId = await saveLedgerWithDuesPayment({
        meetingId,
        duesList: [draftRecord],
        memberId,
        memberName: name,
        detailId: detail.id,
        amount: payAmt,
        date: payDate,
      });
      const updated = draftRecord.details.find((d) => d.id === detail.id);
      if (updated) {
        updated.paidAmount += payAmt;
        updated.payments = [
          ...updated.payments,
          { payDate, amount: payAmt, linkedTransactionId: txId },
        ];
        updated.isPaid = updated.paidAmount >= updated.amount;
        updated.payDate = payDate;
      }
    }
  }

  return id;
}

async function writeDuesDoc(meetingId: string, dues: DuesRecord, details: DuesDetail[]) {
  await setDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.DUES,
      dues.id
    ),
    {
      memberId: dues.memberId,
      year: dues.year,
      totalTargetAmount: dues.totalTargetAmount,
      paymentMethod: dues.paymentMethod || "YEARLY",
      details: serializeDetails(details),
    },
    { merge: true }
  );
}

/** 회비 기수에 분납 추가 (장부 연동 ID 포함) */
async function appendInstallmentToDues(params: {
  meetingId: string;
  dues: DuesRecord;
  detailId: string;
  amount: number;
  payDate: string;
  linkedTransactionId: string | null;
}): Promise<void> {
  const { meetingId, dues, detailId, amount, payDate, linkedTransactionId } =
    params;
  if (amount <= 0) throw new Error("납부 금액은 0보다 커야 합니다.");
  const details = dues.details.map((d) => ({
    ...d,
    payments: [...d.payments],
  }));
  const target = details.find((d) => d.id === detailId);
  if (!target) throw new Error("선택한 회비 회차를 찾을 수 없습니다.");
  const remaining = detailRemaining(target);
  if (remaining <= 0) throw new Error("이미 완납된 회비입니다.");
  if (amount > remaining) {
    throw new Error(
      `잔여 회비(${remaining.toLocaleString("ko-KR")}원)를 초과할 수 없습니다.`
    );
  }
  target.payments.push({
    payDate,
    amount,
    linkedTransactionId,
  });
  target.paidAmount = target.paidAmount + amount;
  target.payDate = payDate;
  target.isPaid = target.paidAmount >= target.amount && target.amount > 0;
  await writeDuesDoc(meetingId, dues, details);
}

/** @deprecated 내부 appendInstallmentToDues 사용 — 외부 호환용 */
export async function appendDuesInstallment(params: {
  meetingId: string;
  dues: DuesRecord;
  detailId: string;
  amount: number;
  payDate: string;
  linkedTransactionId: string | null;
}): Promise<void> {
  return appendInstallmentToDues(params);
}

/** 분납에 대응하는 장부 수입 1건을 찾아 삭제 (링크 ID 또는 비고·일자·금액 매칭) */
async function deleteMatchingLedgerForInstallment(params: {
  meetingId: string;
  dues: DuesRecord;
  detailId: string;
  termLabel: string;
  payDate: string;
  amount: number;
  linkedTransactionId: string | null;
}): Promise<void> {
  const {
    meetingId,
    dues,
    detailId,
    termLabel,
    payDate,
    amount,
    linkedTransactionId,
  } = params;

  const txs = await fetchTransactions(meetingId);
  const expectedNote = buildDuesPaymentNote(
    dues.memberName,
    dues.year,
    termLabel
  );

  // 동일 일자·금액 분납이 여러 건일 수 있으므로 항상 장부 1건만 삭제
  let idToDelete: string | null = null;

  // 1) 명시 링크
  if (linkedTransactionId) {
    const byId = txs.find((t) => t.id === linkedTransactionId);
    if (byId) idToDelete = byId.id;
  }

  // 2) 회비 회차 링크 + 일자·금액 (1건만)
  if (!idToDelete) {
    const byDetail = txs.filter(
      (t) =>
        t.linkedDuesDetailId === detailId &&
        (t.incomeAmount || 0) === amount &&
        (!payDate || payDate === "-" || t.date === payDate)
    );
    idToDelete = byDetail[0]?.id ?? null;
  }

  // 3) 비고·회원·일자·금액 (링크 누락 보정, 1건만)
  if (!idToDelete) {
    const matched = txs.filter((t) => {
      if ((t.incomeAmount || 0) !== amount) return false;
      if (payDate && payDate !== "-" && t.date !== payDate) return false;
      return isDuesLedgerCandidate(t, {
        expectedNote,
        memberName: dues.memberName,
        memberId: dues.memberId,
        year: dues.year,
        termLabel,
      });
    });
    idToDelete = matched[0]?.id ?? null;
  }

  if (idToDelete) {
    await deleteTransactionById(meetingId, idToDelete);
  }
}

function isDuesLedgerCandidate(
  t: Transaction,
  ctx: {
    expectedNote: string;
    memberName: string;
    memberId: string;
    year: number;
    termLabel: string;
  }
): boolean {
  const income = t.incomeAmount || 0;
  if (income <= 0) return false;
  if (t.memberId && ctx.memberId && t.memberId !== ctx.memberId) return false;
  const desc = (t.description || t.note || "").trim();
  const cat = (t.category || "").trim();
  if (desc === ctx.expectedNote) return true;
  return (
    desc.includes(ctx.memberName) &&
    desc.includes(String(ctx.year)) &&
    desc.includes(ctx.termLabel) &&
    (cat.includes("정기 회비") || desc.includes("회비 납부"))
  );
}

/** 회비 분납 1건 삭제 + 연결 장부 거래 삭제 */
export async function deleteDuesInstallment(params: {
  meetingId: string;
  dues: DuesRecord;
  detailId: string;
  /** detail.payments 배열 인덱스. payments 가 비어 있고 paidAmount 만 있는 레거시면 -1 */
  paymentIndex: number;
}): Promise<void> {
  const { meetingId, dues, detailId, paymentIndex } = params;
  const details = dues.details.map((d) => ({
    ...d,
    payments: [...d.payments],
  }));
  const target = details.find((d) => d.id === detailId);
  if (!target) throw new Error("선택한 회비 회차를 찾을 수 없습니다.");

  let removedPayDate = "";
  let removedAmount = 0;
  let linkedTxId: string | null = null;

  if (target.payments.length > 0) {
    if (paymentIndex < 0 || paymentIndex >= target.payments.length) {
      throw new Error("삭제할 분납 이력을 찾을 수 없습니다.");
    }
    const [removed] = target.payments.splice(paymentIndex, 1);
    removedPayDate = removed.payDate || "";
    removedAmount = removed.amount;
    linkedTxId = removed.linkedTransactionId ?? null;
  } else if (paymentIndex === -1 && target.paidAmount > 0) {
    removedPayDate = target.payDate || "";
    removedAmount = target.paidAmount;
    linkedTxId = null;
    target.paidAmount = 0;
    target.payDate = "";
    target.isPaid = false;
    target.payments = [];
    await writeDuesDoc(meetingId, dues, details);
    await deleteMatchingLedgerForInstallment({
      meetingId,
      dues,
      detailId,
      termLabel: target.termLabel,
      payDate: removedPayDate,
      amount: removedAmount,
      linkedTransactionId: linkedTxId,
    });
    await reconcileOrphanLedgersForDetail({
      meetingId,
      dues,
      detailId,
      termLabel: target.termLabel,
      remainingPayments: target.payments,
    });
    return;
  } else {
    throw new Error("삭제할 분납 이력을 찾을 수 없습니다.");
  }

  const paid = target.payments.reduce((s, p) => s + p.amount, 0);
  const payDate =
    target.payments
      .filter((p) => p.amount > 0 && p.payDate)
      .map((p) => p.payDate)
      .sort()
      .at(-1) || "";
  target.paidAmount = paid;
  target.payDate = payDate;
  target.isPaid =
    paid >= target.amount && target.amount > 0 && !target.isExcluded;

  await writeDuesDoc(meetingId, dues, details);

  await deleteMatchingLedgerForInstallment({
    meetingId,
    dues,
    detailId,
    termLabel: target.termLabel,
    payDate: removedPayDate,
    amount: removedAmount,
    linkedTransactionId: linkedTxId,
  });

  // 링크 누락으로 남은 동일 회차 장부 고아 전표 정리
  await reconcileOrphanLedgersForDetail({
    meetingId,
    dues,
    detailId,
    termLabel: target.termLabel,
    remainingPayments: target.payments,
  });
}

/** 회비 문서 전체 회차의 고아 장부 수입을 정리 (이력 화면 진입 시 보정용) */
export async function syncOrphanLedgersForDuesRecord(
  meetingId: string,
  dues: DuesRecord
): Promise<void> {
  for (const detail of dues.details) {
    if (detail.isExcluded) continue;
    await reconcileOrphanLedgersForDetail({
      meetingId,
      dues,
      detailId: detail.id,
      termLabel: detail.termLabel,
      remainingPayments: detail.payments.filter((p) => p.amount > 0),
    });
  }
}

/** 회비 회차에 남아 있지 않은 장부 수입(고아)을 제거 */
async function reconcileOrphanLedgersForDetail(params: {
  meetingId: string;
  dues: DuesRecord;
  detailId: string;
  termLabel: string;
  remainingPayments: { payDate: string; amount: number; linkedTransactionId?: string | null }[];
}): Promise<void> {
  const { meetingId, dues, detailId, termLabel, remainingPayments } = params;
  const txs = await fetchTransactions(meetingId);
  const expectedNote = buildDuesPaymentNote(
    dues.memberName,
    dues.year,
    termLabel
  );
  const keepIds = new Set(
    remainingPayments
      .map((p) => p.linkedTransactionId)
      .filter((id): id is string => !!id)
  );
  // 분납 건수만큼 장부를 남김 (동일 일자·금액 중복 허용)
  const keepSlots = remainingPayments.map(
    (p) => `${p.payDate}|${p.amount}`
  );

  const candidates = txs.filter((t) => {
    if (t.linkedDuesDetailId === detailId) return (t.incomeAmount || 0) > 0;
    return isDuesLedgerCandidate(t, {
      expectedNote,
      memberName: dues.memberName,
      memberId: dues.memberId,
      year: dues.year,
      termLabel,
    });
  });

  for (const t of candidates) {
    const key = `${t.date}|${t.incomeAmount}`;
    if (keepIds.has(t.id)) {
      // 링크로 유지해도 슬롯 1칸 소비 (동일 일자·금액 과다 보존 방지)
      const keyIdx = keepSlots.indexOf(key);
      if (keyIdx >= 0) keepSlots.splice(keyIdx, 1);
      continue;
    }
    const keyIdx = keepSlots.indexOf(key);
    if (keyIdx >= 0) {
      keepSlots.splice(keyIdx, 1);
      continue;
    }
    await deleteTransactionById(meetingId, t.id);
  }
}

/** 장부 거래 삭제 시 연결된 회비 분납 되돌리기 */
export async function revertDuesPaymentsForTransaction(
  meetingId: string,
  duesList: DuesRecord[],
  transactionId: string
): Promise<void> {
  for (const dues of duesList) {
    let changed = false;
    const details = dues.details.map((d) => {
      const kept = d.payments.filter(
        (p) => p.linkedTransactionId !== transactionId
      );
      if (kept.length === d.payments.length) return d;
      changed = true;
      const paid = kept.reduce((s, p) => s + p.amount, 0);
      const payDate =
        kept
          .filter((p) => p.amount > 0 && p.payDate)
          .map((p) => p.payDate)
          .sort()
          .at(-1) || "";
      return {
        ...d,
        payments: kept,
        paidAmount: paid,
        payDate,
        isPaid: paid >= d.amount && d.amount > 0 && !d.isExcluded,
      };
    });
    if (changed) await writeDuesDoc(meetingId, dues, details);
  }
}

/**
 * 장부에서 정기 회비 수입 저장 → 회비 분납 동기화 (앱과 동일)
 */
export async function saveLedgerWithDuesPayment(params: {
  meetingId: string;
  duesList: DuesRecord[];
  memberId: string;
  memberName: string;
  detailId: string;
  amount: number;
  date: string;
}): Promise<string> {
  const { meetingId, duesList, memberId, memberName, detailId, amount, date } =
    params;
  const dues = duesList.find((d) => d.details.some((x) => x.id === detailId));
  if (!dues || dues.memberId !== memberId) {
    throw new Error("선택한 회원과 회비 회차가 일치하지 않습니다.");
  }
  const detail = dues.details.find((d) => d.id === detailId)!;
  const remaining = detailRemaining(detail);
  if (remaining <= 0) throw new Error("이미 완납된 회비입니다.");
  if (amount > remaining) {
    throw new Error(
      `잔여 회비(${remaining.toLocaleString("ko-KR")}원)를 초과할 수 없습니다.`
    );
  }
  const description = buildDuesPaymentNote(
    memberName,
    dues.year,
    detail.termLabel
  );
  const input: LedgerInput = {
    date,
    type: "INCOME",
    category: REGULAR_DUES_CATEGORY,
    description,
    amount,
    memberId,
    linkedDuesDetailId: detailId,
  };
  const txId = await createTransaction(meetingId, input);
  await appendInstallmentToDues({
    meetingId,
    dues,
    detailId,
    amount,
    payDate: date,
    linkedTransactionId: txId,
  });
  return txId;
}

/**
 * 회비 탭에서 납부 → 장부 수입 자동 생성 + 회비 반영
 */
export async function recordDuesPaymentWithLedger(params: {
  meetingId: string;
  dues: DuesRecord;
  detailId?: string;
  amount: number;
  payDate?: string;
  memberName: string;
}): Promise<void> {
  const { meetingId, dues, amount, memberName } = params;
  const payDate = params.payDate || todayIsoDate();
  const detail =
    dues.details.find((d) => d.id === params.detailId) ||
    dues.details.find((d) => detailRemaining(d) > 0) ||
    dues.details[0];
  if (!detail) throw new Error("납부할 회비 회차가 없습니다.");
  await saveLedgerWithDuesPayment({
    meetingId,
    duesList: [dues],
    memberId: dues.memberId,
    memberName,
    detailId: detail.id,
    amount,
    date: payDate,
  });
}

/** @deprecated use recordDuesPaymentWithLedger */
export async function recordDuesPayment(params: {
  meetingId: string;
  dues: DuesRecord;
  amount: number;
  payDate?: string;
}): Promise<void> {
  await recordDuesPaymentWithLedger({
    ...params,
    memberName: params.dues.memberName,
  });
}

export async function deleteLedgerAndRevertDues(params: {
  meetingId: string;
  transaction: Transaction;
  duesList: DuesRecord[];
}): Promise<void> {
  const { meetingId, transaction, duesList } = params;
  await deleteTransaction(meetingId, transaction);
  await revertDuesPaymentsForTransaction(meetingId, duesList, transaction.id);
}
