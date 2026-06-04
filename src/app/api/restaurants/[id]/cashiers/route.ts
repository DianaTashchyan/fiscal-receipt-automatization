import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const cashiers = await prisma.cashier.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, taxCashierId: true, isDefault: true, isActive: true, createdAt: true },
    });

    return NextResponse.json(cashiers);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const body = await req.json();
    const { name, taxCashierId, pinCode, isDefault = false } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!taxCashierId || typeof taxCashierId !== "string") {
      return NextResponse.json({ error: "taxCashierId is required (from SRC cabinet)" }, { status: 400 });
    }
    if (!pinCode || typeof pinCode !== "string" || pinCode.length < 4) {
      return NextResponse.json({ error: "pinCode is required (min 4 characters)" }, { status: 400 });
    }

    if (isDefault) {
      await prisma.cashier.updateMany({
        where: { restaurantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const cashier = await prisma.cashier.create({
      data: {
        restaurantId,
        name: name.trim(),
        taxCashierId: taxCashierId.trim(),
        pinCodeHash: await hash(pinCode, 12),
        isDefault: Boolean(isDefault),
        isActive: true,
      },
      select: { id: true, name: true, taxCashierId: true, isDefault: true, isActive: true, createdAt: true },
    });

    return NextResponse.json(cashier, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
