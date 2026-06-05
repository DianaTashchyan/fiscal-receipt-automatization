import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";

type RouteContext = { params: Promise<{ id: string; cashierId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId, cashierId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const cashier = await prisma.cashier.findFirst({ where: { id: cashierId, restaurantId } });
    if (!cashier) return NextResponse.json({ error: "Cashier not found" }, { status: 404 });

    const body = await req.json();
    const { name, taxCashierId, pinCode } = body;

    const updateData: Record<string, string> = {};

    if (name !== undefined) {
      if (!name || typeof name !== "string") {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (taxCashierId !== undefined) {
      if (!taxCashierId || typeof taxCashierId !== "string") {
        return NextResponse.json({ error: "taxCashierId must be a non-empty string" }, { status: 400 });
      }
      updateData.taxCashierId = taxCashierId.trim();
    }
    if (pinCode !== undefined) {
      if (!pinCode || typeof pinCode !== "string" || pinCode.length < 4) {
        return NextResponse.json({ error: "pinCode must be at least 4 characters" }, { status: 400 });
      }
      updateData.pinCodeHash = await hash(pinCode, 12);
    }

    const updated = await prisma.cashier.update({
      where: { id: cashierId },
      data: updateData,
      select: { id: true, name: true, taxCashierId: true, isDefault: true, isActive: true, createdAt: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
