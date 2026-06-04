// POST /api/restaurants/:id/upload-crt
// Accepts a signed .crt (base64) from SRC, combines it server-side with the
// encrypted private key stored from the CSR generation step, converts to PKCS#12,
// and stores the resulting .p12 — all without ever exposing the private key to
// the browser.
//
// Body: { crtBase64: string, p12Password: string }
// The p12Password is chosen by the user and used to protect the .p12 bundle.

import https from "https";
import forge from "node-forge";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { decryptPrivateKey } from "@/lib/src/csr";
import { encryptCertPassword } from "@/lib/src/cert-crypto";
import { invalidateRestaurantSrcClient } from "@/lib/src/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, tin: true, srcPrivateKeyEnc: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    if (!restaurant.srcPrivateKeyEnc) {
      return NextResponse.json(
        { error: "No private key found for this restaurant. Generate a CSR first (step 2)." },
        { status: 400 }
      );
    }

    const body = await req.json() as { crtBase64?: string; p12Password?: string };
    const { crtBase64, p12Password } = body;

    if (!crtBase64 || typeof crtBase64 !== "string") {
      return NextResponse.json({ error: "crtBase64 is required" }, { status: 400 });
    }
    if (!p12Password || typeof p12Password !== "string" || p12Password.trim() === "") {
      return NextResponse.json(
        { error: "p12Password is required — choose a strong password to protect the .p12 bundle" },
        { status: 400 }
      );
    }

    // Decode the .crt
    let crtPem: string;
    try {
      const crtBuffer = Buffer.from(crtBase64, "base64");
      crtPem = crtBuffer.toString("utf8");
    } catch {
      return NextResponse.json({ error: "crtBase64 is not valid base64" }, { status: 400 });
    }

    // Decrypt the stored private key
    let privateKeyPem: string;
    try {
      privateKeyPem = decryptPrivateKey(restaurant.srcPrivateKeyEnc);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt stored private key — CERT_ENCRYPTION_KEY may have changed" },
        { status: 500 }
      );
    }

    // Parse the .crt and private key, build PKCS#12
    let pfxDer: string;
    try {
      const cert = forge.pki.certificateFromPem(crtPem);
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      const p12 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], p12Password, {
        algorithm: "3des",
        friendlyName: restaurant.tin,
      });
      pfxDer = forge.asn1.toDer(p12).getBytes();
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to convert .crt to .p12: ${(e as Error).message}. Ensure the .crt was signed for the CSR generated in step 2.` },
        { status: 422 }
      );
    }

    const pfxBuffer = Buffer.from(pfxDer, "binary");

    // Validate the resulting .p12 by building an https.Agent
    try {
      new https.Agent({
        pfx: pfxBuffer,
        passphrase: p12Password,
        rejectUnauthorized: false,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Generated .p12 validation failed: ${(e as Error).message}` },
        { status: 422 }
      );
    }

    const encryptedPassword = encryptCertPassword(p12Password);

    await prisma.restaurant.update({
      where: { id },
      data: {
        srcCertData: new Uint8Array(pfxBuffer),
        srcCertPath: null,
        srcCertPassword: encryptedPassword,
        srcConfiguredAt: new Date(),
        srcOnboardingStep: 5,
      },
    });

    invalidateRestaurantSrcClient(id);

    return NextResponse.json({
      success: true,
      message: "Signed .crt converted to .p12 and stored. Test the connection in the next step.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[upload-crt]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
