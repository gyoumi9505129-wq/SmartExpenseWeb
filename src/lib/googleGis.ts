/** Android default_web_client_id 와 동일 (Google Cloud Web 클라이언트) */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  "236502031143-q87kphe946cp3amhbusliai7dmm7ekkp.apps.googleusercontent.com";

type CredentialResponse = { credential?: string; select_by?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
    itp_support?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: Record<string, string | number | boolean>
  ) => void;
  prompt: (
    momentListener?: (notification: {
      isNotDisplayed: () => boolean;
      isSkippedMoment: () => boolean;
      isDismissedMoment: () => boolean;
    }) => void
  ) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 사용할 수 있습니다."));
  }
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google 로그인 스크립트 로드 실패"))
      );
      if (window.google?.accounts?.id) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Google 로그인 스크립트 로드 실패"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Google Identity Services 버튼 렌더.
 * 모바일에서 Firebase popup/redirect 대신 ID 토큰을 직접 받음.
 */
export async function renderGoogleIdentityButton(
  parent: HTMLElement,
  onCredential: (idToken: string) => void | Promise<void>,
  onError?: (message: string) => void
): Promise<void> {
  await loadGoogleIdentityScript();
  const id = window.google?.accounts?.id;
  if (!id) throw new Error("Google Identity Services를 초기화하지 못했습니다.");

  parent.innerHTML = "";

  id.initialize({
    client_id: GOOGLE_WEB_CLIENT_ID,
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
    itp_support: true,
    callback: (response) => {
      const token = response.credential;
      if (!token) {
        onError?.("Google 인증 토큰을 받지 못했습니다.");
        return;
      }
      void Promise.resolve(onCredential(token)).catch((e) => {
        onError?.(
          e instanceof Error ? e.message : "Google 로그인에 실패했습니다."
        );
      });
    },
  });

  const width = Math.min(400, Math.max(280, parent.clientWidth || 320));
  id.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "left",
    width,
    locale: "ko",
  });
}
