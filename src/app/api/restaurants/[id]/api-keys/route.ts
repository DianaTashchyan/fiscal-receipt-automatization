import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { generateApiKey, hashApiKey } from "@/lib/utils/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const apiKeys = await prisma.restaurantApiKey.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, isActive: true, lastUsedAt: true, createdAt: true },
    });

    return NextResponse.json(apiKeys);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const body = await req.json().catch(() => ({}));
    const { label } = body;

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);

    const apiKey = await prisma.restaurantApiKey.create({
      data: {
        restaurantId,
        keyHash,
        label: label ?? null,
        isActive: true,
      },
      select: { id: true, label: true, isActive: true, createdAt: true },
    });

    return NextResponse.json({ ...apiKey, key: rawKey }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id: restaurantId } = await params;
    await requireRestaurantAccess(req, restaurantId);

    const body = await req.json();
    const { keyId } = body;
    if (!keyId) {
      return NextResponse.json({ error: "keyId is required" }, { status: 400 });
    }

    const apiKey = await prisma.restaurantApiKey.findFirst({
      where: { id: keyId, restaurantId },
    });
    if (!apiKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    await prisma.restaurantApiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
