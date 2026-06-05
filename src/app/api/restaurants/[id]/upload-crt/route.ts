// POST /api/restaurants/:id/upload-crt
// Accepts a signed .crt (base64) from SRC, combines it server-side with the
// encrypted private key stored from the CSR generation step, converts to PKCS#12,
// and stores the resulting .p12 — all without ever exposing the private key to
// the browser. The .p12 bundle password is generated server-side; the caller
// does not need to supply or store it.
//
// Body: { crtBase64: string, filename?: string }
//
// CRN extraction from filename:
//   SRC names the signed certificate file "{TIN}_{CRN}.crt" (e.g. "00493113_52014201.crt").
//   This is documented in the VCR submit-cash-register guide (vcr.am/en/p/submit-cash-register,
//   step 19) and is the mechanism VCR uses to auto-populate the CRN after certificate upload.
//   If a filename matching this pattern is provided, the CRN is extracted and stored
//   in the restaurant record so post-cert-configure does not need to parse the cert body.

import https from "https";
import forge from "node-forge";
import { randomBytes } from "crypto";
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

    const body = await req.json() as { crtBase64?: string; filename?: string };
    const { crtBase64, filename } = body;

    if (!crtBase64 || typeof crtBase64 !== "string") {
      return NextResponse.json({ error: "crtBase64 is required" }, { status: 400 });
    }

    // Generate a secure random password server-side; caller never needs to know it.
    const p12Password = randomBytes(32).toString("hex");

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

    // Extract CRN from filename: SRC names the signed cert "{TIN}_{CRN}.crt"
    // (documented in VCR guide: vcr.am/en/p/submit-cash-register, step 19).
    let crnFromFilename: string | null = null;
    if (filename) {
      const base = filename.replace(/\.crt$/i, "");
      const parts = base.split("_");
      if (parts.length === 2) {
        const [part1, part2] = parts;
        // Validate: first part should match the restaurant TIN, second is the CRN (6-12 digits)
        if (/^\d{8}$/.test(part1) && /^\d{6,12}$/.test(part2)) {
          crnFromFilename = part2;
        }
      }
    }

    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { crn: true },
    });

    const crnToStore = currentRestaurant?.crn ?? crnFromFilename;

    await prisma.restaurant.update({
      where: { id },
      data: {
        srcCertData: new Uint8Array(pfxBuffer),
        srcCertPath: null,
        srcCertPassword: encryptedPassword,
        srcConfiguredAt: new Date(),
        srcOnboardingStep: 5,
        ...(crnToStore && !currentRestaurant?.crn ? { crn: crnToStore } : {}),
      },
    });

    invalidateRestaurantSrcClient(id);

    return NextResponse.json({
      success: true,
      crnFromFilename,
      message: crnFromFilename
        ? `Signed .crt converted to .p12 and stored. CRN ${crnFromFilename} extracted from filename.`
        : "Signed .crt converted to .p12 and stored. Test the connection in the next step.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[upload-crt]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
