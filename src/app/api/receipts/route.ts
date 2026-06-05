import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma/client";
import { PaymentMethod, DeliveryMethod, ReceiptStatus } from "@prisma/client";
import { registerSaleInTaxApi } from "@/lib/services/tax-api.service";
import { money } from "@/lib/src/validation";
import { requireAuth } from "@/lib/utils/auth";

const PAGE_SIZE = 50;

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function GET(req: NextRequest) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const skip = (page - 1) * PAGE_SIZE;

  const [receipts, total] = await prisma.$transaction([
    prisma.receipt.findMany({
      include: { restaurant: true, items: true, events: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.receipt.count(),
  ]);

  return NextResponse.json({
    data: receipts,
    pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/receipts
//
// VCR-style API-only receipt creation. Authenticated via X-Api-Key header.
// The caller provides full item data inline — no Product table lookup is
// performed. After SRC onboarding is complete, a restaurant can accept fiscal
// receipts immediately without registering products in the database.
//
// Required fields per item: name, goodCode, adgCode, unit, quantity, unitPrice,
// departmentTaxId, taxRegime. Optional: discountAmount (default 0).
//
// billAmount and totalAmount are computed server-side from the items array.
// tipAmount is optional (default 0); totalAmount = billAmount + tipAmount.
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing X-Api-Key header" }, { status: 401 });
    }

    const keyHash = hashApiKey(apiKey);
    const restaurantApiKey = await prisma.restaurantApiKey.findUnique({
      where: { keyHash },
      include: {
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

    if (!restaurantApiKey || !restaurantApiKey.isActive) {
      return NextResponse.json({ error: "Invalid or inactive API key" }, { status: 401 });
    }

    prisma.restaurantApiKey
      .update({ where: { id: restaurantApiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(console.error);

    const body = await req.json();
    const {
      externalOrderId,
      tableNumber,
      tipAmount = 0,
      paymentMethod,
      cashAmount: bodyCashAmount,
      cardAmount: bodyCardAmount,
      partnerTin = null,
      deliveryMethod = "NONE",
      customerEmail,
      customerPhone,
      items,
    } = body;

    if (!externalOrderId || !paymentMethod || !items?.length) {
      return NextResponse.json(
        { error: "Missing required fields: externalOrderId, paymentMethod, items" },
        { status: 400 }
      );
    }

    const validPaymentMethods = ["CASH", "CARD", "MIXED", "ONLINE"];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { error: `paymentMethod must be one of: ${validPaymentMethods.join(", ")}` },
        { status: 400 }
      );
    }

    if (partnerTin !== null && partnerTin !== undefined) {
      if (typeof partnerTin !== "string" || !/^\d{8}$/.test(partnerTin)) {
        return NextResponse.json(
          { error: "partnerTin must be a valid 8-digit TIN or null" },
          { status: 400 }
        );
      }
    }

    // Validate and map inline items — no Product DB lookup
    type MappedItem = {
      name: string; goodCode: string; adgCode: string; unit: string;
      departmentTaxId: string; taxRegime: string;
      quantity: number; unitPrice: number; totalPrice: number; discountAmount: number;
    };
    const mappedItems: MappedItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.name || !it.goodCode || !it.adgCode || !it.unit || !it.quantity || !it.unitPrice || !it.departmentTaxId || !it.taxRegime) {
        return NextResponse.json(
          { error: `Item ${i + 1} is missing required fields: name, goodCode, adgCode, unit, quantity, unitPrice, departmentTaxId, taxRegime` },
          { status: 400 }
        );
      }
      const qty = Number(it.quantity);
      const price = money(Number(it.unitPrice));
      const discount = money(Number(it.discountAmount ?? 0));
      if (qty <= 0) {
        return NextResponse.json({ error: `Item ${i + 1}: quantity must be greater than zero` }, { status: 400 });
      }
      mappedItems.push({
        name: String(it.name).slice(0, 50),
        goodCode: String(it.goodCode),
        adgCode: String(it.adgCode),
        unit: String(it.unit).slice(0, 50),
        departmentTaxId: String(it.departmentTaxId),
        taxRegime: String(it.taxRegime),
        quantity: qty,
        unitPrice: price,
        totalPrice: money(qty * price - discount),
        discountAmount: discount,
      });
    }

    // Compute bill/total from items
    const billAmt = money(mappedItems.reduce((sum, it) => sum + it.totalPrice, 0));
    const tipAmt = money(Number(tipAmount));
    const totalAmt = money(billAmt + tipAmt);

    // MIXED requires explicit split
    if (paymentMethod === "MIXED") {
      if (bodyCashAmount === undefined || bodyCardAmount === undefined) {
        return NextResponse.json(
          {
            error:
              "MIXED payment requires cashAmount and cardAmount fields specifying " +
              "the exact cash and card portions. Both must be present and must sum to billAmount.",
          },
          { status: 400 }
        );
      }
      const splitSum = Number(bodyCashAmount) + Number(bodyCardAmount);
      if (Math.abs(splitSum - billAmt) > 0.01) {
        return NextResponse.json(
          {
            error:
              `cashAmount (${bodyCashAmount}) + cardAmount (${bodyCardAmount}) = ${splitSum} ` +
              `does not equal computed billAmount (${billAmt}).`,
          },
          { status: 400 }
        );
      }
    }

    const existingReceipt = await prisma.receipt.findUnique({
      where: {
        restaurantId_externalOrderId: {
          restaurantId: restaurantApiKey.restaurantId,
          externalOrderId,
        },
      },
      include: { restaurant: true, items: true, events: true },
    });
    if (existingReceipt) {
      return NextResponse.json(existingReceipt, { status: 200 });
    }

    const cashier = await prisma.cashier.findFirst({
      where: { restaurantId: restaurantApiKey.restaurantId, isDefault: true, isActive: true },
    });
    if (!cashier) {
      return NextResponse.json(
        { error: "No active default cashier configured for this restaurant" },
        { status: 400 }
      );
    }

    const paidCash =
      paymentMethod === "CASH" ? billAmt
      : paymentMethod === "MIXED" ? Number(bodyCashAmount)
      : 0;
    const paidCard =
      paymentMethod === "CARD" || paymentMethod === "ONLINE" ? billAmt
      : paymentMethod === "MIXED" ? Number(bodyCardAmount)
      : 0;

    const { receipt, createdItems } = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          restaurantId: restaurantApiKey.restaurantId,
          cashierId: cashier.id,
          externalOrderId,
          tableNumber,
          billAmount: billAmt,
          tipAmount: tipAmt,
          totalAmount: totalAmt,
          paidCashAmount: paidCash,
          paidCardAmount: paidCard,
          paymentMethod: paymentMethod as PaymentMethod,
          deliveryMethod: deliveryMethod as DeliveryMethod,
          customerEmail,
          customerPhone,
          status: ReceiptStatus.PENDING,
        },
      });

      const createdItems = await Promise.all(
        mappedItems.map((mi) =>
          tx.receiptItem.create({
            data: {
              receiptId: receipt.id,
              productId: null,
              externalProductId: null,
              name: mi.name,
              goodCode: mi.goodCode,
              adgCode: mi.adgCode,
              unit: mi.unit,
              taxRegime: mi.taxRegime,
              departmentTaxId: mi.departmentTaxId,
              quantity: mi.quantity,
              unitPrice: mi.unitPrice,
              totalPrice: mi.totalPrice,
              discountAmount: mi.discountAmount,
            },
          })
        )
      );

      await tx.receiptEvent.create({
        data: {
          receiptId: receipt.id,
          event: "RECEIPT_CREATED",
          fromStatus: null,
          toStatus: ReceiptStatus.PENDING,
          payload: { externalOrderId, paymentMethod, billAmount: billAmt, tipAmount: tipAmt, totalAmount: totalAmt, itemCount: mappedItems.length },
        },
      });

      return { receipt, createdItems };
    });

    try {
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: ReceiptStatus.FISCALIZING },
      });

      const taxResult = await registerSaleInTaxApi({
        restaurant: restaurantApiKey.restaurant,
        cashierTaxId: cashier.taxCashierId,
        billAmount: String(billAmt),
        paidCashAmount: paymentMethod === "MIXED" ? String(paidCash) : undefined,
        paidCardAmount: paymentMethod === "MIXED" ? String(paidCard) : undefined,
        partnerTin: partnerTin ?? null,
        customerEmail,
        paymentMethod: paymentMethod as "CASH" | "CARD" | "MIXED" | "ONLINE",
        items: createdItems.map((item) => ({
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
        where: { id: receipt.id },
        data: {
          ...taxResult.fields,
          srcMode: taxResult.mode,
          status: ReceiptStatus.FISCALIZED,
          fiscalizedAt: new Date(),
        },
        include: { restaurant: true, items: true, events: true },
      });

      await prisma.receiptEvent.create({
        data: {
          receiptId: receipt.id,
          event: "FISCALIZED",
          fromStatus: ReceiptStatus.FISCALIZING,
          toStatus: ReceiptStatus.FISCALIZED,
          payload: taxResult.rawResponse as object,
        },
      });

      return NextResponse.json(updatedReceipt, { status: 201 });
    } catch (taxError) {
      const message = taxError instanceof Error ? taxError.message : "Unknown tax API error";

      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: ReceiptStatus.FAILED, errorMessage: message },
      });

      await prisma.receiptEvent.create({
        data: {
          receiptId: receipt.id,
          event: "FISCALIZATION_FAILED",
          fromStatus: ReceiptStatus.FISCALIZING,
          toStatus: ReceiptStatus.FAILED,
          payload: { message },
        },
      });

      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error("[POST /api/receipts]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
