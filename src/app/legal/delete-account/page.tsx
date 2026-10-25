import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata = {
  title: "Delete your account — ARSkinRX",
  description:
    "How to request deletion of your ARSkinRX account and the data we delete or retain.",
};

export default function DeleteAccountPage() {
  return (
    <LegalShell title="Delete your ARSkinRX account" updated="October 2026">
      <p>
        You can ask us to delete your ARSkinRX account at any time. This page
        explains how to make the request, what we delete, and what we are
        required to keep.
      </p>
      <LegalSection heading="How to request deletion">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Send an email to{" "}
            <a
              href="mailto:crystal@arskinrx.com?subject=Delete%20my%20ARSkinRX%20account"
              className="text-[var(--primary)] underline"
            >
              crystal@arskinrx.com
            </a>{" "}
            from the email address on your ARSkinRX account, with the subject
            line <strong>&ldquo;Delete my ARSkinRX account&rdquo;</strong>.
          </li>
          <li>
            Include your full name and the phone number on file so we can
            confirm the request is yours. We may reply to verify your identity
            before proceeding.
          </li>
          <li>
            We will confirm by email once your account has been deleted,
            normally within 30 days of a verified request.
          </li>
        </ol>
        <p>
          You can also call or text us at{" "}
          <a href="tel:+18709550560" className="text-[var(--primary)] underline">
            (870) 955-0560
          </a>
          . Any upcoming appointments will be cancelled; refunds follow the
          cancellation terms in our Terms &amp; Conditions.
        </p>
      </LegalSection>
      <LegalSection heading="What we delete">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your login credentials and ability to sign in</li>
          <li>Your account profile (name, email, phone, date of birth)</li>
          <li>Photos you uploaded for visits</li>
          <li>Saved intake answers, notification preferences, and SMS opt-in</li>
          <li>Device and push notification tokens</li>
        </ul>
      </LegalSection>
      <LegalSection heading="What we keep, and for how long">
        <p>
          ARSkinRX is a medical practice, so some information cannot be deleted
          on request:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Clinical records</strong> (visit notes, diagnoses, treatment
            plans, prescriptions) are retained for the period required by
            Arkansas law and professional record-keeping obligations, then
            securely destroyed.
          </li>
          <li>
            <strong>Payment and billing records</strong> are retained as
            required for tax and accounting purposes. We never store full card
            numbers; payments are processed by Stripe.
          </li>
          <li>
            <strong>Communications required by law</strong>, such as SMS
            opt-out records, are kept to honor your preferences.
          </li>
        </ul>
        <p>
          Retained records are disconnected from your login, access-restricted
          to your treating provider and authorized staff, and used only as
          required by law.
        </p>
      </LegalSection>
      <LegalSection heading="Deleting data without deleting your account">
        <p>
          If you only want certain data removed (for example, uploaded photos),
          email the same address and tell us what to remove. We will do so
          unless we are required to keep it.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
