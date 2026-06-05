import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { PaymentMethod, DeliveryMethod, ReceiptStatus } from "@prisma/client";
import { registerSaleInTaxApi } from "@/lib/services/tax-api.service";
import { money } from "@/lib/src/validation";
import { requireAuth } from "@/lib/utils/auth";

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/receipts/manual
//
// Admin-authenticated receipt creation (Bearer token). Same VCR-style
// inline-item model as POST /api/receipts. No Product DB lookup is performed.
//
// Required fields per item: name, goodCode, adgCode, unit, quantity, unitPrice,
// departmentTaxId, taxRegime. Optional: discountAmount (default 0).
// billAmount and totalAmount are computed from items. tipAmount defaults to 0.
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const {
      restaurantId,
      externalOrderId,
      tableNumber,
      paymentMethod,
      cashAmount: bodyCashAmount,
      cardAmount: bodyCardAmount,
      partnerTin = null,
      deliveryMethod = "NONE",
      customerEmail,
      customerPhone,
      tipAmount = 0,
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

    if (partnerTin !== null && partnerTin !== undefined) {
      if (typeof partnerTin !== "string" || !/^\d{8}$/.test(partnerTin)) {
        return NextResponse.json(
          { error: "partnerTin must be a valid 8-digit TIN or null" },
          { status: 400 }
        );
      }
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, tin: true, crn: true, isActive: true, srcCertData: true, srcCertPassword: true, srcCertPath: true },
    });
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
      return NextResponse.json(
        { error: "No active default cashier configured for this restaurant" },
        { status: 400 }
      );
    }
    if (!cashier.taxCashierId) {
      return NextResponse.json(
        { error: "Cashier SRC ID not configured. Enter the SRC Cashier ID from your SRC cabinet in the onboarding wizard (step 5) or via the Cashiers admin page." },
        { status: 400 }
      );
    }

    const department = await prisma.department.findFirst({
      where: { restaurantId, isDefault: true, isActive: true },
    });
    if (!department) {
      return NextResponse.json(
        { error: "No active default department configured for this restaurant" },
        { status: 400 }
      );
    }
    if (!department.taxDepartmentId) {
      return NextResponse.json(
        { error: "Department Tax ID not configured. Enter it from your SRC cabinet in the onboarding wizard (step 5) or via the Departments admin page." },
        { status: 400 }
      );
    }
    if (!department.taxRegime) {
      return NextResponse.json(
        { error: "Department Tax Regime not configured. Select it in the onboarding wizard (step 5) or via the Departments admin page." },
        { status: 400 }
      );
    }

    const existingReceipt = await prisma.receipt.findUnique({
      where: { restaurantId_externalOrderId: { restaurantId, externalOrderId } },
    });
    if (existingReceipt) {
      return NextResponse.json({ error: "Receipt with this Order ID already exists" }, { status: 409 });
    }

    // Validate and map inline items — departmentTaxId/taxRegime sourced from DB, not payload
    type MappedItem = {
      name: string; goodCode: string; adgCode: string; unit: string;
      departmentTaxId: string; taxRegime: string;
      quantity: number; unitPrice: number; totalPrice: number; discountAmount: number;
    };
    const mappedItems: MappedItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.name || !it.goodCode || !it.adgCode || !it.unit || !it.quantity || !it.unitPrice) {
        return NextResponse.json(
          { error: `Item ${i + 1} is missing required fields: name, goodCode, adgCode, unit, quantity, unitPrice` },
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
        departmentTaxId: department.taxDepartmentId,
        taxRegime: department.taxRegime,
        quantity: qty,
        unitPrice: price,
        totalPrice: money(qty * price - discount),
        discountAmount: discount,
      });
    }

    const billAmt = money(mappedItems.reduce((sum, it) => sum + it.totalPrice, 0));
    const tipAmt = money(Number(tipAmount));
    const totalAmt = money(billAmt + tipAmt);

    if (paymentMethod === "MIXED") {
      if (bodyCashAmount === undefined || bodyCardAmount === undefined) {
        return NextResponse.json(
          {
            error:
              "MIXED payment requires cashAmount and cardAmount fields. " +
              "Both must be present and must sum to the computed billAmount.",
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
          restaurantId,
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
          customerEmail: customerEmail || null,
          customerPhone: customerPhone || null,
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
          event: "MANUAL_RECEIPT_CREATED",
          fromStatus: null,
          toStatus: ReceiptStatus.PENDING,
          payload: { externalOrderId, paymentMethod, billAmount: billAmt, itemCount: mappedItems.length },
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
        restaurant,
        cashierTaxId: cashier.taxCashierId,
        billAmount: String(billAmt),
        paidCashAmount: paymentMethod === "MIXED" ? String(paidCash) : undefined,
        paidCardAmount: paymentMethod === "MIXED" ? String(paidCard) : undefined,
        partnerTin: partnerTin ?? null,
        customerEmail: customerEmail || null,
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
