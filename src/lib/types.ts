export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  profileCompleted: boolean;
};

/** 연도별 BS 이월 잔액 (meetings.yearBalances["2025"]) */
export type YearBalance = {
  openingBalance: number;
  closingBalance: number;
};

export type YearBalances = Record<string, YearBalance>;

export type Meeting = {
  id: string;
  name: string;
  description: string;
  slogan: string;
  /** 인라인 서식 HTML (웹 헤더). name/slogan 은 평문 유지 */
  nameHtml: string;
  sloganHtml: string;
  /** @deprecated 전체 필드 프리셋 — 인라인 HTML 우선 */
  nameColor: string;
  nameFontSize: string;
  sloganColor: string;
  sloganFontSize: string;
  ownerUid: string;
  adminUid: string;
  sharedWith: string[];
  inactiveMemberUids: string[];
  inactiveMemberReasons: Record<string, string>;
  invitedEmails: string[];
  /** 창립 전 절대 기초. 한우리는 보통 0(이월금 전표로 흡수) */
  initialBalance: number | null;
  /** 현재 잔액 캐시 = 최신 연도 기말 */
  currentBalance: number | null;
  /**
   * 연도별 기초/기말. opening(Y)=closing(Y-1).
   * 장부 연도 조회·결산·특수 재정산의 공통 기준.
   */
  yearBalances: YearBalances;
  duesPaymentMethod: string;
};

export type DirectoryMeeting = {
  id: string;
  name: string;
  description: string;
  slogan: string;
  ownerUid: string;
  adminUid: string;
};

export type Member = {
  id: string;
  name: string;
  status: string;
  joinDate: string;
  phone: string;
  email: string;
  role: string;
  linkedUid: string;
  residenceRegion: string;
};

export type Transaction = {
  id: string;
  date: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  incomeAmount: number;
  expenseAmount: number;
  memberId?: string | null;
  note?: string | null;
  linkedDuesDetailId?: string | null;
};

/** Firestore `eventExpenses` — 앱 경조 탭과 동일 */
export type EventExpense = {
  id: string;
  memberId: string;
  date: string;
  eventSubCategory: string;
  amount: number;
  note: string;
  linkedTransactionId: string | null;
  isSeedOnly: boolean;
};

export type UnpaidDuesOption = {
  duesId: string;
  detailId: string;
  memberId: string;
  memberName: string;
  year: number;
  termLabel: string;
  amount: number;
  paidAmount: number;
  remaining: number;
};

export type DuesPayment = {
  payDate: string;
  amount: number;
  linkedTransactionId?: string | null;
};

export type DuesDetail = {
  id: string;
  termLabel: string;
  amount: number;
  paidAmount: number;
  isPaid: boolean;
  isExcluded: boolean;
  payDate: string;
  payments: DuesPayment[];
};

export type DuesRecord = {
  id: string;
  memberId: string;
  memberName: string;
  year: number;
  totalTargetAmount: number;
  paymentMethod: string;
  details: DuesDetail[];
  paidAmount: number;
  status: string;
};

export type JoinRequest = {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  message: string;
  status: string;
  requestedAt: string;
  decidedAt: string;
  decidedBy: string;
  profileCompleted: boolean;
};

export type UserRole =
  | "SYSTEM_ADMIN"
  | "MEETING_OWNER"
  | "MEETING_ADMIN"
  | "MEMBER";

export const ROLE_LABEL: Record<UserRole, string> = {
  SYSTEM_ADMIN: "한우리 관리자",
  MEETING_OWNER: "모임관리자",
  MEETING_ADMIN: "총무",
  MEMBER: "일반회원",
};

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "활동중",
  DORMANT: "휴면",
  WITHDRAWN: "탈퇴",
};

export const MEMBER_ROLE_LABEL: Record<string, string> = {
  GENERAL: "일반",
  PRESIDENT: "회장",
  TREASURER: "총무",
  EXECUTIVE: "임원",
};
