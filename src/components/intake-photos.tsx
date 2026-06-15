"use client";

import * as React from "react";
import { pathToUrl } from "@/lib/storage";

/**
 * Renders thumbnails for intake condition photos. Resolves each storage path
 * to a download URL (access is governed by Storage rules). Opens full size in
 * a new tab on click.
 */
export function IntakePhotos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = React.useState<string[]>([]);

  React.useEffect(() => {
    let active = true;
    Promise.all(paths.map((p) => pathToUrl(p).catch(() => null))).then((res) => {
      if (active) setUrls(res.filter((u): u is string => !!u));
    });
    return () => {
      active = false;
    };
  }, [paths]);

  if (!paths.length) return null;

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
        Photos
      </p>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <a key={i} href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={`Condition photo ${i + 1}`}
              className="h-20 w-20 rounded-[var(--radius-sm)] border border-[var(--border)] object-cover transition-opacity hover:opacity-90"
            />
          </a>
        ))}
        {urls.length === 0 &&
          paths.map((_, i) => (
            <div
              key={i}
              className="h-20 w-20 animate-pulse rounded-[var(--radius-sm)] bg-[var(--muted)]"
            />
          ))}
      </div>
    </div>
  );
}
