import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const products = await prisma.product.findMany({
      where: { restaurantId },
      include: { department: { select: { id: true, name: true, taxDepartmentId: true, taxRegime: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(products);
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
    const {
      departmentId,
      externalProductId,
      name,
      goodCode,
      adgCode,
      unit,
      price,
      isVariablePrice = false,
    } = body;

    if (!departmentId || typeof departmentId !== "string") {
      return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || name.length > 50) {
      return NextResponse.json({ error: "name is required and must be max 50 characters" }, { status: 400 });
    }
    if (!goodCode || typeof goodCode !== "string" || goodCode.length > 50) {
      return NextResponse.json({ error: "goodCode is required and must be max 50 characters (HS tariff code from SRC good list)" }, { status: 400 });
    }
    if (!adgCode || typeof adgCode !== "string") {
      return NextResponse.json({ error: "adgCode is required (ADG tariff code from SRC)" }, { status: 400 });
    }
    if (!unit || typeof unit !== "string" || unit.length > 50) {
      return NextResponse.json({ error: "unit is required (e.g. piece, kg, liter)" }, { status: 400 });
    }
    if (!isVariablePrice && (price === undefined || price === null || Number(price) <= 0)) {
      return NextResponse.json({ error: "price must be greater than 0 for fixed-price products" }, { status: 400 });
    }

    const dept = await prisma.department.findFirst({
      where: { id: departmentId, restaurantId },
    });
    if (!dept) {
      return NextResponse.json({ error: "Department not found for this restaurant" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        restaurantId,
        departmentId,
        externalProductId: externalProductId ?? null,
        name: name.trim().slice(0, 50),
        goodCode: goodCode.trim().slice(0, 50),
        adgCode: adgCode.trim(),
        unit: unit.trim().slice(0, 50),
        price: isVariablePrice ? null : Number(price),
        isVariablePrice: Boolean(isVariablePrice),
        isActive: true,
      },
      include: { department: { select: { id: true, name: true, taxDepartmentId: true, taxRegime: true } } },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
