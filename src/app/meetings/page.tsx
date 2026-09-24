"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { DuesPanel } from "@/components/meeting/DuesPanel";
import { EventsPanel } from "@/components/meeting/EventsPanel";
import { InvitePanel } from "@/components/meeting/InvitePanel";
import { LedgerPanel } from "@/components/meeting/LedgerPanel";
import { MembersPanel } from "@/components/meeting/MembersPanel";
import { ReportPanel } from "@/components/meeting/ReportPanel";
import { useAuth } from "@/contexts/AuthProvider";
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
import { canEditMeeting, resolveRole } from "@/lib/roles";
import {
  ROLE_LABEL,
  type DuesRecord,
  type EventExpense,
  type Meeting,
  type Member,
  type Transaction,
} from "@/lib/types";

type Tab = "ledger" | "dues" | "members" | "events" | "report";

function MeetingDetailInner() {
  const search = useSearchParams();
  const meetingId = search.get("id") || "";
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("ledger");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dues, setDues] = useState<DuesRecord[]>([]);
  const [eventExpenses, setEventExpenses] = useState<EventExpense[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  const reload = useCallback(async () => {
    if (!user || !meetingId) return;
    setBusy(true);
    setError(null);
    try {
      const m = await fetchMeeting(meetingId);
      if (!m) throw new Error("모임을 찾을 수 없습니다.");
      const [ms, txs, events] = await Promise.all([
        fetchMembers(meetingId),
        fetchTransactions(meetingId),
        fetchEventExpenses(meetingId),
      ]);
      const ds = await fetchDues(meetingId, ms);
      const freshBalance = computeOperatingBalance(txs, m.initialBalance);
      if (
        canEditMeeting(user.uid, user.email, m) &&
        m.currentBalance !== freshBalance
      ) {
        await syncMeetingBalance(meetingId, m.initialBalance);
        setMeeting({ ...m, currentBalance: freshBalance });
      } else {
        setMeeting(m);
      }
      setMembers(ms);
      setTransactions(txs);
      setDues(ds);
      setEventExpenses(events);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "모임 데이터를 불러오지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }, [user, meetingId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const role = useMemo(
    () => (meeting ? resolveRole(user?.uid, user?.email, meeting) : "MEMBER"),
    [meeting, user]
  );
  const canEdit = meeting
    ? canEditMeeting(user?.uid, user?.email, meeting)
    : false;

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

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  if (!meetingId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-zinc-500">
        <p>모임 ID가 없습니다.</p>
        <Link href="/dashboard" className="text-emerald-700 hover:underline">
          내 모임으로
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link
              href="/dashboard"
              className="text-xs text-emerald-700 hover:underline"
            >
              ← 내 모임
            </Link>
            <h1 className="text-lg font-semibold">{meeting?.name ?? "모임"}</h1>
            <p className="text-xs text-zinc-500">
              {ROLE_LABEL[role]}
              {canEdit ? " · 편집 가능" : " · 조회"}
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
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error ? (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
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
                meetingId={meetingId}
                rows={transactions}
                members={members}
                dues={dues}
                canEdit={canEdit}
                onChanged={reload}
              />
            </div>
            <div className={tab === "dues" ? undefined : "hidden"}>
              <DuesPanel
                meetingId={meetingId}
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
                  meetingId={meetingId}
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
          </>
        )}

        {meeting && user ? (
          <InvitePanel
            meetingId={meetingId}
            myUid={user.uid}
            canEdit={canEdit}
          />
        ) : null}
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
