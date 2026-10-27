/** 타이틀용 허용 HTML 정리·평문 추출 (메일/게시판형 인라인 서식) */

const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "SPAN",
  "FONT",
  "BR",
]);

const ALLOWED_STYLE = /^(color|font-size|font-weight|font-style|text-decoration)$/i;

export const RICH_TITLE_COLORS = [
  { label: "검정", value: "#18181b" },
  { label: "회색", value: "#71717a" },
  { label: "초록", value: "#047857" },
  { label: "파랑", value: "#2563eb" },
  { label: "호박", value: "#b45309" },
  { label: "빨강", value: "#dc2626" },
] as const;

export const RICH_TITLE_SIZES = [
  { label: "작게", value: "12px" },
  { label: "보통", value: "14px" },
  { label: "크게", value: "18px" },
  { label: "더크게", value: "22px" },
  { label: "가장크게", value: "28px" },
] as const;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextFromHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeStyle(style: string): string {
  const parts: string[] = [];
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE.test(prop) || !val) continue;
    if (/url\s*\(|expression|javascript:/i.test(val)) continue;
    parts.push(`${prop}: ${val}`);
  }
  return parts.join("; ");
}

/** 허용 태그만 남긴 안전한 HTML. 서버에서는 평문 escape 로 폴백 */
export function sanitizeTitleHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    return escapeHtml(plainTextFromHtml(html));
  }
  const root = document.createElement("div");
  root.innerHTML = html;

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (tag === "BR") return "<br>";
    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).map(walk).join("");
    }

    const children = Array.from(el.childNodes).map(walk).join("");
    const attrs: string[] = [];

    if (tag === "SPAN" || tag === "FONT") {
      const style =
        el.getAttribute("style") ||
        (tag === "FONT" && el.getAttribute("color")
          ? `color: ${el.getAttribute("color")}`
          : "");
      const clean = style ? sanitizeStyle(style) : "";
      if (clean) attrs.push(`style="${escapeHtml(clean)}"`);
      if (tag === "FONT" && !clean && el.getAttribute("color")) {
        const c = el.getAttribute("color") || "";
        if (/^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(c)) {
          attrs.push(`style="color: ${escapeHtml(c)}"`);
        }
      }
      const open = attrs.length ? `<span ${attrs.join(" ")}>` : "<span>";
      return `${open}${children}</span>`;
    }

    const outTag = tag.toLowerCase();
    return `<${outTag}>${children}</${outTag}>`;
  };

  return Array.from(root.childNodes).map(walk).join("").trim();
}

/** 표시용: html 있으면 정제, 없으면 평문 escape */
export function titleDisplayHtml(html: string | undefined | null, plain: string): string {
  const h = (html || "").trim();
  if (h) return sanitizeTitleHtml(h);
  return escapeHtml(plain || "");
}
