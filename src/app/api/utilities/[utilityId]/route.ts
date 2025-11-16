import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { UtilityAccount } from "@/models/UtilityAccount";

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
      return NextResponse.json(
        { error: "Utility account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ utility }, { status: 200 });
  } catch (error) {
    console.error("[UTILITY_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch utility account" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  try {
    const { utilityId } = await context.params;
    const body = await req.json();

    await connectToDatabase();
    const utility = await UtilityAccount.findByIdAndUpdate(utilityId, body, {
      new: true,
      runValidators: true,
    });

    if (!utility) {
      return NextResponse.json(
        { error: "Utility account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ utility }, { status: 200 });
  } catch (error) {
    console.error("[UTILITY_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update utility account" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Utility account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[UTILITY_DELETE]", error);
    return NextResponse.json(
      { error: "Failed to delete utility account" },
      { status: 500 }
    );
  }
}