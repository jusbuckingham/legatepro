export default function BillingPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Billing</h2>

      <p className="text-sm text-slate-400 max-w-prose">
        Manage your LegatePro subscription, payment method, and invoices. Billing will integrate
        with Stripe once enabled.
      </p>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Current Plan</h3>
        <p className="mt-1 text-sm text-slate-400">Free tier (private beta)</p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Invoices</h3>
        <p className="mt-1 text-sm text-slate-400">No invoices available.</p>
      </div>
    </div>
  );
}
