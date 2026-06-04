import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { VALID_TAX_REGIMES } from "@/lib/src/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const departments = await prisma.department.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(departments);
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
    const { name, taxDepartmentId, taxRegime, isDefault = false } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!taxDepartmentId || typeof taxDepartmentId !== "string") {
      return NextResponse.json({ error: "taxDepartmentId is required (integer department number from SRC)" }, { status: 400 });
    }
    if (!Number.isInteger(Number(taxDepartmentId))) {
      return NextResponse.json({ error: "taxDepartmentId must be an integer" }, { status: 400 });
    }
    const regime = Number(taxRegime);
    if (!(VALID_TAX_REGIMES as readonly number[]).includes(regime)) {
      return NextResponse.json(
        { error: `taxRegime must be one of: ${VALID_TAX_REGIMES.join(", ")} (1=VAT, 2=VAT-exempt, 3=turnover, 7=micro)` },
        { status: 400 }
      );
    }

    if (isDefault) {
      await prisma.department.updateMany({
        where: { restaurantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const department = await prisma.department.create({
      data: {
        restaurantId,
        name: name.trim(),
        taxDepartmentId: String(Number(taxDepartmentId)),
        taxRegime: String(regime),
        isDefault: Boolean(isDefault),
        isActive: true,
      },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
