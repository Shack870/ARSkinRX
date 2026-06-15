import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata = { title: "Privacy & HIPAA Notice — ARSkinRX" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy & HIPAA Notice" updated="June 2026">
      <p>
        ARSkinRX is committed to protecting your health information. This notice
        describes how your information may be used and disclosed and how you can
        access it.
      </p>
      <LegalSection heading="Information we collect">
        <p>
          Account details (name, email, phone), the intake information you
          provide, appointment and payment records, and any photos you upload
          for your visit.
        </p>
      </LegalSection>
      <LegalSection heading="How we protect it">
        <p>
          Health information is stored encrypted in transit and at rest on
          HIPAA-eligible infrastructure. Access is limited to you, your treating
          provider, and authorized administrators. Video visits are
          peer-to-peer and are not recorded or stored.
        </p>
      </LegalSection>
      <LegalSection heading="Payment data">
        <p>
          Payments are processed by Stripe. We do not store full card numbers,
          and we never share your diagnosis or clinical details with the payment
          processor.
        </p>
      </LegalSection>
      <LegalSection heading="Your rights">
        <p>
          You may request access to your records, request corrections, and ask
          how your information has been shared. Contact us to exercise these
          rights.
        </p>
      </LegalSection>
      <LegalSection heading="Disclosures">
        <p>
          We disclose health information only as needed to provide care, process
          payment, operate the service, or as required by law.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
