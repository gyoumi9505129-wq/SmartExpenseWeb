"use client";

import { useRef } from "react";
import {
  dateStorageToDigits,
  formatDateDigits,
  normalizeIsoDateInput,
} from "@/lib/format";

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};

/**
 * 앱 `ClubDateField` 와 동일:
 * - 숫자만 최대 8자리 입력
 * - 화면 표시는 YYYY-MM-DD (입력 중 자동 하이픈)
 * - 오른쪽 달력 아이콘으로 날짜 선택
 */
export function IsoDateField({
  value,
  onChange,
  disabled,
  className,
  inputClassName = "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm",
}: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const digits = dateStorageToDigits(value);
  const display = formatDateDigits(digits);
  const completeIso = normalizeIsoDateInput(display);

  return (
    <div className={`relative ${className || ""}`}>
      <input
        type="text"
        lang="en"
        data-input-lang="numeric"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD"
        disabled={disabled}
        value={display}
        maxLength={10}
        onChange={(e) => {
          if (disabled) return;
          const nextDigits = dateStorageToDigits(e.target.value).slice(0, 8);
          onChange(formatDateDigits(nextDigits));
        }}
        onBlur={() => {
          if (!digits) {
            onChange("");
            return;
          }
          // 8자리면 유효 날짜만 확정, 아니면 포맷만 유지(저장 시 검증)
          if (digits.length === 8) {
            onChange(completeIso || formatDateDigits(digits));
          } else {
            onChange(formatDateDigits(digits));
          }
        }}
        className={`${inputClassName} pr-10`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          try {
            el.showPicker?.();
          } catch {
            el.click();
          }
        }}
        className="absolute bottom-1.5 right-1.5 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
        aria-label="날짜 선택"
        title="날짜 선택"
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
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        disabled={disabled}
        value={completeIso || ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden
      />
    </div>
  );
}
