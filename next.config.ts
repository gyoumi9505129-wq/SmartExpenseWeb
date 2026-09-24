import type { NextConfig } from "next";

/**
 * 폰 등 같은 Wi‑Fi 기기에서 http://192.168.x.x:3000 접속 시
 * Next.js 16 기본 정책이 개발용 JS/HMR 를 막아 버튼이 안 눌릴 수 있음.
 */
const lanDevOrigins = [
  "192.168.1.14",
  ...(process.env.NEXT_DEV_ORIGIN
    ? process.env.NEXT_DEV_ORIGIN.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []),
];

const nextConfig: NextConfig = {
  // Firebase Hosting 정적 배포 (Cloud Functions 불필요)
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  allowedDevOrigins: lanDevOrigins,
};

export default nextConfig;
