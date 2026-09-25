"use client";

import { useCallback, useEffect, useState } from "react";
import {
  approveAccessRequest,
  cleanupDuplicateAccountsByKeepUid,
  fetchPendingAccessRequests,
  fetchUserProfiles,
  purgeMeetingAccount,
  rejectAccessRequest,
  setTreasurerUid,
} from "@/lib/access";
import type { JoinRequest, Meeting, UserProfile } from "@/lib/types";

type Props = {
  meeting: Meeting;
  myUid: string;
  onMeetingChanged: () => Promise<void>;
};

export function AdminAccountsPanel({
  meeting,
  myUid,
  onMeetingChanged,
}: Props) {
  const [pending, setPending] = useState<JoinRequest[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([
        fetchPendingAccessRequests(meeting.id),
        fetchUserProfiles(),
      ]);
      setPending(p);
      setProfiles(u.sort((a, b) => a.displayName.localeCompare(b.displayName, "ko")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    }
  }, [meeting.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const shared = new Set(meeting.sharedWith || []);
  const treasurerUid = meeting.adminUid || "";

  async function approve(req: JoinRequest) {
    setBusy(true);
    setError(null);
    try {
      await approveAccessRequest({
        meetingId: meeting.id,
        request: req,
        decidedByUid: myUid,
      });
      setInfo(`${req.displayName || req.email} 승인이 완료되었습니다.`);
      await onMeetingChanged();
      await reload();
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
      await rejectAccessRequest({
        meetingId: meeting.id,
        requestId: req.id,
        decidedByUid: myUid,
      });
      setInfo(`${req.displayName || req.email} 요청을 거절했습니다.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "거절에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTreasurer(uid: string, currentlyTreasurer: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setTreasurerUid(meeting.id, currentlyTreasurer ? null : uid);
      setInfo(
        currentlyTreasurer
          ? "총무 권한을 회수했습니다."
          : "총무 권한을 부여했습니다."
      );
      await onMeetingChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "권한 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function keepOnlyUid(keepUid: string) {
    if (
      !window.confirm(
        `이 UID만 남기고 같은 이메일의 다른 계정·요청·프로필을 삭제할까요?\n${keepUid}`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await cleanupDuplicateAccountsByKeepUid({
        meetingId: meeting.id,
        keepUid,
        decidedByUid: myUid,
      });
      setInfo(
        `${result.email} → UID 1개만 유지 (삭제 ${result.removedUids.length}건)`
      );
      await onMeetingChanged();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "중복 정리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function purgeAccount(uid: string, label: string) {
    if (
      !window.confirm(
        `「${label}」계정을 강퇴·삭제할까요?\n접근·가입요청·프로필을 지워 재가입 시 중복이 생기지 않습니다.\nUID: ${uid}`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await purgeMeetingAccount({ meetingId: meeting.id, uid });
      setInfo(`${label} 계정을 삭제했습니다.`);
      await onMeetingChanged();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const approvedProfiles = profiles.filter(
    (p) =>
      shared.has(p.uid) ||
      p.uid === meeting.ownerUid ||
      p.uid === treasurerUid
  );

  const emailCounts = new Map<string, number>();
  for (const p of profiles) {
    const e = p.email.trim().toLowerCase();
    if (!e) continue;
    emailCounts.set(e, (emailCounts.get(e) || 0) + 1);
  }

  const KEEP_HINT = "jFxZS17sH8esbvmXc6OUDVIkWLr2";

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">관리 · 계정</h2>
      <p className="mt-1 text-xs text-zinc-500">
        승인·총무 지정과 강퇴/삭제를 처리합니다. 삭제 시 UID를 남기지 않고
        가입요청·프로필까지 제거합니다.
      </p>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </p>
      ) : null}

      {profiles.some((p) => p.uid === KEEP_HINT) &&
      (emailCounts.get(
        profiles
          .find((p) => p.uid === KEEP_HINT)
          ?.email.trim()
          .toLowerCase() || ""
      ) || 0) > 1 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-sm text-amber-900">
            같은 이메일 중복 UID가 있습니다. 지정 UID만 남기려면 아래를 누르세요.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => keepOnlyUid(KEEP_HINT)}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {KEEP_HINT.slice(0, 8)}… 만 남기기
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          승인 대기 ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">대기 중인 요청이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pending.map((req) => (
              <li
                key={req.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-zinc-900">
                    {req.displayName || "(이름 없음)"}
                  </p>
                  <p className="text-xs text-zinc-500">{req.email}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => approve(req)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => reject(req)}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 disabled:opacity-50"
                  >
                    거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          가입 계정 ({approvedProfiles.length})
        </h3>
        {approvedProfiles.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">가입된 계정이 없습니다.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
            {approvedProfiles.map((p) => {
              const isOwner = p.uid === meeting.ownerUid;
              const isTreasurer = p.uid === treasurerUid;
              const dup =
                (emailCounts.get(p.email.trim().toLowerCase()) || 0) > 1;
              return (
                <li
                  key={p.uid}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-zinc-900">
                      {p.displayName || "(이름 없음)"}
                      {isOwner ? (
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          모임관리자
                        </span>
                      ) : null}
                      {isTreasurer ? (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          총무
                        </span>
                      ) : null}
                      {p.uid === KEEP_HINT ? (
                        <span className="ml-2 text-xs font-semibold text-emerald-700">
                          유지 대상
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-zinc-500">{p.email}</p>
                    <p className="font-mono text-[10px] text-zinc-400">{p.uid}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dup ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => keepOnlyUid(p.uid)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 disabled:opacity-50"
                      >
                        이 UID만 남기기
                      </button>
                    ) : null}
                    {!isOwner ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleTreasurer(p.uid, isTreasurer)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                            isTreasurer
                              ? "border border-zinc-200 text-zinc-700"
                              : "bg-zinc-900 text-white"
                          }`}
                        >
                          {isTreasurer ? "총무 회수" : "총무 부여"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            purgeAccount(p.uid, p.displayName || p.email || p.uid)
                          }
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
                        >
                          강퇴/삭제
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
