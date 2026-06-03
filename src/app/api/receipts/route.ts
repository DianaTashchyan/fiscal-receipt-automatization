import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma/client";
import { PaymentMethod, DeliveryMethod, ReceiptStatus } from "@prisma/client";
import { registerSaleInTaxApi } from "@/lib/services/tax-api.service";

const PAGE_SIZE = 50;

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function GET(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json({ error: "Missing X-Api-Key header" }, { status: 401 });
    }

    const keyHash = hashApiKey(apiKey);
    const restaurantApiKey = await prisma.restaurantApiKey.findUnique({
      where: { keyHash },
      include: { restaurant: true },
    });

    if (!restaurantApiKey || !restaurantApiKey.isActive) {
      return NextResponse.json({ error: "Invalid or inactive API key" }, { status: 401 });
    }

    // fire-and-forget lastUsedAt update
    prisma.restaurantApiKey
      .update({ where: { id: restaurantApiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(console.error);

    const body = await req.json();
    const {
      externalOrderId,
      tableNumber,
      billAmount,
      tipAmount = 0,
      totalAmount,
      paymentMethod,
      deliveryMethod = "NONE",
      customerEmail,
      customerPhone,
      items,
    } = body;

    if (!externalOrderId || billAmount === undefined || !totalAmount || !paymentMethod || !items?.length) {
      return NextResponse.json(
        { error: "Missing required fields: externalOrderId, billAmount, totalAmount, paymentMethod, items" },
        { status: 400 }
      );
    }

    const validPaymentMethods = ["CASH", "CARD", "MIXED", "ONLINE"];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json({ error: `paymentMethod must be one of: ${validPaymentMethods.join(", ")}` }, { status: 400 });
    }

    // idempotency: return existing fiscalized receipt
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
      return NextResponse.json({ error: "No active default cashier configured for this restaurant" }, { status: 400 });
    }

    // resolve and validate all products BEFORE touching the DB
    const resolvedItems: Array<{
      product: { id: string; name: string; goodCode: string; adgCode: string; unit: string; department: { taxRegime: string; taxDepartmentId: string } };
      externalProductId: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      discountAmount: number;
    }> = [];

    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: {
          restaurantId: restaurantApiKey.restaurantId,
          externalProductId: item.externalProductId,
          isActive: true,
        },
        include: { department: true },
      });
      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${item.externalProductId}` },
          { status: 400 }
        );
      }
      resolvedItems.push({
        product,
        externalProductId: item.externalProductId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        discountAmount: Number(item.discountAmount ?? 0),
      });
    }

    // create receipt + all items atomically
    const { receipt, createdItems } = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          restaurantId: restaurantApiKey.restaurantId,
          cashierId: cashier.id,
          externalOrderId,
          tableNumber,
          billAmount,
          tipAmount,
          totalAmount,
          paymentMethod: paymentMethod as PaymentMethod,
          deliveryMethod: deliveryMethod as DeliveryMethod,
          customerEmail,
          customerPhone,
          status: ReceiptStatus.PENDING,
        },
      });

      const createdItems = await Promise.all(
        resolvedItems.map((ri) =>
          tx.receiptItem.create({
            data: {
              receiptId: receipt.id,
              productId: ri.product.id,
              externalProductId: ri.externalProductId,
              name: ri.product.name,
              goodCode: ri.product.goodCode,
              adgCode: ri.product.adgCode,
              unit: ri.product.unit,
              taxRegime: ri.product.department.taxRegime,
              departmentTaxId: ri.product.department.taxDepartmentId,
              quantity: ri.quantity,
              unitPrice: ri.unitPrice,
              totalPrice: ri.totalPrice,
              discountAmount: ri.discountAmount,
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
          payload: { externalOrderId, paymentMethod, totalAmount, itemCount: items.length },
        },
      });

      return { receipt, createdItems };
    });

    // fiscalize (outside the transaction — SRC call must not hold a DB lock)
    try {
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: ReceiptStatus.FISCALIZING },
      });

      const taxResult = await registerSaleInTaxApi({
        crn: restaurantApiKey.restaurant.crn,
        cashierTaxId: cashier.taxCashierId,
        totalAmount: String(totalAmount),
        customerEmail,
        paymentMethod: paymentMethod as "CASH" | "CARD" | "MIXED" | "ONLINE",
        items: createdItems.map((item) => ({
          externalProductId: item.externalProductId,
          departmentTaxId: item.departmentTaxId,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
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
