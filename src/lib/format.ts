export function formatWon(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 앱 `dateStorageToDigits` — 숫자만 최대 8자리 */
export function dateStorageToDigits(stored: string): string {
  return stored.replace(/\D/g, "").slice(0, 8);
}

/** 앱 `formatDateDigits` — 입력 중 YYYY / YYYY-MM / YYYY-MM-DD */
export function formatDateDigits(digits: string): string {
  const d = dateStorageToDigits(digits);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 완전·유효한 YYYY-MM-DD 만 반환. 아니면 "" */
export function normalizeIsoDateInput(raw: string): string {
  const digits = dateStorageToDigits(raw);
  if (digits.length !== 8) return "";
  const y = Number(digits.slice(0, 4));
  const mo = Number(digits.slice(4, 6));
  const d = Number(digits.slice(6, 8));
  if (!isValidYmd(y, mo, d)) return "";
  return formatDateDigits(digits);
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

/** 로컬 자정 epoch(ms). 잘못된 입력이면 NaN */
export function isoDateToLocalEpochMs(iso: string): number {
  const norm = normalizeIsoDateInput(iso);
  if (!norm) return Number.NaN;
  const [ys, ms, ds] = norm.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  return new Date(y, m - 1, d).getTime();
}

/** epoch(ms) → 로컬 YYYY-MM-DD (UTC 변환으로 하루 밀리지 않음) */
export function epochMsToIsoDate(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 앱 `PHONE_MAX_LENGTH` — 숫자만 최대 11자리 */
export const PHONE_MAX_LENGTH = 11;

/** 전화번호에서 숫자만 추출 */
export function phoneDigits(raw: string): string {
  return (raw || "").replace(/\D/g, "").slice(0, PHONE_MAX_LENGTH);
}

/**
 * 앱 `formatPhoneDigits` — 010-1234-5678 형태.
 * 저장은 숫자만, 화면 표시·입력 중 포맷용.
 */
export function formatPhoneDigits(digitsOrRaw: string): string {
  const d = phoneDigits(digitsOrRaw);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 조회용. 숫자 없으면 "-" 등 호출측에서 처리하도록 빈 문자열 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const d = phoneDigits(raw || "");
  return d ? formatPhoneDigits(d) : "";
}

export function moneyNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
