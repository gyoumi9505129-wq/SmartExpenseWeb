import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type { DirectoryMeeting, JoinRequest, Meeting, UserProfile } from "./types";
import { mapMeeting } from "./meetings";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function fetchMeetingDirectory(): Promise<DirectoryMeeting[]> {
  const snap = await getDocs(
    collection(getFirebaseDb(), COLLECTIONS.MEETING_DIRECTORY)
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: asString(data.name),
        description: asString(data.description),
        slogan: asString(data.slogan),
        ownerUid: asString(data.ownerUid),
        adminUid: asString(data.adminUid),
      } satisfies DirectoryMeeting;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function filterDirectory(
  items: DirectoryMeeting[],
  q: string
): DirectoryMeeting[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (m) =>
      m.name.toLowerCase().includes(needle) ||
      m.description.toLowerCase().includes(needle) ||
      m.slogan.toLowerCase().includes(needle)
  );
}

export async function createMeeting(params: {
  uid: string;
  name: string;
  description?: string;
  slogan?: string;
}): Promise<Meeting> {
  const name = params.name.trim();
  if (!name) throw new Error("모임 이름을 입력해 주세요.");
  const db = getFirebaseDb();
  const now = new Date().toISOString().slice(0, 10);
  const meetingCol = collection(db, COLLECTIONS.MEETINGS);
  const payload = {
    name,
    description: params.description?.trim() || "",
    slogan: params.slogan?.trim() || "",
    createdAt: now,
    ownerUid: params.uid,
    adminUid: "",
    sharedWith: [params.uid],
    duesPaymentMethod: "HALF_YEARLY",
    initialBalance: 0,
    currentBalance: 0,
  };
  const ref = await addDoc(meetingCol, payload);
  await setDoc(
    doc(db, COLLECTIONS.MEETING_DIRECTORY, ref.id),
    {
      name: payload.name,
      description: payload.description,
      slogan: payload.slogan,
      createdAt: now,
      ownerUid: params.uid,
      adminUid: "",
    },
    { merge: true }
  );
  return mapMeeting(ref.id, payload);
}

export async function claimPendingEmailInvites(
  uid: string,
  email: string | null | undefined
): Promise<number> {
  const normalized = email?.trim().toLowerCase() || "";
  if (!uid || !normalized) return 0;
  const snap = await getDocs(
    query(
      collection(getFirebaseDb(), COLLECTIONS.MEETINGS),
      where("invitedEmails", "array-contains", normalized)
    )
  );
  let claimed = 0;
  for (const d of snap.docs) {
    try {
      await updateDoc(d.ref, {
        sharedWith: arrayUnion(uid),
        invitedEmails: arrayRemove(normalized),
        inactiveMemberUids: arrayRemove(uid),
        [`inactiveMemberReasons.${uid}`]: deleteField(),
      });
      claimed += 1;
    } catch {
      // rules 등으로 실패하면 건너뜀
    }
  }
  return claimed;
}

export async function submitJoinRequest(params: {
  meetingId: string;
  uid: string;
  email: string;
  profile: UserProfile | null;
  message?: string;
}): Promise<void> {
  const db = getFirebaseDb();
  const col = collection(
    db,
    COLLECTIONS.MEETINGS,
    params.meetingId,
    COLLECTIONS.JOIN_REQUESTS
  );
  const existing = await getDocs(query(col, where("uid", "==", params.uid)));
  const pending = existing.docs.find(
    (d) => asString(d.data().status) === "PENDING"
  );
  if (pending) throw new Error("이미 가입 요청을 보냈습니다.");

  const approved = existing.docs.find(
    (d) => asString(d.data().status) === "APPROVED"
  );
  if (approved) throw new Error("이미 승인된 모임입니다.");

  const rejected = existing.docs.find((d) => {
    const s = asString(d.data().status);
    return s === "REJECTED" || s === "WITHDRAWN";
  });

  const payload = {
    uid: params.uid,
    email: params.email,
    displayName: params.profile?.displayName || "",
    phone: params.profile?.phone || "",
    message: params.message?.trim() || "",
    status: "PENDING",
    requestedAt: new Date().toISOString(),
    decidedAt: "",
    decidedBy: "",
    profileCompleted: false,
  };

  if (rejected) {
    await setDoc(doc(col, rejected.id), { ...payload, id: rejected.id });
  } else {
    const ref = await addDoc(col, payload);
    await updateDoc(ref, { id: ref.id });
  }
}

export async function fetchPendingJoinRequests(
  meetingId: string
): Promise<JoinRequest[]> {
  const snap = await getDocs(
    query(
      collection(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.JOIN_REQUESTS
      ),
      where("status", "==", "PENDING")
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      uid: asString(data.uid),
      email: asString(data.email),
      displayName: asString(data.displayName),
      phone: asString(data.phone),
      message: asString(data.message),
      status: asString(data.status),
      requestedAt: asString(data.requestedAt),
      decidedAt: asString(data.decidedAt),
      decidedBy: asString(data.decidedBy),
      profileCompleted: data.profileCompleted === true,
    } satisfies JoinRequest;
  });
}

export async function approveJoinRequest(params: {
  meetingId: string;
  request: JoinRequest;
  decidedByUid: string;
}): Promise<void> {
  const db = getFirebaseDb();
  const reqRef = doc(
    db,
    COLLECTIONS.MEETINGS,
    params.meetingId,
    COLLECTIONS.JOIN_REQUESTS,
    params.request.id
  );
  await updateDoc(reqRef, {
    status: "APPROVED",
    decidedAt: new Date().toISOString(),
    decidedBy: params.decidedByUid,
    profileCompleted: false,
  });
  await updateDoc(doc(db, COLLECTIONS.MEETINGS, params.meetingId), {
    sharedWith: arrayUnion(params.request.uid),
    inactiveMemberUids: arrayRemove(params.request.uid),
    [`inactiveMemberReasons.${params.request.uid}`]: deleteField(),
  });
}

export async function rejectJoinRequest(params: {
  meetingId: string;
  requestId: string;
  decidedByUid: string;
}): Promise<void> {
  await updateDoc(
    doc(
      getFirebaseDb(),
      COLLECTIONS.MEETINGS,
      params.meetingId,
      COLLECTIONS.JOIN_REQUESTS,
      params.requestId
    ),
    {
      status: "REJECTED",
      decidedAt: new Date().toISOString(),
      decidedBy: params.decidedByUid,
    }
  );
}

export async function inviteByEmailOrUid(params: {
  meetingId: string;
  rawInput: string;
  myUid: string;
}): Promise<"joined" | "pending_email"> {
  const raw = params.rawInput.trim();
  if (!raw) throw new Error("이메일 또는 UID를 입력해 주세요.");
  const db = getFirebaseDb();
  const meetingRef = doc(db, COLLECTIONS.MEETINGS, params.meetingId);

  if (!raw.includes("@")) {
    if (raw === params.myUid) throw new Error("본인은 이미 포함되어 있습니다.");
    await updateDoc(meetingRef, {
      sharedWith: arrayUnion(raw),
      inactiveMemberUids: arrayRemove(raw),
      [`inactiveMemberReasons.${raw}`]: deleteField(),
    });
    return "joined";
  }

  const email = raw.toLowerCase();
  const profiles = await getDocs(
    query(
      collection(db, COLLECTIONS.USER_PROFILES),
      where("email", "==", email)
    )
  );
  if (!profiles.empty) {
    const inviteeUid = profiles.docs[0].id;
    if (inviteeUid === params.myUid) {
      throw new Error("본인은 이미 포함되어 있습니다.");
    }
    await updateDoc(meetingRef, {
      sharedWith: arrayUnion(inviteeUid),
      invitedEmails: arrayRemove(email),
      inactiveMemberUids: arrayRemove(inviteeUid),
      [`inactiveMemberReasons.${inviteeUid}`]: deleteField(),
    });
    return "joined";
  }

  // 명단 이메일 매칭
  const members = await getDocs(
    collection(db, COLLECTIONS.MEETINGS, params.meetingId, COLLECTIONS.MEMBERS)
  );
  const member = members.docs.find(
    (d) => asString(d.data().email).toLowerCase() === email
  );
  if (member) {
    const linked = asString(member.data().linkedUid);
    if (linked) {
      await updateDoc(meetingRef, {
        sharedWith: arrayUnion(linked),
        invitedEmails: arrayRemove(email),
        inactiveMemberUids: arrayRemove(linked),
        [`inactiveMemberReasons.${linked}`]: deleteField(),
      });
      return "joined";
    }
    await updateDoc(meetingRef, {
      invitedEmails: arrayUnion(email),
    });
    return "pending_email";
  }

  throw new Error(
    "해당 이메일의 사용자를 찾지 못했습니다. 명단에 있는 회원이거나, 상대가 한 번 로그인한 뒤 다시 초대해 주세요."
  );
}

export async function publishDirectoryFromMeeting(
  meeting: Meeting
): Promise<void> {
  await setDoc(
    doc(getFirebaseDb(), COLLECTIONS.MEETING_DIRECTORY, meeting.id),
    {
      name: meeting.name,
      description: meeting.description,
      slogan: meeting.slogan,
      ownerUid: meeting.ownerUid,
      adminUid: meeting.adminUid,
    },
    { merge: true }
  );
}
