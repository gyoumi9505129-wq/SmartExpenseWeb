"use client";

import { useEffect } from "react";

/** 숫자·날짜 등 — 키패드는 inputMode로, 언어(lang)는 한글로 유지 */
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
    return !SKIP_INPUT_TYPES.has(el.type);
  }
  return false;
}

function ensureNumericInputMode(el: HTMLInputElement) {
  if (NUMERIC_INPUT_MODES.has(el.inputMode)) return;
  if (el.type === "tel") {
    el.inputMode = "tel";
    return;
  }
  if (
    el.type === "number" ||
    el.dataset.inputLang === "numeric" ||
    el.dataset.inputLang === "en"
  ) {
    el.inputMode = "decimal";
  }
}

/**
 * 모든 입력 언어 힌트는 한글(ko).
 * 날짜·금액은 lang=en 을 쓰지 않고 inputMode 로 숫자 키패드만 유도한다.
 * (lang=en 이면 모바일에서 한글로 안 돌아오는 경우가 많음)
 */
function applyInputLang(el: Element) {
  if (!isTextEntry(el)) return;
  el.lang = "ko";
  if (el instanceof HTMLInputElement && isNumericEntry(el)) {
    ensureNumericInputMode(el);
  }
}

function applyAll(root: ParentNode = document) {
  root
    .querySelectorAll("input, textarea, [contenteditable]")
    .forEach(applyInputLang);
}

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
