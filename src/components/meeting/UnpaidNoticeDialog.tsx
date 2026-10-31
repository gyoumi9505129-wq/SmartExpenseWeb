"use client";

import { useEffect, useMemo, useState } from "react";
import { formatWon } from "@/lib/format";
import type { ClubAccountRow } from "@/lib/meetingBackup";
import type { MemberDuesSummary } from "@/lib/memberDuesSummary";
import {
  buildGroupUnpaidNotice,
  buildIndividualUnpaidNotice,
  copyTextToClipboard,
  pickPrimaryAccount,
  unpaidMembersOnly,
} from "@/lib/unpaidNotice";

type Props = {
  clubName?: string;
  summaries: MemberDuesSummary[];
  accounts: ClubAccountRow[];
  onClose: () => void;
};

type Tab = "group" | "individual";

export function UnpaidNoticeDialog({
  clubName,
  summaries,
  accounts,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>("group");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const account = useMemo(() => pickPrimaryAccount(accounts), [accounts]);
  const unpaid = useMemo(() => unpaidMembersOnly(summaries), [summaries]);

  useEffect(() => {
    if (unpaid.length === 0) {
      setSelectedMemberId("");
      return;
    }
    if (!unpaid.some((u) => u.memberId === selectedMemberId)) {
      setSelectedMemberId(unpaid[0]!.memberId);
    }
  }, [unpaid, selectedMemberId]);

  const selected = unpaid.find((u) => u.memberId === selectedMemberId) || null;

  const groupText = useMemo(
    () =>
      buildGroupUnpaidNotice({
        clubName,
        summaries,
        account,
      }),
    [clubName, summaries, account]
  );

  const individualText = useMemo(() => {
    if (!selected) return "";
    return buildIndividualUnpaidNotice({
      clubName,
      summary: selected,
      account,
    });
  }, [clubName, selected, account]);

  const preview = tab === "group" ? groupText : individualText;

  async function copyPreview() {
    setError(null);
    setInfo(null);
    if (!preview.trim()) {
      setError("복사할 내용이 없습니다.");
      return;
    }
    try {
      await copyTextToClipboard(preview);
      setInfo("클립보드에 복사했습니다. 단톡·문자에 붙여넣기 하세요.");
    } catch {
      setError("복사에 실패했습니다. 내용을 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">
                미납 안내 공유
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                단톡·단체문자용 / 개인 안내용 문구를 복사할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
            >
              닫기
            </button>
          </div>

          <div className="mt-3 flex overflow-hidden rounded-lg border border-zinc-200">
            {(
              [
                ["group", "단체 공유"],
                ["individual", "개별 안내"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setInfo(null);
                  setError(null);
                }}
                className={`flex-1 px-3 py-2 text-sm font-medium ${
                  tab === id
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {account ? (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              입금 계좌: {account.bankName} {account.accountNumber}
              {account.holderName ? ` (예금주 ${account.holderName})` : ""}
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              등록된 입금 계좌가 없습니다. 설정에서 계좌를 등록하면 안내문에
              포함됩니다.
            </p>
          )}

          {tab === "individual" ? (
            <label className="block text-xs text-zinc-500">
              회원 선택
              <select
                value={selectedMemberId}
                onChange={(e) => {
                  setSelectedMemberId(e.target.value);
                  setInfo(null);
                  setError(null);
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                disabled={unpaid.length === 0}
              >
                {unpaid.length === 0 ? (
                  <option value="">미납 회원 없음</option>
                ) : (
                  unpaid.map((u) => (
                    <option key={u.memberId} value={u.memberId}>
                      {u.memberName} · {formatWon(u.totalUnpaidAmount)}
                    </option>
                  ))
                )}
              </select>
            </label>
          ) : null}

          <textarea
            readOnly
            value={preview}
            rows={16}
            className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 font-mono text-xs leading-relaxed text-zinc-800"
          />

          {info ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {info}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            onClick={() => void copyPreview()}
            disabled={!preview.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            문구 복사
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs text-zinc-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
