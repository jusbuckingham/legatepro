export default function SupportPage() {
  return (
    <main className="min-h-[calc(100vh-1px)] bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Support</h1>

          <p className="mt-4 text-sm text-muted-foreground">
            LegatePro is built for people managing estates during an already difficult time.
            If something isn’t working, feels unclear, or you’re unsure what to do next,
            we want to help you get unstuck.
          </p>

          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              What we can help with
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Account access or login issues</li>
              <li>Questions about how to use LegatePro features</li>
              <li>Unexpected errors or bugs</li>
              <li>Feedback on what’s confusing or missing</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              What we can’t provide
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              LegatePro is not a law firm and does not provide legal advice.
              We can’t make court decisions, interpret laws for your situation,
              or replace an attorney or probate professional.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Contact
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Direct support is available to <span className="font-medium text-foreground">Pro members</span>.
              Pro access includes entry to our private Discord support channels and priority responses.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              If you need help navigating an estate or resolving an issue, you can upgrade to Pro
              to unlock support access.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              We may also offer one-time or short-term paid support options for users who don’t
              need an ongoing subscription.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Pro support requests are typically answered within one business day.
            </p>
          </section>

          <p className="mt-10 text-xs text-muted-foreground">
            If you’re feeling overwhelmed, you’re not alone. LegatePro exists to make
            this process more manageable, one step at a time.
          </p>
        </div>
      </div>
    </main>
  );
}