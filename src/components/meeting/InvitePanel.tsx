"use client";

import { useEffect, useState } from "react";
import {
  approveJoinRequest,
  fetchPendingJoinRequests,
  inviteByEmailOrUid,
  rejectJoinRequest,
} from "@/lib/hub";
import type { JoinRequest } from "@/lib/types";

type Props = {
  meetingId: string;
  myUid: string;
  canEdit: boolean;
};

export function InvitePanel({ meetingId, myUid, canEdit }: Props) {
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<JoinRequest[]>([]);

  async function loadPending() {
    if (!canEdit) return;
    try {
      const list = await fetchPendingJoinRequests(meetingId);
      setPending(list);
    } catch {
      // collectionGroup rules 등으로 실패할 수 있음
    }
  }

  useEffect(() => {
    void loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, canEdit]);

  async function invite() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteByEmailOrUid({
        meetingId,
        rawInput: input,
        myUid,
      });
      setMessage(
        result === "joined"
          ? "초대가 반영되었습니다. 상대가 바로 모임에 접근할 수 있습니다."
          : "이메일 초대가 예약되었습니다. 상대가 로그인하면 자동 합류합니다."
      );
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "초대에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function approve(req: JoinRequest) {
    setBusy(true);
    setError(null);
    try {
      await approveJoinRequest({
        meetingId,
        request: req,
        decidedByUid: myUid,
      });
      await loadPending();
      setMessage(`${req.displayName || req.email} 가입을 승인했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "승인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function reject(req: JoinRequest) {
    setBusy(true);
    setError(null);
    try {
      await rejectJoinRequest({
        meetingId,
        requestId: req.id,
        decidedByUid: myUid,
      });
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "거절에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) return null;

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold">초대 · 가입 승인</h2>
      <p className="mt-1 text-xs text-zinc-500">
        이메일 또는 UID로 초대하거나, 대기 중인 가입 요청을 처리합니다.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="이메일 또는 UID"
          className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={invite}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          초대
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {pending.length > 0 ? (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {pending.map((req) => (
            <li
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {req.displayName || "(이름 없음)"} · {req.email}
                </p>
                {req.message ? (
                  <p className="text-xs text-zinc-500">{req.message}</p>
                ) : null}
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => approve(req)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white"
                >
                  승인
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reject(req)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5"
                >
                  거절
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-zinc-400">대기 중인 가입 요청이 없습니다.</p>
      )}
    </section>
  );
}
