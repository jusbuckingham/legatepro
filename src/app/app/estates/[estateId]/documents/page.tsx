import { connectToDatabase } from "@/lib/db";
import { EstateDocument } from "@/models/EstateDocument";
import { redirect } from "next/navigation";

interface EstateDocumentsPageProps {
  params: {
    estateId: string;
  };
}

export const dynamic = "force-dynamic";

async function createDocumentEntry(formData: FormData) {
  "use server";

  const estateId = formData.get("estateId")?.toString();
  const subject = formData.get("subject")?.toString().trim();
  const location = formData.get("location")?.toString().trim() || "";
  const label = formData.get("label")?.toString().trim();
  const url = formData.get("url")?.toString().trim() || "";
  const tagsRaw = formData.get("tags")?.toString().trim() || "";
  const notes = formData.get("notes")?.toString().trim() || "";
  const isSensitive = formData.get("isSensitive") === "on";

  if (!estateId || !subject || !label) {
    return;
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await connectToDatabase();

  await EstateDocument.create({
    estateId,
    subject,
    location,
    label,
    url,
    tags,
    notes,
    isSensitive,
  });

  redirect(`/app/estates/${estateId}/documents`);
}

export default async function EstateDocumentsPage({
  params,
}: EstateDocumentsPageProps) {
  const { estateId } = params;

  await connectToDatabase();

  const documents = await EstateDocument.find({ estateId })
    .sort({ subject: 1, label: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Document index</h2>
          <p className="text-sm text-slate-400">
            Keep a simple index of every important document for this estate—where it
            lives and how to find it again quickly.
          </p>
        </div>
      </div>

      {/* New document entry form */}
      <form
        action={createDocumentEntry}
        className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <input type="hidden" name="estateId" value={estateId} />

        <div className="grid gap-3 md:grid-cols-[1.1fr,1.1fr]">
          <div className="space-y-1">
            <label htmlFor="subject" className="text-xs font-medium text-slate-200">
              Subject / category
            </label>
            <input
              id="subject"
              name="subject"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Banking, Auto, Medical, Income tax, Property"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="location" className="text-xs font-medium text-slate-200">
              Location (where it's stored)
            </label>
            <input
              id="location"
              name="location"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Google Drive, iCloud, Dropbox, physical folder"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="label" className="text-xs font-medium text-slate-200">
            Document label
          </label>
          <input
            id="label"
            name="label"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="e.g. Chase checking 1234 statements 2022–2023"
            required
          />
        </div>

        <div className="grid gap-3 md:grid-cols-[1.4fr,1fr]">
          <div className="space-y-1">
            <label htmlFor="url" className="text-xs font-medium text-slate-200">
              Link / URL (optional)
            </label>
            <input
              id="url"
              name="url"
              type="url"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="https://drive.google.com/..."
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="tags" className="text-xs font-medium text-slate-200">
              Tags (comma-separated, optional)
            </label>
            <input
              id="tags"
              name="tags"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
              placeholder="e.g. Chase, statements, banking"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="notes" className="text-xs font-medium text-slate-200">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-50 outline-none focus:border-emerald-400"
            placeholder="e.g. includes 1099s, last year's return, copies of correspondence"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              name="isSensitive"
              className="h-3 w-3 rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
            />
            Mark as sensitive (identity, SSN, etc.)
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
          >
            Add to index
          </button>
        </div>
      </form>

      {/* Document index table */}
      {documents.length === 0 ? (
        <p className="text-sm text-slate-400">
          No documents indexed yet. Start by listing out bank accounts, auto loans, medical bills,
          insurance policies, tax returns, and anything else you might need to reference.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Link</th>
                <th className="px-3 py-2">Sensitive</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: any) => {
                const tags = Array.isArray(doc.tags) ? doc.tags : [];

                return (
                  <tr key={doc._id.toString()} className="border-t border-slate-800">
                    <td className="px-3 py-2 align-top text-slate-200">{doc.subject}</td>
                    <td className="px-3 py-2 align-top text-slate-100">{doc.label}</td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {doc.location || "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {tags.length === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] lowercase text-slate-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-300">
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {doc.isSensitive ? (
                        <span className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-300">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-300">
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}