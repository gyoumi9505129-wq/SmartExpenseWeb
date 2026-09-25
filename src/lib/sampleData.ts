import type { DuesRecord, Member, Meeting, Transaction } from "./types";
import { PRIMARY_MEETING_NAME } from "./primaryMeeting";

/** 승인 전 체험용 샘플 데이터 (클라이언트 전용, Firestore 미의존) */

export const SAMPLE_MEETING_ID = "__sample__";

export const SAMPLE_MEETING: Meeting = {
  id: SAMPLE_MEETING_ID,
  name: `${PRIMARY_MEETING_NAME} (샘플)`,
  description: "승인 전 체험용 샘플 화면입니다.",
  slogan: "友情과 信義로 하나되는 한우리",
  ownerUid: "",
  adminUid: "",
  sharedWith: [],
  inactiveMemberUids: [],
  inactiveMemberReasons: {},
  invitedEmails: [],
  initialBalance: 0,
  currentBalance: 14794067,
  duesPaymentMethod: "HALF_YEARLY",
};

export const SAMPLE_MEMBERS: Member[] = [
  {
    id: "s1",
    name: "강대화",
    status: "ACTIVE",
    joinDate: "2011-10-01",
    phone: "01000000001",
    email: "",
    role: "GENERAL",
    linkedUid: "",
    residenceRegion: "대전",
  },
  {
    id: "s2",
    name: "김민석",
    status: "ACTIVE",
    joinDate: "2012-03-15",
    phone: "01000000002",
    email: "",
    role: "PRESIDENT",
    linkedUid: "",
    residenceRegion: "서울",
  },
  {
    id: "s3",
    name: "김성겸",
    status: "ACTIVE",
    joinDate: "2011-10-01",
    phone: "01000000003",
    email: "",
    role: "TREASURER",
    linkedUid: "",
    residenceRegion: "경기도 광명",
  },
];

export const SAMPLE_TRANSACTIONS: Transaction[] = [
  {
    id: "st1",
    date: "2026-07-12",
    type: "INCOME",
    category: "정기 회비 (월/연회비)",
    description: "김영섭 회비(25년_하반기,26년_상반기)",
    amount: 300000,
    incomeAmount: 300000,
    expenseAmount: 0,
    memberId: null,
    note: null,
  },
  {
    id: "st2",
    date: "2026-06-28",
    type: "EXPENSE",
    category: "식대/다과비 (모임 식사, 카페 등)",
    description: "26년 상반기 모임 해장식대(어죽)",
    amount: 116800,
    incomeAmount: 0,
    expenseAmount: 116800,
    memberId: null,
    note: null,
  },
  {
    id: "st3",
    date: "2026-06-28",
    type: "EXPENSE",
    category: "식대/다과비 (모임 식사, 카페 등)",
    description: "26년 상반기 모임 주전부리",
    amount: 84000,
    incomeAmount: 0,
    expenseAmount: 84000,
    memberId: null,
    note: null,
  },
];

export const SAMPLE_DUES: DuesRecord[] = [
  {
    id: "sd1",
    memberId: "s1",
    memberName: "강대화",
    year: 2026,
    totalTargetAmount: 300000,
    paymentMethod: "HALF_YEARLY",
    details: [
      {
        id: "sd1a",
        termLabel: "상반기",
        amount: 150000,
        paidAmount: 0,
        isPaid: false,
        isExcluded: false,
        payDate: "",
        payments: [],
      },
      {
        id: "sd1b",
        termLabel: "하반기",
        amount: 150000,
        paidAmount: 0,
        isPaid: false,
        isExcluded: false,
        payDate: "",
        payments: [],
      },
    ],
    paidAmount: 0,
    status: "미납",
  },
  {
    id: "sd2",
    memberId: "s2",
    memberName: "김민석",
    year: 2026,
    totalTargetAmount: 300000,
    paymentMethod: "HALF_YEARLY",
    details: [
      {
        id: "sd2a",
        termLabel: "상반기",
        amount: 150000,
        paidAmount: 150000,
        isPaid: true,
        isExcluded: false,
        payDate: "2026-03-01",
        payments: [{ payDate: "2026-03-01", amount: 150000 }],
      },
      {
        id: "sd2b",
        termLabel: "하반기",
        amount: 150000,
        paidAmount: 0,
        isPaid: false,
        isExcluded: false,
        payDate: "",
        payments: [],
      },
    ],
    paidAmount: 150000,
    status: "분납",
  },
];
