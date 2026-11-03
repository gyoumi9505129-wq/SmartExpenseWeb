"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)");
  if (mq.matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notOther = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && notOther;
}

/**
 * 브라우저 설치 프롬프트(Chrome/Edge) 또는 iOS 안내로
 * 바탕화면·홈 화면 바로가기를 추가합니다.
 */
export function AddToDesktopButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setReady(true);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW register failed", err));
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setHint("바탕화면에 바로가기가 추가되었습니다.");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onClick = useCallback(async () => {
    setHint(null);
    if (installed) {
      setHint("이미 바로가기로 실행 중입니다.");
      return;
    }
    if (deferred) {
      setBusy(true);
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          setInstalled(true);
          setHint("바탕화면에 바로가기가 추가되었습니다.");
        }
        setDeferred(null);
      } catch (e) {
        setHint(
          e instanceof Error
            ? e.message
            : "바로가기 추가에 실패했습니다. 브라우저 메뉴에서 설치해 주세요."
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    // iOS 또는 설치 프롬프트를 아직 받지 못한 브라우저
    setGuideOpen(true);
  }, [deferred, installed]);

  if (!ready || installed) return null;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onClick()}
        title="바탕화면(홈 화면)에 바로가기 추가"
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
      >
        {busy ? "추가 중…" : "바로가기 추가"}
      </button>
      {hint ? (
        <span className="max-w-[12rem] text-[11px] leading-snug text-emerald-700 sm:max-w-none">
          {hint}
        </span>
      ) : null}

      {guideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-desktop-title"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="add-desktop-title"
              className="text-base font-semibold text-zinc-900"
            >
              바탕화면·홈 화면에 추가
            </h2>
            {isIosSafari() ? (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600">
                <li>
                  하단(또는 상단) <strong>공유</strong> 버튼을 누릅니다.
                </li>
                <li>
                  <strong>홈 화면에 추가</strong>를 선택합니다.
                </li>
                <li>
                  확인을 누르면 아이콘이 홈 화면에 생깁니다.
                </li>
              </ol>
            ) : (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-600">
                <li>
                  브라우저 주소창 오른쪽의 <strong>설치</strong> 아이콘(또는
                  메뉴)을 엽니다.
                </li>
                <li>
                  <strong>앱 설치</strong> / <strong>바로가기 만들기</strong>를
                  선택합니다.
                </li>
                <li>
                  Chrome·Edge에서는 이 버튼으로도 설치 창이 열릴 수 있습니다.
                  메뉴에서 다시 시도해 주세요.
                </li>
              </ol>
            )}
            <button
              type="button"
              className="mt-5 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white"
              onClick={() => setGuideOpen(false)}
            >
              확인
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
