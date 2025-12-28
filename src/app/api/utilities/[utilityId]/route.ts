import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";

export const dynamic = "force-dynamic";

type RouteParams = { utilityId: string };

export async function GET(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  try {
    const { utilityId } = await context.params;

    await connectToDatabase();
    const utility = await UtilityAccount.findById(utilityId);

    if (!utility) {
      return NextResponse.json(
        { ok: false, error: "Utility account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, utility }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[UTILITY_GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch utility account" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  try {
    const { utilityId } = await context.params;
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const utility = await UtilityAccount.findByIdAndUpdate(utilityId, body, {
      new: true,
      runValidators: true,
    });

    if (!utility) {
      return NextResponse.json(
        { ok: false, error: "Utility account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, utility }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[UTILITY_PUT]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update utility account" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<RouteParams> }
): Promise<NextResponse> {
  try {
    const { utilityId } = await context.params;

    await connectToDatabase();
    const utility = await UtilityAccount.findByIdAndDelete(utilityId);

    if (!utility) {
      return NextResponse.json(
        { ok: false, error: "Utility account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, success: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[UTILITY_DELETE]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to delete utility account" },
      { status: 500 }
    );
  }
}