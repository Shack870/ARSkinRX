import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata = { title: "Telehealth Consent — ARSkinRX" };

export default function ConsentPage() {
  return (
    <LegalShell title="Telehealth Informed Consent" updated="June 2026">
      <p>
        By booking a visit, you consent to receive care via telehealth from an
        Arkansas-licensed nurse practitioner through ARSkinRX.
      </p>
      <LegalSection heading="What telehealth is">
        <p>
          Telehealth uses secure video to connect you with a provider remotely.
          Your provider will evaluate your concern, may make recommendations,
          and may prescribe non-controlled medications when appropriate.
        </p>
      </LegalSection>
      <LegalSection heading="Benefits & limitations">
        <p>
          Telehealth offers convenient access to care. However, a remote visit
          has limitations — your provider cannot perform a hands-on physical
          exam, and some conditions may require an in-person evaluation. If your
          provider determines telehealth isn&apos;t appropriate for your
          concern, they will advise you to seek in-person care.
        </p>
      </LegalSection>
      <LegalSection heading="Privacy">
        <p>
          Your video visit is private and is not recorded. The information you
          share is protected as described in our Privacy & HIPAA Notice.
        </p>
      </LegalSection>
      <LegalSection heading="Consent to treatment">
        <p>
          You acknowledge that you are located in Arkansas, that the information
          you provide is accurate, and that you may withdraw this consent at any
          time before your visit.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
