"use client";

import { useEffect, useState } from "react";
import {
  deleteDuesInstallment,
  syncOrphanLedgersForDuesRecord,
} from "@/lib/dues";
import { formatWon } from "@/lib/format";
import type { DuesDetail, DuesRecord } from "@/lib/types";

type HistoryLine = {
  detailId: string;
  termLabel: string;
  payDate: string;
  amount: number;
  paymentIndex: number;
  linkedTransactionId: string | null;
};

function linesForDetail(detail: DuesDetail): HistoryLine[] {
  if (detail.payments.filter((p) => p.amount > 0).length > 0) {
    return detail.payments
      .map((p, paymentIndex) => ({
        detailId: detail.id,
        termLabel: detail.termLabel,
        payDate: p.payDate || "-",
        amount: p.amount,
        paymentIndex,
        linkedTransactionId: p.linkedTransactionId ?? null,
      }))
      .filter((p) => p.amount > 0)
      .sort((a, b) => a.payDate.localeCompare(b.payDate));
  }
  if (detail.paidAmount > 0) {
    return [
      {
        detailId: detail.id,
        termLabel: detail.termLabel,
        payDate: detail.payDate || "-",
        amount: detail.paidAmount,
        paymentIndex: -1,
        linkedTransactionId: null,
      },
    ];
  }
  return [];
}

export function collectPaymentHistory(row: DuesRecord): HistoryLine[] {
  return row.details
    .filter((d) => !d.isExcluded)
    .flatMap(linesForDetail)
    .sort(
      (a, b) =>
        a.payDate.localeCompare(b.payDate) ||
        a.termLabel.localeCompare(b.termLabel, "ko")
    );
}

type Props = {
  meetingId: string;
  row: DuesRecord;
  canEdit?: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

export function DuesPaymentHistoryDialog({
  meetingId,
  row,
  canEdit = false,
  onClose,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localRow, setLocalRow] = useState(row);

  // 이미 삭제된 분납에 남은 고아 장부 수입 정리 (진입 시 1회)
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    (async () => {
      try {
        await syncOrphanLedgersForDuesRecord(meetingId, row);
        if (!cancelled) await onChanged();
      } catch {
        // 보정 실패해도 이력 조회는 유지
      }
    })();
    return () => {
      cancelled = true;
    };
    // 진입 시 1회만: meetingId + dues id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, meetingId, row.id]);

  const remain = Math.max(0, localRow.totalTargetAmount - localRow.paidAmount);
  const history = collectPaymentHistory(localRow);
  const details = localRow.details.filter((d) => !d.isExcluded);

  async function removeLine(line: HistoryLine) {
    if (!canEdit || busy) return;
    const ok = confirm(
      `${line.payDate} · ${line.termLabel} · ${formatWon(line.amount)} 분납을 삭제할까요?\n연결된 장부 수입도 함께 삭제됩니다.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDuesInstallment({
        meetingId,
        dues: localRow,
        detailId: line.detailId,
        paymentIndex: line.paymentIndex,
      });
      // 로컬 미리보기 갱신
      const nextDetails = localRow.details.map((d) => {
        if (d.id !== line.detailId) return d;
        if (line.paymentIndex === -1) {
          return {
            ...d,
            payments: [],
            paidAmount: 0,
            payDate: "",
            isPaid: false,
          };
        }
        const payments = d.payments.filter((_, i) => i !== line.paymentIndex);
        const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
        const payDate =
          payments
            .filter((p) => p.payDate)
            .map((p) => p.payDate)
            .sort()
            .at(-1) || "";
        return {
          ...d,
          payments,
          paidAmount,
          payDate,
          isPaid: paidAmount >= d.amount && d.amount > 0 && !d.isExcluded,
        };
      });
      const paidAmount = nextDetails.reduce((s, d) => s + d.paidAmount, 0);
      const status =
        paidAmount <= 0
          ? "미납"
          : paidAmount >= localRow.totalTargetAmount
            ? "완납"
            : "분납";
      setLocalRow({
        ...localRow,
        details: nextDetails,
        paidAmount,
        status,
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "분납 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dues-history-title"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="dues-history-title"
              className="text-base font-semibold text-zinc-900"
            >
              회비 납부 내역
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {localRow.memberName} · {localRow.year}년 · {localRow.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            닫기
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 px-3 py-3 text-center text-xs">
          <div>
            <p className="text-zinc-500">목표</p>
            <p className="mt-0.5 font-medium text-zinc-800">
              {formatWon(localRow.totalTargetAmount)}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">납부</p>
            <p className="mt-0.5 font-medium text-blue-600">
              {formatWon(localRow.paidAmount)}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">잔여</p>
            <p className="mt-0.5 font-medium text-red-600">
              {formatWon(remain)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            회차별 현황
          </h4>
          <ul className="mt-2 space-y-2">
            {details.map((d) => {
              const termRemain = Math.max(0, d.amount - d.paidAmount);
              const termStatus =
                d.amount > 0 && d.paidAmount >= d.amount
                  ? "완납"
                  : d.paidAmount > 0
                    ? "분납"
                    : "미납";
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-800">{d.termLabel}</p>
                    <p className="text-xs text-zinc-500">
                      목표 {formatWon(d.amount)} · {termStatus}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-blue-600">납부 {formatWon(d.paidAmount)}</p>
                    <p className="text-red-600">잔여 {formatWon(termRemain)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            분납 이력
          </h4>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              아직 분할 납부 이력이 없습니다.
            </p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">납부일</th>
                    <th className="px-3 py-2">회차</th>
                    <th className="px-3 py-2 text-right">금액</th>
                    {canEdit ? (
                      <th className="px-3 py-2 text-right">관리</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {history.map((line, idx) => (
                    <tr
                      key={`${line.detailId}-${line.paymentIndex}-${idx}`}
                      className="border-t border-zinc-100"
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        {line.payDate}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {line.termLabel}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blue-600">
                        {formatWon(line.amount)}
                      </td>
                      {canEdit ? (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeLine(line)}
                            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40"
                          >
                            삭제
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-200 bg-zinc-50 text-xs">
                    <td
                      className="px-3 py-2 text-zinc-500"
                      colSpan={canEdit ? 3 : 2}
                    >
                      합계 {history.length}건
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-zinc-800">
                      {formatWon(history.reduce((s, x) => s + x.amount, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {canEdit && history.length > 0 ? (
            <p className="mt-2 text-[11px] text-zinc-400">
              삭제 시 해당 분납과 연결된 장부 수입도 함께 삭제됩니다.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? "처리 중…" : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 납부 금액이 있으면 상세보기 가능 */
export function hasPayableHistory(row: DuesRecord): boolean {
  return row.paidAmount > 0 || collectPaymentHistory(row).length > 0;
}
