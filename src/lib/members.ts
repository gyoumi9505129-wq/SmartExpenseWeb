import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { todayIsoDate } from "./format";
import { COLLECTIONS } from "./paths";
import type { Member, Meeting } from "./types";

export async function createMember(
  meetingId: string,
  input: {
    name: string;
    phone?: string;
    email?: string;
    role?: string;
    residenceRegion?: string;
    joinDate?: string;
  }
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("이름을 입력해 주세요.");
  const ref = await addDoc(
    collection(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.MEMBERS
    ),
    {
      name,
      status: "ACTIVE",
      joinDate: input.joinDate || todayIsoDate(),
      phone: input.phone?.trim() || "",
      email: input.email?.trim().toLowerCase() || "",
      role: input.role || "GENERAL",
      residenceRegion: input.residenceRegion?.trim() || "",
      birthDate: "",
      address: "",
      detailAddress: "",
      isLunarBirth: false,
      linkedUid: "",
      selfEnrolled: false,
    }
  );
  return ref.id;
}

export async function updateMemberStatus(params: {
  meetingId: string;
  meeting: Meeting;
  member: Member;
  status: "ACTIVE" | "DORMANT" | "WITHDRAWN";
}): Promise<void> {
  const { meetingId, meeting, member, status } = params;
  const db = getFirebaseDb();
  const memberRef = doc(
    db,
    COLLECTIONS.MEETINGS,
    meetingId,
    COLLECTIONS.MEMBERS,
    member.id
  );
  const suspensionDate =
    status === "ACTIVE" ? null : todayIsoDate();
  await updateDoc(memberRef, {
    status,
    suspensionDate,
  });

  const linkedUid = member.linkedUid?.trim() || "";
  if (!linkedUid) return;
  if (linkedUid === meeting.ownerUid) return;
  if (meeting.adminUid && linkedUid === meeting.adminUid) return;

  const meetingRef = doc(db, COLLECTIONS.MEETINGS, meetingId);
  if (status === "ACTIVE") {
    await updateDoc(meetingRef, {
      sharedWith: arrayUnion(linkedUid),
      inactiveMemberUids: arrayRemove(linkedUid),
      [`inactiveMemberReasons.${linkedUid}`]: deleteField(),
    });
  } else {
    await updateDoc(meetingRef, {
      sharedWith: arrayRemove(linkedUid),
      inactiveMemberUids: arrayUnion(linkedUid),
      [`inactiveMemberReasons.${linkedUid}`]: status,
    });
  }
}

export async function updateMemberFields(
  meetingId: string,
  memberId: string,
  fields: Partial<
    Pick<Member, "name" | "phone" | "email" | "role" | "residenceRegion" | "joinDate">
  >
): Promise<void> {
  const payload: Record<string, string> = {};
  if (fields.name != null) payload.name = fields.name.trim();
  if (fields.phone != null) payload.phone = fields.phone.trim();
  if (fields.email != null) payload.email = fields.email.trim().toLowerCase();
  if (fields.role != null) payload.role = fields.role;
  if (fields.residenceRegion != null)
    payload.residenceRegion = fields.residenceRegion.trim();
  if (fields.joinDate != null) payload.joinDate = fields.joinDate;
  await updateDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      meetingId,
      COLLECTIONS.MEMBERS,
      memberId
    ),
    payload
  );
}
