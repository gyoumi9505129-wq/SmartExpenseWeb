"use client";

import { useCallback, useState } from "react";

type Props = {
  /** 바로가기 표시 이름 (예: 한우리) */
  title: string;
  /** 브라우저로 열 절대 URL. 비우면 현재 페이지 */
  href?: string;
};

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "SmartExpense";
}

function resolveHref(href?: string): string {
  if (href && /^https?:\/\//i.test(href)) return href;
  if (typeof window === "undefined") return href || "/";
  if (href?.startsWith("/")) return `${window.location.origin}${href}`;
  return window.location.href;
}

/** Windows 인터넷 바로가기(.url) 파일 내용 */
function buildWindowsUrlFile(url: string): string {
  return `[InternetShortcut]\r\nURL=${url}\r\n`;
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * 앱 설치가 아니라, 브라우저로 모임을 여는 URL 바로가기(.url)를 받습니다.
 * (웹에서는 OS 바탕화면에 직접 쓸 수 없어 파일 다운로드 → 바탕화면으로 이동)
 */
export function AddToDesktopButton({ title, href }: Props) {
  const [hint, setHint] = useState<string | null>(null);

  const onClick = useCallback(() => {
    const url = resolveHref(href);
    const fileBase = sanitizeFileName(title);
    downloadBlob(
      `${fileBase}.url`,
      buildWindowsUrlFile(url),
      "application/internet-shortcut"
    );
    setHint(
      "바로가기 파일이 저장되었습니다. 다운로드 폴더의 .url 파일을 바탕화면으로 옮기면 됩니다."
    );
  }, [href, title]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        title="브라우저로 모임에 접속하는 URL 바로가기 받기"
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
      >
        바로가기 받기
      </button>
      {hint ? (
        <span className="max-w-[16rem] text-[11px] leading-snug text-emerald-700 sm:max-w-xs">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
