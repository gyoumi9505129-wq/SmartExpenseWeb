import { isTransferCategory } from "./balance";
import { shortCategory } from "./categories";
import { currentSystemYear } from "./duesSync";
import type { DuesRecord, Transaction } from "./types";

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
  transactions: Transaction[],
  dues: DuesRecord[]
): number[] {
  const set = new Set<number>();
  const now = currentSystemYear();
  set.add(now);
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

export function buildYearlyReport(
  year: number,
  transactions: Transaction[],
  dues: DuesRecord[],
  initialBalance: number | null = 0
): YearlyReport {
  const yearPrefix = `${year}-`;
  const yearEnd = `${year}-12-31`;
  let ledgerIncome = 0;
  let ledgerExpense = 0;
  let cumIncome = 0;
  let cumExpense = 0;
  const byCategory = new Map<string, { income: number; expense: number }>();
  const transfers: TransferSummary[] = [];

  for (const tx of transactions) {
    const isTransfer = isTransferCategory(tx.category);
    const income = Math.max(0, tx.incomeAmount || 0);
    const expense = Math.max(0, tx.expenseAmount || 0);
    const inYear = tx.date.startsWith(yearPrefix);
    const upToYearEnd = tx.date <= yearEnd;

    if (isTransfer) {
      if (inYear && expense > 0) {
        transfers.push({
          id: tx.id,
          date: tx.date,
          amount: expense,
          note: tx.note || tx.description || "",
        });
      }
      continue;
    }

    if (inYear) {
      ledgerIncome += income;
      ledgerExpense += expense;
      const key = tx.category || "미분류";
      const cur = byCategory.get(key) || { income: 0, expense: 0 };
      cur.income += income;
      cur.expense += expense;
      byCategory.set(key, cur);
    }

    if (upToYearEnd) {
      cumIncome += income;
      cumExpense += expense;
    }
  }

  const initial =
    typeof initialBalance === "number" && initialBalance > 0
      ? initialBalance
      : 0;
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
    yearEndBalance: initial + cumIncome - cumExpense,
    categorySummaries,
    transfers,
    isEmpty:
      duesTotal === 0 &&
      ledgerIncome === 0 &&
      ledgerExpense === 0 &&
      categorySummaries.length === 0,
  };
}
