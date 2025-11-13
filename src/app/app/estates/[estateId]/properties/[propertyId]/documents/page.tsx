interface PropertyDocumentsPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

export default function PropertyDocumentsPage({
  params,
}: PropertyDocumentsPageProps) {
  const { estateId, propertyId } = params;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Property documents
        </h1>
        <p className="text-sm text-slate-400">
          This view will eventually filter the estate&apos;s document index down
          to items that relate to this specific property (deeds, tax bills,
          insurance policies, notices, and more).
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
        <p className="font-medium text-slate-100">
          Property document view coming soon.
        </p>
        <p className="mt-1 text-slate-400">
          Documents tagged for property{" "}
          <span className="font-mono text-xs">{propertyId}</span> in estate{" "}
          <span className="font-mono text-xs">{estateId}</span> will show up
          here.
        </p>
      </div>
    </div>
  );
}