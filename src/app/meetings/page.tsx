"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { AdminAccountsPanel } from "@/components/meeting/AdminAccountsPanel";
import { ClubManagePanel } from "@/components/meeting/ClubManagePanel";
import { DuesPanel } from "@/components/meeting/DuesPanel";
import { EventsPanel } from "@/components/meeting/EventsPanel";
import { LedgerPanel } from "@/components/meeting/LedgerPanel";
import { MembersPanel } from "@/components/meeting/MembersPanel";
import { ReportPanel } from "@/components/meeting/ReportPanel";
import { SettingsPanel } from "@/components/meeting/SettingsPanel";
import { useAuth } from "@/contexts/AuthProvider";
import {
  fetchMyAccessRequest,
  requestAccess,
  resolvePrimaryMeeting,
} from "@/lib/access";
import { ensureHanuriSharedViewerAccess } from "@/lib/hub";
import { FIRST_LEDGER_YEAR } from "@/lib/balance";
import { currentSystemYear } from "@/lib/duesSync";
import { fetchDues } from "@/lib/dues";
import { fetchEventExpenses } from "@/lib/eventExpenses";
import { formatWon } from "@/lib/format";
import { ensureMeetingYearBalances } from "@/lib/ledger";
import {
  fetchMeeting,
  fetchMembers,
  fetchTransactionsForYear,
} from "@/lib/meetings";
import {
  canAccessMeeting,
  canEditMeeting,
  isHanuriSharedViewer,
  resolveRole,
} from "@/lib/roles";
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
import { titleDisplayHtml } from "@/lib/titleHtml";
import {
  nameTitleClass,
  normalizeTitleColor,
  normalizeTitleSize,
  sloganTitleClass,
} from "@/lib/titleStyle";

type Tab =
  | "ledger"
  | "dues"
  | "members"
  | "events"
  | "report"
  | "clubInfo"
  | "admin"
  | "settings";

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
  const [ledgerYear, setLedgerYear] = useState(() => currentSystemYear());
  const ledgerYearRef = useRef(ledgerYear);
  ledgerYearRef.current = ledgerYear;
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
      await ensureHanuriSharedViewerAccess(user.uid, user.email);
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
        setLedgerYear(currentSystemYear());
        if (primary) {
          const req = await fetchMyAccessRequest(primary.id, user.uid);
          setMyRequest(req);
        } else {
          setMyRequest(null);
        }
        return;
      }

      let m = await fetchMeeting(meetingIdParam);
      if (!m) throw new Error("모임을 찾을 수 없습니다.");
      if (!canAccessMeeting(user.uid, user.email, m)) {
        router.replace(
          `/meetings?id=${encodeURIComponent(SAMPLE_MEETING_ID)}&realId=${encodeURIComponent(m.id)}`
        );
        return;
      }

      // 편집 가능 시 yearBalances 없으면 연도 순회 재정산 (한 해씩 로드)
      if (canEditMeeting(user.uid, user.email, m)) {
        const synced = await ensureMeetingYearBalances(meetingIdParam);
        if (synced) {
          m = {
            ...m,
            currentBalance: synced.currentBalance,
            yearBalances: synced.yearBalances,
            initialBalance: synced.initialBalance,
          };
        }
      }

      const year = ledgerYearRef.current || currentSystemYear();
      const [ms, txs, events] = await Promise.all([
        fetchMembers(meetingIdParam),
        fetchTransactionsForYear(meetingIdParam, year),
        fetchEventExpenses(meetingIdParam),
      ]);
      const ds = await fetchDues(meetingIdParam, ms);
      setMeeting(m);
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

  const loadLedgerYear = useCallback(
    async (year: number) => {
      setLedgerYear(year);
      if (isSample || !meetingIdParam) {
        if (isSample) {
          setTransactions(
            SAMPLE_TRANSACTIONS.filter((t) => t.date.startsWith(`${year}-`))
          );
        }
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const txs = await fetchTransactionsForYear(meetingIdParam, year);
        setTransactions(txs);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "장부 연도를 불러오지 못했습니다."
        );
      } finally {
        setBusy(false);
      }
    },
    [isSample, meetingIdParam]
  );

  const role = useMemo(() => {
    if (isSample) return "MEMBER" as const;
    return meeting ? resolveRole(user?.uid, user?.email, meeting) : "MEMBER";
  }, [meeting, user, isSample]);

  const canEdit =
    !isSample && meeting
      ? canEditMeeting(user?.uid, user?.email, meeting)
      : false;

  const canManageAccounts = !isSample && !!meeting && isSystemAdmin;

  const tabItems = useMemo(() => {
    const base: { id: Tab; label: string }[] = [
      { id: "ledger", label: "장부" },
      { id: "dues", label: "회비" },
      { id: "members", label: "회원" },
      { id: "events", label: "경조" },
      { id: "report", label: "결산" },
    ];
    if (canManageAccounts) {
      base.push({ id: "admin", label: "관리" }, { id: "settings", label: "설정" });
    } else if (!isSample) {
      base.push({ id: "clubInfo", label: "관리" });
    }
    return base;
  }, [canManageAccounts, isSample]);

  const selectTab = useCallback((next: Tab) => {
    setTab(next);
  }, []);

  const ledgerYearOptions = useMemo(() => {
    const now = currentSystemYear();
    const years: number[] = [];
    for (let y = now; y >= FIRST_LEDGER_YEAR; y -= 1) years.push(y);
    return years;
  }, []);

  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const onSwipeTouchStart = useCallback((e: TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    swipeStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onSwipeTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      // 가로 스와이프만 (세로 스크롤과 구분)
      if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const idx = tabItems.findIndex((item) => item.id === tab);
      if (idx < 0) return;
      if (dx < 0 && idx < tabItems.length - 1) {
        selectTab(tabItems[idx + 1]!.id);
      } else if (dx > 0 && idx > 0) {
        selectTab(tabItems[idx - 1]!.id);
      }
    },
    [tab, tabItems, selectTab]
  );

  // 관리/설정 권한 없으면 해당 탭에서 이탈
  useEffect(() => {
    if (!canManageAccounts && (tab === "admin" || tab === "settings")) {
      setTab("ledger");
    }
  }, [canManageAccounts, tab]);

  /** 대시보드 현재 잔액 — 연도 필터와 무관, 저장된 최신 잔액 */
  const balance = meeting?.currentBalance ?? 0;

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
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1
                className={
                  meeting?.nameHtml
                    ? "font-semibold"
                    : nameTitleClass(
                        normalizeTitleColor(meeting?.nameColor),
                        normalizeTitleSize(meeting?.nameFontSize)
                      )
                }
                dangerouslySetInnerHTML={{
                  __html: titleDisplayHtml(
                    meeting?.nameHtml,
                    meeting?.name ??
                      (isSample ? SAMPLE_MEETING.name : "모임")
                  ),
                }}
              />
              {(meeting?.slogan ||
                meeting?.sloganHtml ||
                (isSample ? SAMPLE_MEETING.slogan : "")) ? (
                <p
                  className={
                    meeting?.sloganHtml
                      ? "text-sm"
                      : sloganTitleClass(
                          normalizeTitleColor(meeting?.sloganColor),
                          normalizeTitleSize(meeting?.sloganFontSize)
                        )
                  }
                  dangerouslySetInnerHTML={{
                    __html: titleDisplayHtml(
                      meeting?.sloganHtml,
                      meeting?.slogan || SAMPLE_MEETING.slogan
                    ),
                  }}
                />
              ) : null}
            </div>
            <p className="text-xs text-zinc-500">
              {isSample
                ? "샘플 · 조회만"
                : `${ROLE_LABEL[role]}${canEdit ? " · 편집 가능" : " · 조회"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSample && !isHanuriSharedViewer(user.email) ? (
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
            valueClassName={
              balance < 0 ? "text-red-600" : "text-blue-600"
            }
            hint="연도 이월 기준 현재 잔액 (장부 연도 조회와 무관)"
          />
          <StatCard
            label="회원"
            value={
              <>
                <span className="text-emerald-700">
                  활동중 {memberCounts.active}
                </span>
                {" · "}
                <span className="text-amber-700">
                  휴면 {memberCounts.dormant}
                </span>
                {" · "}
                <span className="text-zinc-500">
                  탈퇴 {memberCounts.withdrawn}
                </span>
              </>
            }
          />
        </section>

        <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-zinc-200 sm:gap-2">
          {tabItems.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
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
          <div
            className="touch-pan-y"
            onTouchStart={onSwipeTouchStart}
            onTouchEnd={onSwipeTouchEnd}
          >
            {busy ? (
              <p className="mt-3 text-xs text-zinc-400">최신 데이터 불러오는 중…</p>
            ) : null}
            {tab === "ledger" ? (
              <LedgerPanel
                key={`ledger-${meetingIdParam}`}
                meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                rows={transactions}
                members={members}
                dues={dues}
                canEdit={canEdit}
                yearFilter={ledgerYear}
                yearOptions={ledgerYearOptions}
                onYearChange={loadLedgerYear}
                onChanged={reload}
              />
            ) : null}
            {tab === "dues" ? (
              <DuesPanel
                key={`dues-${meeting?.duesPaymentMethod || "HALF_YEARLY"}-${dues.length}`}
                meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                dues={dues}
                members={members}
                canEdit={canEdit}
                defaultPaymentMethod={
                  meeting?.duesPaymentMethod || "HALF_YEARLY"
                }
                onChanged={reload}
              />
            ) : null}
            {tab === "members" && meeting ? (
              <MembersPanel
                key={`members-${members.length}`}
                meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                meeting={meeting}
                rows={members}
                canEdit={canEdit}
                onChanged={reload}
              />
            ) : null}
            {tab === "events" ? (
              <EventsPanel
                key={`events-${eventExpenses.length}`}
                clubName={meeting?.name || "모임"}
                eventExpenses={eventExpenses}
                transactions={transactions}
                members={members}
              />
            ) : null}
            {tab === "report" ? (
              <ReportPanel
                key={`report-${meetingIdParam}-${dues.length}`}
                meetingId={isSample ? SAMPLE_MEETING_ID : meetingIdParam}
                isSample={isSample}
                sampleTransactions={SAMPLE_TRANSACTIONS}
                dues={dues}
                yearBalances={meeting?.yearBalances || {}}
                initialBalance={meeting?.initialBalance ?? 0}
              />
            ) : null}
            {tab === "clubInfo" && !canManageAccounts && !isSample ? (
              <ClubManagePanel
                key={`clubInfo-${meetingIdParam}`}
                meetingId={meetingIdParam}
              />
            ) : null}
            {tab === "admin" && canManageAccounts && meeting && user ? (
              <AdminAccountsPanel
                key={`admin-${meeting.id}`}
                meeting={meeting}
                myUid={user.uid}
                onMeetingChanged={reload}
              />
            ) : null}
            {tab === "settings" &&
            canManageAccounts &&
            meeting &&
            !isSample ? (
              <SettingsPanel
                key={`settings-${meeting.duesPaymentMethod || "HALF_YEARLY"}`}
                meetingId={meetingIdParam}
                meeting={meeting}
                onChanged={reload}
              />
            ) : null}
          </div>
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
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-base font-semibold leading-snug tracking-tight sm:text-lg ${valueClassName ?? ""}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}
