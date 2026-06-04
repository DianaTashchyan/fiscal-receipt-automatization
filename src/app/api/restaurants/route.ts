import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireAuth } from "@/lib/utils/auth";
import { isValidTin } from "@/lib/src/validation";

export async function GET(req: NextRequest) {
  try {
    const payload = await requireAuth(req);

    let restaurants;
    if (payload.role === "ADMIN") {
      restaurants = await prisma.restaurant.findMany({ orderBy: { createdAt: "desc" } });
    } else {
      const links = await prisma.userRestaurant.findMany({
        where: { userId: payload.sub },
        include: { restaurant: true },
      });
      restaurants = links.map((l) => l.restaurant);
    }

    return NextResponse.json(restaurants);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json();
    const { name, tin, crn, address, logoUrl } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (!tin || !isValidTin(tin)) {
      return NextResponse.json({ error: "tin must be an 8-digit number" }, { status: 400 });
    }
    if (!crn || typeof crn !== "string" || crn.trim() === "") {
      return NextResponse.json({ error: "crn is required" }, { status: 400 });
    }
    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name: name.trim(),
        tin: tin.trim(),
        crn: crn.trim(),
        address: address.trim(),
        logoUrl: logoUrl ?? null,
      },
    });

    return NextResponse.json(restaurant, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
