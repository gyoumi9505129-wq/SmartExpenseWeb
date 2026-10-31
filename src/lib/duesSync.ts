/** 앱과 동일: 정기 회비 카테고리 */
export const REGULAR_DUES_CATEGORY = "정기 회비 (월/연회비)";

/** 회비 등록·조회용 연도 (2001 ~ 현재 시스템 연도) */
export function duesYearOptions(extraYears: number[] = []): number[] {
  const now = new Date().getFullYear();
  const start = 2001;
  const set = new Set<number>();
  for (let y = start; y <= now; y++) set.add(y);
  for (const y of extraYears) {
    if (Number.isFinite(y) && y > 0 && y <= now) set.add(y);
  }
  // 최신 연도가 위 → 열었을 때 현재 연도 근처
  return [...set].sort((a, b) => b - a);
}

/** 현재 시스템 연도 */
export function currentSystemYear(): number {
  return new Date().getFullYear();
}

export function buildDuesPaymentNote(
  memberName: string,
  year: number,
  termLabel: string
): string {
  return `${memberName} ${year}년 ${termLabel} 회비 납부`;
}

/**
 * 앱 DuesLedgerAutoEntry.noteMatchesMemberTerm 과 동일.
 * 표준(`유락준 2022년 하반기 회비 납부`)과
 * 시드(`유락준 회비(22년_상반기 회비 월분납 …)`)를 모두 허용.
 */
export function noteMatchesMemberTerm(
  note: string,
  memberName: string,
  year: number,
  termLabel: string
): boolean {
  if (!note.trim() || !memberName.trim() || !termLabel.trim()) return false;
  if (!note.includes(memberName)) return false;
  const shortYear = String(year % 100).padStart(2, "0");
  const markers = [
    `${year}년 ${termLabel}`,
    `${year}년${termLabel}`,
    `${year}년_${termLabel}`,
    `${year}_${termLabel}`,
    `${year}${termLabel}`,
    `${shortYear}년_${termLabel}`,
    `${shortYear}년 ${termLabel}`,
    `${shortYear}년${termLabel}`,
    `${shortYear}_${termLabel}`,
  ];
  return markers.some((m) => note.includes(m));
}

export function detailRemaining(detail: {
  amount: number;
  paidAmount: number;
  isExcluded?: boolean;
  isPaid?: boolean;
}): number {
  if (detail.isExcluded) return 0;
  return Math.max(0, detail.amount - detail.paidAmount);
}
