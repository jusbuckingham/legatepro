

import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { Estate } from "@/models/Estate";

const MOCK_OWNER_ID = "demo-user"; // TODO: replace with real user id from auth

async function createEstate(formData: FormData) {
  "use server";

  const label = formData.get("label")?.toString().trim();
  const decedentName = formData.get("decedentName")?.toString().trim();

  if (!label || !decedentName) {
    // In a more advanced version, we would surface a validation error.
    return;
  }

  await connectToDatabase();

  const estate = await Estate.create({
    ownerId: MOCK_OWNER_ID,
    label,
    decedent: {
      fullName: decedentName,
    },
    compensation: {
      feeType: "HOURLY",
      hourlyRate: 0,
    },
    status: "OPEN",
  });

  redirect(`/app/estates/${estate._id.toString()}`);
}

export default function NewEstatePage() {
  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New estate</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create a new estate and add basic information about the decedent. You can
          add tasks, expenses, documents, properties, and more after this step.
        </p>
      </div>

      <form
        action={createEstate}
        className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <div className="space-y-1">
          <label
            htmlFor="label"
            className="text-sm font-medium text-slate-100"
          >
            Estate label
          </label>
          <input
            id="label"
            name="label"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="Estate of Donald Buckingham"
            required
          />
          <p className="text-xs text-slate-400">
            This is how the estate will appear in your list and on reports.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="decedentName"
            className="text-sm font-medium text-slate-100"
          >
            Decedent’s full name
          </label>
          <input
            id="decedentName"
            name="decedentName"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="Full legal name"
            required
          />
          <p className="text-xs text-slate-400">
            You can add date of birth, date of death, and other details later.
          </p>
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Create estate
        </button>
      </form>
    </div>
  );
}