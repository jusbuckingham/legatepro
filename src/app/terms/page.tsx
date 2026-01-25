

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | LegatePro",
  description:
    "Terms of Service for LegatePro. Learn the rules, limitations, and responsibilities when using the LegatePro platform.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">
        Terms of Service
      </h1>

      <p className="mt-2 text-sm text-gray-500">
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <section className="mt-8 space-y-4 text-sm text-gray-700">
        <p>
          Welcome to LegatePro. These Terms of Service (&quot;Terms&quot;)
          govern your access to and use of the LegatePro website, applications,
          and services (collectively, the &quot;Service&quot;). By accessing or
          using LegatePro, you agree to be bound by these Terms.
        </p>

        <p>
          If you do not agree to these Terms, you may not use the Service.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          1. What LegatePro Is (and Is Not)
        </h2>
        <p className="text-sm text-gray-700">
          LegatePro is a productivity and record‑keeping platform designed to
          help personal representatives, executors, and families organize
          estate‑related information.
        </p>
        <p className="text-sm text-gray-700">
          <strong>LegatePro is not a law firm, financial advisor, or accounting
          service.</strong> The Service does not provide legal, tax, or financial
          advice. Any information presented is for organizational and
          informational purposes only.
        </p>
        <p className="text-sm text-gray-700">
          You are responsible for consulting qualified professionals for legal,
          tax, or financial decisions.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          2. Eligibility and Accounts
        </h2>
        <p className="text-sm text-gray-700">
          You must be at least 18 years old to use LegatePro. By creating an
          account, you represent that the information you provide is accurate
          and that you have the authority to manage the estate data you enter.
        </p>
        <p className="text-sm text-gray-700">
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activity that occurs under your
          account.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          3. Your Content and Data
        </h2>
        <p className="text-sm text-gray-700">
          You retain ownership of all data, documents, and content you upload
          to LegatePro.
        </p>
        <p className="text-sm text-gray-700">
          By using the Service, you grant LegatePro a limited license to store,
          process, and display your content solely for the purpose of providing
          and improving the Service.
        </p>
        <p className="text-sm text-gray-700">
          You are responsible for the accuracy, legality, and appropriateness
          of the content you submit.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          4. Acceptable Use
        </h2>
        <p className="text-sm text-gray-700">
          You agree not to misuse the Service. This includes, but is not limited
          to:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li>Uploading unlawful, fraudulent, or misleading information</li>
          <li>Accessing estates or data without proper authorization</li>
          <li>Attempting to disrupt, reverse‑engineer, or compromise the Service</li>
          <li>Using LegatePro for purposes unrelated to estate organization</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          5. Service Availability
        </h2>
        <p className="text-sm text-gray-700">
          LegatePro is provided on an &quot;as‑is&quot; and &quot;as‑available&quot;
          basis. We do not guarantee uninterrupted access, error‑free operation,
          or that all data will always be preserved.
        </p>
        <p className="text-sm text-gray-700">
          We may modify, suspend, or discontinue parts of the Service at any
          time.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          6. Limitation of Liability
        </h2>
        <p className="text-sm text-gray-700">
          To the maximum extent permitted by law, LegatePro and its affiliates
          shall not be liable for any indirect, incidental, consequential, or
          special damages arising out of your use of the Service.
        </p>
        <p className="text-sm text-gray-700">
          LegatePro is not responsible for losses resulting from legal errors,
          missed deadlines, incorrect filings, or reliance on information stored
          in the platform.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          7. Termination
        </h2>
        <p className="text-sm text-gray-700">
          You may stop using LegatePro at any time. We may suspend or terminate
          your access if you violate these Terms or misuse the Service.
        </p>
        <p className="text-sm text-gray-700">
          Upon termination, access to your data may be limited or removed in
          accordance with our data retention practices.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          8. Changes to These Terms
        </h2>
        <p className="text-sm text-gray-700">
          We may update these Terms from time to time. Continued use of the
          Service after changes take effect constitutes acceptance of the
          revised Terms.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">
          9. Contact
        </h2>
        <p className="text-sm text-gray-700">
          If you have questions about these Terms, contact us at{" "}
          <a
            href="mailto:support@legatepro.com"
            className="font-medium text-blue-600 hover:underline"
          >
            support@legatepro.com
          </a>.
        </p>
      </section>

      <section className="mt-10 rounded-md border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <strong>Important disclaimer:</strong> LegatePro does not replace a
        licensed attorney, accountant, or fiduciary advisor. Always verify
        estate decisions with qualified professionals.
      </section>
    </main>
  );
}