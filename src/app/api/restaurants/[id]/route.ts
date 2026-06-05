import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireAuth, requireRestaurantAccess } from "@/lib/utils/auth";
import { isValidTin } from "@/lib/src/validation";
import { UserRole } from "@prisma/client";

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
    const { name, tin, crn, address, logoUrl, isActive, srcOnboardingStep, platformName, websiteUrl } = body;

    if (tin !== undefined && !isValidTin(tin)) {
      return NextResponse.json({ error: "tin must be an 8-digit number" }, { status: 400 });
    }
    // crn: allow setting to non-empty string or clearing (null/empty string resets to null)
    if (crn !== undefined && crn !== null && crn !== "" && (typeof crn !== "string" || crn.trim() === "")) {
      return NextResponse.json({ error: "crn must be a non-empty string" }, { status: 400 });
    }
    if (srcOnboardingStep !== undefined && (!Number.isInteger(srcOnboardingStep) || srcOnboardingStep < 0 || srcOnboardingStep > 13)) {
      return NextResponse.json({ error: "srcOnboardingStep must be an integer 0–13" }, { status: 400 });
    }
    if (websiteUrl !== undefined && websiteUrl !== null && websiteUrl !== "" && !/^https:\/\/.+/.test(String(websiteUrl))) {
      return NextResponse.json({ error: "websiteUrl must start with https://" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(tin !== undefined && { tin: String(tin).trim() }),
        ...(crn !== undefined && { crn: crn === null || crn === "" ? null : String(crn).trim() }),
        ...(address !== undefined && { address: String(address).trim() }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl ?? null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(srcOnboardingStep !== undefined && { srcOnboardingStep: Number(srcOnboardingStep) }),
        ...(platformName !== undefined && { platformName: platformName === null || platformName === "" ? null : String(platformName).trim() }),
        ...(websiteUrl !== undefined && {
          websiteUrl: websiteUrl === null || websiteUrl === "" ? null : String(websiteUrl).trim(),
          srcIpAddress: null,  // clear cached DNS resolution; re-resolved on next page load
        }),
      },
    });

    return NextResponse.json(restaurant);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    // Only admins can delete restaurants
    const payload = await requireAuth(req);
    if (payload.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "Admin access required to delete a restaurant" }, { status: 403 });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    // Receipt→Restaurant lacks onDelete:Cascade in the schema, so delete receipts
    // (and their cascade children: ReceiptItem, ReceiptEvent) before the restaurant.
    // All other relations (apiKeys, cashiers, departments, products) have onDelete:Cascade.
    const receipts = await prisma.receipt.findMany({
      where: { restaurantId: id },
      select: { id: true },
    });
    if (receipts.length > 0) {
      const receiptIds = receipts.map((r) => r.id);
      await prisma.receiptEvent.deleteMany({ where: { receiptId: { in: receiptIds } } });
      await prisma.receiptItem.deleteMany({ where: { receiptId: { in: receiptIds } } });
      await prisma.receipt.deleteMany({ where: { restaurantId: id } });
    }

    await prisma.restaurant.delete({ where: { id } });

    return NextResponse.json({ success: true, deleted: { id, name: restaurant.name } });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
