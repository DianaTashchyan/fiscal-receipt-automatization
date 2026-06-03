import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: NextRequest, context: RouteParams) {
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
