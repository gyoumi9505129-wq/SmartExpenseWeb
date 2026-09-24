"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import {
  claimPendingEmailInvites,
  createMeeting,
  fetchMeetingDirectory,
  filterDirectory,
  submitJoinRequest,
} from "@/lib/hub";
import { fetchAccessibleMeetings } from "@/lib/meetings";
import { resolveRole } from "@/lib/roles";
import {
  ROLE_LABEL,
  type DirectoryMeeting,
  type Meeting,
} from "@/lib/types";

type HubTab = "mine" | "find" | "create";

export default function DashboardPage() {
  const { user, profile, loading, logout, isSystemAdmin } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<HubTab>("mine");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [directory, setDirectory] = useState<DirectoryMeeting[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [joinMsg, setJoinMsg] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  async function reloadMine() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const claimed = await claimPendingEmailInvites(user.uid, user.email);
      const list = await fetchAccessibleMeetings(user.uid, user.email);
      setMeetings(list);
      if (claimed > 0) {
        setInfo(`이메일 초대 ${claimed}건이 반영되었습니다.`);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "모임 목록을 불러오지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  async function reloadDirectory() {
    setBusy(true);
    setError(null);
    try {
      const list = await fetchMeetingDirectory();
      setDirectory(list);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "모임 검색 목록을 불러오지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    void reloadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (tab === "find" && directory.length === 0) {
      void reloadDirectory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const myIds = useMemo(() => new Set(meetings.map((m) => m.id)), [meetings]);
  const filtered = useMemo(
    () => filterDirectory(directory, query),
    [directory, query]
  );

  async function handleCreate() {
    if (!user) return;
    setActionBusy(true);
    setError(null);
    try {
      const m = await createMeeting({
        uid: user.uid,
        name: newName,
        description: newDesc,
      });
      setNewName("");
      setNewDesc("");
      setTab("mine");
      await reloadMine();
      router.push(`/meetings?id=${encodeURIComponent(m.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "모임 생성에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleJoin(item: DirectoryMeeting) {
    if (!user) return;
    setActionBusy(true);
    setError(null);
    setInfo(null);
    try {
      await submitJoinRequest({
        meetingId: item.id,
        uid: user.uid,
        email: user.email || "",
        profile,
        message: joinMsg[item.id] || "",
      });
      setInfo(`「${item.name}」가입 요청을 보냈습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가입 요청에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  const displayName =
    profile?.displayName || user.displayName || user.email || "사용자";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-medium text-emerald-600">모으다 웹</p>
            <h1 className="text-lg font-semibold">모임 허브</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <p className="font-medium">{displayName}</p>
              <p className="text-xs text-zinc-500">
                {isSystemAdmin ? "시스템관리자" : user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium hover:bg-zinc-50"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <nav className="flex gap-2 border-b border-zinc-200">
          {(
            [
              ["mine", "내 모임"],
              ["find", "모임 찾기"],
              ["create", "모임 만들기"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === id
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {info}
          </p>
        ) : null}

        {tab === "mine" ? (
          busy ? (
            <p className="mt-8 text-sm text-zinc-500">모임 목록을 불러오는 중…</p>
          ) : meetings.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
              표시할 모임이 없습니다. 「모임 찾기」에서 가입을 요청하거나 「모임
              만들기」로 새 모임을 만드세요.
            </div>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {meetings.map((meeting) => {
                const role = resolveRole(user.uid, user.email, meeting);
                return (
                  <li key={meeting.id}>
                    <Link
                      href={`/meetings?id=${encodeURIComponent(meeting.id)}`}
                      className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base font-semibold">
                          {meeting.name}
                        </h2>
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                          {ROLE_LABEL[role]}
                        </span>
                      </div>
                      {meeting.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-zinc-500">
                          {meeting.description}
                        </p>
                      ) : null}
                      <p className="mt-4 text-xs text-emerald-700">모임 열기 →</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {tab === "find" ? (
          <div className="mt-6">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="모임 이름·소개로 검색"
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm"
            />
            {busy ? (
              <p className="mt-6 text-sm text-zinc-500">검색 목록 로딩 중…</p>
            ) : filtered.length === 0 ? (
              <p className="mt-6 text-sm text-zinc-500">검색 결과가 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {filtered.map((item) => {
                  const joined = myIds.has(item.id);
                  return (
                    <li
                      key={item.id}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="font-semibold">{item.name}</h2>
                          {item.description ? (
                            <p className="mt-1 text-sm text-zinc-500">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        {joined ? (
                          <Link
                            href={`/meetings?id=${encodeURIComponent(item.id)}`}
                            className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700"
                          >
                            이미 참여 중 · 열기
                          </Link>
                        ) : (
                          <div className="flex w-full max-w-sm flex-col gap-2 sm:w-auto">
                            <input
                              value={joinMsg[item.id] || ""}
                              onChange={(e) =>
                                setJoinMsg((m) => ({
                                  ...m,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder="가입 메시지 (선택)"
                              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs"
                            />
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => handleJoin(item)}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                            >
                              가입 요청
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "create" ? (
          <div className="mt-6 max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">새 모임 만들기</h2>
            <p className="mt-1 text-sm text-zinc-500">
              개설자가 되며, 검색 디렉터리에 자동 등록됩니다.
            </p>
            <label className="mt-4 block text-xs text-zinc-500">
              모임 이름 *
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs text-zinc-500">
              소개
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={actionBusy || !newName.trim()}
              onClick={handleCreate}
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {actionBusy ? "생성 중…" : "모임 생성"}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
