import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { ReceiptStatus } from "@prisma/client";
import { registerSaleInTaxApi } from "@/lib/services/tax-api.service";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: {
        cashier: true,
        items: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            tin: true,
            crn: true,
            srcCertData: true,
            srcCertPassword: true,
            srcCertPath: true,
          },
        },
      },
    });

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }
    if (!receipt.cashier) {
      return NextResponse.json({ error: "Receipt cashier not found" }, { status: 400 });
    }
    if (!receipt.items.length) {
      return NextResponse.json({ error: "Receipt has no items" }, { status: 400 });
    }
    if (receipt.status === ReceiptStatus.FISCALIZED) {
      return NextResponse.json({ error: "Receipt is already fiscalized" }, { status: 409 });
    }

    await prisma.receipt.update({
      where: { id },
      data: {
        status: ReceiptStatus.FISCALIZING,
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
        errorMessage: null,
      },
    });

    await prisma.receiptEvent.create({
      data: {
        receiptId: id,
        event: "FISCALIZATION_RETRY_STARTED",
        fromStatus: receipt.status,
        toStatus: ReceiptStatus.FISCALIZING,
        payload: { retryCount: receipt.retryCount + 1 },
      },
    });

    try {
      // Use billAmount (tip-excluded) as the SRC payment, not totalAmount.
      // For MIXED, use the stored cash/card split; fall back to full-card
      // for old receipts created before the split columns were added.
      const billAmt = receipt.billAmount.toString();
      const isMixed = receipt.paymentMethod === "MIXED";
      const paidCash = isMixed && receipt.paidCashAmount != null
        ? receipt.paidCashAmount.toString()
        : undefined;
      const paidCard = isMixed && receipt.paidCardAmount != null
        ? receipt.paidCardAmount.toString()
        : undefined;

      const taxResult = await registerSaleInTaxApi({
        restaurant: receipt.restaurant,
        cashierTaxId: receipt.cashier.taxCashierId,
        billAmount: billAmt,
        paidCashAmount: paidCash,
        paidCardAmount: paidCard,
        // partnerTin is not stored on Receipt; B2B receipts that failed will
        // be retried without partnerTin — acceptable for retry path.
        partnerTin: null,
        customerEmail: receipt.customerEmail,
        paymentMethod: receipt.paymentMethod,
        items: receipt.items.map((item) => ({
          externalProductId: item.externalProductId,
          departmentTaxId: item.departmentTaxId,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          discountAmount: item.discountAmount.toString(),
          unit: item.unit,
          name: item.name,
          goodCode: item.goodCode,
          adgCode: item.adgCode,
        })),
      });

      const updatedReceipt = await prisma.receipt.update({
        where: { id },
        data: {
          ...taxResult.fields,
          srcMode: taxResult.mode,
          status: ReceiptStatus.FISCALIZED,
          fiscalizedAt: new Date(),
          errorMessage: null,
        },
        include: { restaurant: true, cashier: true, items: true, events: true },
      });

      await prisma.receiptEvent.create({
        data: {
          receiptId: id,
          event: "FISCALIZATION_RETRY_SUCCEEDED",
          fromStatus: ReceiptStatus.FISCALIZING,
          toStatus: ReceiptStatus.FISCALIZED,
          payload: taxResult.rawResponse as object,
        },
      });

      return NextResponse.json(updatedReceipt);
    } catch (taxError) {
      const message = taxError instanceof Error ? taxError.message : "Unknown tax API error";

      await prisma.receipt.update({
        where: { id },
        data: { status: ReceiptStatus.FAILED, errorMessage: message },
      });

      await prisma.receiptEvent.create({
        data: {
          receiptId: id,
          event: "FISCALIZATION_RETRY_FAILED",
          fromStatus: ReceiptStatus.FISCALIZING,
          toStatus: ReceiptStatus.FAILED,
          payload: { message },
        },
      });

      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
