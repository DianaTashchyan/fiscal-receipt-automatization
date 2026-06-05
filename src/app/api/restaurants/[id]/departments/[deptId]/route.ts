import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { VALID_TAX_REGIMES } from "@/lib/src/types";

type RouteContext = { params: Promise<{ id: string; deptId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId, deptId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const dept = await prisma.department.findFirst({ where: { id: deptId, restaurantId } });
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    const body = await req.json();
    const { name, taxDepartmentId, taxRegime } = body;

    const updateData: Record<string, string> = {};

    if (name !== undefined) {
      if (!name || typeof name !== "string") {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (taxDepartmentId !== undefined) {
      if (!Number.isInteger(Number(taxDepartmentId))) {
        return NextResponse.json({ error: "taxDepartmentId must be an integer" }, { status: 400 });
      }
      updateData.taxDepartmentId = String(Number(taxDepartmentId));
    }
    if (taxRegime !== undefined) {
      const regime = Number(taxRegime);
      if (!(VALID_TAX_REGIMES as readonly number[]).includes(regime)) {
        return NextResponse.json(
          { error: `taxRegime must be one of: ${VALID_TAX_REGIMES.join(", ")} (1=VAT, 2=VAT-exempt, 3=Turnover, 7=Micro)` },
          { status: 400 }
        );
      }
      updateData.taxRegime = String(regime);
    }

    const updated = await prisma.department.update({ where: { id: deptId }, data: updateData });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
