"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { renderGoogleIdentityButton } from "@/lib/googleGis";

type Props = {
  className?: string;
};

/**
 * Google Identity Services 공식 버튼.
 * 모바일에서 Firebase popup/redirect 없이 ID 토큰 → Firebase 로그인.
 */
export function GoogleSignInButton({ className = "" }: Props) {
  const { signInWithGoogleIdToken, error, clearError, setErrorMessage } =
    useAuth();
  const hostRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;

    void (async () => {
      try {
        await renderGoogleIdentityButton(
          el,
          async (idToken) => {
            clearError();
            setBusy(true);
            try {
              await signInWithGoogleIdToken(idToken);
            } finally {
              setBusy(false);
            }
          },
          (message) => {
            setErrorMessage(message);
            setBusy(false);
          }
        );
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setErrorMessage(
            e instanceof Error
              ? e.message
              : "Google 로그인 버튼을 불러오지 못했습니다."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signInWithGoogleIdToken, clearError, setErrorMessage]);

  return (
    <div className={`flex w-full flex-col gap-3 ${className}`}>
      {!ready ? (
        <div className="flex h-12 items-center justify-center rounded-xl bg-white/10 text-sm text-zinc-400">
          로그인 준비 중…
        </div>
      ) : null}
      <div
        ref={hostRef}
        className={`flex w-full justify-center ${busy ? "pointer-events-none opacity-60" : ""}`}
      />
      {busy ? (
        <p className="text-center text-xs text-zinc-400">로그인 중…</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-left text-xs leading-5 text-red-700 ring-1 ring-red-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
