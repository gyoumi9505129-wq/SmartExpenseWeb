"use client";

import { useEffect, useRef } from "react";
import type { DaumPostcodeResult } from "@/lib/daumPostcode";
import { loadDaumPostcodeScript } from "@/lib/daumPostcode";

type Props = {
  onComplete: (data: DaumPostcodeResult) => void;
  onClose: () => void;
};

export function DaumPostcodeDialog({ onComplete, onClose }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const settledRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCloseRef = useRef(onClose);
  onCompleteRef.current = onComplete;
  onCloseRef.current = onClose;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadDaumPostcodeScript();
        if (cancelled || !layerRef.current || !window.daum?.Postcode) return;
        new window.daum.Postcode({
          oncomplete: (data) => {
            settledRef.current = true;
            onCompleteRef.current(data);
          },
          onclose: () => {
            if (!settledRef.current) onCloseRef.current();
          },
          width: "100%",
          height: "100%",
        }).embed(layerRef.current);
      } catch {
        if (!cancelled) onCloseRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:h-[560px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900">주소 검색</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
          >
            닫기
          </button>
        </div>
        <div ref={layerRef} className="min-h-0 flex-1 bg-white" />
      </div>
    </div>
  );
}
