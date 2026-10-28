import {
  currentBalanceFromYearBalances,
  isTransferCategory,
  yearBalanceEntry,
} from "./balance";
import { shortCategory } from "./categories";
import { currentSystemYear } from "./duesSync";
import type { DuesRecord, Transaction, YearBalances } from "./types";

export type CategorySummary = {
  category: string;
  label: string;
  income: number;
  expense: number;
  color: string;
};

export type TransferSummary = {
  id: string;
  date: string;
  amount: number;
  note: string;
};

export type YearlyReport = {
  year: number;
  duesTotal: number;
  ledgerIncome: number;
  ledgerExpense: number;
  /** 해당 연도 말 BS 잔액 (전년 이월 + 당해 운영) */
  yearEndBalance: number;
  categorySummaries: CategorySummary[];
  transfers: TransferSummary[];
  isEmpty: boolean;
};

const CATEGORY_COLORS: Record<string, string> = {
  "정기 회비": "#2563eb",
  "찬조금/특별 회비": "#0ea5e9",
  "이자/수익": "#ca8a04",
  "기타 수입": "#7c3aed",
  "식대/다과비": "#dc2626",
  "장소 대관료": "#ea580c",
  "행사/진행비": "#d97706",
  "비품/소모품비": "#0891b2",
  "경조사비": "#3b82f6",
  "교통/통신비": "#64748b",
  "기타 지출": "#71717a",
  "자금 이동": "#9333ea",
};

function colorForCategory(category: string): string {
  const short = shortCategory(category);
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (short.startsWith(key) || category.startsWith(key)) return color;
  }
  return "#52525b";
}

function yearFromDate(date: string): number | null {
  if (!date || date.length < 4) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function availableReportYears(
  yearBalances: YearBalances | null | undefined,
  transactions: Transaction[],
  dues: DuesRecord[]
): number[] {
  const set = new Set<number>();
  const now = currentSystemYear();
  set.add(now);
  if (yearBalances) {
    for (const key of Object.keys(yearBalances)) {
      const y = Number(key);
      if (y >= 2011 && y <= now) set.add(y);
    }
  }
  for (const tx of transactions) {
    const y = yearFromDate(tx.date);
    if (y != null && y >= 2011 && y <= now) set.add(y);
  }
  for (const d of dues) {
    if (d.year >= 2011 && d.year <= now) set.add(d.year);
  }
  return [...set].sort((a, b) => b - a);
}

function duesPaidForYear(dues: DuesRecord[], year: number): number {
  let sum = 0;
  for (const row of dues) {
    if (row.year !== year) continue;
    for (const detail of row.details) {
      if (!detail.isExcluded && detail.paidAmount > 0) {
        sum += detail.paidAmount;
      }
    }
  }
  return sum;
}

/**
 * 결산. transactions 는 해당 연도(또는 그 이상) 전표.
 * yearEndBalance 는 yearBalances[year].closing 을 우선하고,
 * 없으면 opening + 당해 수입−지출로 계산.
 */
export function buildYearlyReport(
  year: number,
  transactions: Transaction[],
  dues: DuesRecord[],
  options?: {
    yearBalances?: YearBalances | null;
    initialBalance?: number | null;
    yearOpening?: number | null;
  }
): YearlyReport {
  const yearPrefix = `${year}-`;
  let ledgerIncome = 0;
  let ledgerExpense = 0;
  const byCategory = new Map<string, { income: number; expense: number }>();
  const transfers: TransferSummary[] = [];

  for (const tx of transactions) {
    if (!tx.date.startsWith(yearPrefix)) continue;
    const isTransfer = isTransferCategory(tx.category);
    const income = Math.max(0, tx.incomeAmount || 0);
    const expense = Math.max(0, tx.expenseAmount || 0);

    if (isTransfer) {
      if (expense > 0) {
        transfers.push({
          id: tx.id,
          date: tx.date,
          amount: expense,
          note: tx.note || tx.description || "",
        });
      }
      continue;
    }

    ledgerIncome += income;
    ledgerExpense += expense;
    const key = tx.category || "미분류";
    const cur = byCategory.get(key) || { income: 0, expense: 0 };
    cur.income += income;
    cur.expense += expense;
    byCategory.set(key, cur);
  }

  const stored = yearBalanceEntry(options?.yearBalances, year);
  const opening =
    stored?.openingBalance ??
    (typeof options?.yearOpening === "number"
      ? options.yearOpening
      : resolveFallbackOpening(year, options));

  const yearEndBalance =
    stored?.closingBalance ?? opening + ledgerIncome - ledgerExpense;

  const duesTotal = duesPaidForYear(dues, year);
  const categorySummaries: CategorySummary[] = [...byCategory.entries()]
    .map(([category, amounts]) => ({
      category,
      label: shortCategory(category) || category,
      income: amounts.income,
      expense: amounts.expense,
      color: colorForCategory(category),
    }))
    .sort((a, b) => {
      const aTotal = a.income + a.expense;
      const bTotal = b.income + b.expense;
      return bTotal - aTotal;
    });

  transfers.sort((a, b) => b.date.localeCompare(a.date));

  return {
    year,
    duesTotal,
    ledgerIncome,
    ledgerExpense,
    yearEndBalance,
    categorySummaries,
    transfers,
    isEmpty:
      duesTotal === 0 &&
      ledgerIncome === 0 &&
      ledgerExpense === 0 &&
      categorySummaries.length === 0,
  };
}

function resolveFallbackOpening(
  year: number,
  options?: {
    yearBalances?: YearBalances | null;
    initialBalance?: number | null;
  }
): number {
  if (options?.yearBalances) {
    const earlier = Object.keys(options.yearBalances)
      .map(Number)
      .filter((y) => y < year)
      .sort((a, b) => b - a);
    if (earlier.length > 0) {
      return (
        options.yearBalances[String(earlier[0]!)]?.closingBalance ??
        currentBalanceFromYearBalances(
          options.yearBalances,
          options.initialBalance
        )
      );
    }
  }
  return typeof options?.initialBalance === "number" &&
    options.initialBalance > 0
    ? options.initialBalance
    : 0;
}
