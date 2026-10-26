"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProviderAvailability, useProviderProfile } from "@/lib/hooks";
import { BIO_MIN_CHARS } from "@/lib/validation";

export const SCHEDULE_PATH = "/provider/availability";
export const PROFILE_PATH = "/provider/profile";

export type SetupStep = "schedule" | "profile";

/**
 * What a nurse still has to finish before the rest of the provider area opens.
 * Ordered by what we ask for first.
 */
export function useProviderSetup(uid: string | undefined) {
  const { availability, loading: availLoading } = useProviderAvailability(uid);
  const { profile, loading: profileLoading } = useProviderProfile(uid);

  const loading = !uid || availLoading || profileLoading;
  const hasSchedule = (availability?.windows?.length ?? 0) > 0;
  const hasProfile =
    Boolean(profile?.photoURL) &&
    (profile?.bio ?? "").trim().length >= BIO_MIN_CHARS;

  let required: SetupStep | null = null;
  if (!loading) {
    if (!hasSchedule) required = "schedule";
    else if (!hasProfile) required = "profile";
  }

  return { loading, required, hasSchedule, hasProfile, profile, availability };
}

/**
 * Forces first-time setup: a nurse (including the owner's provider login)
 * can't use the dashboard until they've set a weekly schedule and finished
 * their public profile. Once done, every page is open and the schedule can be
 * edited any time from Availability.
 */
export function ProviderSetupGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { loading, required } = useProviderSetup(user?.uid);

  const target =
    required === "schedule"
      ? SCHEDULE_PATH
      : required === "profile"
        ? PROFILE_PATH
        : null;
  const blocked = Boolean(target && pathname !== target);

  React.useEffect(() => {
    if (!loading && blocked && target) {
      router.replace(`${target}?setup=1`);
    }
  }, [loading, blocked, target, router]);

  if (loading || blocked) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }
  return <>{children}</>;
}
