import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { PaymentMethod, DeliveryMethod, ReceiptStatus } from "@prisma/client";
import { registerSaleInTaxApi } from "@/lib/services/tax-api.service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      restaurantId,
      externalOrderId,
      tableNumber,
      paymentMethod,
      deliveryMethod = "NONE",
      customerEmail,
      customerPhone,
      items,
    } = body;

    if (!restaurantId || !externalOrderId || !paymentMethod || !items?.length) {
      return NextResponse.json(
        { error: "Missing required fields: restaurantId, externalOrderId, paymentMethod, items" },
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

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    if (!restaurant.isActive) {
      return NextResponse.json({ error: "Restaurant is not active" }, { status: 400 });
    }

    const cashier = await prisma.cashier.findFirst({
      where: { restaurantId, isDefault: true, isActive: true },
    });
    if (!cashier) {
      return NextResponse.json({ error: "No active default cashier configured for this restaurant" }, { status: 400 });
    }

    const existingReceipt = await prisma.receipt.findUnique({
      where: { restaurantId_externalOrderId: { restaurantId, externalOrderId } },
    });
    if (existingReceipt) {
      return NextResponse.json({ error: "Receipt with this Order ID already exists" }, { status: 409 });
    }

    // Resolve and validate all products BEFORE writing anything to DB
    let billAmount = 0;
    const preparedItems: Array<{
      product: { id: string; name: string; goodCode: string; adgCode: string; unit: string; externalProductId: string | null; department: { taxRegime: string; taxDepartmentId: string } };
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const item of items) {
      const qty = Number(item.quantity);
      if (!qty || qty <= 0) {
        return NextResponse.json({ error: "Quantity must be greater than zero" }, { status: 400 });
      }

      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { department: true },
      });
      if (!product || product.restaurantId !== restaurantId || !product.isActive) {
        return NextResponse.json({ error: `Invalid product: ${item.productId}` }, { status: 400 });
      }
      if (!product.price && !product.isVariablePrice) {
        return NextResponse.json({ error: `Product has no price: ${item.productId}` }, { status: 400 });
      }

      const unitPrice = Number(product.price ?? 0);
      const totalPrice = qty * unitPrice;
      billAmount += totalPrice;
      preparedItems.push({ product, quantity: qty, unitPrice, totalPrice });
    }

    const totalAmount = billAmount;

    // Create receipt + items atomically
    const { receipt, createdItems } = await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          restaurantId,
          cashierId: cashier.id,
          externalOrderId,
          tableNumber,
          billAmount,
          tipAmount: 0,
          totalAmount,
          paymentMethod: paymentMethod as PaymentMethod,
          deliveryMethod: deliveryMethod as DeliveryMethod,
          customerEmail: customerEmail || null,
          customerPhone: customerPhone || null,
          status: ReceiptStatus.PENDING,
        },
      });

      const createdItems = await Promise.all(
        preparedItems.map((pi) =>
          tx.receiptItem.create({
            data: {
              receiptId: receipt.id,
              productId: pi.product.id,
              externalProductId: pi.product.externalProductId,
              name: pi.product.name,
              goodCode: pi.product.goodCode,
              adgCode: pi.product.adgCode,
              unit: pi.product.unit,
              taxRegime: pi.product.department.taxRegime,
              departmentTaxId: pi.product.department.taxDepartmentId,
              quantity: pi.quantity,
              unitPrice: pi.unitPrice,
              totalPrice: pi.totalPrice,
              discountAmount: 0,
            },
          })
        )
      );

      await tx.receiptEvent.create({
        data: {
          receiptId: receipt.id,
          event: "MANUAL_RECEIPT_CREATED",
          fromStatus: null,
          toStatus: ReceiptStatus.PENDING,
          payload: { externalOrderId, paymentMethod, totalAmount, itemCount: items.length },
        },
      });

      return { receipt, createdItems };
    });

    // Fiscalize outside the transaction — SRC call must not hold a DB lock
    try {
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: ReceiptStatus.FISCALIZING },
      });

      const taxResult = await registerSaleInTaxApi({
        crn: restaurant.crn,
        cashierTaxId: cashier.taxCashierId,
        totalAmount: String(totalAmount),
        customerEmail: customerEmail || null,
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
        include: { restaurant: true, cashier: true, items: true, events: true },
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
    console.error("[POST /api/receipts/manual]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}