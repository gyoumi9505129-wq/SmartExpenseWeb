"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListPagination,
  PAGE_SIZE,
  paginateSlice,
} from "@/components/ListPagination";
import { categoriesFor, shortCategory } from "@/lib/categories";
import {
  deleteLedgerAndRevertDues,
  listUnpaidOptionsForMember,
  saveLedgerWithDuesPayment,
  unpaidOptionLabel,
} from "@/lib/dues";
import { REGULAR_DUES_CATEGORY, buildDuesPaymentNote } from "@/lib/duesSync";
import { formatWon, todayIsoDate } from "@/lib/format";
import { createTransaction, updateTransaction } from "@/lib/ledger";
import type { DuesRecord, Member, Transaction } from "@/lib/types";

type Props = {
  meetingId: string;
  rows: Transaction[];
  members: Member[];
  dues: DuesRecord[];
  canEdit: boolean;
  onChanged: () => Promise<void>;
};

type FormState = {
  date: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  description: string;
  amount: string;
  memberId: string;
  duesDetailId: string;
  /** 정기 회비 납부 방식 — 앱 DuesLedgerPaymentMode 와 동일 */
  paymentMode: "FULL" | "PARTIAL";
};

const emptyForm = (): FormState => ({
  date: todayIsoDate(),
  type: "EXPENSE",
  category: categoriesFor("EXPENSE")[0],
  description: "",
  amount: "",
  memberId: "",
  duesDetailId: "",
  paymentMode: "FULL",
});

function yearFromDate(date: string): number | null {
  const y = Number(date?.slice(0, 4));
  return Number.isFinite(y) && y > 1900 ? y : null;
}

export function LedgerPanel({
  meetingId,
  rows,
  members,
  dues,
  canEdit,
  onChanged,
}: Props) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 0 = 전체 */
  const [yearFilter, setYearFilter] = useState(0);
  const [page, setPage] = useState(1);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const row of rows) {
      const y = yearFromDate(row.date);
      if (y != null) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    if (yearFilter === 0) return rows;
    return rows.filter((row) => yearFromDate(row.date) === yearFilter);
  }, [rows, yearFilter]);

  useEffect(() => {
    setPage(1);
  }, [yearFilter, rows.length]);

  const pageRows = useMemo(
    () => paginateSlice(filtered, page, PAGE_SIZE),
    [filtered, page]
  );

  const cats = useMemo(() => categoriesFor(form.type), [form.type]);
  const isRegularDues =
    form.type === "INCOME" && form.category === REGULAR_DUES_CATEGORY && !editing;

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "ACTIVE"),
    [members]
  );

  const unpaidOptions = useMemo(
    () =>
      form.memberId
        ? listUnpaidOptionsForMember(dues, form.memberId)
        : [],
    [dues, form.memberId]
  );

  const selectedOpt = unpaidOptions.find((o) => o.detailId === form.duesDetailId);

  function applyAmountForMode(
    mode: "FULL" | "PARTIAL",
    remaining: number | undefined,
    currentAmount: string
  ): string {
    if (remaining == null || remaining <= 0) return "";
    if (mode === "FULL") return String(remaining);
    // 부분 납부: 잔여 전액이 채워져 있으면 비워 직접 입력
    const n = Number(currentAmount.replace(/,/g, ""));
    if (Number.isFinite(n) && n >= remaining) return "";
    return currentAmount;
  }

  function setPaymentMode(mode: "FULL" | "PARTIAL") {
    setForm((f) => {
      const opt = unpaidOptions.find((o) => o.detailId === f.duesDetailId);
      return {
        ...f,
        paymentMode: mode,
        amount: applyAmountForMode(mode, opt?.remaining, f.amount),
      };
    });
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(row: Transaction) {
    const type =
      row.type?.toUpperCase() === "INCOME" || row.incomeAmount > 0
        ? "INCOME"
        : "EXPENSE";
    setEditing(row);
    setForm({
      date: row.date || todayIsoDate(),
      type,
      category: row.category || categoriesFor(type)[0],
      description: row.description || "",
      amount: String(row.amount || row.incomeAmount || row.expenseAmount || ""),
      memberId: row.memberId || "",
      duesDetailId: row.linkedDuesDetailId || "",
      paymentMode: "FULL",
    });
    setError(null);
    setOpen(true);
  }

  function setMember(memberId: string) {
    const member = members.find((m) => m.id === memberId);
    const options = listUnpaidOptionsForMember(dues, memberId);
    const first = options[0];
    setForm((f) => ({
      ...f,
      memberId,
      duesDetailId: first?.detailId || "",
      description:
        member && first
          ? buildDuesPaymentNote(member.name, first.year, first.termLabel)
          : "",
      amount: first
        ? applyAmountForMode(f.paymentMode, first.remaining, "")
        : "",
    }));
  }

  function setDetail(detailId: string) {
    const opt = unpaidOptions.find((o) => o.detailId === detailId);
    const member = members.find((m) => m.id === form.memberId);
    setForm((f) => ({
      ...f,
      duesDetailId: detailId,
      description:
        member && opt
          ? buildDuesPaymentNote(member.name, opt.year, opt.termLabel)
          : f.description,
      amount: opt
        ? applyAmountForMode(f.paymentMode, opt.remaining, f.amount)
        : "",
    }));
  }

  async function save() {
    const amount = Number(form.amount.replace(/,/g, ""));
    if (!form.date) {
      setError("일자를 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("금액을 확인해 주세요.");
      return;
    }
    if (isRegularDues) {
      if (!form.memberId) {
        setError("회원을 선택해 주세요.");
        return;
      }
      if (!form.duesDetailId) {
        setError(
          unpaidOptions.length === 0
            ? "미납·부분납 회비가 없습니다. 회비를 먼저 등록해 주세요."
            : "납부 대상 월/기수를 선택해 주세요."
        );
        return;
      }
      const remaining = selectedOpt?.remaining ?? 0;
      if (remaining <= 0) {
        setError("이미 완납된 회비입니다.");
        return;
      }
      if (form.paymentMode === "PARTIAL" && amount > remaining) {
        setError(
          `부분 납부는 잔여(${remaining.toLocaleString("ko-KR")}원) 이내로 입력해 주세요.`
        );
        return;
      }
      if (form.paymentMode === "FULL" && amount !== remaining) {
        setError(
          `완납 금액은 잔여 ${remaining.toLocaleString("ko-KR")}원이어야 합니다.`
        );
        return;
      }
      if (amount > remaining) {
        setError(
          `잔여 회비(${remaining.toLocaleString("ko-KR")}원)를 초과할 수 없습니다.`
        );
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (isRegularDues) {
        const member = members.find((m) => m.id === form.memberId);
        await saveLedgerWithDuesPayment({
          meetingId,
          duesList: dues,
          memberId: form.memberId,
          memberName: member?.name || "",
          detailId: form.duesDetailId,
          amount,
          date: form.date,
        });
      } else {
        const input = {
          date: form.date,
          type: form.type,
          category: form.category,
          description: form.description.trim(),
          amount,
          memberId: form.memberId || null,
          linkedDuesDetailId: form.duesDetailId || null,
        };
        if (editing) await updateTransaction(meetingId, editing, input);
        else await createTransaction(meetingId, input);
      }
      setOpen(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Transaction) {
    if (!confirm("이 장부 내역을 삭제할까요? 연결된 회비 납부도 함께 되돌립니다."))
      return;
    setBusy(true);
    setError(null);
    try {
      await deleteLedgerAndRevertDues({
        meetingId,
        transaction: row,
        duesList: dues,
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-zinc-600">
            수입·지출 내역 ({filtered.length.toLocaleString("ko-KR")}건
            {yearFilter > 0 ? ` · ${yearFilter}년` : ""}
            {rows.length !== filtered.length
              ? ` / 전체 ${rows.length.toLocaleString("ko-KR")}건`
              : ""}
            )
          </p>
          <label className="flex items-center gap-1.5 text-sm text-zinc-600">
            연도
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(Number(e.target.value))}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              <option value={0}>전체</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </label>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
          >
            + 내역 추가
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">
            {editing ? "장부 수정" : "장부 추가"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500">
              일자
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              구분
              <select
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as "INCOME" | "EXPENSE";
                  setForm((f) => ({
                    ...f,
                    type,
                    category: categoriesFor(type)[0],
                    memberId: "",
                    duesDetailId: "",
                    description: "",
                    amount: "",
                    paymentMode: "FULL",
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="INCOME">수입</option>
                <option value="EXPENSE">지출</option>
              </select>
            </label>
            <label className="text-xs text-zinc-500 sm:col-span-2">
              항목
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value,
                    memberId: "",
                    duesDetailId: "",
                    description:
                      e.target.value === REGULAR_DUES_CATEGORY
                        ? ""
                        : f.description,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            {isRegularDues ? (
              <>
                <label className="text-xs text-zinc-500">
                  회원
                  <select
                    value={form.memberId}
                    onChange={(e) => setMember(e.target.value)}
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
                  납부 대상 월/기수
                  <select
                    value={form.duesDetailId}
                    onChange={(e) => setDetail(e.target.value)}
                    disabled={!form.memberId}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-50"
                  >
                    <option value="">
                      {form.memberId
                        ? unpaidOptions.length
                          ? "납부할 월/기수 선택 (분납 가능)"
                          : "미납 회비 없음"
                        : "회원을 먼저 선택"}
                    </option>
                    {unpaidOptions.map((o) => (
                      <option key={o.detailId} value={o.detailId}>
                        {unpaidOptionLabel(o)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="sm:col-span-2">
                  <p className="text-xs text-zinc-500">납부 방식</p>
                  <div className="mt-1 flex overflow-hidden rounded-lg border border-zinc-200">
                    {(
                      [
                        ["FULL", "완납"],
                        ["PARTIAL", "부분 납부"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPaymentMode(mode)}
                        className={`flex-1 px-3 py-2 text-sm font-medium ${
                          form.paymentMode === mode
                            ? "bg-emerald-600 text-white"
                            : "bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p
                    className={`mt-1.5 text-xs ${
                      form.paymentMode === "PARTIAL" && !selectedOpt
                        ? "font-medium text-red-600"
                        : "text-zinc-500"
                    }`}
                  >
                    {form.paymentMode === "PARTIAL"
                      ? selectedOpt
                        ? `잔여 ${formatWon(selectedOpt.remaining)} 이내로 입력하세요. (잔여 전액도 가능)`
                        : "납부 대상 월/기수를 먼저 선택해 주세요!!"
                      : selectedOpt
                        ? `회원·기수 선택 시 잔여 ${formatWon(selectedOpt.remaining)}이 자동 입력됩니다.`
                        : "회원과 납부 대상 월/기수를 선택하면 잔여 전액이 자동 입력됩니다. 일부만 내려면 부분 납부를 선택하세요."}
                  </p>
                </div>
              </>
            ) : null}

            <label className="text-xs text-zinc-500">
              {isRegularDues && form.paymentMode === "PARTIAL"
                ? selectedOpt
                  ? `부분 납부 금액 (잔여 ${selectedOpt.remaining.toLocaleString("ko-KR")}원 이내)`
                  : "부분 납부 금액"
                : isRegularDues && form.paymentMode === "FULL" && selectedOpt
                  ? `완납 금액 (잔여 ${formatWon(selectedOpt.remaining)})`
                  : "금액"}
              <input
                type="number"
                min={1}
                max={
                  isRegularDues && selectedOpt
                    ? selectedOpt.remaining
                    : undefined
                }
                value={form.amount}
                readOnly={
                  isRegularDues &&
                  form.paymentMode === "FULL" &&
                  !!selectedOpt
                }
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                className={`mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm ${
                  isRegularDues &&
                  form.paymentMode === "FULL" &&
                  selectedOpt
                    ? "bg-zinc-50 text-zinc-600"
                    : ""
                }`}
              />
            </label>
            <label className="text-xs text-zinc-500">
              내용
              <input
                type="text"
                value={form.description}
                readOnly={isRegularDues}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className={`mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm ${
                  isRegularDues ? "bg-zinc-50 text-zinc-600" : ""
                }`}
                placeholder={
                  isRegularDues
                    ? form.paymentMode === "PARTIAL"
                      ? "회원·기수 선택 후 부분 납부 금액을 입력하면 분납으로 반영됩니다."
                      : "회원·기수 선택 시 자동 생성"
                    : ""
                }
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          {yearFilter > 0
            ? `${yearFilter}년 장부 내역이 없습니다.`
            : "장부 내역이 없습니다."}
        </p>
      ) : (
        <>
          {/* 모바일 카드 */}
          <ul className="mt-4 space-y-3 md:hidden">
            {pageRows.map((row) => {
              const isIncome =
                row.type?.toUpperCase() === "INCOME" || row.incomeAmount > 0;
              const amount = isIncome ? row.incomeAmount : row.expenseAmount;
              return (
                <li
                  key={row.id}
                  className="touch-card rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <time className="text-sm font-medium text-zinc-800">
                      {row.date}
                    </time>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isIncome
                          ? "bg-blue-50 text-blue-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {isIncome ? "수입" : "지출"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-zinc-500">
                    {shortCategory(row.category) || "-"}
                  </p>
                  <p className="mt-1 text-base leading-snug text-zinc-900">
                    {row.description || "-"}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    {canEdit ? (
                      <div className="flex gap-3 text-xs">
                        <button
                          type="button"
                          className="font-medium text-emerald-700 hover:underline"
                          onClick={() => openEdit(row)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="font-medium text-red-600 hover:underline"
                          onClick={() => remove(row)}
                        >
                          삭제
                        </button>
                      </div>
                    ) : (
                      <span />
                    )}
                    <p
                      className={`text-lg font-semibold tracking-tight ${
                        isIncome ? "text-blue-600" : "text-red-600"
                      }`}
                    >
                      {amount ? formatWon(amount) : "-"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* 데스크톱 테이블 */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">일자</th>
                  <th className="px-4 py-3">구분</th>
                  <th className="px-4 py-3">항목</th>
                  <th className="px-4 py-3">내용</th>
                  <th className="px-4 py-3 text-right">수입</th>
                  <th className="px-4 py-3 text-right">지출</th>
                  {canEdit ? <th className="px-4 py-3 text-right">관리</th> : null}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="whitespace-nowrap px-4 py-3">{row.date}</td>
                    <td className="px-4 py-3">
                      {row.type?.toUpperCase() === "INCOME" || row.incomeAmount > 0
                        ? "수입"
                        : "지출"}
                    </td>
                    <td className="px-4 py-3">
                      {shortCategory(row.category) || "-"}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-zinc-600">
                      {row.description || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-600">
                      {row.incomeAmount ? formatWon(row.incomeAmount) : ""}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {row.expenseAmount ? formatWon(row.expenseAmount) : ""}
                    </td>
                    {canEdit ? (
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                        <button
                          type="button"
                          className="text-emerald-700 hover:underline"
                          onClick={() => openEdit(row)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="ml-3 text-red-600 hover:underline"
                          onClick={() => remove(row)}
                        >
                          삭제
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
