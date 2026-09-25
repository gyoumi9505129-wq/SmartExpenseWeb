"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { resolvePrimaryMeeting } from "@/lib/access";
import { canAccessMeeting } from "@/lib/roles";
import { SAMPLE_MEETING_ID } from "@/lib/sampleData";

/**
 * 로그인 후 단일 모임으로 진입.
 * - 승인·멤버십 있음 → 실데이터
 * - 없으면 → 샘플 화면
 */
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const meeting = await resolvePrimaryMeeting();
        if (cancelled) return;
        if (
          meeting &&
          canAccessMeeting(user.uid, user.email, meeting)
        ) {
          router.replace(`/meetings?id=${encodeURIComponent(meeting.id)}`);
        } else {
          const sampleQs = meeting
            ? `&realId=${encodeURIComponent(meeting.id)}`
            : "";
          router.replace(
            `/meetings?id=${encodeURIComponent(SAMPLE_MEETING_ID)}${sampleQs}`
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "모임을 불러오지 못했습니다."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-sm text-zinc-500">
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700">{error}</p>
      ) : (
        <p>모임으로 이동 중…</p>
      )}
    </div>
  );
}
