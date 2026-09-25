"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AdminAccountsPanel } from "@/components/meeting/AdminAccountsPanel";
import { DuesPanel } from "@/components/meeting/DuesPanel";
import { EventsPanel } from "@/components/meeting/EventsPanel";
import { LedgerPanel } from "@/components/meeting/LedgerPanel";
import { MembersPanel } from "@/components/meeting/MembersPanel";
import { ReportPanel } from "@/components/meeting/ReportPanel";
import { useAuth } from "@/contexts/AuthProvider";
import {
  fetchMyAccessRequest,
  requestAccess,
  resolvePrimaryMeeting,
} from "@/lib/access";
import { computeOperatingBalance } from "@/lib/balance";
import { fetchDues } from "@/lib/dues";
import { fetchEventExpenses } from "@/lib/eventExpenses";
import { formatWon } from "@/lib/format";
import { syncMeetingBalance } from "@/lib/ledger";
import {
  fetchMeeting,
  fetchMembers,
  fetchTransactions,
} from "@/lib/meetings";
import { canAccessMeeting, canEditMeeting, resolveRole } from "@/lib/roles";
import {
  SAMPLE_DUES,
  SAMPLE_MEETING,
  SAMPLE_MEETING_ID,
  SAMPLE_MEMBERS,
  SAMPLE_TRANSACTIONS,
} from "@/lib/sampleData";
import {
  ROLE_LABEL,
  type DuesRecord,
  type EventExpense,
  type JoinRequest,
  type Meeting,
  type Member,
  type Transaction,
} from "@/lib/types";

type Tab = "ledger" | "dues" | "members" | "events" | "report" | "admin";

function MeetingDetailInner() {
  const search = useSearchParams();
  const meetingIdParam = search.get("id") || "";
  const realIdHint = search.get("realId") || "";
  const { user, profile, loading, logout, isSystemAdmin } = useAuth();
  const router = useRouter();

  const isSample = meetingIdParam === SAMPLE_MEETING_ID;

  const [tab, setTab] = useState<Tab>("ledger");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [realMeeting, setRealMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dues, setDues] = useState<DuesRecord[]>([]);
  const [eventExpenses, setEventExpenses] = useState<EventExpense[]>([]);
  const [myRequest, setMyRequest] = useState<JoinRequest | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  const reload = useCallback(async () => {
    if (!user || !meetingIdParam) return;
    setBusy(true);
    setError(null);
    try {
      if (isSample) {
        let primary = realIdHint
          ? await fetchMeeting(realIdHint)
          : await resolvePrimaryMeeting();
        if (
          primary &&
          canAccessMeeting(user.uid, user.email, primary)
        ) {
          router.replace(`/meetings?id=${encodeURIComponent(primary.id)}`);
          return;
        }
        setRealMeeting(primary);
        setMeeting(SAMPLE_MEETING);
        setMembers(SAMPLE_MEMBERS);
        setTransactions(SAMPLE_TRANSACTIONS);
        setDues(SAMPLE_DUES);
        setEventExpenses([]);
        if (primary) {
          const req = await fetchMyAccessRequest(primary.id, user.uid);
          setMyRequest(req);
        } else {
          setMyRequest(null);
        }
        return;
      }

      const m = await fetchMeeting(meetingIdParam);
      if (!m) throw new Error("모임을 찾을 수 없습니다.");
      if (!canAccessMeeting(user.uid, user.email, m)) {
        router.replace(
          `/meetings?id=${encodeURIComponent(SAMPLE_MEETING_ID)}&realId=${encodeURIComponent(m.id)}`
        );
        return;
      }
      const [ms, txs, events] = await Promise.all([
        fetchMembers(meetingIdParam),
        fetchTransactions(meetingIdParam),
        fetchEventExpenses(meetingIdParam),
      ]);
      const ds = await fetchDues(meetingIdParam, ms);
      const freshBalance = computeOperatingBalance(txs, m.initialBalance);
      if (
        canEditMeeting(user.uid, user.email, m) &&
        m.currentBalance !== freshBalance
      ) {
        await syncMeetingBalance(meetingIdParam, m.initialBalance);
        setMeeting({ ...m, currentBalance: freshBalance });
      } else {
        setMeeting(m);
      }
      setRealMeeting(m);
      setMembers(ms);
      setTransactions(txs);
      setDues(ds);
      setEventExpenses(events);
      setMyRequest(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "모임 데이터를 불러오지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }, [user, meetingIdParam, isSample, realIdHint, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const role = useMemo(() => {
    if (isSample) return "MEMBER" as const;
    return meeting ? resolveRole(user?.uid, user?.email, meeting) : "MEMBER";
  }, [meeting, user, isSample]);

  const canEdit =
    !isSample && meeting
      ? canEditMeeting(user?.uid, user?.email, meeting)
      : false;

  const canManageAccounts = !isSample && !!meeting && isSystemAdmin;

  // 관리 탭이 없어졌는데 admin에 있으면 장부로
  useEffect(() => {
    if (!canManageAccounts && tab === "admin") setTab("ledger");
  }, [canManageAccounts, tab]);

  const balance = useMemo(
    () => computeOperatingBalance(transactions, meeting?.initialBalance ?? 0),
    [meeting?.initialBalance, transactions]
  );

  const memberCounts = useMemo(() => {
    let active = 0;
    let dormant = 0;
    let withdrawn = 0;
    for (const m of members) {
      if (m.status === "DORMANT") dormant += 1;
      else if (m.status === "WITHDRAWN") withdrawn += 1;
      else active += 1;
    }
    return { total: members.length, active, dormant, withdrawn };
  }, [members]);

  async function handleRequestAccess() {
    if (!user || !realMeeting) {
      setError("승인할 모임을 찾을 수 없습니다. 관리자에게 문의하세요.");
      return;
    }
    setActionBusy(true);
    setError(null);
    setInfo(null);
    try {
      await requestAccess({
        meetingId: realMeeting.id,
        uid: user.uid,
        email: user.email || "",
        displayName:
          profile?.displayName || user.displayName || user.email || "",
        phone: profile?.phone || "",
      });
      setInfo("승인 요청을 보냈습니다. 관리자 승인 후 실데이터를 볼 수 있습니다.");
      const req = await fetchMyAccessRequest(realMeeting.id, user.uid);
      setMyRequest(req);
    } catch (e) {
      setError(e instanceof Error ? e.message : "승인 요청에 실패했습니다.");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  if (!meetingIdParam) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-zinc-500">
        <p>모임 ID가 없습니다.</p>
        <Link href="/dashboard" className="text-emerald-700 hover:underline">
          다시 시도
        </Link>
      </div>
    );
  }

  const requestStatus = myRequest?.status || "";
  const pendingRequest = requestStatus === "PENDING";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-medium text-emerald-600">모으다 웹</p>
            <h1 className="text-lg font-semibold">
              {meeting?.name ?? (isSample ? SAMPLE_MEETING.name : "모임")}
            </h1>
            <p className="text-xs text-zinc-500">
              {isSample
                ? "샘플 · 조회만"
                : `${ROLE_LABEL[role]}${canEdit ? " · 편집 가능" : " · 조회"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSample ? (
              <button
                type="button"
                disabled={actionBusy || pendingRequest || !realMeeting}
                onClick={() => handleRequestAccess()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {pendingRequest
                  ? "승인 대기 중"
                  : actionBusy
                    ? "요청 중…"
                    : "승인 요청"}
              </button>
            ) : null}
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

      <main className="mx-auto max-w-6xl px-4 py-6">
        {isSample ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {pendingRequest
              ? "승인 요청이 접수되었습니다. 관리자 승인 후 새로고침하면 실데이터가 표시됩니다."
              : "승인 전 체험용 샘플입니다. 「승인 요청」을 보내면 관리자 승인 후 실제 한우리 데이터를 볼 수 있습니다."}
          </div>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {info}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="현재 잔액"
            value={formatWon(balance)}
            hint="장부 전체 수입 − 지출 (계좌 이체 제외)"
          />
          <StatCard
            label="회원"
            value={`활동중 ${memberCounts.active} · 휴면 ${memberCounts.dormant} · 탈퇴 ${memberCounts.withdrawn}`}
          />
        </section>

        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-zinc-200 sm:gap-2">
          {(
            [
              ["ledger", "장부"],
              ["dues", "회비"],
              ["members", "회원"],
              ["events", "경조"],
              ["report", "결산"],
              ...(canManageAccounts
                ? ([["admin", "관리"]] as const)
                : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`shrink-0 px-3 py-2 text-sm font-medium sm:px-4 ${
                tab === id
                  ? "border-b-2 border-emerald-600 text-emerald-700"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {busy && !meeting ? (
          <p className="mt-8 text-sm text-zinc-500">데이터 로딩 중…</p>
        ) : (
          <>
            <div className={tab === "ledger" ? undefined : "hidden"}>
              <LedgerPanel
                meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                rows={transactions}
                members={members}
                dues={dues}
                canEdit={canEdit}
                onChanged={reload}
              />
            </div>
            <div className={tab === "dues" ? undefined : "hidden"}>
              <DuesPanel
                meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                dues={dues}
                members={members}
                canEdit={canEdit}
                defaultPaymentMethod={meeting?.duesPaymentMethod || "HALF_YEARLY"}
                onChanged={reload}
              />
            </div>
            {meeting ? (
              <div className={tab === "members" ? undefined : "hidden"}>
                <MembersPanel
                  meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                  meeting={meeting}
                  rows={members}
                  canEdit={canEdit}
                  onChanged={reload}
                />
              </div>
            ) : null}
            <div className={tab === "events" ? undefined : "hidden"}>
              <EventsPanel
                clubName={meeting?.name || "모임"}
                eventExpenses={eventExpenses}
                transactions={transactions}
                members={members}
              />
            </div>
            <div className={tab === "report" ? undefined : "hidden"}>
              <ReportPanel
                transactions={transactions}
                dues={dues}
                initialBalance={meeting?.initialBalance ?? 0}
              />
            </div>
            {canManageAccounts && meeting && user ? (
              <div className={tab === "admin" ? undefined : "hidden"}>
                <AdminAccountsPanel
                  meeting={meeting}
                  myUid={user.uid}
                  onMeetingChanged={reload}
                />
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default function MeetingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
          불러오는 중…
        </div>
      }
    >
      <MeetingDetailInner />
    </Suspense>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-base font-semibold leading-snug tracking-tight sm:text-lg">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}
