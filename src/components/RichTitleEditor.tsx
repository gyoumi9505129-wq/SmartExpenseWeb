"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  RICH_TITLE_COLORS,
  RICH_TITLE_SIZES,
  plainTextFromHtml,
  sanitizeTitleHtml,
} from "@/lib/titleHtml";

type Props = {
  label: string;
  valueHtml: string;
  onChange: (next: { html: string; text: string }) => void;
  placeholder?: string;
};

function runCommand(command: string, value?: string) {
  try {
    document.execCommand("styleWithCSS", false, "true");
  } catch {
    /* ignore */
  }
  document.execCommand(command, false, value);
}

function applyFontSize(px: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  span.style.fontSize = px;
  try {
    range.surroundContents(span);
  } catch {
    // 교차 노드 선택 시 extractContents
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const after = document.createRange();
  after.selectNodeContents(span);
  after.collapse(false);
  sel.addRange(after);
}

export function RichTitleEditor({
  label,
  valueHtml,
  onChange,
  placeholder,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = valueHtml || "";
    if (lastExternal.current === next) return;
    if (el.innerHTML === next) {
      lastExternal.current = next;
      return;
    }
    el.innerHTML = next || "";
    lastExternal.current = next;
  }, [valueHtml]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeTitleHtml(el.innerHTML);
    const text = plainTextFromHtml(html);
    lastExternal.current = html;
    onChange({ html, text });
  }

  function withFocus(fn: () => void) {
    ref.current?.focus();
    fn();
    emit();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <p className="border-b border-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500">
        {label}
      </p>
      <div
        ref={ref}
        role="textbox"
        aria-label={label}
        lang="ko"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
        className="min-h-[2.75rem] px-3 py-2 text-sm text-zinc-900 outline-none empty:before:pointer-events-none empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)]"
      />
      <div className="flex flex-wrap items-center gap-1 border-t border-zinc-100 bg-zinc-50 px-2 py-1.5">
        <ToolBtn title="실행 취소" onClick={() => withFocus(() => runCommand("undo"))}>
          ↶
        </ToolBtn>
        <ToolBtn title="다시 실행" onClick={() => withFocus(() => runCommand("redo"))}>
          ↷
        </ToolBtn>
        <Sep />
        <ToolBtn title="굵게" onClick={() => withFocus(() => runCommand("bold"))}>
          <span className="font-bold">B</span>
        </ToolBtn>
        <ToolBtn title="기울임" onClick={() => withFocus(() => runCommand("italic"))}>
          <span className="italic">I</span>
        </ToolBtn>
        <ToolBtn
          title="밑줄"
          onClick={() => withFocus(() => runCommand("underline"))}
        >
          <span className="underline">U</span>
        </ToolBtn>
        <Sep />
        <label className="flex items-center gap-1 text-[11px] text-zinc-500">
          크기
          <select
            className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-800"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              withFocus(() => applyFontSize(v));
            }}
          >
            <option value="" disabled>
              선택
            </option>
            {RICH_TITLE_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1 pl-1">
          <span className="text-[11px] text-zinc-500">색</span>
          {RICH_TITLE_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              aria-label={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                withFocus(() => runCommand("foreColor", c.value))
              }
              className="h-5 w-5 rounded-full border border-white ring-1 ring-zinc-300"
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs text-zinc-700 hover:bg-zinc-200"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-zinc-200" aria-hidden />;
}
