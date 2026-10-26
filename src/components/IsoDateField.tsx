"use client";

import { normalizeIsoDateInput } from "@/lib/format";

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  className?: string;
  /** input 요소에 붙일 추가 클래스 */
  inputClassName?: string;
};

/**
 * 장부·이력 공통 일자 입력.
 * - 화면/저장: YYYY-MM-DD
 * - 키보드: YYYYMMDD 또는 YYYY-MM-DD
 * - 달력 아이콘으로도 선택 가능
 */
export function IsoDateField({
  value,
  onChange,
  disabled,
  className,
  inputClassName = "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm",
}: Props) {
  const iso = normalizeIsoDateInput(value) || value;

  return (
    <div className={`relative ${className || ""}`}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        disabled={disabled}
        value={iso}
        onChange={(e) => {
          const raw = e.target.value.trim();
          // 입력 중에는 하이픈 포함 자유, 8자리 숫자가 되면 즉시 정규화
          const digits = raw.replace(/\D/g, "");
          if (digits.length === 8) {
            onChange(normalizeIsoDateInput(digits) || raw);
            return;
          }
          onChange(raw);
        }}
        onBlur={() => {
          const next = normalizeIsoDateInput(iso);
          if (next) onChange(next);
        }}
        className={`${inputClassName} pr-10`}
      />
      <input
        type="date"
        disabled={disabled}
        value={normalizeIsoDateInput(iso) || ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="absolute bottom-0 right-1 top-auto h-[38px] w-9 cursor-pointer opacity-0"
        aria-label="달력에서 날짜 선택"
        tabIndex={-1}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 right-2 text-zinc-400"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </span>
    </div>
  );
}
