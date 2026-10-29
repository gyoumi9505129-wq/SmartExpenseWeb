import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  initializeAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Android SmartExpense 앱과 동일한 Firebase 프로젝트.
 * 프로젝트 ID: smartexpense-55679
 */
const firebaseEnvConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyB4Ys7qg4CfFt7osRBX2aepV_zTdptd9fY",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "smartexpense-55679.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "smartexpense-55679",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "smartexpense-55679.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "236502031143",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:236502031143:web:79f1a3076ace60e9182702",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-KLZ50HWBYJ",
};

let app: FirebaseApp;
let auth: Auth;
let authPersistenceReady: Promise<Auth> | null = null;
let db: Firestore;

/** 사설 LAN IP (폰에서 http://192.168.x.x:3000 접속) */
export function isLanHostname(hostname: string): boolean {
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
}

/**
 * authDomain: Hosting(web.app)은 현재 hostname (동일 출처).
 * GIS 로그인(signInWithCredential)이 주 경로라 redirect 의존도는 낮음.
 */
function resolveAuthDomain(): string {
  const fallback = firebaseEnvConfig.authDomain;
  if (typeof window === "undefined") return fallback;
  const { hostname, host } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return fallback;
  if (isLanHostname(hostname)) return host;
  if (hostname.endsWith(".web.app") || hostname.endsWith(".firebaseapp.com")) {
    return hostname;
  }
  return hostname;
}

export function getFirebaseApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase 클라이언트 SDK는 브라우저에서만 초기화합니다.");
  }
  if (!app) {
    if (getApps().length) {
      app = getApp();
    } else {
      app = initializeApp({
        ...firebaseEnvConfig,
        authDomain: resolveAuthDomain(),
      });
    }
  }
  return app;
}

/** 예전에 LOCAL persistence 로 남은 Firebase 인증 저장소 제거 */
function purgeLegacyLocalAuthStorage(): Promise<void> {
  try {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("firebase:")) remove.push(key);
    }
    remove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase("firebaseLocalStorageDb");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * SESSION persistence 만 사용.
 * getAuth() 기본값(IndexedDB LOCAL)을 쓰면 브라우저를 닫아도 자동 로그인됨.
 */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    try {
      auth = initializeAuth(firebaseApp, {
        persistence: browserSessionPersistence,
      });
    } catch {
      // HMR 등으로 이미 초기화된 경우
      auth = getAuth(firebaseApp);
    }
  }
  return auth;
}

/**
 * 브라우저를 완전히 종료하면 로그인 세션이 끊기도록 SESSION persistence 적용.
 * (탭 새로고침·같은 탭 내 이동은 유지. Chrome '끊긴 위치에서 계속'은 OS/브라우저 설정에 따름)
 */
export function ensureAuthPersistence(): Promise<Auth> {
  if (!authPersistenceReady) {
    authPersistenceReady = (async () => {
      await purgeLegacyLocalAuthStorage();
      const instance = getFirebaseAuth();
      try {
        await setPersistence(instance, browserSessionPersistence);
      } catch {
        // SESSION 미지원·이미 적용된 경우
      }
      return instance;
    })();
  }
  return authPersistenceReady;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

export const firebaseConfig = firebaseEnvConfig;
