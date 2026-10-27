import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { epochMsToIsoDate, isoDateToLocalEpochMs } from "./format";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type { ClubAccountRow, ClubHistoryRow } from "./meetingBackup";
import { plainTextFromHtml, sanitizeTitleHtml } from "./titleHtml";

/** 앱 `DuesPaymentMethod` / `toDisplayLabel()` 과 동일 */
export const DUES_PAYMENT_METHODS = [
  { value: "MONTHLY", label: "월별" },
  { value: "QUARTERLY", label: "분기별" },
  { value: "HALF_YEARLY", label: "반기별" },
  { value: "YEARLY", label: "연도별" },
] as const;

export async function updateMeetingTitle(params: {
  meetingId: string;
  name: string;
  slogan: string;
  nameHtml?: string;
  sloganHtml?: string;
  description?: string;
}): Promise<void> {
  const nameHtml = sanitizeTitleHtml(params.nameHtml ?? "");
  const sloganHtml = sanitizeTitleHtml(params.sloganHtml ?? "");
  const name =
    plainTextFromHtml(nameHtml) || params.name.trim();
  if (!name) throw new Error("모임 이름을 입력해 주세요.");
  const slogan =
    plainTextFromHtml(sloganHtml) || params.slogan.trim();
  const db = getFirebaseDb();
  await updateDoc(doc(db, COLLECTIONS.MEETINGS, params.meetingId), {
    name,
    slogan,
    nameHtml,
    sloganHtml,
    description: (params.description ?? "").trim(),
  });
  await setDoc(
    doc(db, COLLECTIONS.MEETING_DIRECTORY, params.meetingId),
    {
      name,
      slogan,
      description: (params.description ?? "").trim(),
    },
    { merge: true }
  );
}

export async function updateDuesPaymentMethod(
  meetingId: string,
  method: string
): Promise<void> {
  const value = method.trim() || "HALF_YEARLY";
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId), {
    duesPaymentMethod: value,
  });
}

export async function listHistories(
  meetingId: string
): Promise<ClubHistoryRow[]> {
  const snap = await getDocs(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.HISTORIES
    )
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        date: typeof data.date === "number" ? data.date : 0,
        content: typeof data.content === "string" ? data.content : "",
        details: typeof data.details === "string" ? data.details : "",
        note: typeof data.note === "string" ? data.note : null,
      };
    })
    .sort((a, b) => a.date - b.date);
}

export async function upsertHistory(
  meetingId: string,
  input: {
    id?: string;
    dateIso: string;
    content: string;
    details: string;
    note?: string;
  }
): Promise<string> {
  const content = input.content.trim();
  if (!content) throw new Error("이력 내용을 입력해 주세요.");
  const dateMs = isoDateToLocalEpochMs(input.dateIso);
  if (Number.isNaN(dateMs)) {
    throw new Error("날짜는 YYYY-MM-DD 형식으로 입력해 주세요.");
  }
  const payload = {
    date: dateMs,
    content,
    details: input.details.trim(),
    note: input.note?.trim() || null,
  };
  if (input.id) {
    await setDoc(
      doc(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.HISTORIES,
        input.id
      ),
      payload,
      { merge: true }
    );
    return input.id;
  }
  const ref = await addDoc(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.HISTORIES
    ),
    payload
  );
  return ref.id;
}

export async function deleteHistory(
  meetingId: string,
  historyId: string
): Promise<void> {
  await deleteDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.HISTORIES,
      historyId
    )
  );
}

export async function listAccounts(
  meetingId: string
): Promise<ClubAccountRow[]> {
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

export async function upsertAccount(
  meetingId: string,
  input: {
    id?: string;
    bankName: string;
    accountNumber: string;
    holderName: string;
  }
): Promise<string> {
  const bankName = input.bankName.trim();
  const accountNumber = input.accountNumber.trim();
  if (!bankName || !accountNumber) {
    throw new Error("은행명과 계좌번호를 입력해 주세요.");
  }
  const payload = {
    bankName,
    accountNumber,
    holderName: input.holderName.trim(),
  };
  if (input.id) {
    await setDoc(
      doc(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.ACCOUNTS,
        input.id
      ),
      payload,
      { merge: true }
    );
    return input.id;
  }
  const ref = await addDoc(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.ACCOUNTS
    ),
    payload
  );
  return ref.id;
}

export async function deleteAccount(
  meetingId: string,
  accountId: string
): Promise<void> {
  await deleteDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.ACCOUNTS,
      accountId
    )
  );
}

export function historyDateToIso(dateMs: number): string {
  return epochMsToIsoDate(dateMs);
}
