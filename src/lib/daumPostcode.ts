export type DaumPostcodeResult = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  sido: string;
  sigungu: string;
  bname: string;
  buildingName: string;
  apartment: string;
  userSelectedType: "R" | "J" | string;
};

type DaumPostcodeInstance = {
  open: (opts?: { popupKey?: string }) => void;
  embed: (element: HTMLElement) => void;
};

type DaumPostcodeConstructor = new (options: {
  oncomplete: (data: DaumPostcodeResult) => void;
  onclose?: (state: string) => void;
  width?: string | number;
  height?: string | number;
}) => DaumPostcodeInstance;

declare global {
  interface Window {
    daum?: {
      Postcode: DaumPostcodeConstructor;
    };
  }
}

const SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let scriptPromise: Promise<void> | null = null;

export function loadDaumPostcodeScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 사용할 수 있습니다."));
  }
  if (window.daum?.Postcode) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("주소 검색 스크립트를 불러오지 못했습니다."))
      );
      if (window.daum?.Postcode) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("주소 검색 스크립트를 불러오지 못했습니다."));
    document.head.appendChild(script);
  }).catch((err) => {
    scriptPromise = null;
    throw err;
  });

  return scriptPromise;
}

const SIDO_TO_REGION: Record<string, string> = {
  서울: "서울",
  부산: "부산",
  대구: "대구",
  인천: "인천",
  광주: "광주",
  대전: "대전",
  울산: "울산",
  세종: "세종",
  경기: "경기도",
  강원: "강원도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

/** 앱·웹 목록의 「거주」 표기와 맞추기: 경기도 화성, 대전 등 */
export function formatResidenceRegion(data: DaumPostcodeResult): string {
  const sidoKey = (data.sido || "").trim();
  const region = SIDO_TO_REGION[sidoKey] || sidoKey;
  const sigungu = (data.sigungu || "").trim().replace(/(시|군)$/, "");
  const isProvince = region.endsWith("도") || region.includes("특별자치도");
  if (isProvince && sigungu) return `${region} ${sigungu}`;
  return region || sigungu;
}

export function pickRoadOrJibunAddress(data: DaumPostcodeResult): string {
  if (data.userSelectedType === "J") {
    return data.jibunAddress || data.roadAddress || "";
  }
  return data.roadAddress || data.jibunAddress || "";
}
