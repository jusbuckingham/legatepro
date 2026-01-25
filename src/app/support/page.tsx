

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">Support</h1>

      <p className="mt-4 text-sm text-gray-600">
        LegatePro is built for people managing estates during an already difficult time.
        If something isn’t working, feels unclear, or you’re unsure what to do next,
        we want to help you get unstuck.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          What we can help with
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
          <li>Account access or login issues</li>
          <li>Questions about how to use LegatePro features</li>
          <li>Unexpected errors or bugs</li>
          <li>Feedback on what’s confusing or missing</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          What we can’t provide
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          LegatePro is not a law firm and does not provide legal advice.
          We can’t make court decisions, interpret laws for your situation,
          or replace an attorney or probate professional.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Contact
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          For support questions or issues, email us at{" "}
          <a
            href="mailto:support@legatepro.com"
            className="font-medium text-blue-600 hover:underline"
          >
            support@legatepro.com
          </a>
          .
        </p>
        <p className="mt-2 text-sm text-gray-500">
          We do our best to respond within one business day.
        </p>
      </section>

      <p className="mt-10 text-xs text-gray-500">
        If you’re feeling overwhelmed, you’re not alone. LegatePro exists to make
        this process more manageable, one step at a time.
      </p>
    </main>
  );
}