import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
  deleteField,
  deleteDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import {
  approveJoinRequest,
  fetchMeetingDirectory,
  fetchPendingJoinRequests,
  rejectJoinRequest,
  submitJoinRequest,
} from "./hub";
import { fetchMeeting, fetchMembers } from "./meetings";
import { isPrimaryMeetingName } from "./primaryMeeting";
import type { JoinRequest, Meeting, UserProfile } from "./types";

export async function resolvePrimaryMeeting(): Promise<Meeting | null> {
  const directory = await fetchMeetingDirectory();
  const hit =
    directory.find((m) => isPrimaryMeetingName(m.name)) || directory[0];
  if (!hit) return null;
  return fetchMeeting(hit.id);
}

export async function fetchMyAccessRequest(
  meetingId: string,
  uid: string
): Promise<JoinRequest | null> {
  const snap = await getDocs(
    query(
      collection(
        getFirebaseDb(),
        COLLECTIONS.MEETINGS,
        meetingId,
        COLLECTIONS.JOIN_REQUESTS
      ),
      where("uid", "==", uid)
    )
  );
  if (snap.empty) return null;
  const docs = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: typeof data.uid === "string" ? data.uid : "",
        email: typeof data.email === "string" ? data.email : "",
        displayName:
          typeof data.displayName === "string" ? data.displayName : "",
        phone: typeof data.phone === "string" ? data.phone : "",
        message: typeof data.message === "string" ? data.message : "",
        status: typeof data.status === "string" ? data.status : "",
        requestedAt:
          typeof data.requestedAt === "string" ? data.requestedAt : "",
        decidedAt: typeof data.decidedAt === "string" ? data.decidedAt : "",
        decidedBy: typeof data.decidedBy === "string" ? data.decidedBy : "",
        profileCompleted: data.profileCompleted === true,
      } satisfies JoinRequest;
    })
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  return docs[0] ?? null;
}

export async function requestAccess(params: {
  meetingId: string;
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
}): Promise<void> {
  await submitJoinRequest({
    meetingId: params.meetingId,
    uid: params.uid,
    email: params.email,
    profile: {
      uid: params.uid,
      email: params.email,
      displayName: params.displayName,
      phone: params.phone || "",
      profileCompleted: true,
    },
    message: "",
  });
}

/** 승인 시 가입정보 입력 없이 바로 일반 회원으로 이용 */
export async function approveAccessRequest(params: {
  meetingId: string;
  request: JoinRequest;
  decidedByUid: string;
}): Promise<void> {
  await approveJoinRequest(params);
}

export { rejectJoinRequest as rejectAccessRequest };

export async function fetchPendingAccessRequests(
  meetingId: string
): Promise<JoinRequest[]> {
  return fetchPendingJoinRequests(meetingId);
}

export async function fetchUserProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(
    collection(getFirebaseDb(), COLLECTIONS.USER_PROFILES)
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: (typeof data.uid === "string" && data.uid) || d.id,
      email: typeof data.email === "string" ? data.email : "",
      displayName: typeof data.displayName === "string" ? data.displayName : "",
      phone: typeof data.phone === "string" ? data.phone : "",
      profileCompleted: data.profileCompleted === true,
    } satisfies UserProfile;
  });
}

/** 총무 지정 — meeting.adminUid */
export async function setTreasurerUid(
  meetingId: string,
  treasurerUid: string | null
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId), {
    adminUid: treasurerUid || "",
  });
  try {
    await updateDoc(
      doc(getFirebaseDb(), COLLECTIONS.MEETING_DIRECTORY, meetingId),
      { adminUid: treasurerUid || "" }
    );
  } catch {
    // directory 없을 수 있음
  }
}

export async function grantMeetingAccess(
  meetingId: string,
  uid: string
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), COLLECTIONS.MEETINGS, meetingId), {
    sharedWith: arrayUnion(uid),
    inactiveMemberUids: arrayRemove(uid),
    [`inactiveMemberReasons.${uid}`]: deleteField(),
  });
}

/**
 * 강퇴/삭제 — UID를 inactive에 남기지 않고 접근·요청·프로필을 제거합니다.
 * 재가입 시 같은 계정으로 깨끗이 PENDING 요청을 다시 보낼 수 있습니다.
 */
export async function purgeMeetingAccount(params: {
  meetingId: string;
  uid: string;
}): Promise<void> {
  const meeting = await fetchMeeting(params.meetingId);
  if (!meeting) throw new Error("모임을 찾을 수 없습니다.");
  if (params.uid === meeting.ownerUid) {
    throw new Error("모임관리자 계정은 삭제할 수 없습니다.");
  }

  const db = getFirebaseDb();
  const meetingRef = doc(db, COLLECTIONS.MEETINGS, params.meetingId);
  const updates: Record<string, unknown> = {
    sharedWith: arrayRemove(params.uid),
    inactiveMemberUids: arrayRemove(params.uid),
    [`inactiveMemberReasons.${params.uid}`]: deleteField(),
  };
  if (meeting.adminUid === params.uid) {
    updates.adminUid = "";
  }
  await updateDoc(meetingRef, updates);

  try {
    await updateDoc(doc(db, COLLECTIONS.MEETING_DIRECTORY, params.meetingId), {
      ...(meeting.adminUid === params.uid ? { adminUid: "" } : {}),
    });
  } catch {
    // directory 없을 수 있음
  }

  // 가입 요청 문서 전부 삭제 (거절 상태로 남기지 않음)
  const reqSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.MEETINGS, params.meetingId, COLLECTIONS.JOIN_REQUESTS),
      where("uid", "==", params.uid)
    )
  );
  await Promise.all(reqSnap.docs.map((d) => deleteDoc(d.ref)));

  // 회원 명단 linkedUid 연결 해제 (명단 자체는 유지)
  try {
    const members = await fetchMembers(params.meetingId);
    await Promise.all(
      members
        .filter((m) => m.linkedUid === params.uid)
        .map((m) =>
          updateDoc(
            doc(db, COLLECTIONS.MEETINGS, params.meetingId, COLLECTIONS.MEMBERS, m.id),
            { linkedUid: "" }
          )
        )
    );
  } catch {
    // members 권한/경로 이슈 시 접근 제거만으로도 충분
  }

  // 프로필 삭제 — 재가입 시 중복 표시 방지 (시스템관리자 규칙 필요)
  try {
    await deleteDoc(doc(db, COLLECTIONS.USER_PROFILES, params.uid));
  } catch {
    // 모임개설자만 로그인한 경우 프로필 삭제는 실패할 수 있음
  }
}

/**
 * 같은 이메일의 중복 UID를 정리합니다.
 * keepUid만 sharedWith에 남기고, 같은 이메일 다른 UID는 완전 삭제(강퇴)합니다.
 */
export async function cleanupDuplicateAccountsByKeepUid(params: {
  meetingId: string;
  keepUid: string;
  decidedByUid: string;
}): Promise<{ removedUids: string[]; rejectedRequests: number; email: string }> {
  const profiles = await fetchUserProfiles();
  const keep = profiles.find((p) => p.uid === params.keepUid);
  if (!keep) {
    throw new Error("남길 UID의 프로필을 찾을 수 없습니다.");
  }
  const email = keep.email.trim().toLowerCase();
  if (!email) {
    throw new Error("남길 계정의 이메일이 비어 있습니다.");
  }

  const sameEmailUids = profiles
    .filter((p) => p.email.trim().toLowerCase() === email)
    .map((p) => p.uid);
  const removeUids = sameEmailUids.filter((uid) => uid !== params.keepUid);

  for (const uid of removeUids) {
    await purgeMeetingAccount({ meetingId: params.meetingId, uid });
  }

  // keepUid에 PENDING이 있으면 승인, 없으면 접근만 보장
  const pending = await fetchPendingJoinRequests(params.meetingId);
  let rejectedRequests = 0;
  for (const req of pending) {
    const reqEmail = req.email.trim().toLowerCase();
    if (reqEmail === email && req.uid !== params.keepUid) {
      // purge가 못 지운 요청이 있으면 삭제 시도
      try {
        await deleteDoc(
          doc(
            getFirebaseDb(),
            COLLECTIONS.MEETINGS,
            params.meetingId,
            COLLECTIONS.JOIN_REQUESTS,
            req.id
          )
        );
        rejectedRequests += 1;
      } catch {
        await rejectJoinRequest({
          meetingId: params.meetingId,
          requestId: req.id,
          decidedByUid: params.decidedByUid,
        });
        rejectedRequests += 1;
      }
    }
  }

  const meeting = await fetchMeeting(params.meetingId);
  const keepPending = pending.find(
    (r) => r.uid === params.keepUid && r.status === "PENDING"
  );
  if (keepPending) {
    await approveJoinRequest({
      meetingId: params.meetingId,
      request: keepPending,
      decidedByUid: params.decidedByUid,
    });
  } else if (meeting && !(meeting.sharedWith || []).includes(params.keepUid)) {
    await grantMeetingAccess(params.meetingId, params.keepUid);
  }

  return { removedUids: removeUids, rejectedRequests, email };
}
