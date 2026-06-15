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
  ProviderAvailability,
  ProviderProfile,
  UserProfile,
  VisitNote,
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
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!intakeId) {
      setLoading(false);
      return;
    }
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
