import type { Meeting, UserRole } from "./types";

/** Android SystemAdminConfig / firestore.rules 와 동일 */
export const SYSTEM_ADMIN_EMAILS = new Set(["gyoumi9505129@gmail.com"]);

export function isSystemAdmin(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.length > 0 && SYSTEM_ADMIN_EMAILS.has(normalized);
}

/**
 * Android UserRole / MeetingRoleRepository 와 동일한 우선순위
 * 시스템관리자 > 개설자(모임관리자) > 지정 총무 > 일반회원
 */
export function resolveRole(
  uid: string | null | undefined,
  email: string | null | undefined,
  meeting?: Meeting | null
): UserRole {
  if (isSystemAdmin(email)) return "SYSTEM_ADMIN";
  const normalizedUid = uid?.trim() ?? "";
  if (!normalizedUid || !meeting) return "MEMBER";
  if (meeting.ownerUid === normalizedUid) return "MEETING_OWNER";
  if (meeting.adminUid && meeting.adminUid === normalizedUid) {
    return "MEETING_ADMIN";
  }
  return "MEMBER";
}

export function canEditMeeting(
  uid: string | null | undefined,
  email: string | null | undefined,
  meeting: Meeting
): boolean {
  const role = resolveRole(uid, email, meeting);
  return (
    role === "SYSTEM_ADMIN" ||
    role === "MEETING_OWNER" ||
    role === "MEETING_ADMIN"
  );
}

export function canAccessMeeting(
  uid: string | null | undefined,
  email: string | null | undefined,
  meeting: Meeting
): boolean {
  if (isSystemAdmin(email)) return true;
  const normalizedUid = uid?.trim() ?? "";
  if (!normalizedUid) return false;
  if (meeting.ownerUid === normalizedUid) return true;
  if (meeting.adminUid && meeting.adminUid === normalizedUid) return true;
  if (meeting.sharedWith?.includes(normalizedUid)) {
    return !meeting.inactiveMemberUids?.includes(normalizedUid);
  }
  return false;
}
