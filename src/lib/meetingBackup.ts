/**
 * 모임 데이터 백업·복원·초기화 (시스템관리자용).
 * 모임 문서(개설자·sharedWith 등)는 유지하고 하위 컬렉션만 다룬다.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type {
  DuesRecord,
  EventExpense,
  Meeting,
  Member,
  Transaction,
} from "./types";
import { fetchDues } from "./dues";
import { fetchEventExpenses } from "./eventExpenses";
import { fetchMembers, fetchMeeting, fetchTransactions } from "./meetings";
import { syncMeetingBalance } from "./ledger";

export const BACKUP_FORMAT = "smartexpense-meeting-backup";
export const BACKUP_VERSION = 1;
export const SEED_FILE_PATH = "/seeds/hanuri-initial.smartexpense.json";

export type ClubHistoryRow = {
  id: string;
  date: number;
  content: string;
  details: string;
  note: string | null;
};

export type ClubAccountRow = {
  id: string;
  bankName: string;
  accountNumber: string;
  holderName: string;
};

export type MeetingBackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  meeting: {
    name: string;
    slogan: string;
    description: string;
    nameHtml?: string;
    sloganHtml?: string;
    nameColor?: string;
    nameFontSize?: string;
    sloganColor?: string;
    sloganFontSize?: string;
    duesPaymentMethod: string;
    initialBalance: number | null;
    currentBalance: number | null;
  };
  members: Member[];
  transactions: Transaction[];
  dues: DuesRecord[];
  eventExpenses: EventExpense[];
  histories: ClubHistoryRow[];
  accounts: ClubAccountRow[];
};

const DATA_COLLECTIONS = [
  COLLECTIONS.MEMBERS,
  COLLECTIONS.TRANSACTIONS,
  COLLECTIONS.DUES,
  COLLECTIONS.EVENT_EXPENSES,
  COLLECTIONS.HISTORIES,
  COLLECTIONS.ACCOUNTS,
] as const;

const BATCH_LIMIT = 400;

async function fetchHistories(meetingId: string): Promise<ClubHistoryRow[]> {
  const snap = await getDocs(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.HISTORIES
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      date: typeof data.date === "number" ? data.date : 0,
      content: typeof data.content === "string" ? data.content : "",
      details: typeof data.details === "string" ? data.details : "",
      note: typeof data.note === "string" ? data.note : null,
    };
  });
}

async function fetchAccounts(meetingId: string): Promise<ClubAccountRow[]> {
  const snap = await getDocs(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.ACCOUNTS
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      bankName: typeof data.bankName === "string" ? data.bankName : "",
      accountNumber:
        typeof data.accountNumber === "string" ? data.accountNumber : "",
      holderName: typeof data.holderName === "string" ? data.holderName : "",
    };
  });
}

export async function exportMeetingBackup(
  meetingId: string
): Promise<MeetingBackupPayload> {
  const meeting = await fetchMeeting(meetingId);
  if (!meeting) throw new Error("모임을 찾을 수 없습니다.");
  const [members, transactions, eventExpenses, histories, accounts] =
    await Promise.all([
      fetchMembers(meetingId),
      fetchTransactions(meetingId),
      fetchEventExpenses(meetingId),
      fetchHistories(meetingId),
      fetchAccounts(meetingId),
    ]);
  const dues = await fetchDues(meetingId, members);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    meeting: {
      name: meeting.name,
      slogan: meeting.slogan,
      description: meeting.description,
      nameHtml: meeting.nameHtml || "",
      sloganHtml: meeting.sloganHtml || "",
      nameColor: meeting.nameColor || "default",
      nameFontSize: meeting.nameFontSize || "md",
      sloganColor: meeting.sloganColor || "default",
      sloganFontSize: meeting.sloganFontSize || "md",
      duesPaymentMethod: meeting.duesPaymentMethod || "HALF_YEARLY",
      initialBalance: meeting.initialBalance,
      currentBalance: meeting.currentBalance,
    },
    members,
    transactions,
    dues,
    eventExpenses,
    histories,
    accounts,
  };
}

export function downloadBackupJson(
  payload: MeetingBackupPayload,
  filename?: string
): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ||
    `smartexpense-backup-${payload.meeting.name || "meeting"}-${payload.exportedAt.slice(0, 10)}.smartexpense.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupJson(raw: string): MeetingBackupPayload {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON 파일을 읽을 수 없습니다.");
  }
  if (!data || typeof data !== "object") {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error(
      `지원하지 않는 백업 형식입니다. (${String(obj.format ?? "없음")})`
    );
  }
  if (typeof obj.version !== "number" || obj.version < 1) {
    throw new Error("백업 버전을 확인할 수 없습니다.");
  }
  return data as MeetingBackupPayload;
}

async function deleteCollectionDocs(
  db: Firestore,
  meetingId: string,
  sub: string,
  onProgress?: (msg: string) => void
): Promise<number> {
  const col = collection(db, COLLECTIONS.MEETINGS, meetingId, sub);
  let deleted = 0;
  for (;;) {
    const snap = await getDocs(col);
    if (snap.empty) break;
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n += 1;
      deleted += 1;
      if (n >= BATCH_LIMIT) {
        await batch.commit();
        onProgress?.(`${sub} 삭제 중… (${deleted})`);
        batch = writeBatch(db);
        n = 0;
      }
    }
    if (n > 0) {
      await batch.commit();
      onProgress?.(`${sub} 삭제 중… (${deleted})`);
    }
    if (snap.size < BATCH_LIMIT) break;
  }
  return deleted;
}

/** 모임 문서는 유지하고 하위 데이터만 비움 */
export async function clearMeetingData(
  meetingId: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  const db = getFirebaseDb();
  for (const sub of DATA_COLLECTIONS) {
    onProgress?.(`${sub} 초기화 중…`);
    await deleteCollectionDocs(db, meetingId, sub, onProgress);
  }
  // 잔액만 0으로 (owner/sharedWith 유지)
  await updateDoc(doc(db, COLLECTIONS.MEETINGS, meetingId), {
    currentBalance: 0,
    initialBalance: 0,
  });
}

async function commitChunks(
  db: Firestore,
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
  onProgress?: (msg: string) => void,
  label = "저장"
): Promise<void> {
  let batch = writeBatch(db);
  let n = 0;
  let done = 0;
  for (const op of ops) {
    op(batch);
    n += 1;
    done += 1;
    if (n >= BATCH_LIMIT) {
      await batch.commit();
      onProgress?.(`${label} 중… (${done}/${ops.length})`);
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) {
    await batch.commit();
    onProgress?.(`${label} 완료 (${done})`);
  }
}

function duesToFirestore(d: DuesRecord): Record<string, unknown> {
  return {
    memberId: d.memberId,
    memberName: d.memberName,
    year: d.year,
    totalTargetAmount: d.totalTargetAmount,
    paymentMethod: d.paymentMethod,
    details: d.details.map((det) => ({
      id: det.id,
      termLabel: det.termLabel,
      amount: det.amount,
      paidAmount: det.paidAmount,
      isPaid: det.isPaid,
      isExcluded: det.isExcluded,
      payDate: det.payDate,
      payments: det.payments.map((p) => ({
        payDate: p.payDate,
        amount: p.amount,
        linkedTransactionId: p.linkedTransactionId ?? null,
      })),
    })),
  };
}

/**
 * 하위 데이터를 비운 뒤 백업 내용으로 채운다.
 * 모임 문서의 ownerUid / adminUid / sharedWith 는 변경하지 않는다.
 */
export async function restoreMeetingBackup(
  meetingId: string,
  payload: MeetingBackupPayload,
  onProgress?: (msg: string) => void
): Promise<void> {
  const db = getFirebaseDb();
  onProgress?.("기존 데이터 삭제 중…");
  await clearMeetingData(meetingId, onProgress);

  const meta = payload.meeting;
  if (meta) {
    onProgress?.("모임 메타 반영 중…");
    await updateDoc(doc(db, COLLECTIONS.MEETINGS, meetingId), {
      name: meta.name || undefined,
      slogan: meta.slogan ?? "",
      description: meta.description ?? "",
      nameHtml: meta.nameHtml || "",
      sloganHtml: meta.sloganHtml || "",
      nameColor: meta.nameColor || "default",
      nameFontSize: meta.nameFontSize || "md",
      sloganColor: meta.sloganColor || "default",
      sloganFontSize: meta.sloganFontSize || "md",
      duesPaymentMethod: meta.duesPaymentMethod || "HALF_YEARLY",
      initialBalance: meta.initialBalance ?? 0,
      currentBalance: meta.currentBalance ?? 0,
    });
    try {
      await setDoc(
        doc(db, COLLECTIONS.MEETING_DIRECTORY, meetingId),
        {
          name: meta.name,
          slogan: meta.slogan ?? "",
          description: meta.description ?? "",
        },
        { merge: true }
      );
    } catch {
      // directory 실패는 무시
    }
  }

  const memberOps = (payload.members || []).map((m) => {
    return (batch: ReturnType<typeof writeBatch>) => {
      const ref = doc(db, COLLECTIONS.MEETINGS, meetingId, COLLECTIONS.MEMBERS, m.id);
      batch.set(ref, {
        name: m.name,
        status: m.status || "ACTIVE",
        joinDate: m.joinDate || "",
        phone: m.phone || "",
        email: m.email || "",
        role: m.role || "GENERAL",
        residenceRegion: m.residenceRegion || "",
        linkedUid: m.linkedUid || "",
        birthDate: "",
        address: "",
        detailAddress: "",
        isLunarBirth: false,
        selfEnrolled: false,
      });
    };
  });
  await commitChunks(db, memberOps, onProgress, "회원");

  const txOps = (payload.transactions || []).map((t) => {
    return (batch: ReturnType<typeof writeBatch>) => {
      const ref = doc(
        db,
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.TRANSACTIONS,
        t.id
      );
      batch.set(ref, {
        date: t.date,
        type: t.type,
        category: t.category,
        description: t.description,
        note: t.note ?? t.description,
        amount: t.amount,
        incomeAmount: t.incomeAmount,
        expenseAmount: t.expenseAmount,
        memberId: t.memberId ?? null,
        linkedDuesDetailId: t.linkedDuesDetailId ?? null,
      });
    };
  });
  await commitChunks(db, txOps, onProgress, "장부");

  const duesOps = (payload.dues || []).map((d) => {
    return (batch: ReturnType<typeof writeBatch>) => {
      const ref = doc(db, COLLECTIONS.MEETINGS, meetingId, COLLECTIONS.DUES, d.id);
      batch.set(ref, duesToFirestore(d));
    };
  });
  await commitChunks(db, duesOps, onProgress, "회비");

  const eventOps = (payload.eventExpenses || []).map((e) => {
    return (batch: ReturnType<typeof writeBatch>) => {
      const ref = doc(
        db,
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.EVENT_EXPENSES,
        e.id
      );
      batch.set(ref, {
        memberId: e.memberId,
        date: e.date,
        eventSubCategory: e.eventSubCategory,
        amount: e.amount,
        note: e.note || "",
        linkedTransactionId: e.linkedTransactionId,
        isSeedOnly: e.isSeedOnly === true,
      });
    };
  });
  await commitChunks(db, eventOps, onProgress, "경조");

  const histOps = (payload.histories || []).map((h) => {
    return (batch: ReturnType<typeof writeBatch>) => {
      const ref = doc(
        db,
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.HISTORIES,
        h.id
      );
      batch.set(ref, {
        date: h.date,
        content: h.content,
        details: h.details,
        note: h.note,
      });
    };
  });
  await commitChunks(db, histOps, onProgress, "이력");

  const accOps = (payload.accounts || []).map((a) => {
    return (batch: ReturnType<typeof writeBatch>) => {
      const ref = doc(
        db,
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.ACCOUNTS,
        a.id
      );
      batch.set(ref, {
        bankName: a.bankName,
        accountNumber: a.accountNumber,
        holderName: a.holderName,
      });
    };
  });
  await commitChunks(db, accOps, onProgress, "계좌");

  onProgress?.("잔액 재계산 중…");
  await syncMeetingBalance(meetingId, meta?.initialBalance ?? 0);
  onProgress?.("복원 완료");
}

export async function loadSeedBackupFromPublic(): Promise<MeetingBackupPayload> {
  const res = await fetch(SEED_FILE_PATH, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      "초기 데이터 파일을 불러오지 못했습니다. /seeds/hanuri-initial.smartexpense.json 를 확인해 주세요."
    );
  }
  const text = await res.text();
  return parseBackupJson(text);
}

export function readBackupFile(file: File): Promise<MeetingBackupPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseBackupJson(String(reader.result || "")));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsText(file, "utf-8");
  });
}

export type { Meeting };
