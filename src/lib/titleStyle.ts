/** 모임 타이틀(이름·슬로건) 색·크기 프리셋 */

export const TITLE_COLORS = [
  { value: "default", label: "기본", swatch: "#3f3f46" },
  { value: "emerald", label: "초록", swatch: "#047857" },
  { value: "blue", label: "파랑", swatch: "#2563eb" },
  { value: "amber", label: "호박", swatch: "#b45309" },
  { value: "red", label: "빨강", swatch: "#dc2626" },
  { value: "zinc", label: "회색", swatch: "#71717a" },
] as const;

export const TITLE_SIZES = [
  { value: "sm", label: "작게" },
  { value: "md", label: "보통" },
  { value: "lg", label: "크게" },
] as const;

export type TitleColor = (typeof TITLE_COLORS)[number]["value"];
export type TitleSize = (typeof TITLE_SIZES)[number]["value"];

export function normalizeTitleColor(v: unknown): TitleColor {
  const s = typeof v === "string" ? v : "";
  return TITLE_COLORS.some((c) => c.value === s)
    ? (s as TitleColor)
    : "default";
}

export function normalizeTitleSize(v: unknown): TitleSize {
  const s = typeof v === "string" ? v : "";
  return TITLE_SIZES.some((c) => c.value === s) ? (s as TitleSize) : "md";
}

const NAME_COLOR_CLASS: Record<TitleColor, string> = {
  default: "text-zinc-900",
  emerald: "text-emerald-700",
  blue: "text-blue-600",
  amber: "text-amber-700",
  red: "text-red-600",
  zinc: "text-zinc-500",
};

const SLOGAN_COLOR_CLASS: Record<TitleColor, string> = {
  default: "text-zinc-600",
  emerald: "text-emerald-700",
  blue: "text-blue-600",
  amber: "text-amber-700",
  red: "text-red-600",
  zinc: "text-zinc-500",
};

const NAME_SIZE_CLASS: Record<TitleSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
};

const SLOGAN_SIZE_CLASS: Record<TitleSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function nameTitleClass(color: TitleColor, size: TitleSize): string {
  return `${NAME_SIZE_CLASS[size]} font-semibold ${NAME_COLOR_CLASS[color]}`;
}

export function sloganTitleClass(color: TitleColor, size: TitleSize): string {
  return `${SLOGAN_SIZE_CLASS[size]} ${SLOGAN_COLOR_CLASS[color]}`;
}
