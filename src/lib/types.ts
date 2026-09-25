export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  profileCompleted: boolean;
};

export type Meeting = {
  id: string;
  name: string;
  description: string;
  slogan: string;
  ownerUid: string;
  adminUid: string;
  sharedWith: string[];
  inactiveMemberUids: string[];
  inactiveMemberReasons: Record<string, string>;
  invitedEmails: string[];
  initialBalance: number | null;
  currentBalance: number | null;
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
  SYSTEM_ADMIN: "시스템관리자",
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
