/** Centralized Firestore collection names to avoid string drift. */
export const COLLECTIONS = {
  users: "users",
  providers: "providers",
  availability: "availability",
  services: "services",
  appointments: "appointments",
  intakeResponses: "intakeResponses",
  payments: "payments",
  payouts: "payouts",
  visitNotes: "visitNotes",
  signaling: "signaling",
  auditLogs: "auditLogs",
  presence: "presence",
  liveRequests: "liveRequests",
} as const;
