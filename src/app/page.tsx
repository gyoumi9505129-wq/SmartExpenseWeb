"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useAuth } from "@/contexts/AuthProvider";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-zinc-950 px-4 py-16 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.25),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(16,185,129,0.12),_transparent_50%)]"
      />
      <main className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm font-medium tracking-wide text-emerald-400">모으다</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">스마트 모임 장부</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Android 앱과 동일한 Firebase 계정으로 로그인하면, PC·브라우저에서도
          장부·회비·회원을 조회하고 관리할 수 있습니다.
        </p>

        <div className="mt-8">
          {/* loading 중에도 버튼 노출 — 폰 LAN 에서 세션 확인이 멈춰도 로그인 가능 */}
          {user && loading ? (
            <div className="flex h-12 items-center justify-center text-sm text-zinc-400">
              로그인 이동 중…
            </div>
          ) : (
            <GoogleSignInButton />
          )}
        </div>

        <ul className="mt-8 space-y-2 text-xs leading-5 text-zinc-500">
          <li>· 프로젝트: <code className="text-zinc-300">smartexpense-55679</code></li>
          <li>· Google 로그인만 지원 (웹 1단계)</li>
          <li>· Firestore 규칙·권한은 앱과 동일하게 적용</li>
        </ul>
      </main>
    </div>
  );
}
