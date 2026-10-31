import { collection, doc, getDocs, getDoc, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import { isSystemAdmin } from "./roles";
import type { UserProfile } from "./types";

/** 권한 이관 전 남아 있는 표시명 */
const LEGACY_ADMIN_DISPLAY_NAMES = new Set([
  "시스템관리자",
  "공용한우리",
  "한우리 공용",
]);

export const HANURI_ADMIN_DISPLAY_NAME = "한우리 관리자";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function profileFromData(uid: string, data: Record<string, unknown>): UserProfile {
  return {
    uid: asString(data.uid) || uid,
    email: asString(data.email),
    displayName: asString(data.displayName),
    phone: asString(data.phone),
    profileCompleted: data.profileCompleted === true,
  };
}

function resolveDisplayName(params: {
  email: string;
  authName: string;
  storedName: string;
}): string {
  if (isSystemAdmin(params.email)) return HANURI_ADMIN_DISPLAY_NAME;
  const stored = params.storedName.trim();
  if (LEGACY_ADMIN_DISPLAY_NAMES.has(stored)) {
    return (
      params.authName.trim() ||
      params.email.split("@")[0] ||
      "회원"
    );
  }
  return params.authName.trim() || stored;
}

/**
 * Google/Auth 최신 displayName을 Firestore userProfiles/{uid}에 반영.
 * 한우리 관리자·레거시 관리자 표시명은 권한 allowlist 기준으로 정규화한다.
 */
export async function syncUserProfileFromAuth(
  user: User
): Promise<UserProfile> {
  const uid = user.uid;
  const ref = doc(getFirebaseDb(), COLLECTIONS.USER_PROFILES, uid);
  const snap = await getDoc(ref);
  const existing = snap.exists()
    ? profileFromData(uid, snap.data() as Record<string, unknown>)
    : null;

  const authName = user.displayName?.trim() || "";
  const authEmail = user.email?.trim().toLowerCase() || "";
  const storedName = existing?.displayName?.trim() || "";
  const storedEmail = existing?.email?.trim().toLowerCase() || "";

  const nextEmail = authEmail || storedEmail;
  const nextName = resolveDisplayName({
    email: nextEmail,
    authName,
    storedName,
  });
  const now = new Date().toISOString().slice(0, 10);

  const nameChanged = nextName !== storedName;
  const emailChanged = Boolean(authEmail) && authEmail !== storedEmail;
  const needsWrite = !existing || nameChanged || emailChanged;

  if (needsWrite) {
    await setDoc(
      ref,
      {
        uid,
        email: nextEmail,
        displayName: nextName,
        phone: existing?.phone || "",
        profileCompleted: existing?.profileCompleted === true,
        createdAt: existing
          ? (snap.data()?.createdAt as string) || now
          : now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  return {
    uid,
    email: nextEmail,
    displayName: nextName,
    phone: existing?.phone || "",
    profileCompleted: existing?.profileCompleted === true,
  };
}

/**
 * 가입 계정 목록에 남은 레거시 관리자 표시명을 정리한다.
 * (allowlist 이관 후에도 userProfiles.displayName 이 남아 보이는 경우)
 */
export async function normalizeLegacyAdminDisplayNames(): Promise<number> {
  const snap = await getDocs(
    collection(getFirebaseDb(), COLLECTIONS.USER_PROFILES)
  );
  let updated = 0;
  const now = new Date().toISOString().slice(0, 10);
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const email = asString(data.email).trim().toLowerCase();
    const storedName = asString(data.displayName).trim();
    const nextName = resolveDisplayName({
      email,
      authName: "",
      storedName,
    });
    if (!nextName || nextName === storedName) continue;
    await setDoc(
      d.ref,
      { displayName: nextName, updatedAt: now },
      { merge: true }
    );
    updated += 1;
  }
  return updated;
}
