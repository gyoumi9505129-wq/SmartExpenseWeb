export const INCOME_CATEGORIES = [
  "정기 회비 (월/연회비)",
  "찬조금/특별 회비 (기부금 등)",
  "이자/수익",
  "기타 수입 (이월금 등)",
] as const;

export const EXPENSE_CATEGORIES = [
  "식대/다과비 (모임 식사, 카페 등)",
  "장소 대관료 (모임 장소 대여비)",
  "행사/진행비 (이벤트 기획, 상품 구매 등)",
  "비품/소모품비 (운영에 필요한 물품 구매)",
  "경조사비 (회원 화환, 축의금/조의금 등)",
  "교통/통신비 (이동 경비, 문자 발송비 등)",
  "기타 지출 (수수료 및 예비비)",
] as const;

export function categoriesFor(type: "INCOME" | "EXPENSE") {
  return type === "INCOME" ? [...INCOME_CATEGORIES] : [...EXPENSE_CATEGORIES];
}

export function shortCategory(category: string) {
  const i = category.indexOf("(");
  return i > 0 ? category.slice(0, i).trim() : category;
}
