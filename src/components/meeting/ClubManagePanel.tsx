"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClubAccountRow, ClubHistoryRow } from "@/lib/meetingBackup";
import {
  historyDateToIso,
  listAccounts,
  listHistories,
} from "@/lib/meetingSettings";

type Props = {
  meetingId: string;
};

/** 일반 회원용 — 모임 이력·계좌 조회 전용 */
export function ClubManagePanel({ meetingId }: Props) {
  const [histories, setHistories] = useState<ClubHistoryRow[]>([]);
  const [accounts, setAccounts] = useState<ClubAccountRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [h, a] = await Promise.all([
        listHistories(meetingId),
        listAccounts(meetingId),
      ]);
      setHistories(h);
      setAccounts(a);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "모임 정보를 불러오지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="mt-6 space-y-6">
      <p className="text-xs text-zinc-500">
        모임 이력과 계좌 정보를 조회할 수 있습니다. (수정은 시스템관리자 설정에서
        가능)
      </p>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">모임 이력</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-100">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs font-medium text-zinc-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">일자</th>
                <th className="px-3 py-2">내용</th>
                <th className="px-3 py-2">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {histories.map((h) => (
                <tr key={h.id} className="align-top text-zinc-800">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {historyDateToIso(h.date)}
                  </td>
                  <td className="px-3 py-2">{h.content}</td>
                  <td className="px-3 py-2 text-zinc-600">
                    {h.details || "—"}
                  </td>
                </tr>
              ))}
              {!busy && histories.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-4 text-xs text-zinc-400"
                  >
                    이력이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">모임 계좌 정보</h2>
        <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {accounts.map((a) => (
            <li key={a.id} className="px-3 py-3 text-sm text-zinc-800">
              <p className="font-medium">
                {a.bankName} {a.accountNumber}
              </p>
              {a.holderName ? (
                <p className="text-xs text-zinc-500">예금주: {a.holderName}</p>
              ) : null}
            </li>
          ))}
          {!busy && accounts.length === 0 ? (
            <li className="px-3 py-4 text-xs text-zinc-400">
              등록된 계좌가 없습니다.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
