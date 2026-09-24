import { doc, getDoc, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirebaseDb } from "./firebase";
import { COLLECTIONS } from "./paths";
import type { UserProfile } from "./types";

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

/**
 * Google/Auth 최신 displayName을 Firestore userProfiles/{uid}에 반영.
 * 이름이 같으면 읽기만 하고, 다르면 덮어쓴다(전화·완료여부는 유지).
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

  const nextName = authName || storedName;
  const nextEmail = authEmail || storedEmail;
  const now = new Date().toISOString().slice(0, 10);

  const nameChanged = Boolean(authName) && authName !== storedName;
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
