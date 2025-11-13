// src/app/app/estates/new/page.tsx
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

const MOCK_OWNER_ID = "demo-user";

async function createEstate(formData: FormData) {
  "use server";

  const label = formData.get("label")?.toString() || "";
  const decedentName = formData.get("decedentName")?.toString() || "";

  if (!label || !decedentName) return;

  await connectToDatabase();

  const estate = await Estate.create({
    ownerId: MOCK_OWNER_ID,
    label,
    decedent: {
      fullName: decedentName,
    },
    compensation: { feeType: "HOURLY", hourlyRate: 0 },
  });

  redirect(`/app/estates/${estate._id}`);
}

export default function NewEstatePage() {
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">New estate</h1>
      <form action={createEstate} className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-100">Estate label</label>
          <input
            name="label"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="Estate of Donald Buckingham"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-100">Decedent name</label>
          <input
            name="decedentName"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="Full legal name"
            required
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Create estate
        </button>
      </form>
    </div>
  );
}