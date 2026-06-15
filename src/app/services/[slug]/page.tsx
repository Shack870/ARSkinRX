import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Video, FileCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ServiceCard } from "@/components/service-card";
import { Faq } from "@/components/faq";
import { StickyBookBar } from "@/components/sticky-book-bar";
import { Button } from "@/components/ui/button";
import { SERVICES, getServiceBySlug } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";

const EXPECT = [
  {
    icon: ClipboardList,
    title: "Share your story",
    body: "Answer a few quick questions about your concern and history.",
  },
  {
    icon: Video,
    title: "Meet your provider",
    body: "Connect by video with a licensed Arkansas nurse practitioner.",
  },
  {
    icon: FileCheck,
    title: "Get your plan",
    body: "Receive a personalized treatment plan and prescriptions if appropriate.",
  },
];

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) return {};
  return {
    title: `${service.name} — ARSkinRX`,
    description: service.shortDescription,
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) notFound();

  const related = SERVICES.filter((s) => s.id !== service.id).slice(0, 4);

  const faqs = [
    {
      q: `How much is a ${service.name.toLowerCase()} visit?`,
      a: `${formatCurrency(service.defaultPriceCents)} for a ${service.durationMinutes}-minute video visit, paid securely at booking.`,
    },
    {
      q: "Can I get a prescription for this?",
      a: "If your provider determines it's appropriate, yes. Prescriptions are at their clinical judgment. We do not prescribe controlled substances online.",
    },
    {
      q: "Who will I see?",
      a: "A nurse practitioner licensed in Arkansas with prescriptive authority. You'll pick your provider during booking.",
    },
    {
      q: "What if I need to reschedule?",
      a: "If you miss your window you can reschedule once for free. Refunds aren't available within 48 hours of a visit.",
    },
  ];

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="bg-gradient-to-b from-[var(--primary-soft)] to-[var(--background)]">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center">
            <p className="text-sm font-medium text-[var(--primary)]">
              {formatCurrency(service.defaultPriceCents)} ·{" "}
              {service.durationMinutes} min video visit
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              {service.name}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--muted-foreground)]">
              {service.description}
            </p>
            <Link
              href={`/book?service=${service.slug}`}
              className="mt-8 inline-block"
            >
              <Button size="lg">Book a {service.name} visit</Button>
            </Link>
          </div>
        </section>

        {/* What to expect */}
        <section className="bg-[var(--muted)] py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">
              What to expect
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {EXPECT.map((e, i) => (
                <div key={e.title}>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                    <e.icon className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                    Step {i + 1}
                  </div>
                  <h3 className="mt-1 font-semibold">{e.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {e.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">
            Questions about {service.name.toLowerCase()}
          </h2>
          <Faq items={faqs} />
        </section>

        {/* Related */}
        <section className="mx-auto max-w-5xl px-4 pb-24 md:pb-16">
          <h2 className="mb-6 text-center text-2xl font-semibold tracking-tight">
            Explore other services
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((s) => (
              <ServiceCard key={s.id} service={s} />
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
      <StickyBookBar label={`Book a ${service.name} visit`} />
    </>
  );
}
