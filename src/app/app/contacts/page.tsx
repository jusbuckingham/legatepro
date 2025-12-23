import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import PageHeader from "@/components/layout/PageHeader";
import { Contact } from "@/models/Contact";

type PageSearchParams = {
  q?: string;
  role?: string;
};

type PageProps = {
  searchParams: Promise<PageSearchParams>;
};

type ContactLean = {
  _id: string | { toString: () => string };
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  estates?: Array<string | { toString: () => string }>;
};

type ContactListItem = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  estatesCount: number;
};

export default async function ContactsPage({ searchParams }: PageProps) {
  const { q: qRaw, role: roleRaw } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  await connectToDatabase();

  const q = (qRaw ?? "").trim();
  const roleFilter = (roleRaw ?? "ALL").toUpperCase();

  const mongoQuery: Record<string, unknown> = {
    ownerId: session.user.id,
  };

  if (q.length > 0) {
    mongoQuery.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  if (roleFilter !== "ALL") {
    mongoQuery.role = roleFilter;
  }

  const contactsRaw = (await Contact.find(mongoQuery)
    .sort({ name: 1, createdAt: -1 })
    .lean()) as ContactLean[];

  const contacts: ContactListItem[] = contactsRaw.map((c) => {
    const id =
      typeof c._id === "string" ? c._id : c._id.toString();

    const name = c.name?.trim() || "Unnamed contact";

    const estatesCount = Array.isArray(c.estates)
      ? c.estates.length
      : 0;

    return {
      _id: id,
      name,
      email: c.email || undefined,
      phone: c.phone || undefined,
      role: c.role || undefined,
      estatesCount,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Contacts"
        description="Keep track of executors, heirs, attorneys, vendors, and other people connected to your estates."
        actions={
          <Link
            href="/app/contacts/new"
            className="inline-flex items-center rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400"
          >
            New contact
          </Link>
        }
      />

      {/* Filters */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
        <form className="flex flex-wrap items-end gap-3 sm:gap-4" method="GET">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Search
            </label>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Name, email, phone…"
              className="mt-1 w-full rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Role
            </label>
            <select
              name="role"
              defaultValue={roleFilter}
              className="mt-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="ALL">All roles</option>
              <option value="EXECUTOR">Executor</option>
              <option value="ADMINISTRATOR">Administrator</option>
              <option value="HEIR">Heir / Beneficiary</option>
              <option value="ATTORNEY">Attorney</option>
              <option value="CREDITOR">Creditor</option>
              <option value="VENDOR">Vendor</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-white"
          >
            Apply filters
          </button>
        </form>
      </section>

      {/* Contacts table */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Contacts ({contacts.length})
          </h2>
        </div>

        {contacts.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-500">
              You don&apos;t have any contacts yet. Create your first contact to start linking people to estates.
            </p>
            <div>
              <Link
                href="/app/contacts/new"
                className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950/50 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-950"
              >
                Create a contact
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Phone</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium text-right">
                    Estates
                  </th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact._id}
                    className="border-b border-slate-800/60 last:border-0"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/app/contacts/${contact._id}`}
                        className="text-sky-400 hover:text-sky-300"
                      >
                        {contact.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-200">
                      {contact.email ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-200">
                      {contact.phone ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-slate-200">
                      {contact.role ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-200">
                      {contact.estatesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}