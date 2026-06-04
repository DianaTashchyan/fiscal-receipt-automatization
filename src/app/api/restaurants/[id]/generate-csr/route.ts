// POST /api/restaurants/:id/generate-csr
// Generates a new RSA-2048 keypair + PKCS#10 CSR for this restaurant.
// Stores the encrypted private key and the CSR PEM in the DB.
// Returns only the CSR (safe to share) — never the private key.
// Re-generating overwrites the previous key/CSR (the old cert will stop working).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { generateSrcCsr } from "@/lib/src/csr";
import { isValidTin } from "@/lib/src/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, tin: true, name: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    if (!isValidTin(restaurant.tin)) {
      return NextResponse.json(
        { error: "Restaurant TIN is invalid — must be 8 digits before generating a CSR" },
        { status: 400 }
      );
    }

    // RSA-2048 key generation takes ~500ms — acceptable for one-time onboarding
    const { csrPem, privateKeyEnc } = generateSrcCsr(restaurant.tin);

    await prisma.restaurant.update({
      where: { id },
      data: {
        srcPrivateKeyEnc: privateKeyEnc,
        srcCsrPem: csrPem,
        srcCsrCreatedAt: new Date(),
        srcOnboardingStep: 2,
      },
    });

    return NextResponse.json({
      success: true,
      csrPem,
      tin: restaurant.tin,
      subject: `CN=${restaurant.tin} Tin, OU=${restaurant.tin} Tin, O=${restaurant.tin} Tin, L=Yerevan, ST=Yerevan, C=AM`,
      message:
        "CSR generated. Download it and upload to the SRC u6 cabinet. " +
        "After SRC approves and you receive the .crt, convert to .p12 and upload via /src-config.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[generate-csr]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
