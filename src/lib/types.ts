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
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: Role;
  /** Arkansas only for now; kept for future multi-state expansion. */
  state: string;
  notificationPrefs?: NotificationPrefs;
  /** Explicit consent to receive SMS (TCPA). */
  smsOptIn?: boolean;
  /** When SMS consent was given (for compliance records). */
  smsOptInAt?: number;
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
  /** Which service lines this provider treats. */
  conditions: ServiceType[];
  /** Optional per-service price overrides, in cents. */
  priceOverrides?: Partial<Record<ServiceType, number>>;
  attestations: ProviderAttestations;
  status: ProviderStatus;
  /** Stripe Connect account id for payouts. */
  stripeAccountId?: string;
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
  /** Manual provider payout tracking (Stripe Connect deferred for now). */
  providerPaidAt?: number;
  payoutId?: string;
  /** Cancellation metadata. */
  cancelledBy?: Role;
  cancelledAt?: number;
  refundEligible?: boolean;
  /** Soft hold expiry for pending_payment slots (epoch millis). */
  holdExpiresAt?: number;
  /** True for on-demand "No-Wait Live" visits. */
  isLive?: boolean;
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
  | "matched"
  | "expired"
  | "cancelled";

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
  /** Round-robin offer state: the nurse currently being pinged. */
  offeredTo?: string | null;
  offerExpiresAt?: number | null;
  /** Nurses who declined or timed out (not pinged again). */
  declinedBy?: string[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
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
