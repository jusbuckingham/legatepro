import React from "react";
import { notFound } from "next/navigation";

import { connectToDatabase } from "../../../../lib/db";
import { Estate } from "../../../../models/Estate";

// Props type for this dynamic route in Next 16 / React 19
// `params` is a Promise that must be awaited.
type PageProps = {
  params: Promise<{
    estateId: string;
  }>;
};

export default async function EstateSettingsPage({ params }: PageProps) {
  const { estateId } = await params;

  await connectToDatabase();

  const estateDoc = await Estate.findById(estateId).lean().exec();

  if (!estateDoc) {
    notFound();
  }

  return (
    <div>
      <h1>Settings for {estateDoc.name}</h1>
      {/* Settings form and other components here */}
    </div>
  );
}