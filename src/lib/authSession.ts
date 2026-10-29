/**
 * 브라우저 종료 후 재실행 시 자동 로그인 방지.
 *
 * Firebase SESSION persistence 만으로는 Chrome "중단한 위치에서 계속"이
 * sessionStorage 를 복원해 로그인이 되살아날 수 있다.
 * pagehide 가드로 이전 문서가 pageshow 없이 끝난 경우(종료·복원) 세션을 폐기한다.
 */

const UNLOAD_GUARD_KEY = "se_auth_unload_guard";
const HARD_NAV_KEY = "se_auth_hard_nav";

export function markAuthUnloadGuard(): void {
  try {
    localStorage.setItem(UNLOAD_GUARD_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearAuthUnloadGuard(): void {
  try {
    localStorage.removeItem(UNLOAD_GUARD_KEY);
  } catch {
    // ignore
  }
}

/** 로그인 직후 location.replace 등 의도적 hard navigation 직전에 호출 */
export function prepareAuthHardNavigation(): void {
  try {
    sessionStorage.setItem(HARD_NAV_KEY, "1");
    clearAuthUnloadGuard();
  } catch {
    // ignore
  }
}

function consumeHardNavigationFlag(): boolean {
  try {
    if (sessionStorage.getItem(HARD_NAV_KEY) === "1") {
      sessionStorage.removeItem(HARD_NAV_KEY);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function readUnloadGuard(): boolean {
  try {
    return localStorage.getItem(UNLOAD_GUARD_KEY) === "1";
  } catch {
    return false;
  }
}

function navigationType(): string {
  try {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? "";
  } catch {
    return "";
  }
}

/** storage 에 남은 Firebase 인증 키 동기 삭제 */
export function clearFirebaseAuthStorageSync(): void {
  const strip = (storage: Storage) => {
    const remove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith("firebase:")) remove.push(key);
    }
    remove.forEach((key) => storage.removeItem(key));
  };
  try {
    strip(sessionStorage);
  } catch {
    // ignore
  }
  try {
    strip(localStorage);
  } catch {
    // ignore
  }
  try {
    indexedDB.deleteDatabase("firebaseLocalStorageDb");
  } catch {
    // ignore
  }
}

/**
 * 브라우저가 이전에 가드만 남기고 끝난 뒤 다시 열린 경우 true.
 * (새로고침·의도적 hard nav 는 false)
 */
export function shouldDiscardAuthSessionOnBoot(): boolean {
  const guarded = readUnloadGuard();
  const hardNav = consumeHardNavigationFlag();
  const type = navigationType();

  // pageshow 전에도 가드를 소비해 중복 판정을 막는다
  clearAuthUnloadGuard();

  if (!guarded) return false;
  if (hardNav) return false;
  if (type === "reload" || type === "back_forward") return false;
  return true;
}

/** pagehide / pageshow 리스너 등록. cleanup 반환 */
export function bindAuthUnloadGuards(): () => void {
  const onHide = () => markAuthUnloadGuard();
  const onShow = () => clearAuthUnloadGuard();
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  return () => {
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
  };
}
