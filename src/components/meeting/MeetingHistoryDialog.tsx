"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClubHistoryRow } from "@/lib/meetingBackup";
import { todayIsoDate } from "@/lib/format";
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
};

export function MeetingHistoryDialog({
  meetingId,
  onClose,
  onChanged,
}: Props) {
  const [histories, setHistories] = useState<ClubHistoryRow[]>([]);
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
                모임 이력 관리
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                창단·회장 선출·회원 변동 등 모임 이력을 추가·삭제합니다.
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

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-zinc-500">
              일자
              <input
                type="date"
                value={histDate}
                onChange={(e) => setHistDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              내용 *
              <input
                value={histContent}
                onChange={(e) => setHistContent(e.target.value)}
                placeholder="내용"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              세부
              <input
                value={histDetails}
                onChange={(e) => setHistDetails(e.target.value)}
                placeholder="세부"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await upsertHistory(meetingId, {
                  dateIso: histDate,
                  content: histContent,
                  details: histDetails,
                });
                setHistDate(todayIsoDate());
                setHistContent("");
                setHistDetails("");
              }, "이력을 추가했습니다.")
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            이력 추가
          </button>

          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
            {histories.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-800">
                    {historyDateToIso(h.date)} · {h.content}
                  </p>
                  {h.details ? (
                    <p className="text-xs text-zinc-500">{h.details}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => deleteHistory(meetingId, h.id),
                      "이력을 삭제했습니다."
                    )
                  }
                  className="text-xs text-red-600 disabled:opacity-50"
                >
                  삭제
                </button>
              </li>
            ))}
            {histories.length === 0 ? (
              <li className="px-3 py-4 text-xs text-zinc-400">
                이력이 없습니다.
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
