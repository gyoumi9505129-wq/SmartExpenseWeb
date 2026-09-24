/** Android `FirestorePaths` 와 동일한 경로 헬퍼 */

export const COLLECTIONS = {
  MEETINGS: "meetings",
  MEETING_DIRECTORY: "meetingDirectory",
  USER_PROFILES: "userProfiles",
  MEMBERS: "members",
  TRANSACTIONS: "transactions",
  DUES: "dues",
  ACCOUNTS: "accounts",
  EVENT_EXPENSES: "eventExpenses",
  HISTORIES: "histories",
  JOIN_REQUESTS: "joinRequests",
} as const;

export const paths = {
  meetings: () => COLLECTIONS.MEETINGS,
  meeting: (meetingId: string) => `${COLLECTIONS.MEETINGS}/${meetingId}`,
  meetingDirectory: () => COLLECTIONS.MEETING_DIRECTORY,
  userProfile: (uid: string) => `${COLLECTIONS.USER_PROFILES}/${uid}`,
  members: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.MEMBERS}`,
  transactions: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.TRANSACTIONS}`,
  dues: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.DUES}`,
  accounts: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.ACCOUNTS}`,
  eventExpenses: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.EVENT_EXPENSES}`,
  histories: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.HISTORIES}`,
  joinRequests: (meetingId: string) =>
    `${COLLECTIONS.MEETINGS}/${meetingId}/${COLLECTIONS.JOIN_REQUESTS}`,
};
