"use client";

import { useMemo, useState } from "react";
import {
  DuesPaymentHistoryDialog,
  hasPayableHistory,
} from "@/components/meeting/DuesPaymentHistoryDialog";
import { detailRemaining } from "@/lib/duesSync";
import { formatWon, todayIsoDate } from "@/lib/format";
import {
  detailStatusLabel,
  recordUnpaidAmount,
  type MemberDuesSummary,
} from "@/lib/memberDuesSummary";
import { recordDuesPaymentWithLedger } from "@/lib/dues";
import type { DuesRecord } from "@/lib/types";

type Props = {
  meetingId: string;
  summary: MemberDuesSummary;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export function MemberDuesDetailDialog({
  meetingId,
  summary,
  canEdit,
  onClose,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyRow, setHistoryRow] = useState<DuesRecord | null>(null);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [payDetailId, setPayDetailId] = useState<Record<string, string>>({});
  const [payDateByRow, setPayDateByRow] = useState<Record<string, string>>({});
  const [payModeByRow, setPayModeByRow] = useState<
    Record<string, "FULL" | "PARTIAL">
  >({});

  const totalUnpaid = useMemo(
    () => summary.records.reduce((s, r) => s + recordUnpaidAmount(r), 0),
    [summary.records]
  );

  async function pay(row: DuesRecord) {
    const unpaidDetails = row.details.filter(
      (d) => !d.isExcluded && detailRemaining(d) > 0
    );
    const detailId = payDetailId[row.id] || unpaidDetails[0]?.id;
    const detail = row.details.find((d) => d.id === detailId);
    if (!detail) {
      setError("납부할 회비 회차가 없습니다.");
      return;
    }
    const remaining = detailRemaining(detail);
    const mode = payModeByRow[row.id] || "FULL";
    let amount =
      mode === "FULL"
        ? remaining
        : Number((payAmount[row.id] || "").replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(
        mode === "FULL"
          ? "완납할 잔여 금액이 없습니다."
          : "부분 납부 금액을 입력해 주세요."
      );
      return;
    }
    if (amount > remaining) {
      setError(
        `잔여 회비(${remaining.toLocaleString("ko-KR")}원)를 초과할 수 없습니다.`
      );
      return;
    }
    const payDate = payDateByRow[row.id] || todayIsoDate();
    setBusy(true);
    setError(null);
    try {
      await recordDuesPaymentWithLedger({
        meetingId,
        dues: row,
        detailId,
        amount,
        payDate,
        memberName: row.memberName,
      });
      setPayAmount((p) => ({ ...p, [row.id]: "" }));
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "납부 기록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-100 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">
                  {summary.memberName} 납부 상세
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {canEdit
                    ? "연도별 내역을 확인하고 미납 회차를 납부 처리할 수 있습니다."
                    : "조회만 가능합니다. (수정은 모임관리자·시스템관리자만 가능)"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                닫기
              </button>
            </div>
            <p
              className={`mt-3 text-base font-semibold ${
                totalUnpaid > 0 ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {totalUnpaid > 0
                ? `미납 합계 ${formatWon(totalUnpaid)}`
                : summary.hasRegisteredDues
                  ? "완납"
                  : "등록된 회비 없음"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            {summary.records.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                표시할 납부 상세 내역이 없습니다.
              </p>
            ) : (
              <ul className="space-y-4">
                {summary.records.map((row) => {
                  const remain = recordUnpaidAmount(row);
                  const unpaidDetails = row.details.filter(
                    (d) => !d.isExcluded && detailRemaining(d) > 0
                  );
                  const selectedDetailId =
                    payDetailId[row.id] || unpaidDetails[0]?.id || "";
                  const selectedDetail = row.details.find(
                    (d) => d.id === selectedDetailId
                  );
                  const selectedRemain = selectedDetail
                    ? detailRemaining(selectedDetail)
                    : 0;
                  const mode = payModeByRow[row.id] || "FULL";

                  return (
                    <li
                      key={row.id}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-zinc-900">
                            {row.year}년
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              row.status === "완납"
                                ? "bg-emerald-50 text-emerald-700"
                                : row.status === "분납"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </div>
                        {hasPayableHistory(row) ? (
                          <button
                            type="button"
                            onClick={() => setHistoryRow(row)}
                            className="text-xs font-medium text-blue-600 hover:underline"
                          >
                            분납 이력
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-zinc-500">목표</p>
                          <p className="mt-0.5 font-medium">
                            {formatWon(row.totalTargetAmount)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-zinc-500">납부</p>
                          <p className="mt-0.5 font-medium text-blue-600">
                            {formatWon(row.paidAmount)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-zinc-500">잔여</p>
                          <p className="mt-0.5 font-medium text-red-600">
                            {formatWon(remain)}
                          </p>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
                        {row.details.map((d) => {
                          const rem = detailRemaining(d);
                          return (
                            <li
                              key={d.id}
                              className="flex items-start justify-between gap-3 text-sm"
                            >
                              <div>
                                <p className="font-medium text-zinc-800">
                                  {d.termLabel}
                                  <span className="ml-2 text-xs font-normal text-zinc-500">
                                    {detailStatusLabel(d)}
                                  </span>
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {d.isExcluded
                                    ? "제외"
                                    : d.paidAmount > 0 && rem > 0
                                      ? `${formatWon(d.paidAmount)} / ${formatWon(d.amount)}`
                                      : rem <= 0 && d.amount > 0
                                        ? formatWon(d.amount)
                                        : `- / ${formatWon(d.amount)}`}
                                </p>
                              </div>
                              {!d.isExcluded && rem > 0 ? (
                                <span className="shrink-0 text-xs font-medium text-red-600">
                                  잔여 {formatWon(rem)}
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>

                      {canEdit && unpaidDetails.length > 0 ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
                          <select
                            value={selectedDetailId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setPayDetailId((p) => ({ ...p, [row.id]: id }));
                              const d = unpaidDetails.find((x) => x.id === id);
                              const rem = d ? detailRemaining(d) : 0;
                              const m = payModeByRow[row.id] || "FULL";
                              setPayAmount((p) => ({
                                ...p,
                                [row.id]:
                                  m === "FULL" && rem > 0 ? String(rem) : "",
                              }));
                            }}
                            className="min-w-[10rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {unpaidDetails.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.termLabel} · 잔여{" "}
                                {detailRemaining(d).toLocaleString("ko-KR")}원
                              </option>
                            ))}
                          </select>
                          <div className="flex overflow-hidden rounded-lg border border-zinc-200 text-xs">
                            {(
                              [
                                ["FULL", "완납"],
                                ["PARTIAL", "부분납"],
                              ] as const
                            ).map(([m, label]) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => {
                                  setPayModeByRow((p) => ({
                                    ...p,
                                    [row.id]: m,
                                  }));
                                  setPayAmount((prev) => ({
                                    ...prev,
                                    [row.id]:
                                      m === "FULL" && selectedRemain > 0
                                        ? String(selectedRemain)
                                        : "",
                                  }));
                                }}
                                className={`px-2 py-1.5 ${
                                  mode === m
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white text-zinc-700"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <input
                            type="date"
                            value={payDateByRow[row.id] || todayIsoDate()}
                            onChange={(e) =>
                              setPayDateByRow((p) => ({
                                ...p,
                                [row.id]: e.target.value,
                              }))
                            }
                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                          />
                          {mode === "PARTIAL" ? (
                            <input
                              type="number"
                              placeholder={`잔여 ${selectedRemain.toLocaleString("ko-KR")}원 이내`}
                              value={payAmount[row.id] || ""}
                              onChange={(e) =>
                                setPayAmount((p) => ({
                                  ...p,
                                  [row.id]: e.target.value,
                                }))
                              }
                              className="w-36 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                            />
                          ) : (
                            <span className="text-xs text-zinc-500">
                              {formatWon(selectedRemain)}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={busy || remain <= 0}
                            onClick={() => pay(row)}
                            className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white disabled:opacity-40"
                          >
                            납부
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {historyRow ? (
        <DuesPaymentHistoryDialog
          meetingId={meetingId}
          row={historyRow}
          canEdit={canEdit}
          onClose={() => setHistoryRow(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
