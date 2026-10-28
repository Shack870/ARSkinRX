"use client";

import * as React from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type {
  Appointment,
  IntakeResponse,
  LiveRequest,
  PaymentRecord,
  Payout,
  ProviderAvailability,
  ProviderProfile,
  UserProfile,
  VisitNote,
  VisitNoteHistoryEntry,
  Prescription,
} from "@/lib/types";

export function useLiveRequest(id: string | undefined) {
  const [request, setRequest] = React.useState<LiveRequest | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, COLLECTIONS.liveRequests, id),
      (snap) => {
        setRequest(snap.exists() ? (snap.data() as LiveRequest) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [id]);
  return { request, loading };
}

export function useProviderProfile(uid: string | undefined) {
  const [profile, setProfile] = React.useState<ProviderProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!uid) return;
    const ref = doc(db, COLLECTIONS.providers, uid);
    return onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as ProviderProfile) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);

  return { profile, loading };
}

export function useProviderAvailability(uid: string | undefined) {
  const [availability, setAvailability] =
    React.useState<ProviderAvailability | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!uid) return;
    const ref = doc(db, COLLECTIONS.availability, uid);
    return onSnapshot(
      ref,
      (snap) => {
        setAvailability(
          snap.exists() ? (snap.data() as ProviderAvailability) : null,
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);

  return { availability, loading };
}

export function useUserProfile(uid: string | undefined) {
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, COLLECTIONS.users, uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);
  return { profile, loading };
}

export function useIntake(intakeId: string | undefined) {
  const [intake, setIntake] = React.useState<IntakeResponse | null>(null);
  // Nothing to load when there's no intake id.
  const [loading, setLoading] = React.useState(Boolean(intakeId));
  React.useEffect(() => {
    if (!intakeId) return;
    return onSnapshot(
      doc(db, COLLECTIONS.intakeResponses, intakeId),
      (snap) => {
        setIntake(snap.exists() ? (snap.data() as IntakeResponse) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [intakeId]);
  return { intake, loading };
}

export function useVisitNote(appointmentId: string | undefined) {
  const [note, setNote] = React.useState<VisitNote | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!appointmentId) return;
    return onSnapshot(
      doc(db, COLLECTIONS.visitNotes, appointmentId),
      (snap) => {
        setNote(snap.exists() ? (snap.data() as VisitNote) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [appointmentId]);
  return { note, loading };
}

/** All prescriptions tied to one visit (patient, nurse on the visit, or admin). */
/**
 * Prescriptions for one visit. Non-admin readers must scope the query to
 * their own uid (`clientId` for patients, `providerId` for nurses) so the
 * Firestore rule can prove every result is theirs; admins read unscoped.
 */
export function usePrescriptionsForAppointment(
  appointmentId: string | undefined,
  scope?: { field: "clientId" | "providerId"; uid: string | undefined },
) {
  const [prescriptions, setPrescriptions] = React.useState<Prescription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const scopeField = scope?.field;
  const scopeUid = scope?.uid;
  React.useEffect(() => {
    if (!appointmentId) return;
    if (scopeField && !scopeUid) return;
    const q = scopeField
      ? query(
          collection(db, COLLECTIONS.prescriptions),
          where("appointmentId", "==", appointmentId),
          where(scopeField, "==", scopeUid),
        )
      : query(
          collection(db, COLLECTIONS.prescriptions),
          where("appointmentId", "==", appointmentId),
        );
    return onSnapshot(
      q,
      (snap) => {
        setPrescriptions(
          snap.docs
            .map((d) => d.data() as Prescription)
            .sort((a, b) => a.createdAt - b.createdAt),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [appointmentId, scopeField, scopeUid]);
  return { prescriptions, loading };
}

export function useClientPayments(uid: string | undefined) {
  const [payments, setPayments] = React.useState<PaymentRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, COLLECTIONS.payments),
      where("clientId", "==", uid),
    );
    return onSnapshot(
      q,
      (snap) => {
        setPayments(
          snap.docs
            .map((d) => d.data() as PaymentRecord)
            .sort((a, b) => b.createdAt - a.createdAt),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);
  return { payments, loading };
}

/** Payouts issued to a provider, newest first. */
export function useProviderPayouts(uid: string | undefined) {
  const [payouts, setPayouts] = React.useState<Payout[]>([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, COLLECTIONS.payouts),
      where("providerId", "==", uid),
    );
    return onSnapshot(
      q,
      (snap) => {
        setPayouts(
          snap.docs
            .map((d) => ({ ...(d.data() as Payout), id: d.id }))
            .sort((a, b) => b.createdAt - a.createdAt),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);
  return { payouts, loading };
}

export function useAppointment(id: string | undefined) {
  const [appointment, setAppointment] = React.useState<Appointment | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    const ref = doc(db, COLLECTIONS.appointments, id);
    return onSnapshot(
      ref,
      (snap) => {
        setAppointment(snap.exists() ? (snap.data() as Appointment) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [id]);

  return { appointment, loading };
}

export function useClientAppointments(uid: string | undefined) {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, COLLECTIONS.appointments),
      where("clientId", "==", uid),
      orderBy("start", "asc"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setAppointments(snap.docs.map((d) => d.data() as Appointment));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);

  return { appointments, loading };
}

export function useProviderAppointments(uid: string | undefined) {
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, COLLECTIONS.appointments),
      where("providerId", "==", uid),
      orderBy("start", "asc"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setAppointments(snap.docs.map((d) => d.data() as Appointment));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [uid]);

  return { appointments, loading };
}

/**
 * Prior versions of a visit note (visitNotes/{id}/history), newest first.
 * Readable by the provider on the visit and admins; written server-side only.
 */
export function useVisitNoteHistory(appointmentId: string | undefined) {
  const [history, setHistory] = React.useState<VisitNoteHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(Boolean(appointmentId));
  React.useEffect(() => {
    if (!appointmentId) return;
    return onSnapshot(
      collection(db, COLLECTIONS.visitNotes, appointmentId, "history"),
      (snap) => {
        setHistory(
          snap.docs
            .map((d) => ({ ...(d.data() as VisitNoteHistoryEntry), id: d.id }))
            .sort((a, b) => b.editedAt - a.editedAt),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [appointmentId]);
  return { history, loading };
}
