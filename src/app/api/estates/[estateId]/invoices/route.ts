// src/app/api/estates/[estateId]/invoices/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import dbConnect from '@/lib/mongodb'; // <-- adjust to your DB util
import Invoice from '@/models/Invoice'; // <-- adjust to your actual model path

type RouteParams = {
  params: {
    estateId: string;
  };
};

interface CreateInvoiceBody {
  description: string;
  amount: number;
  issueDate: string; // ISO string from client
  dueDate?: string;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const invoices = await Invoice.find({ estate: params.estateId })
      .sort({ issueDate: -1 })
      .lean()
      .exec();

    return NextResponse.json(invoices, { status: 200 });
  } catch (error) {
    console.error('[GET_INVOICES]', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await dbConnect();

    const body = (await req.json()) as CreateInvoiceBody;

    const errors: string[] = [];

    if (!body.description || !body.description.trim()) {
      errors.push('Description is required');
    }

    if (body.amount == null || Number.isNaN(Number(body.amount))) {
      errors.push('Valid amount is required');
    }

    if (!body.issueDate) {
      errors.push('Issue date is required');
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 },
      );
    }

    const issueDate = new Date(body.issueDate);
    const dueDate = body.dueDate ? new Date(body.dueDate) : undefined;

    const invoice = await Invoice.create({
      estate: params.estateId,
      description: body.description.trim(),
      amount: Number(body.amount),
      issueDate,
      dueDate,
      status: 'draft', // or 'unpaid', adjust to your enum
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error('[CREATE_INVOICE]', error);
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 },
    );
  }
}