import { detailRemaining } from "./duesSync";
import type { DuesDetail, DuesRecord, Member } from "./types";

export type MemberDuesSummary = {
  memberId: string;
  memberName: string;
  totalUnpaidAmount: number;
  unpaidDetails: string;
  isFullyPaid: boolean;
  hasRegisteredDues: boolean;
  records: DuesRecord[];
};

function formatUnpaidTermLabel(termLabel: string): string {
  if (termLabel === "상반기") return "상";
  if (termLabel === "하반기") return "하";
  if (termLabel === "연도 전체" || termLabel === "연간") return "전체";
  return termLabel;
}

function unpaidTermsForRecord(row: DuesRecord): string[] {
  return row.details
    .filter((d) => !d.isExcluded && detailRemaining(d) > 0)
    .map((d) => d.termLabel);
}

export function recordUnpaidAmount(row: DuesRecord): number {
  return row.details.reduce((sum, d) => sum + detailRemaining(d), 0);
}

function buildUnpaidDetailsText(records: DuesRecord[]): string {
  return records
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((row) => {
      const terms = unpaidTermsForRecord(row);
      if (terms.length === 0) return null;
      const labels = terms.map(formatUnpaidTermLabel);
      return `${row.year}(${labels.join(",")})`;
    })
    .filter((x): x is string => Boolean(x))
    .join(", ");
}

/**
 * 앱 회비 현황과 동일: 회원 단위로 미납 합계·미납 회차 문구를 만든다.
 * 활동중 회원 + 회비 기록이 있는 비활동 회원을 포함한다.
 */
export function buildMemberDuesSummaries(
  dues: DuesRecord[],
  members: Member[]
): MemberDuesSummary[] {
  const byMember = new Map<string, DuesRecord[]>();
  for (const row of dues) {
    const list = byMember.get(row.memberId) || [];
    list.push(row);
    byMember.set(row.memberId, list);
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const rows: MemberDuesSummary[] = [];

  for (const member of members) {
    const hasDues = byMember.has(member.id);
    if (member.status !== "ACTIVE" && !hasDues) continue;
    const records = (byMember.get(member.id) || []).slice().sort((a, b) => b.year - a.year);
    const totalUnpaid = records.reduce((s, r) => s + recordUnpaidAmount(r), 0);
    rows.push({
      memberId: member.id,
      memberName: member.name,
      totalUnpaidAmount: totalUnpaid,
      unpaidDetails: buildUnpaidDetailsText(records),
      isFullyPaid: records.length > 0 && totalUnpaid === 0,
      hasRegisteredDues: records.length > 0,
      records,
    });
  }

  // 회원 목록에 없지만 회비만 있는 경우
  for (const [memberId, records] of byMember) {
    if (memberById.has(memberId)) continue;
    const sorted = records.slice().sort((a, b) => b.year - a.year);
    const totalUnpaid = sorted.reduce((s, r) => s + recordUnpaidAmount(r), 0);
    rows.push({
      memberId,
      memberName: sorted[0]?.memberName || "(회원 없음)",
      totalUnpaidAmount: totalUnpaid,
      unpaidDetails: buildUnpaidDetailsText(sorted),
      isFullyPaid: sorted.length > 0 && totalUnpaid === 0,
      hasRegisteredDues: true,
      records: sorted,
    });
  }

  return rows.sort((a, b) => {
    if (b.totalUnpaidAmount !== a.totalUnpaidAmount) {
      return b.totalUnpaidAmount - a.totalUnpaidAmount;
    }
    if (a.hasRegisteredDues !== b.hasRegisteredDues) {
      return a.hasRegisteredDues ? -1 : 1;
    }
    return a.memberName.localeCompare(b.memberName, "ko");
  });
}

export function detailStatusLabel(detail: DuesDetail): string {
  if (detail.isExcluded) return "제외";
  const remaining = detailRemaining(detail);
  if (remaining <= 0 && detail.amount > 0) {
    return detail.payments.length > 1
      ? `완납 · ${detail.payments.length}회 분할`
      : "완납";
  }
  if (detail.paidAmount > 0) {
    return detail.payments.length > 1
      ? `부분 납부 · ${detail.payments.length}회`
      : "부분 납부";
  }
  return "미납";
}
