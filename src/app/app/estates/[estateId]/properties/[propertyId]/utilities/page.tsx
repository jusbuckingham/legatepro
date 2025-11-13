interface PropertyUtilitiesPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

export default function PropertyUtilitiesPage({
  params,
}: PropertyUtilitiesPageProps) {
  const { estateId, propertyId } = params;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Utilities
        </h1>
        <p className="text-sm text-slate-400">
          This area will surface utility accounts (gas, electric, water, trash,
          internet) tied to this address.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
        <p className="font-medium text-slate-100">
          Utility tracking coming soon.
        </p>
        <p className="mt-1 text-slate-400">
          Once wired up, you&apos;ll see account numbers, balances, and recent
          bills for property{" "}
          <span className="font-mono text-xs">{propertyId}</span> in estate{" "}
          <span className="font-mono text-xs">{estateId}</span>.
        </p>
      </div>
    </div>
  );
}