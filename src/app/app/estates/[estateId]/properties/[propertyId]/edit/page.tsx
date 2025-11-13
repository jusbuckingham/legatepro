interface EditPropertyPageProps {
  params: {
    estateId: string;
    propertyId: string;
  };
}

export default function EditPropertyPage({ params }: EditPropertyPageProps) {
  const { estateId, propertyId } = params;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Edit property
        </h1>
        <p className="text-sm text-slate-400">
          This will be the workspace where you can update address details,
          rent targets, and notes for this specific property.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-8 text-sm text-slate-300">
        <p className="font-medium text-slate-100">Edit form coming soon.</p>
        <p className="mt-1 text-slate-400">
          For now, property{" "}
          <span className="font-mono text-xs">{propertyId}</span> in estate{" "}
          <span className="font-mono text-xs">{estateId}</span> is displayed
          read-only on the main property page.
        </p>
      </div>
    </div>
  );
}