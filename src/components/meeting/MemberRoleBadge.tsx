"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MEMBER_ROLE_LABEL } from "@/lib/types";

export type MemberRoleKey =
  | "GENERAL"
  | "PRESIDENT"
  | "TREASURER"
  | "EXECUTIVE";

type RoleStyle = {
  label: string;
  className: string;
  iconClassName: string;
};

const ROLE_STYLE: Record<MemberRoleKey, RoleStyle> = {
  PRESIDENT: {
    label: MEMBER_ROLE_LABEL.PRESIDENT || "회장",
    className: "bg-amber-50 text-amber-900 ring-amber-200/80",
    iconClassName: "text-amber-600",
  },
  TREASURER: {
    label: MEMBER_ROLE_LABEL.TREASURER || "총무",
    className: "bg-emerald-50 text-emerald-900 ring-emerald-200/80",
    iconClassName: "text-emerald-600",
  },
  EXECUTIVE: {
    label: MEMBER_ROLE_LABEL.EXECUTIVE || "임원",
    className: "bg-sky-50 text-sky-900 ring-sky-200/80",
    iconClassName: "text-sky-600",
  },
  GENERAL: {
    label: MEMBER_ROLE_LABEL.GENERAL || "일반",
    className: "bg-zinc-100 text-zinc-700 ring-zinc-200/80",
    iconClassName: "text-zinc-500",
  },
};

const ROLE_ORDER: MemberRoleKey[] = [
  "PRESIDENT",
  "TREASURER",
  "EXECUTIVE",
  "GENERAL",
];

function normalizeRole(role: string | null | undefined): MemberRoleKey {
  const key = (role || "GENERAL").toUpperCase();
  if (key in ROLE_STYLE) return key as MemberRoleKey;
  return "GENERAL";
}

function RoleIcon({
  role,
  className,
}: {
  role: MemberRoleKey;
  className?: string;
}) {
  const common = `h-3.5 w-3.5 shrink-0 ${className || ""}`;
  switch (role) {
    case "PRESIDENT":
      // crown
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={common}
          aria-hidden
        >
          <path d="M5 16.5 3.2 8.8a.75.75 0 0 1 1.2-.75L7.5 10l3.2-5.2a.75.75 0 0 1 1.3 0L15.2 10l3.1-1.95a.75.75 0 0 1 1.2.75L17.7 16.5H5Z" />
          <path d="M5.25 18h13.5a.75.75 0 0 1 0 1.5H5.25a.75.75 0 0 1 0-1.5Z" />
        </svg>
      );
    case "TREASURER":
      // shield-check (운영·총무)
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <path d="M12 3.5 5.5 6v5.2c0 4.1 2.8 7.5 6.5 8.8 3.7-1.3 6.5-4.7 6.5-8.8V6L12 3.5Z" />
          <path d="m9.2 12.1 1.9 1.9 3.7-3.8" />
        </svg>
      );
    case "EXECUTIVE":
      // star
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={common}
          aria-hidden
        >
          <path d="m12 3.4 2.3 4.7 5.2.8-3.8 3.6.9 5.2L12 15.3l-4.6 2.4.9-5.2-3.8-3.6 5.2-.8L12 3.4Z" />
        </svg>
      );
    default:
      // user
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={common}
          aria-hidden
        >
          <circle cx="12" cy="8.5" r="3.2" />
          <path d="M5.5 18.5c1.5-2.6 3.7-3.9 6.5-3.9s5 1.3 6.5 3.9" />
        </svg>
      );
  }
}

export function memberRoleLabel(role: string | null | undefined): string {
  const key = normalizeRole(role);
  return ROLE_STYLE[key].label;
}

/** 조회용 직책 뱃지 (아이콘 + 라벨) */
export function MemberRoleBadge({
  role,
  size = "md",
}: {
  role: string | null | undefined;
  size?: "sm" | "md";
}) {
  const key = normalizeRole(role);
  const style = ROLE_STYLE[key];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset ${pad} ${style.className}`}
    >
      <RoleIcon role={key} className={style.iconClassName} />
      {style.label}
    </span>
  );
}

/** 직책 변경용 커스텀 셀렉트 (옵션에도 아이콘) */
export function MemberRoleSelect({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const key = normalizeRole(value);
  const style = ROLE_STYLE[key];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

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

  const btnPad =
    size === "sm" ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-sm";

  return (
    <div ref={rootRef} className="relative inline-block min-w-[7.5rem]">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex w-full items-center justify-between gap-1.5 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 ${btnPad}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <RoleIcon role={key} className={style.iconClassName} />
          {style.label}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5 text-zinc-400"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {ROLE_ORDER.map((role) => {
            const item = ROLE_STYLE[role];
            const selected = role === key;
            return (
              <li key={role} role="option" aria-selected={selected}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs hover:bg-zinc-50 ${
                    selected ? "bg-zinc-50 font-semibold" : "font-medium"
                  } text-zinc-800`}
                  onClick={() => {
                    onChange(role);
                    setOpen(false);
                  }}
                >
                  <RoleIcon role={role} className={item.iconClassName} />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
