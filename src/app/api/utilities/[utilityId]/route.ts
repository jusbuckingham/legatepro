import type { NextRequest } from "next/server";

import { jsonOk, noStoreHeaders, safeErrorMessage } from "@/lib/apiResponse";
import { connectToDatabase } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { headers: noStoreHeaders() } as const;

type RouteParams = { utilityId: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { utilityId } = await context.params;

    await connectToDatabase();
    const utility = await UtilityAccount.findById(utilityId);

    if (!utility) {
      return jsonOk({ ok: false, error: "Utility account not found" }, 404, NO_STORE.headers);
    }

    return jsonOk({ ok: true, utility }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("[UTILITY_GET]", safeErrorMessage(error));
    return jsonOk({ ok: false, error: "Failed to fetch utility account" }, 500, NO_STORE.headers);
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { utilityId } = await context.params;
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonOk({ ok: false, error: "Invalid JSON" }, 400, NO_STORE.headers);
    }

    await connectToDatabase();
    const utility = await UtilityAccount.findByIdAndUpdate(utilityId, body as Record<string, unknown>, {
      new: true,
      runValidators: true,
    });

    if (!utility) {
      return jsonOk({ ok: false, error: "Utility account not found" }, 404, NO_STORE.headers);
    }

    return jsonOk({ ok: true, utility }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("[UTILITY_PUT]", safeErrorMessage(error));
    return jsonOk({ ok: false, error: "Failed to update utility account" }, 500, NO_STORE.headers);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { utilityId } = await context.params;

    await connectToDatabase();
    const utility = await UtilityAccount.findByIdAndDelete(utilityId);

    if (!utility) {
      return jsonOk({ ok: false, error: "Utility account not found" }, 404, NO_STORE.headers);
    }

    return jsonOk({ ok: true, success: true }, 200, NO_STORE.headers);
  } catch (error) {
    console.error("[UTILITY_DELETE]", safeErrorMessage(error));
    return jsonOk({ ok: false, error: "Failed to delete utility account" }, 500, NO_STORE.headers);
  }
}