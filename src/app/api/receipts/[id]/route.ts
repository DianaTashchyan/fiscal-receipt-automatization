import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireAuth } from "@/lib/utils/auth";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteParams) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      restaurant: true,
      cashier: true,
      items: true,
      events: true,
    },
  });

  if (!receipt) {
    return NextResponse.json(
      { error: "Receipt not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(receipt);
}
