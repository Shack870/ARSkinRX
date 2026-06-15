"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { Loader2, Star } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SERVICE_MAP } from "@/lib/services";
import type { ServiceType } from "@/lib/types";

interface PublicProvider {
  uid: string;
  displayName: string;
  bio: string;
  photoURL: string | null;
  conditions: ServiceType[];
  ratingAvg: number;
  ratingCount: number;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ProviderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [provider, setProvider] = React.useState<PublicProvider | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/providers/${id}`)
      .then((r) => (r.ok ? r.json() : { provider: null }))
      .then((d) => setProvider(d.provider))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[var(--muted)]">
        <div className="mx-auto max-w-2xl px-4 py-12">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
            </div>
          ) : !provider ? (
            <Card className="p-8 text-center">
              <p className="text-[var(--muted-foreground)]">
                This provider isn&apos;t available.
              </p>
              <Link href="/book" className="mt-4 inline-block">
                <Button>Browse providers</Button>
              </Link>
            </Card>
          ) : (
            <Card className="p-8">
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-xl font-semibold text-[var(--primary)]">
                  {provider.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={provider.photoURL}
                      alt={provider.displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials(provider.displayName)
                  )}
                </span>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {provider.displayName}
                  </h1>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Arkansas-licensed nurse practitioner
                  </p>
                  {provider.ratingCount > 0 && (
                    <span className="mt-1 inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {provider.ratingAvg.toFixed(1)} ({provider.ratingCount})
                    </span>
                  )}
                </div>
              </div>

              {provider.bio && (
                <p className="mt-6 text-[var(--foreground)]">{provider.bio}</p>
              )}

              <div className="mt-6">
                <p className="mb-2 text-sm font-medium">Treats</p>
                <div className="flex flex-wrap gap-2">
                  {provider.conditions.map((c) => (
                    <Badge key={c} variant="primary">
                      {SERVICE_MAP[c]?.name ?? c}
                    </Badge>
                  ))}
                </div>
              </div>

              <Link href="/book" className="mt-8 inline-block">
                <Button size="lg">Book a visit</Button>
              </Link>
            </Card>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
