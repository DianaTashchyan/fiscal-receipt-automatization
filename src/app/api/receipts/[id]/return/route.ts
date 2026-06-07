import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireAuth } from "@/lib/utils/auth";
import { nextSeq } from "@/lib/src/sequence";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { mapSrcResultToReceiptFields } from "@/lib/src/mapper";
import { SrcConfigError } from "@/lib/src/errors";
import { ReceiptStatus, ReceiptType, PaymentMethod } from "@prisma/client";

type ReturnItem = {
  receiptProductId: number;
  quantity: number;
  name: string;
  goodCode: string;
  adgCode: string;
  unit: string;
  price: number;
  dep: number;
  taxRegime: number;
};

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

// POST /api/receipts/[id]/return
// Creates and fiscalizes a return (refund) receipt linked to the original receipt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { items: rawItems, cashAmountForReturn: rawCash, cardAmountForReturn: rawCard } = body as {
    items?: unknown;
    cashAmountForReturn?: unknown;
    cardAmountForReturn?: unknown;
  };

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }

  const cashAmt = money(Number(rawCash ?? 0));
  const cardAmt = money(Number(rawCard ?? 0));

  if (!Number.isFinite(cashAmt) || cashAmt < 0) {
    return NextResponse.json({ error: "cashAmountForReturn must be a non-negative number" }, { status: 400 });
  }
  if (!Number.isFinite(cardAmt) || cardAmt < 0) {
    return NextResponse.json({ error: "cardAmountForReturn must be a non-negative number" }, { status: 400 });
  }
  if (cashAmt + cardAmt <= 0) {
    return NextResponse.json({ error: "At least one of cashAmountForReturn or cardAmountForReturn must be > 0" }, { status: 400 });
  }

  // Validate item shape
  const returnItems: ReturnItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i] as Record<string, unknown>;
    if (!it || typeof it !== "object") {
      return NextResponse.json({ error: `items[${i}]: must be an object` }, { status: 400 });
    }
    if (!Number.isInteger(Number(it.receiptProductId))) {
      return NextResponse.json({ error: `items[${i}]: receiptProductId must be an integer` }, { status: 400 });
    }
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: `items[${i}]: quantity must be > 0` }, { status: 400 });
    }
    returnItems.push({
      receiptProductId: Number(it.receiptProductId),
      quantity: qty,
      name: String(it.name ?? ""),
      goodCode: String(it.goodCode ?? ""),
      adgCode: String(it.adgCode ?? ""),
      unit: String(it.unit ?? ""),
      price: money(Number(it.price ?? 0)),
      dep: Number(it.dep ?? 0),
      taxRegime: Number(it.taxRegime ?? 1),
    });
  }

  // Fetch original receipt
  const original = await prisma.receipt.findUnique({
    where: { id },
    include: { restaurant: true, cashier: true, items: true },
  });

  if (!original) {
    return NextResponse.json({ error: "Original receipt not found" }, { status: 404 });
  }

  const isFiscalized = ["FISCALIZED", "PDF_GENERATED", "SENT"].includes(original.status);
  if (!isFiscalized) {
    return NextResponse.json({ error: "Only fiscalized receipts can be returned" }, { status: 400 });
  }

  if (original.receiptType === ReceiptType.RETURN) {
    return NextResponse.json({ error: "Cannot return a return receipt" }, { status: 400 });
  }

  if (!original.srcReceiptId) {
    return NextResponse.json({ error: "Original receipt has no SRC receipt ID" }, { status: 400 });
  }

  const crn = original.restaurant.crn;
  if (!crn) {
    return NextResponse.json({ error: "Restaurant CRN is not configured" }, { status: 400 });
  }

  try {
    // Fetch SRC return info for quantity validation
    const infoSeq = await nextSeq(crn);
    const client = await resolveAdminSrcClient(original.restaurantId);
    const infoResult = await client.getReturnedReceiptInfo(crn, infoSeq, original.srcReceiptId);

    if (infoResult.code !== 0) {
      return NextResponse.json(
        { error: `SRC error: ${infoResult.errorMessage ?? infoResult.message}` },
        { status: 502 }
      );
    }

    let srcItems = infoResult.result?.items ?? [];

    // In mock mode getReturnedReceiptInfo returns empty items — fall back to DB items for validation
    if (srcItems.length === 0 && original.items.length > 0) {
      srcItems = original.items.map((item, idx) => ({
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

    // Validate return quantities
    for (const ri of returnItems) {
      const srcItem = srcItems.find((s) => s.receiptProductId === ri.receiptProductId);
      if (!srcItem) {
        return NextResponse.json(
          { error: `Item with receiptProductId ${ri.receiptProductId} not found in original receipt` },
          { status: 400 }
        );
      }
      if (ri.quantity > srcItem.quantity) {
        return NextResponse.json(
          {
            error: `Return quantity (${ri.quantity}) for "${srcItem.goodName}" exceeds original quantity (${srcItem.quantity})`,
          },
          { status: 400 }
        );
      }
    }

    // Compute return amounts
    const returnBillAmt = money(returnItems.reduce((sum, it) => sum + it.price * it.quantity, 0));
    const totalRefund = money(cashAmt + cardAmt);

    // Derive payment method for return receipt
    let returnPaymentMethod: PaymentMethod;
    if (cashAmt > 0 && cardAmt > 0) {
      returnPaymentMethod = PaymentMethod.MIXED;
    } else if (cashAmt > 0) {
      returnPaymentMethod = PaymentMethod.CASH;
    } else {
      returnPaymentMethod = PaymentMethod.CARD;
    }

    const externalReturnId = `RETURN-${original.externalOrderId}-${Date.now()}`;

    // Create return receipt record and items in a transaction
    const returnReceipt = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          restaurantId: original.restaurantId,
          cashierId: original.cashierId,
          externalOrderId: externalReturnId,
          receiptType: ReceiptType.RETURN,
          originalReceiptId: original.id,
          billAmount: returnBillAmt,
          tipAmount: 0,
          totalAmount: totalRefund,
          paidCashAmount: cashAmt,
          paidCardAmount: cardAmt,
          paymentMethod: returnPaymentMethod,
          deliveryMethod: "NONE",
          status: ReceiptStatus.PENDING,
        },
      });

      await Promise.all(
        returnItems.map((item) =>
          tx.receiptItem.create({
            data: {
              receiptId: receipt.id,
              name: item.name.slice(0, 50) || "Return item",
              goodCode: item.goodCode,
              adgCode: item.adgCode,
              unit: item.unit,
              taxRegime: String(item.taxRegime),
              departmentTaxId: String(item.dep),
              quantity: item.quantity,
              unitPrice: item.price,
              totalPrice: money(item.price * item.quantity),
              discountAmount: 0,
            },
          })
        )
      );

      await tx.receiptEvent.create({
        data: {
          receiptId: receipt.id,
          event: "RETURN_RECEIPT_CREATED",
          fromStatus: null,
          toStatus: ReceiptStatus.PENDING,
          payload: {
            originalReceiptId: original.id,
            originalFiscalNumber: original.fiscalNumber,
            originalExternalOrderId: original.externalOrderId,
            returnItemCount: returnItems.length,
            cashAmountForReturn: cashAmt,
            cardAmountForReturn: cardAmt,
          },
        },
      });

      return receipt;
    });

    // Fiscalize the return receipt via SRC
    await prisma.receipt.update({
      where: { id: returnReceipt.id },
      data: { status: ReceiptStatus.FISCALIZING },
    });

    let srcMode: string;
    let updatedReturnReceipt;

    try {
      const returnSeq = await nextSeq(crn);
      const returnResult = await client.printReturnReceipt(
        {
          crn,
          receiptId: original.srcReceiptId,
          cardAmountForReturn: cardAmt,
          cashAmountForReturn: cashAmt,
          returnItemList: returnItems.map((item) => ({
            receiptProductId: item.receiptProductId,
            quantity: item.quantity,
          })),
        },
        returnSeq
      );

      if (returnResult.code !== 0 || !returnResult.result) {
        throw new Error(returnResult.errorMessage ?? returnResult.message ?? "SRC print-return-receipt failed");
      }

      const fields = mapSrcResultToReceiptFields(returnResult.result);
      srcMode = client.mode;

      updatedReturnReceipt = await prisma.receipt.update({
        where: { id: returnReceipt.id },
        data: {
          ...fields,
          srcMode,
          status: ReceiptStatus.FISCALIZED,
          fiscalizedAt: new Date(),
        },
        include: { restaurant: true, cashier: true, items: true, events: true },
      });

      await prisma.receiptEvent.create({
        data: {
          receiptId: returnReceipt.id,
          event: "RETURN_FISCALIZED",
          fromStatus: ReceiptStatus.FISCALIZING,
          toStatus: ReceiptStatus.FISCALIZED,
          payload: { srcRequest: { crn, receiptId: original.srcReceiptId }, srcResponse: returnResult },
        },
      });

      return NextResponse.json(updatedReturnReceipt, { status: 201 });
    } catch (fiscalError) {
      const message = fiscalError instanceof Error ? fiscalError.message : "Unknown fiscalization error";

      await prisma.receipt.update({
        where: { id: returnReceipt.id },
        data: { status: ReceiptStatus.FAILED, errorMessage: message },
      });

      await prisma.receiptEvent.create({
        data: {
          receiptId: returnReceipt.id,
          event: "RETURN_FISCALIZATION_FAILED",
          fromStatus: ReceiptStatus.FISCALIZING,
          toStatus: ReceiptStatus.FAILED,
          payload: { message },
        },
      });

      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
