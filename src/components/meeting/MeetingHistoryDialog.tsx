"use client";

import { useCallback, useEffect, useState } from "react";
import { IsoDateField } from "@/components/IsoDateField";
import type { ClubHistoryRow } from "@/lib/meetingBackup";
import { normalizeIsoDateInput, todayIsoDate } from "@/lib/format";
import {
  deleteHistory,
  historyDateToIso,
  listHistories,
  upsertHistory,
} from "@/lib/meetingSettings";

type Props = {
  meetingId: string;
  onClose: () => void;
  onChanged?: () => Promise<void>;
  /** true면 조회만 (일반 회원) */
  readOnly?: boolean;
};

export function MeetingHistoryDialog({
  meetingId,
  onClose,
  onChanged,
  readOnly = false,
}: Props) {
  const [histories, setHistories] = useState<ClubHistoryRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [histDate, setHistDate] = useState(todayIsoDate());
  const [histContent, setHistContent] = useState("");
  const [histDetails, setHistDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await listHistories(meetingId);
    setHistories(rows);
  }, [meetingId]);

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다.")
    );
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setHistDate(todayIsoDate());
    setHistContent("");
    setHistDetails("");
  }

  function startEdit(row: ClubHistoryRow) {
    if (readOnly) return;
    setError(null);
    setInfo(null);
    setEditingId(row.id);
    setHistDate(historyDateToIso(row.date) || todayIsoDate());
    setHistContent(row.content || "");
    setHistDetails(row.details || "");
  }

  async function run(action: () => Promise<void>, okMessage: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      setInfo(okMessage);
      await reload();
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
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
                {readOnly ? "모임 이력" : "모임 이력 관리"}
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                {readOnly
                  ? "창단·회장 선출·회원 변동 등 모임 이력을 조회합니다."
                  : "창단·회장 선출·회원 변동 등 모임 이력을 추가·수정·삭제합니다."}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {info}
            </p>
          ) : null}

          {!readOnly ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-zinc-500">
                  일자
                  <IsoDateField
                    value={histDate}
                    onChange={setHistDate}
                    disabled={busy}
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  내용 *
                  <input
                    lang="ko"
                    value={histContent}
                    onChange={(e) => setHistContent(e.target.value)}
                    placeholder="내용"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-zinc-500">
                  상세
                  <input
                    lang="ko"
                    value={histDetails}
                    onChange={(e) => setHistDetails(e.target.value)}
                    placeholder="상세"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const dateIso = normalizeIsoDateInput(histDate);
                    if (!dateIso) {
                      setError(
                        "일자는 YYYY-MM-DD 또는 YYYYMMDD 로 입력해 주세요."
                      );
                      return;
                    }
                    const isEdit = Boolean(editingId);
                    void run(async () => {
                      await upsertHistory(meetingId, {
                        id: editingId || undefined,
                        dateIso,
                        content: histContent,
                        details: histDetails,
                      });
                      resetForm();
                    }, isEdit ? "이력을 수정했습니다." : "이력을 추가했습니다.");
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {editingId ? "이력 수정" : "이력 추가"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      resetForm();
                      setInfo(null);
                      setError(null);
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 disabled:opacity-50"
                  >
                    수정 취소
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-zinc-100">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-xs font-medium text-zinc-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">일자</th>
                  <th className="px-3 py-2">내용</th>
                  <th className="px-3 py-2">상세</th>
                  {!readOnly ? (
                    <th className="w-24 whitespace-nowrap px-3 py-2 text-right">
                      {" "}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {histories.map((h) => (
                  <tr
                    key={h.id}
                    className={`align-top text-zinc-800 ${
                      editingId === h.id ? "bg-emerald-50/60" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {historyDateToIso(h.date)}
                    </td>
                    <td className="px-3 py-2">{h.content}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      {h.details || "—"}
                    </td>
                    {!readOnly ? (
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEdit(h)}
                            className="text-xs text-emerald-700 disabled:opacity-50"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (editingId === h.id) resetForm();
                              void run(
                                () => deleteHistory(meetingId, h.id),
                                "이력을 삭제했습니다."
                              );
                            }}
                            className="text-xs text-red-600 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
                {histories.length === 0 ? (
                  <tr>
                    <td
                      colSpan={readOnly ? 3 : 4}
                      className="px-3 py-4 text-xs text-zinc-400"
                    >
                      이력이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
