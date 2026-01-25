

export const metadata = {
  title: "Privacy Policy | LegatePro",
  description:
    "How LegatePro collects, uses, and protects your information.",
};

function Section(props: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-gray-900">{props.title}</h2>
      <div className="space-y-2 text-sm text-gray-700">{props.children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  const lastUpdated = "January 24, 2026";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-600">Last updated: {lastUpdated}</p>
        <p className="text-sm text-gray-700">
          LegatePro helps you organize estate work. We collect only what we need to
          run the app, keep it secure, and improve it. We do not sell your
          personal information.
        </p>
      </header>

      <div className="mt-8 space-y-8">
        <Section title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Account info</span> (like your name,
              email, and sign-in identifiers).
            </li>
            <li>
              <span className="font-medium">Estate workspace content</span>
              (things you add like tasks, documents, contacts, properties,
              invoices, notes, and metadata).
            </li>
            <li>
              <span className="font-medium">Files you upload</span> (documents
              and attachments you choose to store in LegatePro).
            </li>
            <li>
              <span className="font-medium">Usage + device data</span> (basic
              logs like pages viewed, feature usage, IP address, browser type,
              and timestamps). This helps with security and performance.
            </li>
          </ul>
        </Section>

        <Section title="What we do not collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              We do not collect sensitive information unless you intentionally
              add it to your estate workspace.
            </li>
            <li>We do not sell your personal information.</li>
            <li>
              We do not use your private estate content to advertise to you.
            </li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide and operate LegatePro.</li>
            <li>To secure accounts, prevent fraud, and monitor abuse.</li>
            <li>To provide customer support and respond to requests.</li>
            <li>
              To improve product quality (for example, fixing bugs and improving
              performance).
            </li>
          </ul>
        </Section>

        <Section title="Sharing">
          <p>
            We share information only when needed to run the service, comply with
            the law, or protect LegatePro and our users.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Service providers</span> that help us
              operate the app (for example, hosting, databases, analytics, and
              payment processing). They are required to protect your data and use
              it only to provide services to us.
            </li>
            <li>
              <span className="font-medium">Legal</span> when required to comply
              with a lawful request.
            </li>
            <li>
              <span className="font-medium">Safety</span> to investigate fraud,
              abuse, or security incidents.
            </li>
          </ul>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your data for as long as your account is active or as needed
            to provide the service. You can request deletion, and we will delete
            or de-identify data unless we must keep it for legal, security, or
            operational reasons.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We use reasonable safeguards designed to protect your information.
            No method of transmission or storage is 100% secure, but we work hard
            to protect your account and data.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Access and update</span>: You can
              review and update your account and estate data inside the app.
            </li>
            <li>
              <span className="font-medium">Delete</span>: You can request
              deletion of your account and associated data.
            </li>
            <li>
              <span className="font-medium">Cookies</span>: We may use cookies
              and similar technologies for sign-in, basic functionality, and
              security. You can control cookies through your browser settings.
            </li>
          </ul>
        </Section>

        <Section title="Children">
          <p>
            LegatePro is not intended for children under 13 (or the age required
            by your local law). We do not knowingly collect personal information
            from children.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update this policy from time to time. If we make material
            changes, we will update the date above and may provide additional
            notice inside the product.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions or requests? Email us at{" "}
            <a
              className="font-medium text-blue-600 hover:underline"
              href="mailto:support@legatepro.com"
            >
              support@legatepro.com
            </a>
            .
          </p>
        </Section>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Important note</p>
          <p className="mt-1">
            LegatePro provides organization tools and is not a law firm. We do
            not provide legal advice.
          </p>
        </div>
      </div>
    </main>
  );
}