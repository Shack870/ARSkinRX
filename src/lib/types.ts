/**
 * ARSkinRX shared domain types.
 *
 * These mirror the Firestore document shapes. Timestamps are stored as
 * Firestore Timestamps server-side but we expose them as ISO strings /
 * millis on the client to keep components simple.
 */

export type Role = "client" | "provider" | "admin";

/**
 * The condition / service lines the clinic offers. Providers pick which of
 * these they will see clients for during onboarding.
 */
export type ServiceType =
  | "anti-aging"
  | "hyperpigmentation"
  | "acne"
  | "rosacea"
  | "hair-loss"
  | "hair-growth"
  | "toe-nail-health"
  | "eczema-psoriasis";

export interface ServiceDefinition {
  id: ServiceType;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  /** Default price in cents; a provider may override per-service later. */
  defaultPriceCents: number;
  /** Visit length in minutes. */
  durationMinutes: number;
  /** lucide-react icon name used in the UI. */
  icon: string;
}

/** Per-user email/notification preferences. */
export interface NotificationPrefs {
  /** Booking confirmation / receipt email. */
  receipt: boolean;
  /** Reminder ~3 days before the visit. */
  reminder3Day: boolean;
  /** Reminder ~1 day before the visit. */
  reminder1Day: boolean;
  /** Reminder on the day of the visit. */
  reminderDayOf: boolean;
}

/** Base profile for every authenticated user. */
export interface PatientPharmacy {
  name: string;
  /** City / street so the right branch is unambiguous. */
  location: string;
  phone: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  /** Date of birth, ISO date "YYYY-MM-DD". Collected at intake (required to prescribe). */
  dob?: string;
  /** Preferred pharmacy, captured at intake; the prescriber sends Rx here. */
  pharmacy?: PatientPharmacy;
  role: Role;
  /**
   * Mirror of the additive `admin: true` custom claim. Lets a provider (e.g.
   * the clinic owner) also administer without giving up their provider role.
   */
  isAdmin?: boolean;
  /** Arkansas only for now; kept for future multi-state expansion. */
  state: string;
  notificationPrefs?: NotificationPrefs;
  /** Explicit consent to receive SMS (TCPA). */
  smsOptIn?: boolean;
  /** When SMS consent was given (for compliance records). */
  smsOptInAt?: number;
  /** When the patient accepted Terms/Privacy/Telehealth Consent at signup. */
  consentAcceptedAt?: number | null;
  /**
   * False for accounts created during guest booking or by an admin, until the
   * patient sets a password. Drives the "finish your account" prompt.
   */
  passwordSet?: boolean;
  createdVia?: "signup" | "booking" | "admin";
  createdAt: number;
  updatedAt: number;
}

export type ProviderStatus = "pending" | "approved" | "suspended";

/** Attestations the APRN checks during onboarding. */
export interface ProviderAttestations {
  followsArkansasNursingRules: boolean;
  hasPrescriptiveAuthority: boolean;
  agreesToTerms: boolean;
  attestedAt: number;
}

/** Extended profile for APRNs (the marketplace providers). */
export interface ProviderProfile {
  uid: string;
  licenseNumber: string;
  bio: string;
  photoURL?: string;
  /** Post-nominal credentials shown to patients, e.g. "APRN, FNP-C". */
  credentials?: string;
  /** Years in practice as an APRN. */
  yearsExperience?: number;
  /** Which service lines this provider treats. */
  conditions: ServiceType[];
  /** Optional per-service price overrides, in cents. */
  priceOverrides?: Partial<Record<ServiceType, number>>;
  attestations: ProviderAttestations;
  status: ProviderStatus;
  /** Stripe Connect (Express) account id for automatic payouts. */
  stripeAccountId?: string;
  /**
   * True once Stripe reports details_submitted && charges_enabled &&
   * payouts_enabled. Visits paid after this point are split automatically.
   */
  stripeOnboardingComplete: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Weekly availability for a provider. Each entry is a recurring window on a
 * given weekday in the provider's local time. Bookable slots are generated
 * from these windows minus already-booked appointments.
 */
export interface AvailabilityWindow {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** "HH:mm" 24h local time */
  startTime: string;
  endTime: string;
}

export interface ProviderAvailability {
  providerId: string;
  timezone: string;
  windows: AvailabilityWindow[];
  /** Specific ISO dates the provider has blocked off. */
  blackoutDates: string[];
  updatedAt: number;
}

export type AppointmentStatus =
  | "pending_payment"
  | "booked"
  | "in_progress"
  | "completed"
  | "no_show"
  | "rescheduled"
  | "cancelled";

export type NoShowParty = "client" | "provider" | null;

/** How a nurse is paid their share of a visit. */
export type PayoutVia = "stripe" | "manual";

export interface Appointment {
  id: string;
  clientId: string;
  providerId: string;
  serviceId: ServiceType;
  /** Visit window start/end in epoch millis (UTC). */
  start: number;
  end: number;
  status: AppointmentStatus;
  priceCents: number;
  platformFeeCents: number;
  paymentId?: string;
  stripePaymentIntentId?: string;
  intakeId?: string;
  videoRoomId?: string;
  /** When each party actually joined the call. */
  joinedAt?: { client?: number; provider?: number };
  noShowParty?: NoShowParty;
  /** Set when this appointment was rescheduled into a new one. */
  rescheduledToId?: string;
  rescheduledFromId?: string;
  /**
   * How the nurse gets their share of this visit.
   * - "stripe": split automatically through Stripe Connect (destination charge
   *   at checkout, or a Transfer on completion for live visits). Never shows
   *   up as owed in admin payouts.
   * - "manual" (or unset): the owner pays by Zelle/check/ACH and records it.
   */
  payoutVia?: PayoutVia;
  /** Stripe Transfer id when the nurse's share was sent after the fact (live visits). */
  stripeTransferId?: string;
  /** Manual provider payout tracking (for nurses not on Stripe Connect). */
  providerPaidAt?: number;
  payoutId?: string;
  /** Cancellation metadata. */
  cancelledBy?: Role;
  cancelledAt?: number;
  refundEligible?: boolean;
  /** Stripe refund id (or a `dev_`/`manual_` marker) once a refund was issued. */
  refundId?: string;
  refundedCents?: number;
  refundedAt?: number;
  /** Soft hold expiry for pending_payment slots (epoch millis). */
  holdExpiresAt?: number;
  /** True for on-demand "No-Wait Live" visits. */
  isLive?: boolean;
  /**
   * What the nurse decided about medication at End Appointment.
   * "recommend" → one or more `prescriptions` docs exist for this visit.
   */
  rxDecision?: "recommend" | "none";
  /** Timestamps of milestone reminders already sent, to avoid duplicates. */
  remindersSent?: { threeDay?: number; oneDay?: number; dayOf?: number };
  reminderSentAt?: number;
  /** Patient's rating of the visit (1-5) and when it was left. */
  rating?: number;
  ratedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** A provider's real-time availability for No-Wait Live visits. */
export interface LivePresence {
  providerId: string;
  online: boolean;
  busy: boolean;
  conditions: ServiceType[];
  lastSeenAt: number;
  updatedAt: number;
}

export type LiveRequestStatus =
  | "pending_payment"
  | "searching"
  /** Paid; every eligible nurse is busy, so the patient holds a place in line. */
  | "queued"
  | "matched"
  | "expired"
  | "cancelled"
  /** Patient took the "schedule instead" offer; see convertedAppointmentId. */
  | "converted";

/** A patient's on-demand live-visit request, matched to a nurse Uber-style. */
export interface LiveRequest {
  id: string;
  clientId: string;
  serviceId: ServiceType;
  status: LiveRequestStatus;
  priceCents: number;
  platformFeeCents: number;
  intake: Record<string, string | string[] | boolean>;
  photoPaths: string[];
  stripePaymentIntentId?: string;
  providerId?: string;
  appointmentId?: string;
  refundEligible?: boolean;
  /** Stripe refund id (or a `dev_`/`manual_` marker) once a refund was issued. */
  refundId?: string;
  refundedCents?: number;
  refundedAt?: number;
  /** Round-robin offer state: the nurse currently being pinged. */
  offeredTo?: string | null;
  offerExpiresAt?: number | null;
  /** Nurses who declined or timed out (not pinged again). */
  declinedBy?: string[];
  /** When the current search (offer round) started; drives the safety cap. */
  searchStartedAt?: number;
  // ── Queue (status === "queued", or carried along once popped) ──
  /** Nurse whose line the patient is waiting in. */
  queuedProviderId?: string | null;
  /** Display name of that nurse, denormalized for the patient screen. */
  queuedProviderName?: string | null;
  queuedAt?: number | null;
  /** 1-based place in that nurse's line (recomputed server-side). */
  position?: number | null;
  /** Projected start time (epoch ms), recomputed on every queue event. */
  estimateAt?: number | null;
  /** Projected end of the nurse's current visit (epoch ms), if any. */
  currentVisitEndsAt?: number | null;
  /** Next scheduled (non-live) visit start for the nurse, if it gates the queue. */
  nextScheduledStart?: number | null;
  /** When the schedule-instead fallback was first offered. */
  waitOfferedScheduleAt?: number | null;
  /** Last time the head of the line was popped into a 15s offer. */
  lastPoppedAt?: number | null;
  /** Set on the offer when it came off the queue (how long they've waited). */
  queuedWaitMs?: number | null;
  /** Set when the patient converted to a scheduled visit. */
  convertedAppointmentId?: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

/** Pre-payment projection for a service line (see estimateForNewRequest). */
export interface LiveEstimate {
  /** True when at least one eligible nurse is online (now or after a wait). */
  available: boolean;
  nurseCount: number;
  /** Projected wait for a brand-new request, in ms (0 = right now). */
  bestWaitMs: number;
  /** 1-based place the new request would take in the best nurse's line. */
  position: number;
  /** Projected start time, epoch ms. */
  nextOpeningAt: number | null;
  reason: "now" | "busy" | "scheduled_block" | "none";
  /** Best nurse's uid and display name (for copy like "Crystal is in a visit"). */
  providerId?: string | null;
  providerName?: string | null;
}

/** Intake questionnaire response. Considered PHI. */
export interface IntakeResponse {
  id: string;
  appointmentId: string;
  clientId: string;
  serviceId: ServiceType;
  answers: Record<string, string | string[] | boolean>;
  /** Cloud Storage paths for uploaded condition photos. */
  photoPaths: string[];
  createdAt: number;
}

export type PaymentStatus =
  | "requires_payment"
  | "succeeded"
  | "refunded"
  | "partially_refunded"
  | "failed";

/** Payment record. Deliberately contains NO clinical / PHI fields. */
export interface PaymentRecord {
  id: string;
  appointmentId: string;
  clientId: string;
  providerId: string;
  amountCents: number;
  platformFeeCents: number;
  currency: string;
  stripePaymentIntentId: string;
  stripeChargeId?: string;
  payoutVia?: PayoutVia;
  status: PaymentStatus;
  refundedCents: number;
  createdAt: number;
  updatedAt: number;
}

/** Clinical note written by the provider. PHI. */
export interface VisitNote {
  appointmentId: string;
  providerId: string;
  clientId: string;
  subjective: string;
  assessment: string;
  plan: string;
  /** Free-text record of what was prescribed (Rx delivered via external tool in v1). */
  prescribed: string;
  createdAt: number;
  updatedAt: number;
  /** Who last saved the note (set by the server PATCH route). */
  updatedBy?: string;
  updatedByName?: string;
}

/**
 * A prior version of a visit note, written to visitNotes/{id}/history when
 * the note is amended. Server-written only.
 */
export interface VisitNoteHistoryEntry {
  id: string;
  appointmentId: string;
  subjective: string;
  assessment: string;
  plan: string;
  prescribed: string;
  /** When this (now superseded) version was originally saved. */
  versionSavedAt: number;
  /** Who replaced this version, and when. */
  editedBy: string;
  editedByName: string;
  editedAt: number;
  reason?: string;
}

/** Row in a nurse's patient roster (GET /api/provider/patients). */
export interface ProviderPatientSummary {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  dob: string | null;
  age: number | null;
  visitCount: number;
  lastVisitAt: number | null;
  lastServiceId: ServiceType | null;
}

/** One visit in a patient's history (GET /api/provider/patients/[uid]). */
export interface ProviderPatientVisit {
  appointment: Appointment;
  serviceName: string;
  providerName: string;
  /** True when the requester may edit this visit's note (their visit, or admin). */
  canEdit: boolean;
  intake: {
    answers: Record<string, string | string[] | boolean>;
    photoPaths: string[];
  } | null;
  note: VisitNote | null;
  noteHistory: VisitNoteHistoryEntry[];
}

export interface ProviderPatientDetail {
  profile: {
    uid: string;
    displayName: string;
    email: string;
    phone: string;
    dob: string | null;
    age: number | null;
  };
  visits: ProviderPatientVisit[];
}

/* ───────────────────────────── Prescriptions ───────────────────────────── */

/**
 * Lifecycle of a prescription recommendation. The nurse on the visit
 * recommends; the prescriber of record (the clinic owner / admin) approves,
 * sends it to the pharmacy, or declines (which refunds the visit).
 *
 *   recommended → approved → sent
 *               ↘ declined
 */
export type PrescriptionStatus = "recommended" | "approved" | "sent" | "declined";

/** One medication line, as written on a prescription. */
export interface PrescriptionItem {
  /** Generic / brand name, e.g. "Tretinoin cream". */
  drug: string;
  /** e.g. "0.025%", "100 mg". */
  strength: string;
  /** Directions, e.g. "Apply pea-sized amount to face nightly." */
  sig: string;
  /** e.g. "45 g", "60 tablets". */
  quantity: string;
  refills: number;
}

/** One prescription (one drug) tied to a completed visit. Server-written only. */
export interface Prescription {
  id: string;
  appointmentId: string;
  clientId: string;
  /** Nurse on the visit. */
  providerId: string;
  serviceId: ServiceType;
  status: PrescriptionStatus;
  /** What the nurse recommended (never edited after creation). */
  recommended: PrescriptionItem;
  /** Nurse's one-line rationale for the prescriber. */
  reason: string;
  recommendedBy: string;
  recommendedByName: string;
  recommendedAt: number;
  /** The prescriber's final version (defaults to `recommended` on approve). */
  final?: PrescriptionItem;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  declineReason?: string;
  sentAt?: number;
  sentBy?: string;
  /** Free text: how it was sent (e-prescribe ref, "called in", fax). */
  sentVia?: string;
  /** Snapshot of the patient's pharmacy at recommendation time. */
  pharmacy?: PatientPharmacy | null;
  /** Set when the review queue reminder has fired for this item. */
  reviewNudgedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** A manual payout to a provider covering one or more completed visits. */
export interface Payout {
  id: string;
  providerId: string;
  amountCents: number;
  appointmentIds: string[];
  /** e.g. "Zelle", "Check", "ACH" */
  method: string;
  note?: string;
  createdBy: string;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}
