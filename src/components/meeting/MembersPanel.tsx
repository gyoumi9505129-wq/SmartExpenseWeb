"use client";

import { useMemo, useState } from "react";
import { DaumPostcodeDialog } from "@/components/DaumPostcodeDialog";
import { IsoDateField } from "@/components/IsoDateField";
import {
  formatResidenceRegion,
  pickRoadOrJibunAddress,
  type DaumPostcodeResult,
} from "@/lib/daumPostcode";
import {
  createMember,
  updateMemberFields,
  updateMemberStatus,
} from "@/lib/members";
import { normalizeIsoDateInput, todayIsoDate } from "@/lib/format";
import {
  MEMBER_ROLE_LABEL,
  MEMBER_STATUS_LABEL,
  type Meeting,
  type Member,
} from "@/lib/types";

type StatusFilter = "ALL" | "ACTIVE" | "DORMANT" | "WITHDRAWN";

type MemberFormState = {
  name: string;
  phone: string;
  email: string;
  role: string;
  residenceRegion: string;
  address: string;
  detailAddress: string;
  joinDate: string;
};

const EMPTY_FORM: MemberFormState = {
  name: "",
  phone: "",
  email: "",
  role: "GENERAL",
  residenceRegion: "",
  address: "",
  detailAddress: "",
  joinDate: todayIsoDate(),
};

type Props = {
  meetingId: string;
  meeting: Meeting;
  rows: Member[];
  canEdit: boolean;
  onChanged: () => Promise<void>;
};

export function MembersPanel({
  meetingId,
  meeting,
  rows,
  canEdit,
  onChanged,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberFormState>(EMPTY_FORM);
  const [addressSearchOpen, setAddressSearchOpen] = useState(false);

  const counts = useMemo(() => {
    let active = 0;
    let dormant = 0;
    let withdrawn = 0;
    for (const m of rows) {
      if (m.status === "DORMANT") dormant += 1;
      else if (m.status === "WITHDRAWN") withdrawn += 1;
      else active += 1;
    }
    return {
      ALL: rows.length,
      ACTIVE: active,
      DORMANT: dormant,
      WITHDRAWN: withdrawn,
    };
  }, [rows]);

  const filtered =
    filter === "ALL" ? rows : rows.filter((m) => m.status === filter);

  function patchForm(patch: Partial<MemberFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function openCreate() {
    setError(null);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, joinDate: todayIsoDate() });
    setFormOpen(true);
  }

  function openEdit(member: Member) {
    setError(null);
    setEditingId(member.id);
    setForm({
      name: member.name || "",
      phone: member.phone || "",
      email: member.email || "",
      role: member.role || "GENERAL",
      residenceRegion: member.residenceRegion || "",
      address: member.address || "",
      detailAddress: member.detailAddress || "",
      joinDate: member.joinDate || todayIsoDate(),
    });
    setFormOpen(true);
  }

  function applyAddressSearch(data: DaumPostcodeResult) {
    patchForm({
      residenceRegion: formatResidenceRegion(data),
      address: pickRoadOrJibunAddress(data),
    });
    setAddressSearchOpen(false);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveMember() {
    const name = form.name.trim();
    if (!name) {
      setError("이름을 입력해 주세요.");
      return;
    }
    const joinDate = normalizeIsoDateInput(form.joinDate);
    if (!joinDate) {
      setError("가입일은 YYYY-MM-DD 또는 YYYYMMDD 로 입력해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateMemberFields(meetingId, editingId, {
          name,
          phone: form.phone,
          email: form.email,
          role: form.role,
          residenceRegion: form.residenceRegion,
          address: form.address,
          detailAddress: form.detailAddress,
          joinDate,
        });
      } else {
        await createMember(meetingId, {
          name,
          phone: form.phone,
          email: form.email,
          role: form.role,
          residenceRegion: form.residenceRegion,
          address: form.address,
          detailAddress: form.detailAddress,
          joinDate,
        });
      }
      closeForm();
      await onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : editingId
            ? "회원 수정에 실패했습니다."
            : "회원 등록에 실패했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(
    member: Member,
    status: "ACTIVE" | "DORMANT" | "WITHDRAWN"
  ) {
    const label = MEMBER_STATUS_LABEL[status] || status;
    if (!confirm(`${member.name} 님을 「${label}」(으)로 변경할까요?`)) return;
    setBusy(true);
    setError(null);
    try {
      await updateMemberStatus({ meetingId, meeting, member, status });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, role: string) {
    setBusy(true);
    setError(null);
    try {
      await updateMemberFields(meetingId, member.id, { role });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "직책 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">
          회원 ({counts.ALL}명)
        </h2>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              if (formOpen && !editingId) closeForm();
              else openCreate();
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white"
          >
            + 회원 등록
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["ALL", "전체"],
            ["ACTIVE", "활동중"],
            ["DORMANT", "휴면"],
            ["WITHDRAWN", "탈퇴"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === id
                ? "bg-zinc-800 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {label} {counts[id]}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {formOpen && canEdit ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">
            {editingId ? "회원 수정" : "회원 등록"}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-zinc-500">
              이름 *
              <input
                lang="ko"
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder="이름"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              전화
              <input
                type="tel"
                lang="en"
                data-input-lang="numeric"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => patchForm({ phone: e.target.value })}
                placeholder="전화"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              이메일
              <input
                type="email"
                lang="ko"
                value={form.email}
                onChange={(e) => patchForm({ email: e.target.value })}
                placeholder="이메일"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              직책
              <select
                value={form.role}
                onChange={(e) => patchForm({ role: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {Object.entries(MEMBER_ROLE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              거주
              <input
                lang="ko"
                value={form.residenceRegion}
                onChange={(e) =>
                  patchForm({ residenceRegion: e.target.value })
                }
                placeholder="예: 경기도 화성"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-zinc-500">
              가입일
              <IsoDateField
                value={form.joinDate}
                onChange={(joinDate) => patchForm({ joinDate })}
                disabled={busy}
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs text-zinc-500">
                  주소
                  <input
                    lang="ko"
                    value={form.address}
                    readOnly
                    placeholder="주소 검색으로 입력"
                    className="mt-1 w-full cursor-default rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAddressSearchOpen(true)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  주소 검색
                </button>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                주소는 검색으로만 입력됩니다. 상세 주소(동·호수 등)만 직접
                입력하세요.
              </p>
            </div>
            <label className="text-xs text-zinc-500 sm:col-span-2 lg:col-span-3">
              상세 주소
              <input
                lang="ko"
                value={form.detailAddress}
                onChange={(e) => patchForm({ detailAddress: e.target.value })}
                placeholder="동·호수 등"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveMember()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {editingId ? "수정 저장" : "저장"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={closeForm}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {addressSearchOpen ? (
        <DaumPostcodeDialog
          onComplete={applyAddressSearch}
          onClose={() => setAddressSearchOpen(false)}
        />
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">표시할 회원이 없습니다.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-3 md:hidden">
            {filtered.map((row) => {
              const statusLabel =
                MEMBER_STATUS_LABEL[row.status] || row.status;
              const roleLabel =
                MEMBER_ROLE_LABEL[row.role] || row.role || "일반";
              const statusClass =
                row.status === "ACTIVE"
                  ? "bg-emerald-50 text-emerald-700"
                  : row.status === "DORMANT"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-zinc-100 text-zinc-600";
              return (
                <li
                  key={row.id}
                  className={`touch-card rounded-2xl border bg-white p-4 shadow-sm ${
                    editingId === row.id
                      ? "border-emerald-300"
                      : "border-zinc-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-zinc-900">
                      {row.name}
                    </p>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                      {roleLabel}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {canEdit ? (
                    <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                      직책
                      <select
                        value={row.role || "GENERAL"}
                        disabled={busy}
                        onChange={(e) => changeRole(row, e.target.value)}
                        className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-800"
                      >
                        {Object.entries(MEMBER_ROLE_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <dl className="mt-3 space-y-1.5 text-sm text-zinc-600">
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-zinc-400">전화</dt>
                      <dd>{row.phone || "-"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-zinc-400">거주</dt>
                      <dd>{row.residenceRegion || "-"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-zinc-400">가입</dt>
                      <dd>{row.joinDate || "-"}</dd>
                    </div>
                  </dl>
                  {canEdit ? (
                    <div className="mt-3 flex flex-wrap gap-3 border-t border-zinc-100 pt-3 text-xs">
                      <button
                        type="button"
                        className="font-medium text-emerald-700 hover:underline"
                        onClick={() => openEdit(row)}
                      >
                        수정
                      </button>
                      {row.status !== "ACTIVE" ? (
                        <button
                          type="button"
                          className="font-medium text-emerald-700 hover:underline"
                          onClick={() => setStatus(row, "ACTIVE")}
                        >
                          활동중
                        </button>
                      ) : null}
                      {row.status !== "DORMANT" ? (
                        <button
                          type="button"
                          className="font-medium text-amber-700 hover:underline"
                          onClick={() => setStatus(row, "DORMANT")}
                        >
                          휴면
                        </button>
                      ) : null}
                      {row.status !== "WITHDRAWN" ? (
                        <button
                          type="button"
                          className="font-medium text-red-600 hover:underline"
                          onClick={() => setStatus(row, "WITHDRAWN")}
                        >
                          탈퇴
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">이름</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">직책</th>
                  <th className="px-4 py-3">전화</th>
                  <th className="px-4 py-3">거주</th>
                  <th className="px-4 py-3">가입일</th>
                  {canEdit ? (
                    <th className="px-4 py-3 text-right">관리</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t border-zinc-100 ${
                      editingId === row.id ? "bg-emerald-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3">
                      {MEMBER_STATUS_LABEL[row.status] || row.status}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select
                          value={row.role || "GENERAL"}
                          disabled={busy}
                          onChange={(e) => changeRole(row, e.target.value)}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs"
                        >
                          {Object.entries(MEMBER_ROLE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        MEMBER_ROLE_LABEL[row.role] || row.role
                      )}
                    </td>
                    <td className="px-4 py-3">{row.phone || "-"}</td>
                    <td className="px-4 py-3">{row.residenceRegion || "-"}</td>
                    <td className="px-4 py-3">{row.joinDate || "-"}</td>
                    {canEdit ? (
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                        <button
                          type="button"
                          className="text-emerald-700 hover:underline"
                          onClick={() => openEdit(row)}
                        >
                          수정
                        </button>
                        {row.status !== "ACTIVE" ? (
                          <button
                            type="button"
                            className="ml-2 text-emerald-700 hover:underline"
                            onClick={() => setStatus(row, "ACTIVE")}
                          >
                            활동중
                          </button>
                        ) : null}
                        {row.status !== "DORMANT" ? (
                          <button
                            type="button"
                            className="ml-2 text-amber-700 hover:underline"
                            onClick={() => setStatus(row, "DORMANT")}
                          >
                            휴면
                          </button>
                        ) : null}
                        {row.status !== "WITHDRAWN" ? (
                          <button
                            type="button"
                            className="ml-2 text-red-600 hover:underline"
                            onClick={() => setStatus(row, "WITHDRAWN")}
                          >
                            탈퇴
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
