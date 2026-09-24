"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListPagination,
  PAGE_SIZE,
  paginateSlice,
} from "@/components/ListPagination";
import { MemberDuesDetailDialog } from "@/components/meeting/MemberDuesDetailDialog";
import { YearSelect } from "@/components/YearSelect";
import {
  createOrUpdateDues,
  type DuesTermPaymentInput,
} from "@/lib/dues";
import { duesYearOptions } from "@/lib/duesSync";
import { formatWon, todayIsoDate } from "@/lib/format";
import { buildMemberDuesSummaries } from "@/lib/memberDuesSummary";
import type { DuesRecord, Member } from "@/lib/types";

type Props = {
  meetingId: string;
  dues: DuesRecord[];
  members: Member[];
  canEdit: boolean;
  defaultPaymentMethod?: string;
  onChanged: () => Promise<void>;
};

type TermDraft = {
  termLabel: string;
  amount: number;
  payDate: string;
  isExcluded: boolean;
  isPaid: boolean;
  additionalPay: string;
  paidAmount: number;
  paymentHistory: { payDate: string; amount: number }[];
};

function buildTermDrafts(
  paymentMethod: string,
  year: number,
  totalTarget: number,
  firstHalfDate: string,
  secondHalfDate: string
): TermDraft[] {
  const method = paymentMethod.toUpperCase();
  if (method.includes("HALF")) {
    const half = Math.floor(totalTarget / 2);
    const second = totalTarget - half;
    return [
      {
        termLabel: "상반기",
        amount: half,
        payDate: firstHalfDate || `${year}-01-01`,
        isExcluded: false,
        isPaid: false,
        additionalPay: "",
        paidAmount: 0,
        paymentHistory: [],
      },
      {
        termLabel: "하반기",
        amount: second,
        payDate: secondHalfDate || `${year}-07-01`,
        isExcluded: false,
        isPaid: false,
        additionalPay: "",
        paidAmount: 0,
        paymentHistory: [],
      },
    ];
  }
  return [
    {
      termLabel: "연간",
      amount: totalTarget,
      payDate: firstHalfDate || `${year}-01-01`,
      isExcluded: false,
      isPaid: false,
      additionalPay: "",
      paidAmount: 0,
      paymentHistory: [],
    },
  ];
}

function termDraftsFromExisting(row: DuesRecord): TermDraft[] {
  return row.details.map((d) => {
    const history =
      d.payments.filter((p) => p.amount > 0).length > 0
        ? d.payments
            .filter((p) => p.amount > 0)
            .map((p) => ({ payDate: p.payDate || "-", amount: p.amount }))
            .sort((a, b) => a.payDate.localeCompare(b.payDate))
        : d.paidAmount > 0
          ? [{ payDate: d.payDate || "-", amount: d.paidAmount }]
          : [];
    const paidAmount = Math.max(
      d.paidAmount,
      history.reduce((s, h) => s + h.amount, 0)
    );
    const remaining = Math.max(0, d.amount - paidAmount);
    const fullyPaid = !d.isExcluded && d.amount > 0 && paidAmount >= d.amount;
    return {
      termLabel: d.termLabel,
      amount: d.amount,
      payDate: d.payDate || todayIsoDate(),
      isExcluded: d.isExcluded,
      isPaid: fullyPaid,
      additionalPay: "",
      paidAmount,
      paymentHistory: history,
    };
  });
}

function findExistingDues(
  dues: DuesRecord[],
  memberId: string,
  year: number
): DuesRecord | null {
  if (!memberId || !year) return null;
  return dues.find((d) => d.memberId === memberId && d.year === year) ?? null;
}

export function DuesPanel({
  meetingId,
  dues,
  members,
  canEdit,
  defaultPaymentMethod = "HALF_YEARLY",
  onChanged,
}: Props) {
  const years = useMemo(
    () => duesYearOptions(dues.map((d) => d.year)),
    [dues]
  );

  const currentYear = new Date().getFullYear();
  const [memberQuery, setMemberQuery] = useState("");
  const [page, setPage] = useState(1);
  const [createYear, setCreateYear] = useState(currentYear);
  const [firstHalfDate, setFirstHalfDate] = useState(`${currentYear}-01-01`);
  const [secondHalfDate, setSecondHalfDate] = useState(`${currentYear}-07-01`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [targetAmount, setTargetAmount] = useState("300000");
  const [editingDuesId, setEditingDuesId] = useState<string | null>(null);
  const [termDrafts, setTermDrafts] = useState<TermDraft[]>(() =>
    buildTermDrafts(
      defaultPaymentMethod,
      currentYear,
      300000,
      `${currentYear}-01-01`,
      `${currentYear}-07-01`
    )
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const memberSummaries = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return buildMemberDuesSummaries(dues, members).filter((row) =>
      q ? row.memberName.toLowerCase().includes(q) : true
    );
  }, [dues, members, memberQuery]);

  const totalUnpaidAmount = useMemo(
    () => memberSummaries.reduce((s, row) => s + row.totalUnpaidAmount, 0),
    [memberSummaries]
  );

  const selectedSummary = useMemo(() => {
    if (!selectedMemberId) return null;
    return (
      buildMemberDuesSummaries(dues, members).find(
        (r) => r.memberId === selectedMemberId
      ) ?? null
    );
  }, [selectedMemberId, dues, members]);

  useEffect(() => {
    setPage(1);
  }, [memberQuery, dues.length, members.length]);

  useEffect(() => {
    if (years.length > 0 && !years.includes(createYear)) {
      setCreateYear(years[0]!);
    }
  }, [years, createYear]);

  const pageRows = useMemo(
    () => paginateSlice(memberSummaries, page, PAGE_SIZE),
    [memberSummaries, page]
  );

  const activeMembers = members.filter((m) => m.status === "ACTIVE");
  const isHalfYearly = (defaultPaymentMethod || "HALF_YEARLY")
    .toUpperCase()
    .includes("HALF");

  const createPaidSum = termDrafts.reduce((s, t) => {
    if (t.isExcluded) return s;
    const base = t.paidAmount;
    if (t.isPaid && t.paidAmount < t.amount) return s + t.amount;
    if (t.isPaid) return s + t.paidAmount;
    const add = Number(t.additionalPay.replace(/,/g, ""));
    const extra = Number.isFinite(add) && add > 0 ? add : 0;
    return s + base + extra;
  }, 0);
  const createTarget = Number(targetAmount.replace(/,/g, "")) || 0;
  const createRemain = Math.max(0, createTarget - createPaidSum);

  function loadMemberYearForm(nextMemberId: string, nextYear: number) {
    const existing = findExistingDues(dues, nextMemberId, nextYear);
    const first = `${nextYear}-01-01`;
    const second = `${nextYear}-07-01`;
    if (existing) {
      setEditingDuesId(existing.id);
      setTargetAmount(String(existing.totalTargetAmount));
      setTermDrafts(termDraftsFromExisting(existing));
      const half = existing.details.find((d) => d.termLabel === "상반기");
      const secondTerm = existing.details.find((d) => d.termLabel === "하반기");
      setFirstHalfDate(half?.payDate || first);
      setSecondHalfDate(secondTerm?.payDate || second);
      return;
    }
    setEditingDuesId(null);
    setFirstHalfDate(first);
    setSecondHalfDate(second);
    const amount = Number(targetAmount.replace(/,/g, "")) || 0;
    setTermDrafts(
      buildTermDrafts(defaultPaymentMethod, nextYear, amount, first, second)
    );
  }

  function rebuildTerms(
    nextYear: number,
    nextTarget: string,
    firstDate: string,
    secondDate: string
  ) {
    const amount = Number(nextTarget.replace(/,/g, "")) || 0;
    if (editingDuesId) {
      setTermDrafts((rows) => {
        if (!rows.length) {
          return buildTermDrafts(
            defaultPaymentMethod,
            nextYear,
            amount,
            firstDate,
            secondDate
          );
        }
        if (
          rows.length === 2 &&
          defaultPaymentMethod.toUpperCase().includes("HALF")
        ) {
          const half = Math.floor(amount / 2);
          const secondAmt = amount - half;
          return rows.map((r, i) => {
            const termAmount = i === 0 ? half : secondAmt;
            return {
              ...r,
              amount: termAmount,
              isPaid:
                !r.isExcluded && termAmount > 0 && r.paidAmount >= termAmount,
            };
          });
        }
        return rows.map((r) => ({
          ...r,
          amount,
          isPaid: !r.isExcluded && amount > 0 && r.paidAmount >= amount,
        }));
      });
      return;
    }
    setTermDrafts(
      buildTermDrafts(
        defaultPaymentMethod,
        nextYear,
        amount,
        firstDate,
        secondDate
      )
    );
  }

  function onCreateYearChange(nextYear: number) {
    setCreateYear(nextYear);
    loadMemberYearForm(memberId, nextYear);
  }

  function onMemberChange(nextMemberId: string) {
    setMemberId(nextMemberId);
    loadMemberYearForm(nextMemberId, createYear);
  }

  function onTargetAmountChange(value: string) {
    setTargetAmount(value);
    rebuildTerms(createYear, value, firstHalfDate, secondHalfDate);
  }

  function updateTerm(termLabel: string, patch: Partial<TermDraft>) {
    setTermDrafts((rows) =>
      rows.map((r) => {
        if (r.termLabel !== termLabel) return r;
        const remaining = Math.max(0, r.amount - r.paidAmount);
        const next = { ...r, ...patch };
        if (patch.isExcluded) {
          next.isPaid = false;
          next.additionalPay = "";
        }
        if (patch.isPaid) {
          next.additionalPay = "";
          next.isExcluded = false;
        }
        if (patch.additionalPay != null) {
          const n = Number(String(patch.additionalPay).replace(/,/g, ""));
          if (Number.isFinite(n) && remaining > 0 && n > remaining) {
            next.additionalPay = String(remaining);
          }
          if (remaining <= 0) next.additionalPay = "";
          else next.isPaid = false;
        }
        return next;
      })
    );
  }

  function openMemberRow(row: {
    memberId: string;
    hasRegisteredDues: boolean;
  }) {
    setError(null);
    if (row.hasRegisteredDues) {
      setSelectedMemberId(row.memberId);
      return;
    }
    if (canEdit) {
      setCreateOpen(true);
      onMemberChange(row.memberId);
      return;
    }
    setError("아직 회비가 등록되지 않았습니다.");
  }

  async function createDues() {
    if (!memberId) {
      setError("회원을 선택해 주세요.");
      return;
    }
    const amount = Number(targetAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("목표 금액을 확인해 주세요.");
      return;
    }
    if (isHalfYearly && (!firstHalfDate || !secondHalfDate)) {
      setError("상·하반기 납부일자를 입력해 주세요.");
      return;
    }

    for (const t of termDrafts) {
      if (t.isExcluded) continue;
      const remaining = Math.max(0, t.amount - t.paidAmount);
      const add = Number(t.additionalPay.replace(/,/g, ""));
      if (remaining <= 0 && Number.isFinite(add) && add > 0) {
        setError(`${t.termLabel}: 이미 완납된 회차입니다.`);
        return;
      }
      if (t.isPaid && remaining <= 0) continue;
      if (Number.isFinite(add) && add > remaining) {
        setError(
          `${t.termLabel}: 부분 납부 금액이 잔여(${remaining.toLocaleString("ko-KR")}원)를 초과합니다.`
        );
        return;
      }
    }

    const hasNewPayment = termDrafts.some((t) => {
      if (t.isExcluded) return true;
      const remaining = Math.max(0, t.amount - t.paidAmount);
      if (t.isPaid && remaining > 0) return true;
      const add = Number(t.additionalPay.replace(/,/g, ""));
      return Number.isFinite(add) && add > 0;
    });

    const existing = findExistingDues(dues, memberId, createYear);
    const member = activeMembers.find((m) => m.id === memberId);
    const termPayments: DuesTermPaymentInput[] = termDrafts.map((t) => {
      const remaining = Math.max(0, t.amount - t.paidAmount);
      const add = Number(t.additionalPay.replace(/,/g, "")) || 0;
      return {
        termLabel: t.termLabel,
        isExcluded: t.isExcluded,
        payDate: t.payDate,
        markFullyPaid: t.isPaid && remaining > 0,
        additionalAmount: !t.isPaid && remaining > 0 ? add : 0,
      };
    });

    setBusy(true);
    setError(null);
    try {
      await createOrUpdateDues({
        meetingId,
        duesId: existing?.id || editingDuesId || undefined,
        existing: existing,
        memberId,
        memberName: member?.name || existing?.memberName || "",
        year: createYear,
        totalTargetAmount: amount,
        paymentMethod:
          existing?.paymentMethod || defaultPaymentMethod || "HALF_YEARLY",
        termDates: {
          firstHalf: firstHalfDate,
          secondHalf: secondHalfDate,
          yearly: firstHalfDate,
        },
        termPayments: hasNewPayment || existing ? termPayments : undefined,
      });
      setCreateOpen(false);
      setMemberId("");
      setEditingDuesId(null);
      setTermDrafts(
        buildTermDrafts(
          defaultPaymentMethod,
          createYear,
          Number(targetAmount.replace(/,/g, "")) || 300000,
          firstHalfDate,
          secondHalfDate
        )
      );
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "회비 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-zinc-600">
            회원명
            <input
              type="search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="이름 검색"
              className="w-36 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm sm:w-44"
            />
          </label>
          <p className="text-xs text-zinc-500">
            {memberSummaries.length.toLocaleString("ko-KR")}명
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
          >
            + 회비 등록
          </button>
        ) : null}
      </div>

      <p
        className={`mt-4 text-lg font-bold tracking-tight sm:text-xl ${
          totalUnpaidAmount > 0 ? "text-red-600" : "text-emerald-700"
        }`}
      >
        총 미납액: {formatWon(totalUnpaidAmount)}
      </p>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {createOpen && canEdit ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">
            {editingDuesId ? "회비 납부 (기존 분납 반영)" : "회비 등록"}
          </h3>
          {editingDuesId ? (
            <p className="mt-1 text-xs text-emerald-700">
              이미 등록된 회비입니다. 분납 이력을 확인한 뒤 잔여분만 추가 납부할 수
              있습니다.
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-zinc-500">
              연도
              <YearSelect
                value={createYear}
                onChange={onCreateYearChange}
                years={years}
                className="mt-1 w-full [&_button]:py-2"
              />
            </label>
            <label className="text-xs text-zinc-500">
              회원
              <select
                value={memberId}
                onChange={(e) => onMemberChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">선택</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              연회비 (총 납부 대상 금액)
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => onTargetAmountChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <p className="text-blue-600">납부: {formatWon(createPaidSum)}</p>
            <p
              className={
                createRemain > 0 ? "text-red-600" : "text-emerald-700"
              }
            >
              {createRemain > 0 ? `미납: ${formatWon(createRemain)}` : "완납"}
            </p>
            <p className="text-zinc-500">
              납부 방법: {isHalfYearly ? "반기" : "연간"}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              회차별 납부 (완납 · 부분납 · 제외)
            </p>
            {termDrafts.map((t) => {
              const remaining = Math.max(0, t.amount - t.paidAmount);
              const fullyPaid = !t.isExcluded && remaining <= 0 && t.amount > 0;
              const status = t.isExcluded
                ? "제외"
                : fullyPaid || (t.isPaid && remaining <= 0)
                  ? "완납"
                  : t.paidAmount > 0 ||
                      Number(t.additionalPay.replace(/,/g, "")) > 0
                    ? `부분납 ${formatWon(t.paidAmount)} · 잔여 ${formatWon(remaining)}`
                    : `미납 ${formatWon(t.amount)}`;
              return (
                <div
                  key={t.termLabel}
                  className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-800">
                        {t.termLabel} · {formatWon(t.amount)}
                      </p>
                      <p
                        className={`text-xs ${
                          fullyPaid
                            ? "text-emerald-700"
                            : t.paidAmount > 0
                              ? "text-red-600"
                              : "text-zinc-500"
                        }`}
                      >
                        {status}
                      </p>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={t.isExcluded}
                        onChange={(e) =>
                          updateTerm(t.termLabel, {
                            isExcluded: e.target.checked,
                          })
                        }
                      />
                      제외
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={fullyPaid || (t.isPaid && remaining > 0)}
                        disabled={t.isExcluded || fullyPaid}
                        onChange={(e) =>
                          updateTerm(t.termLabel, {
                            isPaid: e.target.checked,
                          })
                        }
                      />
                      완납
                    </label>
                  </div>

                  {t.paymentHistory.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-medium text-zinc-500">
                        분납 이력 ({t.paymentHistory.length}회)
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {t.paymentHistory.map((h, i) => (
                          <li
                            key={`${h.payDate}-${h.amount}-${i}`}
                            className="flex justify-between text-xs text-zinc-700"
                          >
                            <span>{h.payDate}</span>
                            <span className="text-blue-600">
                              {formatWon(h.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {!t.isExcluded && !fullyPaid ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-zinc-500">
                        납부일자
                        <input
                          type="date"
                          value={t.payDate}
                          onChange={(e) =>
                            updateTerm(t.termLabel, {
                              payDate: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </label>
                      {!t.isPaid ? (
                        <label className="text-xs text-zinc-500">
                          추가 납부 금액 (잔여 {formatWon(remaining)} 이내)
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            placeholder="부분 납부 시 입력"
                            value={t.additionalPay}
                            onChange={(e) =>
                              updateTerm(t.termLabel, {
                                additionalPay: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                          />
                        </label>
                      ) : (
                        <p className="self-end text-xs text-emerald-700">
                          잔여 {formatWon(remaining)}이 장부에 반영됩니다.
                        </p>
                      )}
                    </div>
                  ) : fullyPaid ? (
                    <p className="mt-2 text-xs text-emerald-700">
                      이 회차는 완납되었습니다.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            완납·부분납을 입력하면 장부에 정기 회비 수입이 자동 생성됩니다.
            {editingDuesId
              ? " 기존 분납 이력은 유지되고, 이번에 입력한 금액만 추가됩니다."
              : " 아무 입력 없이 등록하면 미납 회비만 생성됩니다."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={createDues}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {editingDuesId ? "납부 저장" : "등록"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setEditingDuesId(null);
                setMemberId("");
              }}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {memberSummaries.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          {memberQuery.trim()
            ? "검색 조건에 맞는 회원이 없습니다."
            : "표시할 회원이 없습니다."}
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3 md:hidden">
            {pageRows.map((row) => (
              <li key={row.memberId}>
                <button
                  type="button"
                  onClick={() => openMemberRow(row)}
                  className="touch-card w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-semibold text-zinc-900">
                      {row.memberName}
                    </p>
                    <p
                      className={`shrink-0 text-sm font-semibold ${
                        !row.hasRegisteredDues
                          ? "text-zinc-400"
                          : row.isFullyPaid
                            ? "text-blue-600"
                            : "text-red-600"
                      }`}
                    >
                      {!row.hasRegisteredDues
                        ? "-"
                        : row.isFullyPaid
                          ? "완납"
                          : formatWon(row.totalUnpaidAmount)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    {row.unpaidDetails ||
                      (row.isFullyPaid ? "미납 없음" : "회비 미등록")}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">회원</th>
                  <th className="px-4 py-3 text-right">미납금액</th>
                  <th className="px-4 py-3 text-right">미납 내역</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.memberId}
                    className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"
                    onClick={() => openMemberRow(row)}
                  >
                    <td className="px-4 py-3 font-medium">{row.memberName}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        !row.hasRegisteredDues
                          ? "text-zinc-400"
                          : row.isFullyPaid
                            ? "text-blue-600"
                            : "text-red-600"
                      }`}
                    >
                      {!row.hasRegisteredDues
                        ? "-"
                        : row.isFullyPaid
                          ? "완납"
                          : formatWon(row.totalUnpaidAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {row.unpaidDetails || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={memberSummaries.length}
            onPageChange={setPage}
          />
        </>
      )}

      {selectedSummary ? (
        <MemberDuesDetailDialog
          meetingId={meetingId}
          summary={selectedSummary}
          canEdit={canEdit}
          onClose={() => setSelectedMemberId(null)}
          onChanged={async () => {
            await onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
