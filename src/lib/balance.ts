import type { Transaction } from "./types";

/** 앱 `ClubCategory.TRANSFER` 와 동일 — 통장 잔액 합산에서 제외 */
export const TRANSFER_CATEGORY = "자금 이동/계좌 이체";

export function isTransferCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const c = category.trim();
  return c === TRANSFER_CATEGORY || c.startsWith("자금 이동");
}

/**
 * 운영 잔액 = (기초잔액≥0) + Σ수입 − Σ지출 (계좌 이체 제외).
 * 한우리 시드는 이월금이 첫 수입 전표이므로 initialBalance 는 보통 0.
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
  const initial =
    typeof initialBalance === "number" && initialBalance > 0 ? initialBalance : 0;
  return initial + income - expense;
}
