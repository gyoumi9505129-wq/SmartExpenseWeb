# 모으다 웹 (SmartExpense Web)

Android **SmartExpense / 모으다** 앱과 **동일한 Firebase 프로젝트**(`smartexpense-55679`)를 사용하는 Next.js 웹 클라이언트입니다.

## 기술 스택

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Firebase Auth (Google) + Cloud Firestore

## Firestore 구조 (앱과 동일)

| 경로 | 용도 |
|------|------|
| `userProfiles/{uid}` | 사용자 프로필 |
| `meetings/{id}` | 모임 |
| `meetingDirectory/{id}` | 검색용 디렉터리 |
| `meetings/{id}/members` | 회원 |
| `meetings/{id}/transactions` | 장부 |
| `meetings/{id}/dues` | 회비 |
| `meetings/{id}/joinRequests` | 가입 요청 |

## 로컬 실행

```bash
cd c:\AiDev\SmartExpenseWeb
npm install
npm run dev
```

http://localhost:3000

`.env.local` 은 Firebase 웹 앱 설정값을 사용합니다. (`NEXT_PUBLIC_FIREBASE_*`)

## 구현 범위

1. Google 로그인
2. 모임 허브: 내 모임 / 찾기·가입 요청 / 만들기 / 이메일 초대 자동 합류
3. 모임 상세: 장부 CRUD, 회비 조회·등록·납부, 회원 상태·직책, 초대·가입 승인

## Vercel 배포

1. GitHub에 `SmartExpenseWeb` 푸시 후 [Vercel](https://vercel.com)에 Import
2. Environment Variables에 `.env.local` 과 동일한 `NEXT_PUBLIC_FIREBASE_*` 등록
3. Deploy 후 발급된 도메인 확인 (예: `https://xxx.vercel.app`)

### Firebase Authorized domains

1. Firebase Console → Authentication → Settings → **Authorized domains**
2. `localhost` 외에 **Vercel 도메인** 추가
3. (필요 시) Google Cloud Console OAuth 클라이언트에 웹 원본·리다이렉트 URI 추가

## 주요 파일

- `src/lib/firebase.ts` — Firebase 초기화
- `src/lib/hub.ts` — 허브(검색·생성·가입·초대)
- `src/lib/ledger.ts` / `dues.ts` / `members.ts` — CRUD
- `src/app/dashboard/page.tsx` — 모임 허브
- `src/app/meetings/[id]/page.tsx` — 장부/회비/회원
