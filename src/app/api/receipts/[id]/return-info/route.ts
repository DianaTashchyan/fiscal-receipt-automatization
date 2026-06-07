import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireAuth } from "@/lib/utils/auth";
import { nextSeq } from "@/lib/src/sequence";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { SrcConfigError } from "@/lib/src/errors";

// GET /api/receipts/[id]/return-info
// Fetches the SRC return info for an existing fiscalized receipt.
// Used by the return-receipt form to display items and original quantities.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: { restaurant: true, items: true },
  });

  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  if (receipt.status !== "FISCALIZED" && receipt.status !== "PDF_GENERATED" && receipt.status !== "SENT") {
    return NextResponse.json({ error: "Only fiscalized receipts can be returned" }, { status: 400 });
  }

  if (receipt.receiptType === "RETURN") {
    return NextResponse.json({ error: "Cannot create a return for a return receipt" }, { status: 400 });
  }

  if (!receipt.srcReceiptId) {
    return NextResponse.json({ error: "Receipt has no SRC receipt ID — cannot fetch return info" }, { status: 400 });
  }

  const crn = receipt.restaurant.crn;
  if (!crn) {
    return NextResponse.json({ error: "Restaurant CRN is not configured" }, { status: 400 });
  }

  try {
    const seq = await nextSeq(crn);
    const client = await resolveAdminSrcClient(receipt.restaurantId);
    const srcResult = await client.getReturnedReceiptInfo(crn, seq, receipt.srcReceiptId);

    if (srcResult.code !== 0) {
      return NextResponse.json(
        { error: srcResult.errorMessage ?? srcResult.message ?? "SRC returned an error" },
        { status: 502 }
      );
    }

    let items = srcResult.result?.items ?? [];

    // In mock mode getReturnedReceiptInfo returns empty items — fall back to DB items
    if (items.length === 0 && receipt.items.length > 0) {
      items = receipt.items.map((item, idx) => ({
        receiptProductId: idx + 1,
        quantity: Number(item.quantity),
        goodCode: item.goodCode,
        goodName: item.name,
        adgCode: item.adgCode,
        unit: item.unit,
        price: Number(item.unitPrice),
        dep: Number(item.departmentTaxId),
        taxRegime: Number(item.taxRegime) || 1,
        vat: 0,
        discount: Number(item.discountAmount) || 0,
        discountType: 0,
        additionalDiscount: 0,
        additionalDiscountType: 0,
        totalWithoutTaxes: Number(item.totalPrice),
        totalWithTaxes: Number(item.totalPrice),
      }));
    }

    return NextResponse.json({
      success: true,
      result: { ...(srcResult.result ?? {}), items },
      originalPayment: {
        paymentMethod: receipt.paymentMethod,
        paidCashAmount: Number(receipt.paidCashAmount ?? 0),
        paidCardAmount: Number(receipt.paidCardAmount ?? 0),
        billAmount: Number(receipt.billAmount),
        fiscalNumber: receipt.fiscalNumber,
        receiptNumber: receipt.receiptNumber,
      },
    });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
