"use client";

import { useMemo, useState } from "react";
import {
  buildEventSummaries,
  eventExpensesFromLedger,
} from "@/lib/eventExpenses";
import { formatWon } from "@/lib/format";
import { MEMBER_STATUS_LABEL, type EventExpense, type Member, type Transaction } from "@/lib/types";

type Props = {
  clubName: string;
  eventExpenses: EventExpense[];
  transactions: Transaction[];
  members: Member[];
};

export function EventsPanel({
  clubName,
  eventExpenses,
  transactions,
  members,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { total, memberSummaries, fromLedgerFallback } = useMemo(() => {
    const source =
      eventExpenses.length > 0
        ? eventExpenses
        : eventExpensesFromLedger(transactions);
    const built = buildEventSummaries(source, members);
    return {
      total: built.total,
      memberSummaries: built.members,
      fromLedgerFallback: eventExpenses.length === 0 && built.members.length > 0,
    };
  }, [eventExpenses, transactions, members]);

  if (memberSummaries.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
        <p className="text-base font-medium text-zinc-800">
          경조사비 내역이 없습니다
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          장부에서 카테고리를 &apos;경조사비&apos;로 등록하면
          <br />
          회원별 지급 내역이 여기에 집계됩니다.
        </p>
        <p className="mt-3 text-xs text-zinc-400">
          대상 회원과 세부 항목을 함께 입력해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-zinc-500">{clubName} 총 경조사비 지출액</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-red-600">
          {formatWon(total)}
        </p>
        {fromLedgerFallback ? (
          <p className="mt-2 text-[11px] text-zinc-400">
            경조 전용 데이터가 없어 장부 경조사비로 집계했습니다.
          </p>
        ) : null}
      </div>

      <p className="text-sm font-medium text-zinc-500">회원별 지급 누적액</p>

      <ul className="space-y-3">
        {memberSummaries.map((summary) => {
          const isOpen = expandedId === summary.memberId;
          const statusLabel =
            MEMBER_STATUS_LABEL[summary.memberStatus] || summary.memberStatus;
          const statusClass =
            summary.memberStatus === "ACTIVE"
              ? "bg-blue-50 text-blue-700"
              : summary.memberStatus === "DORMANT"
                ? "bg-zinc-100 text-zinc-600"
                : "bg-red-50 text-red-700";
          return (
            <li key={summary.memberId}>
              <button
                type="button"
                onClick={() =>
                  setExpandedId(isOpen ? null : summary.memberId)
                }
                className="touch-card w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-zinc-900">
                        {summary.memberName}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-red-600">
                      총 {formatWon(summary.totalAmount)}
                    </p>
                  </div>
                  <span className="text-zinc-400" aria-hidden>
                    {isOpen ? "▴" : "▾"}
                  </span>
                </div>

                {isOpen ? (
                  <ul className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                    {summary.details.map((detail, idx) => (
                      <li
                        key={`${detail.date}-${detail.eventSubCategory}-${idx}`}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-800">
                            {detail.eventSubCategory}
                          </p>
                          <p className="text-xs text-zinc-500">{detail.date}</p>
                          {detail.note ? (
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {detail.note}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 font-medium text-zinc-800">
                          {formatWon(detail.amount)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
