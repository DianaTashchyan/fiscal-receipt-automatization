import { NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";

export async function GET() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json(restaurants);
}
