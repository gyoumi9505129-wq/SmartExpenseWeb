"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import {
  AUTH_IDLE_TIMEOUT_MS,
  clearAuthActivity,
  markAuthActivity,
  readLastAuthActivity,
} from "@/lib/authSession";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "keydown",
  "touchstart",
  "scroll",
  "mousemove",
];

const ACTIVITY_THROTTLE_MS = 5_000;
const CHECK_INTERVAL_MS = 30_000;

/**
 * 로그인 상태에서 유휴 1시간이 지나면 자동 로그아웃.
 * 입력·클릭·스크롤 등이 있으면 타이머를 연장합니다.
 */
export function IdleSessionGuard() {
  const { user, loading, logoutDueToIdle } = useAuth();
  const loggingOut = useRef(false);

  useEffect(() => {
    if (loading || !user) {
      loggingOut.current = false;
      return;
    }

    markAuthActivity();
    let lastMark = Date.now();

    const bump = () => {
      const now = Date.now();
      if (now - lastMark < ACTIVITY_THROTTLE_MS) return;
      lastMark = now;
      markAuthActivity();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };

    const checkIdle = () => {
      if (loggingOut.current) return;
      const last = readLastAuthActivity() || Date.now();
      if (Date.now() - last < AUTH_IDLE_TIMEOUT_MS) return;
      loggingOut.current = true;
      clearAuthActivity();
      void logoutDueToIdle();
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(checkIdle, CHECK_INTERVAL_MS);
    // 마운트 직후에도 한 번 검사 (다른 탭에서 이미 만료된 경우)
    checkIdle();

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [user, loading, logoutDueToIdle]);

  return null;
}
