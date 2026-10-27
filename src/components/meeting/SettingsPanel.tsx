"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearMeetingData,
  downloadBackupJson,
  exportMeetingBackup,
  loadSeedBackupFromPublic,
  readBackupFile,
  restoreMeetingBackup,
  SEED_FILE_PATH,
} from "@/lib/meetingBackup";
import { MeetingHistoryDialog } from "@/components/meeting/MeetingHistoryDialog";
import {
  deleteAccount,
  DUES_PAYMENT_METHODS,
  listAccounts,
  listHistories,
  updateDuesPaymentMethod,
  updateMeetingTitle,
  upsertAccount,
} from "@/lib/meetingSettings";
import type { ClubAccountRow } from "@/lib/meetingBackup";
import type { Meeting } from "@/lib/types";
import {
  TITLE_COLORS,
  TITLE_SIZES,
  nameTitleClass,
  normalizeTitleColor,
  normalizeTitleSize,
  sloganTitleClass,
  type TitleColor,
  type TitleSize,
} from "@/lib/titleStyle";

type Props = {
  meetingId: string;
  meeting: Meeting;
  onChanged: () => Promise<void>;
};

function StyleControls({
  label,
  color,
  size,
  onColor,
  onSize,
}: {
  label: string;
  color: TitleColor;
  size: TitleSize;
  onColor: (v: TitleColor) => void;
  onSize: (v: TitleSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
      <span className="font-medium text-zinc-500">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-zinc-400">색</span>
        {TITLE_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            aria-label={c.label}
            onClick={() => onColor(c.value)}
            className={`h-6 w-6 rounded-full border-2 ${
              color === c.value
                ? "border-emerald-600 ring-1 ring-emerald-200"
                : "border-white ring-1 ring-zinc-200"
            }`}
            style={{ backgroundColor: c.swatch }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-zinc-400">크기</span>
        {TITLE_SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onSize(s.value)}
            className={`rounded-md px-2 py-1 ${
              size === s.value
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ meetingId, meeting, onChanged }: Props) {
  const [name, setName] = useState(meeting.name);
  const [slogan, setSlogan] = useState(meeting.slogan);
  const [nameColor, setNameColor] = useState(() =>
    normalizeTitleColor(meeting.nameColor)
  );
  const [nameFontSize, setNameFontSize] = useState(() =>
    normalizeTitleSize(meeting.nameFontSize)
  );
  const [sloganColor, setSloganColor] = useState(() =>
    normalizeTitleColor(meeting.sloganColor)
  );
  const [sloganFontSize, setSloganFontSize] = useState(() =>
    normalizeTitleSize(meeting.sloganFontSize)
  );
  const [duesMethod, setDuesMethod] = useState(
    meeting.duesPaymentMethod || "HALF_YEARLY"
  );
  const [accounts, setAccounts] = useState<ClubAccountRow[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seedFileRef = useRef<HTMLInputElement>(null);

  const reloadLists = useCallback(async () => {
    const [h, a] = await Promise.all([
      listHistories(meetingId),
      listAccounts(meetingId),
    ]);
    setHistoryCount(h.length);
    setAccounts(a);
  }, [meetingId]);

  useEffect(() => {
    setName(meeting.name);
    setSlogan(meeting.slogan);
    setNameColor(normalizeTitleColor(meeting.nameColor));
    setNameFontSize(normalizeTitleSize(meeting.nameFontSize));
    setSloganColor(normalizeTitleColor(meeting.sloganColor));
    setSloganFontSize(normalizeTitleSize(meeting.sloganFontSize));
    setDuesMethod(meeting.duesPaymentMethod || "HALF_YEARLY");
  }, [meeting]);

  useEffect(() => {
    void reloadLists().catch((e) =>
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.")
    );
  }, [reloadLists]);

  async function run(action: () => Promise<void>, okMessage: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    setProgress(null);
    try {
      await action();
      setInfo(okMessage);
      await onChanged();
      await reloadLists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <p className="text-xs text-amber-700">
        시스템관리자 전용입니다. 백업·초기화·복원은 클라우드(Firestore) 데이터를
        직접 변경합니다. 모임 문서(개설자·승인 회원 목록)는 유지됩니다.
      </p>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {info}
        </p>
      ) : null}
      {progress ? (
        <p className="rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
          {progress}
        </p>
      ) : null}

      {/* 1. 모임 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">모임</h2>

        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-700">타이틀 설정</h3>
          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="모임 이름"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <StyleControls
              label="이름"
              color={nameColor}
              size={nameFontSize}
              onColor={setNameColor}
              onSize={setNameFontSize}
            />
          </div>
          <div className="space-y-2">
            <input
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              placeholder="슬로건"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <StyleControls
              label="슬로건"
              color={sloganColor}
              size={sloganFontSize}
              onColor={setSloganColor}
              onSize={setSloganFontSize}
            />
          </div>
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-[11px] text-zinc-500">미리보기</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={nameTitleClass(nameColor, nameFontSize)}>
                {name.trim() || "모임 이름"}
              </span>
              {slogan.trim() ? (
                <span className={sloganTitleClass(sloganColor, sloganFontSize)}>
                  {slogan}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  updateMeetingTitle({
                    meetingId,
                    name,
                    slogan,
                    nameColor,
                    nameFontSize,
                    sloganColor,
                    sloganFontSize,
                  }),
                "모임 타이틀을 저장했습니다."
              )
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            타이틀 저장
          </button>
        </div>

        <div className="mt-6 space-y-3 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium text-zinc-700">
            회비 납부 방식 지정
          </h3>
          <select
            value={duesMethod}
            onChange={(e) => setDuesMethod(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            {DUES_PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => updateDuesPaymentMethod(meetingId, duesMethod),
                "회비 납부 방식을 저장했습니다."
              )
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            납부 방식 저장
          </button>
        </div>

        <div className="mt-6 space-y-3 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium text-zinc-700">모임 이력 관리</h3>
          <p className="text-xs text-zinc-500">
            등록된 이력 {historyCount.toLocaleString("ko-KR")}건. 목록·추가·삭제는
            팝업에서 관리합니다.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            이력 관리 열기
          </button>
        </div>

        <div className="mt-6 space-y-3 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium text-zinc-700">모임 계좌 관리</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="은행 *"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="계좌번호 *"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="예금주"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await upsertAccount(meetingId, {
                  bankName,
                  accountNumber,
                  holderName,
                });
                setBankName("");
                setAccountNumber("");
                setHolderName("");
              }, "계좌를 추가했습니다.")
            }
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            계좌 추가
          </button>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span>
                  {a.bankName} {a.accountNumber}
                  {a.holderName ? ` (${a.holderName})` : ""}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => deleteAccount(meetingId, a.id),
                      "계좌를 삭제했습니다."
                    )
                  }
                  className="text-xs text-red-600"
                >
                  삭제
                </button>
              </li>
            ))}
            {accounts.length === 0 ? (
              <li className="px-3 py-4 text-xs text-zinc-400">계좌가 없습니다.</li>
            ) : null}
          </ul>
        </div>
      </section>

      {/* 2. 백업/복원 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">백업 / 복원</h2>
        <p className="mt-1 text-xs text-zinc-500">
          권장 순서: 파일 백업 → (필요 시) 초기화 → 파일 복원 또는 초기 데이터
          파일 업로드
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                setProgress("백업 파일 생성 중…");
                const payload = await exportMeetingBackup(meetingId);
                downloadBackupJson(payload);
              }, "백업 파일을 다운로드했습니다.")
            }
            className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            파일 백업
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800 disabled:opacity-50"
          >
            파일 복원…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.smartexpense.json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (
                !confirm(
                  "현재 모임 데이터(회원·장부·회비 등)를 지운 뒤 이 파일로 복원합니다. 계속할까요?"
                )
              ) {
                return;
              }
              void run(async () => {
                const payload = await readBackupFile(file);
                await restoreMeetingBackup(meetingId, payload, setProgress);
              }, "파일 복원이 완료되었습니다.");
            }}
          />

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !confirm(
                  "회원·장부·회비·경조·이력·계좌를 모두 비웁니다.\n모임 개설자·승인 목록은 유지됩니다.\n계속할까요?"
                )
              ) {
                return;
              }
              void run(
                () => clearMeetingData(meetingId, setProgress),
                "초기화가 완료되었습니다. 이제 파일 복원 또는 데이터 입력을 진행하세요."
              );
            }}
            className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
          >
            초기화
          </button>
        </div>

        <div className="mt-6 space-y-2 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-medium text-zinc-700">
            초기 데이터로 재설정
          </h3>
          <p className="text-xs text-zinc-500">
            고정 시드 파일을 받거나 업로드한 뒤, 또는 「초기 데이터로 재설정」으로
            사이트 시드를 바로 적용할 수 있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={SEED_FILE_PATH}
              download
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800"
            >
              초기 데이터 파일 받기
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => seedFileRef.current?.click()}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800 disabled:opacity-50"
            >
              초기 데이터 파일 업로드…
            </button>
            <input
              ref={seedFileRef}
              type="file"
              accept=".json,.smartexpense.json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (
                  !confirm(
                    "현재 데이터를 지운 뒤 선택한 초기 데이터 파일로 재설정합니다. 계속할까요?"
                  )
                ) {
                  return;
                }
                void run(async () => {
                  const payload = await readBackupFile(file);
                  await restoreMeetingBackup(meetingId, payload, setProgress);
                }, "초기 데이터 파일로 재설정했습니다.");
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  !confirm(
                    "현재 데이터를 지운 뒤 서버의 초기 데이터 파일로 재설정합니다. 계속할까요?"
                  )
                ) {
                  return;
                }
                void run(async () => {
                  const payload = await loadSeedBackupFromPublic();
                  await restoreMeetingBackup(meetingId, payload, setProgress);
                }, "초기 데이터로 재설정했습니다.");
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              초기 데이터로 재설정
            </button>
          </div>
        </div>
      </section>

      {historyOpen ? (
        <MeetingHistoryDialog
          meetingId={meetingId}
          onClose={() => {
            setHistoryOpen(false);
            void reloadLists().catch(() => undefined);
          }}
          onChanged={async () => {
            await reloadLists();
          }}
        />
      ) : null}
    </div>
  );
}
