"use client";

import { useMemo, useState } from "react";
import { YearSelect } from "@/components/YearSelect";
import { currentSystemYear } from "@/lib/duesSync";
import { formatWon } from "@/lib/format";
import {
  availableReportYears,
  buildYearlyReport,
  type CategorySummary,
} from "@/lib/yearlyReport";
import type { DuesRecord, Transaction } from "@/lib/types";

type Props = {
  transactions: Transaction[];
  dues: DuesRecord[];
  initialBalance: number | null;
};

export function ReportPanel({
  transactions,
  dues,
  initialBalance,
}: Props) {
  const years = useMemo(
    () => availableReportYears(transactions, dues),
    [transactions, dues]
  );
  const [year, setYear] = useState(() => currentSystemYear());
  const [detailCategory, setDetailCategory] = useState<string | null>(null);

  const report = useMemo(
    () => buildYearlyReport(year, transactions, dues, initialBalance),
    [year, transactions, dues, initialBalance]
  );

  const detailItems = useMemo(() => {
    if (!detailCategory) return [];
    const prefix = `${year}-`;
    return transactions
      .filter(
        (tx) => tx.date.startsWith(prefix) && tx.category === detailCategory
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [detailCategory, year, transactions]);

  const incomeSlices = report.categorySummaries.filter((c) => c.income > 0);
  const expenseSlices = report.categorySummaries.filter((c) => c.expense > 0);

  const balanceColor =
    report.yearEndBalance > 0
      ? "text-blue-600"
      : report.yearEndBalance < 0
        ? "text-red-600"
        : "text-zinc-700";

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-600">
          연도
          <span className="ml-2 inline-block">
            <YearSelect value={year} onChange={setYear} years={years} />
          </span>
        </label>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-500">{year}년 결산</p>
        <dl className="mt-4 space-y-3 text-sm">
          <SummaryLine
            label="회비 수납"
            value={formatWon(report.duesTotal)}
            valueClass="text-blue-600"
          />
          <SummaryLine
            label="장부 수입"
            value={formatWon(report.ledgerIncome)}
            valueClass="text-blue-600"
          />
          <SummaryLine
            label="장부 지출"
            value={formatWon(report.ledgerExpense)}
            valueClass="text-red-600"
          />
        </dl>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
          <p className="text-sm font-medium text-zinc-800">
            현재 잔액 ({year}년 말 기준)
          </p>
          <p className={`text-xl font-semibold tracking-tight ${balanceColor}`}>
            {formatWon(report.yearEndBalance)}
          </p>
        </div>
      </section>

      {report.isEmpty ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-base font-medium text-zinc-800">
            {year}년 결산 데이터 없음
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            선택한 연도에 회비 수납·장부 입출금 내역이 아직 없습니다.
          </p>
        </div>
      ) : (
        <>
          {(incomeSlices.length > 0 || expenseSlices.length > 0) && (
            <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              {incomeSlices.length > 0 ? (
                <PieSection title="수입 구성" slices={incomeSlices} mode="income" />
              ) : null}
              {expenseSlices.length > 0 ? (
                <PieSection
                  title="지출 구성"
                  slices={expenseSlices}
                  mode="expense"
                />
              ) : null}
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-medium text-zinc-500">
              카테고리별 내역
            </h3>
            {report.categorySummaries.length === 0 ? (
              <p className="text-sm text-zinc-500">
                카테고리별 집계할 데이터가 없습니다.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                {report.categorySummaries.map((item) => (
                  <li key={item.category} className="border-t border-zinc-100 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => setDetailCategory(item.category)}
                      className="touch-card flex w-full flex-col gap-2 px-4 py-3.5 text-left hover:bg-zinc-50"
                    >
                      <span
                        className="text-sm font-semibold"
                        style={{ color: item.color }}
                      >
                        {item.label}
                      </span>
                      <span className="flex justify-between text-sm">
                        <span
                          className={
                            item.income > 0
                              ? "font-medium text-blue-600"
                              : "text-zinc-400"
                          }
                        >
                          {item.income > 0
                            ? `+${formatWon(item.income)}`
                            : "-"}
                        </span>
                        <span
                          className={
                            item.expense > 0
                              ? "font-medium text-red-600"
                              : "text-zinc-400"
                          }
                        >
                          {item.expense > 0
                            ? `−${formatWon(item.expense)}`
                            : "-"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {report.transfers.length > 0 ? (
            <section>
              <h3 className="mb-3 text-sm font-medium text-zinc-500">
                계좌 간 이체 내역
              </h3>
              <ul className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                {report.transfers.map((item) => (
                  <li
                    key={item.id}
                    className="border-t border-zinc-100 px-4 py-3.5 first:border-t-0"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-500">{item.date}</span>
                      <span className="font-semibold text-purple-700">
                        {formatWon(item.amount)}
                      </span>
                    </div>
                    {item.note ? (
                      <p className="mt-1 text-sm text-zinc-600">{item.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {detailCategory ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setDetailCategory(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-500">{year}년</p>
                <h3 className="text-base font-semibold text-zinc-900">
                  {shortLabel(detailCategory)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailCategory(null)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                닫기
              </button>
            </div>
            {detailItems.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">내역이 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {detailItems.map((tx) => {
                  const isIncome =
                    tx.type?.toUpperCase() === "INCOME" || tx.incomeAmount > 0;
                  const amount = isIncome ? tx.incomeAmount : tx.expenseAmount;
                  return (
                    <li
                      key={tx.id}
                      className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3 text-sm last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-zinc-500">{tx.date}</p>
                        <p className="mt-0.5 text-zinc-800">
                          {tx.description || tx.note || "-"}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 font-medium ${
                          isIncome ? "text-blue-600" : "text-red-600"
                        }`}
                      >
                        {formatWon(amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`font-semibold ${valueClass || ""}`}>{value}</dd>
    </div>
  );
}

function shortLabel(category: string) {
  const i = category.indexOf("(");
  return i > 0 ? category.slice(0, i).trim() : category;
}

function PieSection({
  title,
  slices,
  mode,
}: {
  title: string;
  slices: CategorySummary[];
  mode: "income" | "expense";
}) {
  const total = slices.reduce(
    (acc, s) => acc + (mode === "income" ? s.income : s.expense),
    0
  );
  let cursor = 0;
  const stops = slices.map((s) => {
    const amount = mode === "income" ? s.income : s.expense;
    const start = cursor;
    const pct = total > 0 ? (amount / total) * 100 : 0;
    cursor += pct;
    return `${s.color} ${start}% ${cursor}%`;
  });

  return (
    <div>
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div
          className="h-36 w-36 shrink-0 rounded-full"
          style={{
            background:
              stops.length > 0
                ? `conic-gradient(${stops.join(", ")})`
                : "#e4e4e7",
          }}
          aria-hidden
        />
        <ul className="w-full space-y-2 text-sm">
          {slices.map((s) => {
            const amount = mode === "income" ? s.income : s.expense;
            const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
            return (
              <li
                key={s.category}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate text-zinc-700">{s.label}</span>
                </span>
                <span className="shrink-0 text-zinc-500">
                  {pct}% · {formatWon(amount)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
