import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { requireEstateAccess } from "@/lib/estateAccess";
import { connectToDatabase } from "@/lib/db";
import getEstateReadiness from "@/lib/estate/readiness";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ estateId: string }> },
) {
  const { estateId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    await connectToDatabase();

    await requireEstateAccess({ estateId, userId: session.user.id });

    const readiness = await getEstateReadiness(estateId);

    return NextResponse.json({ ok: true, readiness }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";

    // If your `requireEstateAccess` throws a forbidden-ish error, normalize it here.
    // We intentionally keep this simple and conservative.
    if (message.toLowerCase().includes("forbidden") || message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
