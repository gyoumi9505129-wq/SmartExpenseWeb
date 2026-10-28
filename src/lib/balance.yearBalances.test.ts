import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildYearBalancesFromTransactions,
  computeOperatingBalance,
  currentBalanceFromYearBalances,
  needsYearBalanceRebuild,
  resolveYearOpening,
} from "./balance";
import type { Transaction } from "./types";

function tx(
  partial: Partial<Transaction> & Pick<Transaction, "id" | "date">
): Transaction {
  return {
    type: "INCOME",
    category: "기타 수입",
    description: "",
    amount: 0,
    incomeAmount: 0,
    expenseAmount: 0,
    ...partial,
  };
}

describe("yearBalances BS carryforward", () => {
  it("전년도 기말이 다음 해 기초가 된다", () => {
    const rows: Transaction[] = [
      tx({
        id: "1",
        date: "2024-06-01",
        type: "INCOME",
        incomeAmount: 1_000_000,
        amount: 1_000_000,
      }),
      tx({
        id: "2",
        date: "2024-12-01",
        type: "EXPENSE",
        expenseAmount: 200_000,
        amount: 200_000,
        category: "기타 지출",
      }),
      tx({
        id: "3",
        date: "2025-03-01",
        type: "INCOME",
        incomeAmount: 100_000,
        amount: 100_000,
      }),
    ];

    const { yearBalances, currentBalance } = buildYearBalancesFromTransactions(
      rows,
      0,
      { fromYear: 2024, toYear: 2025 }
    );

    assert.equal(yearBalances["2024"]?.openingBalance, 0);
    assert.equal(yearBalances["2024"]?.closingBalance, 800_000);
    assert.equal(yearBalances["2025"]?.openingBalance, 800_000);
    assert.equal(yearBalances["2025"]?.closingBalance, 900_000);
    assert.equal(currentBalance, 900_000);
    assert.equal(resolveYearOpening(2025, yearBalances, 0), 800_000);
    assert.equal(
      currentBalanceFromYearBalances(yearBalances, 0),
      900_000
    );
  });

  it("계좌 이체는 잔액에서 제외한다", () => {
    const rows: Transaction[] = [
      tx({
        id: "1",
        date: "2026-01-10",
        type: "INCOME",
        incomeAmount: 500_000,
        amount: 500_000,
      }),
      tx({
        id: "2",
        date: "2026-01-11",
        type: "EXPENSE",
        expenseAmount: 500_000,
        amount: 500_000,
        category: "자금 이동/계좌 이체",
      }),
    ];
    const { yearBalances } = buildYearBalancesFromTransactions(rows, 0, {
      fromYear: 2026,
      toYear: 2026,
    });
    assert.equal(yearBalances["2026"]?.closingBalance, 500_000);
  });

  it("initialBalance 절대 기초를 첫 해 opening에 반영한다", () => {
    const rows: Transaction[] = [
      tx({
        id: "1",
        date: "2023-01-01",
        type: "INCOME",
        incomeAmount: 50,
        amount: 50,
      }),
    ];
    const { yearBalances } = buildYearBalancesFromTransactions(rows, 1000, {
      fromYear: 2023,
      toYear: 2023,
    });
    assert.equal(yearBalances["2023"]?.openingBalance, 1000);
    assert.equal(yearBalances["2023"]?.closingBalance, 1050);
  });

  it("연도 맵과 currentBalance 불일치 시 재구축이 필요하다", () => {
    assert.equal(needsYearBalanceRebuild({}, 100), true);
    assert.equal(
      needsYearBalanceRebuild(
        { "2026": { openingBalance: 0, closingBalance: 100 } },
        100
      ),
      false
    );
    assert.equal(
      needsYearBalanceRebuild(
        { "2026": { openingBalance: 0, closingBalance: 90 } },
        100
      ),
      true
    );
  });

  it("당해 전표만으로도 opening+합산이 전체 합산과 같다", () => {
    const all: Transaction[] = [
      tx({
        id: "a",
        date: "2024-01-01",
        incomeAmount: 100,
        amount: 100,
      }),
      tx({
        id: "b",
        date: "2025-01-01",
        incomeAmount: 40,
        amount: 40,
      }),
      tx({
        id: "c",
        date: "2025-06-01",
        type: "EXPENSE",
        expenseAmount: 10,
        amount: 10,
        category: "기타 지출",
      }),
    ];
    const { yearBalances, currentBalance } = buildYearBalancesFromTransactions(
      all,
      0,
      { fromYear: 2024, toYear: 2025 }
    );
    const y2025 = all.filter((t) => t.date.startsWith("2025-"));
    const opening = yearBalances["2025"]!.openingBalance;
    assert.equal(
      computeOperatingBalance(y2025, opening),
      yearBalances["2025"]!.closingBalance
    );
    assert.equal(currentBalance, computeOperatingBalance(all, 0));
  });
});
