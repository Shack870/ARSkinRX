"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAppointment } from "@/lib/hooks";
import { isJoinable } from "@/lib/appointment-window";
import { VideoRoom } from "@/components/visit/video-room";
import { Button } from "@/components/ui/button";

export default function VisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const { appointment, loading } = useAppointment(id);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(`/visit/${id}`)}`);
    }
  }, [authLoading, user, router, id]);

  if (authLoading || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <Centered>
        <p>Visit not found.</p>
        <Link href="/dashboard">
          <Button variant="outline" className="mt-4">
            Back
          </Button>
        </Link>
      </Centered>
    );
  }

  const isParticipant =
    appointment.clientId === user.uid || appointment.providerId === user.uid;
  if (!isParticipant) {
    return (
      <Centered>
        <p>You don&apos;t have access to this visit.</p>
      </Centered>
    );
  }

  if (!isJoinable(appointment)) {
    const backHref =
      role === "provider"
        ? "/provider/schedule"
        : `/dashboard/appointments/${id}`;
    return (
      <Centered>
        <p className="max-w-sm text-center">
          This visit isn&apos;t open right now. You can join starting 5 minutes
          before the scheduled time.
        </p>
        <Link href={backHref}>
          <Button variant="outline" className="mt-4">
            Back
          </Button>
        </Link>
      </Centered>
    );
  }

  return <VideoRoom appointment={appointment} role={role ?? "client"} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-950 px-4 text-white">
      {children}
    </div>
  );
}
