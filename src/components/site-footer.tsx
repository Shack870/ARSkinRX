import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] text-xs font-bold text-[var(--primary-foreground)]">
                AR
              </span>
              <span className="font-semibold">ARSkinRX</span>
            </div>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              Virtual skin care from licensed Arkansas nurse practitioners.
              Founded by B. Crystal Shackelford, APRN.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
            <FooterCol
              title="Clinic"
              links={[
                ["Services", "/#services"],
                ["How it works", "/#how-it-works"],
                ["Book a visit", "/book"],
              ]}
            />
            <FooterCol
              title="Providers"
              links={[
                ["Apply to practice", "/providers/apply"],
                ["Provider login", "/login"],
              ]}
            />
            <FooterCol
              title="Legal"
              links={[
                ["Terms & Conditions", "/legal/terms"],
                ["Privacy & HIPAA", "/legal/privacy"],
                ["Telehealth consent", "/legal/consent"],
              ]}
            />
          </div>
        </div>
        <p className="mt-10 text-xs text-[var(--muted-foreground)]">
          © {new Date().getFullYear()} ARSkinRX. Services available to Arkansas
          residents only. This site does not provide emergency care — call 911
          for emergencies.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <h4 className="mb-3 font-semibold">{title}</h4>
      <ul className="space-y-2 text-[var(--muted-foreground)]">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="hover:text-[var(--primary)]">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
