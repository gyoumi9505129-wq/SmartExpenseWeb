"use client";

import { useEffect } from "react";

/** 숫자·날짜 등 IME가 영문/숫자 쪽이 맞는 입력 */
const NUMERIC_INPUT_TYPES = new Set([
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "tel",
  "range",
]);

const SKIP_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "file",
  "hidden",
  "button",
  "submit",
  "reset",
  "image",
  "color",
]);

const NUMERIC_INPUT_MODES = new Set(["numeric", "decimal", "tel"]);

function isNumericEntry(el: HTMLElement): boolean {
  if (el.dataset.inputLang === "en" || el.dataset.inputLang === "numeric") {
    return true;
  }
  if (el instanceof HTMLInputElement) {
    if (NUMERIC_INPUT_TYPES.has(el.type)) return true;
    if (NUMERIC_INPUT_MODES.has(el.inputMode)) return true;
  }
  return false;
}

function isTextEntry(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLInputElement) {
    if (SKIP_INPUT_TYPES.has(el.type)) return false;
    if (NUMERIC_INPUT_TYPES.has(el.type)) return false;
    return true;
  }
  return false;
}

function applyInputLang(el: Element) {
  if (!isTextEntry(el)) return;
  el.lang = isNumericEntry(el) ? "en" : "ko";
}

function applyAll(root: ParentNode = document) {
  root.querySelectorAll("input, textarea, [contenteditable]").forEach(applyInputLang);
}

/**
 * 텍스트 입력 기본 언어를 한글로 두고,
 * 날짜·금액 등 숫자 입력은 영문(숫자) 쪽으로 둔다.
 * (html lang=ko 상속 + 필드별 lang으로 모바일 키보드·IME 힌트)
 */
export function InputLangDefaults() {
  useEffect(() => {
    applyAll();

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof Element) applyInputLang(t);
    };

    document.addEventListener("focusin", onFocusIn);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          applyInputLang(node);
          applyAll(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      observer.disconnect();
    };
  }, []);

  return null;
}
