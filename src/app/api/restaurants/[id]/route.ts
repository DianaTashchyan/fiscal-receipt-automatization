import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { isValidTin } from "@/lib/src/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: {
        cashiers: { where: { isActive: true }, select: { id: true, name: true, taxCashierId: true, isDefault: true } },
        departments: { where: { isActive: true } },
        _count: { select: { products: true, receipts: true } },
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    return NextResponse.json(restaurant);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const body = await req.json();
    const { name, tin, crn, address, logoUrl, isActive } = body;

    if (tin !== undefined && !isValidTin(tin)) {
      return NextResponse.json({ error: "tin must be an 8-digit number" }, { status: 400 });
    }
    if (crn !== undefined && (typeof crn !== "string" || crn.trim() === "")) {
      return NextResponse.json({ error: "crn must be a non-empty string" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(tin !== undefined && { tin: String(tin).trim() }),
        ...(crn !== undefined && { crn: String(crn).trim() }),
        ...(address !== undefined && { address: String(address).trim() }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl ?? null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return NextResponse.json(restaurant);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
