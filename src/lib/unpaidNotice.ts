import { formatWon } from "./format";
import type { MemberDuesSummary } from "./memberDuesSummary";
import type { ClubAccountRow } from "./meetingBackup";

export type UnpaidNoticeAccount = {
  bankName: string;
  accountNumber: string;
  holderName: string;
};

/** 화면 표기 `2023(하), 2024(상,하)` → 안내문용 */
export function expandUnpaidDetailsForNotice(raw: string): string {
  if (!raw.trim()) return "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\d{4})\((.+)\)$/);
      if (!m) return part;
      const year = m[1]!;
      const terms = m[2]!
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          if (t === "상") return "상반기";
          if (t === "하") return "하반기";
          if (t === "전체") return "연간";
          return t;
        });
      if (terms.length === 2 && terms.includes("상반기") && terms.includes("하반기")) {
        return `${year}년 상·하반기`;
      }
      return `${year}년 ${terms.join("·")}`;
    })
    .join(", ");
}

export function formatAccountLine(account: UnpaidNoticeAccount | null): string {
  if (!account?.bankName || !account?.accountNumber) {
    return "(등록된 입금 계좌 없음 — 설정에서 계좌를 등록해 주세요)";
  }
  const holder = account.holderName?.trim()
    ? `\n예금주: ${account.holderName.trim()}`
    : "";
  return `${account.bankName} ${account.accountNumber}${holder}`;
}

export function pickPrimaryAccount(
  accounts: ClubAccountRow[]
): UnpaidNoticeAccount | null {
  const first = accounts.find(
    (a) => a.bankName.trim() && a.accountNumber.trim()
  );
  if (!first) return null;
  return {
    bankName: first.bankName.trim(),
    accountNumber: first.accountNumber.trim(),
    holderName: first.holderName.trim(),
  };
}

export function unpaidMembersOnly(
  summaries: MemberDuesSummary[]
): MemberDuesSummary[] {
  return summaries.filter(
    (s) => s.hasRegisteredDues && !s.isFullyPaid && s.totalUnpaidAmount > 0
  );
}

/** 단톡·단체문자용 */
export function buildGroupUnpaidNotice(params: {
  clubName?: string;
  summaries: MemberDuesSummary[];
  account: UnpaidNoticeAccount | null;
}): string {
  const club = params.clubName?.trim() || "한우리";
  const unpaid = unpaidMembersOnly(params.summaries);
  const accountBlock = formatAccountLine(params.account);

  const lines: string[] = [
    `[${club} 회비 미납 안내]`,
    "",
    `안녕하세요, ${club}입니다.`,
    "현재 기준 회비 미납 현황을 공유드립니다.",
    "해당 회원께서는 확인 후 납부 부탁드립니다.",
    "",
    "■ 입금 계좌",
    accountBlock,
    "※ 입금자명은 성함으로 부탁드려요.",
    "",
    "■ 미납 현황",
  ];

  if (unpaid.length === 0) {
    lines.push("현재 미납 회원이 없습니다.");
  } else {
    for (const row of unpaid) {
      const detail = expandUnpaidDetailsForNotice(row.unpaidDetails);
      lines.push(`· ${row.memberName}: ${formatWon(row.totalUnpaidAmount)}`);
      if (detail) lines.push(`  (${detail})`);
    }
  }

  lines.push("", "문의 있으시면 말씀 주세요.", "감사합니다.");
  return lines.join("\n");
}

/** 개인 문자·톡용 */
export function buildIndividualUnpaidNotice(params: {
  clubName?: string;
  summary: MemberDuesSummary;
  account: UnpaidNoticeAccount | null;
}): string {
  const club = params.clubName?.trim() || "한우리";
  const { summary, account } = params;
  const detail = expandUnpaidDetailsForNotice(summary.unpaidDetails);
  const accountBlock = formatAccountLine(account);

  const lines: string[] = [
    `[${club}] ${summary.memberName} 님 회비 미납 안내`,
    "",
    `미납 금액: ${formatWon(summary.totalUnpaidAmount)}`,
  ];
  if (detail) lines.push(`미납 내역: ${detail}`);
  lines.push(
    "",
    `입금 계좌: ${accountBlock.replace(/\n예금주:/, "\n예금주:")}`,
    `※ 입금자명은 「${summary.memberName}」으로 부탁드려요.`,
    "",
    "확인 부탁드립니다. 감사합니다."
  );
  return lines.join("\n");
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
