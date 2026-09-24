"use client";

import { useEffect, useId, useRef, useState } from "react";
import { currentSystemYear } from "@/lib/duesSync";

type Props = {
  value: number;
  onChange: (year: number) => void;
  years: number[];
  /** true면 value 0 = "전체" */
  includeAll?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
};

/**
 * 연도 콤보: 미래 연도 없이, 목록 열면 현재 연도로 스크롤.
 */
export function YearSelect({
  value,
  onChange,
  years,
  includeAll = false,
  className = "",
  id,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const listId = useId();
  const now = currentSystemYear();

  const label =
    includeAll && value === 0
      ? "전체"
      : years.includes(value)
        ? `${value}년`
        : years[0]
          ? `${years[0]}년`
          : "선택";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current.get(now);
    el?.scrollIntoView({ block: "center" });
  }, [open, now]);

  function pick(y: number) {
    onChange(y);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        className="flex w-full min-w-[7.5rem] items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
      >
        <span>{label}</span>
        <span className="text-zinc-400" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 z-40 mt-1 max-h-56 min-w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {includeAll ? (
            <li role="option" aria-selected={value === 0}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                  value === 0 ? "bg-zinc-100 font-medium" : ""
                }`}
                onClick={() => pick(0)}
              >
                전체
              </button>
            </li>
          ) : null}
          {years.map((y) => (
            <li key={y} role="option" aria-selected={value === y}>
              <button
                type="button"
                ref={(node) => {
                  if (node) itemRefs.current.set(y, node);
                  else itemRefs.current.delete(y);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                  value === y ? "bg-zinc-100 font-medium" : ""
                } ${y === now ? "text-zinc-900" : "text-zinc-700"}`}
                onClick={() => pick(y)}
              >
                {y}년
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
