import type { Transaction, YearBalance, YearBalances } from "./types";

/** 앱 `ClubCategory.TRANSFER` 와 동일 — 통장 잔액 합산에서 제외 */
export const TRANSFER_CATEGORY = "자금 이동/계좌 이체";

/** 한우리 실데이터 최초 전표 연도. 연도 스캔·재계산 하한 */
export const FIRST_LEDGER_YEAR = 2011;

export function isTransferCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const c = category.trim();
  return c === TRANSFER_CATEGORY || c.startsWith("자금 이동");
}

export function sanitizeInitialBalance(
  initialBalance: number | null | undefined
): number {
  return typeof initialBalance === "number" && initialBalance > 0
    ? initialBalance
    : 0;
}

export function yearFromIsoDate(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

/**
 * 운영 잔액 = (기초잔액≥0) + Σ수입 − Σ지출 (계좌 이체 제외).
 * 연도 단위로 쓸 때는 initialBalance 자리에 그 해 openingBalance 를 넣는다.
 * 한우리 시드는 이월금이 첫 수입 전표이므로 절대 기초(initialBalance)는 보통 0.
 */
export function computeOperatingBalance(
  transactions: Transaction[],
  initialBalance: number | null = 0
): number {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (isTransferCategory(tx.category)) continue;
    income += Math.max(0, tx.incomeAmount || 0);
    expense += Math.max(0, tx.expenseAmount || 0);
  }
  return sanitizeInitialBalance(initialBalance) + income - expense;
}

/** 전년도 기말 → 당해 기초. 없으면 절대 기초(initialBalance). */
export function resolveYearOpening(
  year: number,
  yearBalances: YearBalances | null | undefined,
  initialBalance: number | null | undefined
): number {
  const map = yearBalances || {};
  const prev = map[String(year - 1)];
  if (prev && typeof prev.closingBalance === "number") {
    return prev.closingBalance;
  }
  const self = map[String(year)];
  if (self && typeof self.openingBalance === "number") {
    return self.openingBalance;
  }
  const earlier = Object.keys(map)
    .map(Number)
    .filter((y) => Number.isFinite(y) && y < year)
    .sort((a, b) => b - a);
  if (earlier.length > 0) {
    const last = map[String(earlier[0]!)];
    if (last && typeof last.closingBalance === "number") {
      return last.closingBalance;
    }
  }
  return sanitizeInitialBalance(initialBalance);
}

/**
 * 메모리상 전체(또는 다년도) 전표로 연도별 기초/기말 맵을 만든다.
 * 특수 작업·테스트용. 연도 루프는 오름차순 BS 이월.
 */
export function buildYearBalancesFromTransactions(
  transactions: Transaction[],
  initialBalance: number | null | undefined,
  options?: { fromYear?: number; toYear?: number }
): { yearBalances: YearBalances; currentBalance: number } {
  const yearsInTx = new Set<number>();
  for (const tx of transactions) {
    const y = yearFromIsoDate(tx.date);
    if (y != null) yearsInTx.add(y);
  }

  const fromYear =
    options?.fromYear ??
    (yearsInTx.size > 0
      ? Math.min(...yearsInTx)
      : FIRST_LEDGER_YEAR);
  const toYear =
    options?.toYear ??
    (yearsInTx.size > 0
      ? Math.max(...yearsInTx)
      : fromYear);

  const byYear = new Map<number, Transaction[]>();
  for (const tx of transactions) {
    const y = yearFromIsoDate(tx.date);
    if (y == null || y < fromYear || y > toYear) continue;
    const list = byYear.get(y) || [];
    list.push(tx);
    byYear.set(y, list);
  }

  const yearBalances: YearBalances = {};
  let opening = sanitizeInitialBalance(initialBalance);
  let currentBalance = opening;

  for (let year = fromYear; year <= toYear; year += 1) {
    const yearTxs = byYear.get(year) || [];
    // 중간 빈 연도는 맵에 넣지 않고 opening만 유지 (다음 활동 연도로 이월)
    if (yearTxs.length === 0 && year < toYear) {
      continue;
    }
    const closing = computeOperatingBalance(yearTxs, opening);
    yearBalances[String(year)] = {
      openingBalance: opening,
      closingBalance: closing,
    } satisfies YearBalance;
    opening = closing;
    currentBalance = closing;
  }

  return { yearBalances, currentBalance };
}

/** 저장된 연도 맵에서 「현재 잔액」= 가장 늦은 연도의 기말 */
export function currentBalanceFromYearBalances(
  yearBalances: YearBalances | null | undefined,
  fallback: number | null | undefined = 0
): number {
  if (!yearBalances) return sanitizeInitialBalance(fallback);
  const years = Object.keys(yearBalances)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);
  if (years.length === 0) return sanitizeInitialBalance(fallback);
  const latest = yearBalances[String(years[0]!)];
  if (latest && typeof latest.closingBalance === "number") {
    return latest.closingBalance;
  }
  return sanitizeInitialBalance(fallback);
}

export function yearBalanceEntry(
  yearBalances: YearBalances | null | undefined,
  year: number
): YearBalance | null {
  const entry = yearBalances?.[String(year)];
  if (!entry) return null;
  if (
    typeof entry.openingBalance !== "number" ||
    typeof entry.closingBalance !== "number"
  ) {
    return null;
  }
  return entry;
}

/** yearBalances 가 없거나 currentBalance 와 최신 기말이 어긋나면 재계산 필요 */
export function needsYearBalanceRebuild(
  yearBalances: YearBalances | null | undefined,
  currentBalance: number | null | undefined
): boolean {
  if (!yearBalances || Object.keys(yearBalances).length === 0) return true;
  if (currentBalance == null) return false;
  const derived = currentBalanceFromYearBalances(yearBalances, currentBalance);
  return derived !== currentBalance;
}
