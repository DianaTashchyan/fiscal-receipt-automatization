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
      select: { id: true, tin: true, name: true, srcCsrPem: true, srcCsrCreatedAt: true, srcCertData: true },
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

    // Safety guard: if a CSR already exists, require explicit confirmation.
    // Regenerating creates a new key pair — the old CSR is invalidated and any
    // certificate already signed for it cannot be used with the new private key.
    if (restaurant.srcCsrPem) {
      const body = await req.json().catch(() => ({})) as { force?: boolean };
      if (!body.force) {
        const certUploaded = restaurant.srcCertData !== null;
        return NextResponse.json(
          {
            error: certUploaded
              ? "A certificate is already stored for this restaurant. Regenerating the CSR will create a new private key — the uploaded certificate will no longer work and fiscalization will fail until a new certificate is signed by SRC and re-uploaded."
              : "A CSR already exists for this restaurant. Regenerating will create a new private key — if this CSR was already submitted to SRC, a new one must be submitted and SRC must sign a new certificate.",
            requiresForce: true,
            csrCreatedAt: restaurant.srcCsrCreatedAt?.toISOString() ?? null,
            certAlreadyUploaded: certUploaded,
            hint: 'To confirm regeneration, pass { "force": true } in the request body.',
          },
          { status: 409 }
        );
      }
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
        "After SRC approves and you receive the signed .crt, upload it via POST /api/restaurants/:id/upload-crt — " +
        "the server combines it with this private key into a PKCS#12 bundle automatically.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[generate-csr]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
