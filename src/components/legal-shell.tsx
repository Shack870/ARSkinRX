import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[var(--background)]">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Last updated {updated}
          </p>
          <div className="legal mt-8 space-y-5 text-sm leading-relaxed text-[var(--foreground)]">
            {children}
          </div>
          <p className="mt-10 rounded-[var(--radius-md)] bg-[var(--muted)] p-4 text-xs text-[var(--muted-foreground)]">
            This document is a starting template and not legal advice. Have it
            reviewed by a licensed attorney before going live.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">{heading}</h2>
      <div className="space-y-2 text-[var(--muted-foreground)]">{children}</div>
    </section>
  );
}
