"use client";

import { useMemo, useState } from "react";
import {
  createMember,
  updateMemberFields,
  updateMemberStatus,
} from "@/lib/members";
import {
  MEMBER_ROLE_LABEL,
  MEMBER_STATUS_LABEL,
  type Meeting,
  type Member,
} from "@/lib/types";

type StatusFilter = "ALL" | "ACTIVE" | "DORMANT" | "WITHDRAWN";

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
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

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

  async function addMember() {
    setBusy(true);
    setError(null);
    try {
      await createMember(meetingId, { name, phone, email });
      setCreateOpen(false);
      setName("");
      setPhone("");
      setEmail("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "회원 등록에 실패했습니다.");
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
            onClick={() => setCreateOpen((v) => !v)}
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

      {createOpen && canEdit ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold">회원 등록</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input
              placeholder="이름 *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              placeholder="전화"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={addMember}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-xs"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">표시할 회원이 없습니다.</p>
      ) : (
        <>
          {/* 모바일 카드 */}
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
                  className="touch-card rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
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

          {/* 데스크톱 테이블 */}
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
                  <tr key={row.id} className="border-t border-zinc-100">
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
                        {row.status !== "ACTIVE" ? (
                          <button
                            type="button"
                            className="text-emerald-700 hover:underline"
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
