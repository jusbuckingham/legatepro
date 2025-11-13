// src/app/app/estates/page.tsx
import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

const MOCK_OWNER_ID = "demo-user"; // TODO: replace with real user id from auth

export const dynamic = "force-dynamic";

export default async function EstatesPage() {
  await connectToDatabase();
  const estates = await Estate.find({ ownerId: MOCK_OWNER_ID }).sort({ createdAt: -1 }).lean();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your Estates</h1>
        <Link
          href="/app/estates/new"
          className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          New estate
        </Link>
      </div>

      {estates.length === 0 ? (
        <p className="text-sm text-slate-400">
          You don&apos;t have any estates yet. Click <span className="font-medium">New estate</span> to get started.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/40">
          {estates.map((estate: any) => (
            <li key={estate._id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  href={`/app/estates/${estate._id}`}
                  className="font-medium text-slate-50 hover:text-emerald-400"
                >
                  {estate.label}
                </Link>
                <p className="text-xs text-slate-400">
                  Status: {estate.status} • Created{" "}
                  {new Date(estate.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {estate.decedent?.fullName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}