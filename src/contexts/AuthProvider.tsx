"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { syncUserProfileFromAuth } from "@/lib/userProfile";
import { isSystemAdmin } from "@/lib/roles";
import type { UserProfile } from "@/lib/types";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isSystemAdmin: boolean;
  /** Google ID 토큰(GIS) → Firebase 세션 */
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setErrorMessage: (message: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function authErrorMessage(e: unknown): string {
  const code =
    typeof e === "object" && e && "code" in e
      ? String((e as { code: string }).code)
      : "";
  if (code === "auth/popup-closed-by-user") {
    return "로그인이 취소되었습니다. 다시 시도해 주세요.";
  }
  if (code === "auth/unauthorized-domain") {
    return "이 주소는 Firebase 승인 도메인에 없습니다.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google 로그인이 Firebase에서 비활성화되어 있습니다.";
  }
  if (code === "auth/invalid-credential" || code === "auth/argument-error") {
    return "Google 인증 정보가 올바르지 않습니다. 다시 시도해 주세요.";
  }
  return e instanceof Error ? e.message : "Google 로그인에 실패했습니다.";
}

function syncProfile(
  user: User,
  cancelled: () => boolean,
  setProfile: (p: UserProfile | null) => void
) {
  void syncUserProfileFromAuth(user)
    .then((p) => {
      if (!cancelled()) setProfile(p);
    })
    .catch((e) => {
      console.error(e);
      if (!cancelled()) setProfile(null);
    });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    const isCancelled = () => cancelled;

    const markReady = () => {
      if (!cancelled) setLoading(false);
    };
    const watchdog = window.setTimeout(markReady, 2500);

    try {
      const auth = getFirebaseAuth();
      unsub = onAuthStateChanged(auth, (next) => {
        if (cancelled) return;
        setUser(next);
        window.clearTimeout(watchdog);
        markReady();
        if (!next) {
          setProfile(null);
          return;
        }
        syncProfile(next, isCancelled, setProfile);
      });
    } catch (e) {
      if (!cancelled) {
        setError(
          e instanceof Error ? e.message : "Firebase 초기화에 실패했습니다."
        );
      }
      window.clearTimeout(watchdog);
      markReady();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      unsub();
    };
  }, []);

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    setError(null);
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(getFirebaseAuth(), credential);
      // onAuthStateChanged에서도 동기화하지만, 로그인 직후 최신 이름으로 즉시 반영
      if (result.user) {
        const profile = await syncUserProfileFromAuth(result.user);
        setProfile(profile);
        setUser(result.user);
      }
    } catch (e) {
      const message = authErrorMessage(e);
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    await signOut(getFirebaseAuth());
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      isSystemAdmin: isSystemAdmin(user?.email),
      signInWithGoogleIdToken,
      logout,
      clearError: () => setError(null),
      setErrorMessage: (message) => setError(message),
    }),
    [user, profile, loading, error, signInWithGoogleIdToken, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
