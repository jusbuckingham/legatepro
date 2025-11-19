import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { RentPayment } from "@/models/RentPayment";

interface RouteParams {
  params: Promise<{
    estateId: string;
    paymentId: string;
  }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, paymentId } = await params;

    await connectToDatabase();

    const payment = await RentPayment.findOne({
      _id: paymentId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ payment }, { status: 200 });
  } catch (error) {
    console.error(
      "[GET /api/estates/[estateId]/rent/[paymentId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch payment" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, paymentId } = await params;
    const body = await request.json();

    await connectToDatabase();

    const updated = await RentPayment.findOneAndUpdate(
      {
        _id: paymentId,
        estateId,
        ownerId: session.user.id,
      },
      body,
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ payment: updated }, { status: 200 });
  } catch (error) {
    console.error(
      "[PATCH /api/estates/[estateId]/rent/[paymentId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { estateId, paymentId } = await params;

    await connectToDatabase();

    const deleted = await RentPayment.findOneAndDelete({
      _id: paymentId,
      estateId,
      ownerId: session.user.id,
    }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      "[DELETE /api/estates/[estateId]/rent/[paymentId]] Error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 }
    );
  }
}