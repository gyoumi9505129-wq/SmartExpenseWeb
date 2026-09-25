/** 운영 단일 모임(한우리) 식별 */

export const PRIMARY_MEETING_NAME = "한우리";

export function isPrimaryMeetingName(name: string): boolean {
  const n = name.trim();
  return n === PRIMARY_MEETING_NAME || n.startsWith(`${PRIMARY_MEETING_NAME}(`);
}
