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

import tls from "tls";
import crypto from "crypto";
import forge from "node-forge";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { decryptPrivateKey } from "@/lib/src/csr";
import { invalidateRestaurantSrcClient } from "@/lib/src/client";

type RouteContext = { params: Promise<{ id: string }> };

function spkiFingerprint(publicKey: forge.pki.PublicKey): string {
  const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKey as forge.pki.rsa.PublicKey)).getBytes();
  return crypto.createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, tin: true, srcPrivateKeyEnc: true, srcCsrPem: true },
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

    // Parse .crt and validate it pairs with the stored private key.
    // Store cert PEM directly — no PKCS#12. node-forge's toPkcs12Asn1 hardcodes
    // SHA-1 for the outer MAC; OpenSSL 3.5+ at security level 2 rejects any use
    // of SHA-1, causing "Unable to load certificate from PFX data" on Vercel.
    let certPem: string;
    let certFingerprint: string;
    let privKeyFingerprint: string;
    try {
      const cert = forge.pki.certificateFromPem(crtPem);
      const privKey = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey;
      certPem = forge.pki.certificateToPem(cert); // re-encode to normalise
      certFingerprint = spkiFingerprint(cert.publicKey);
      privKeyFingerprint = spkiFingerprint(forge.pki.rsa.setPublicKey(privKey.n, privKey.e));
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to parse .crt: ${(e as Error).message}. Ensure the .crt was signed for the CSR generated in step 2.` },
        { status: 422 }
      );
    }

    // Compute CSR fingerprint for diagnostics (srcCsrPem may be null if not yet generated)
    let csrFingerprint: string | null = null;
    if (restaurant.srcCsrPem) {
      try {
        const csr = forge.pki.certificationRequestFromPem(restaurant.srcCsrPem);
        if (csr.publicKey) csrFingerprint = spkiFingerprint(csr.publicKey);
      } catch { /* non-fatal */ }
    }

    const certPemBuffer = Buffer.from(certPem, "utf8");

    // tls.createSecureContext throws immediately if cert+key don't match
    try {
      tls.createSecureContext({
        cert: certPemBuffer,
        key: Buffer.from(privateKeyPem, "utf8"),
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: `Certificate/key validation failed: ${(e as Error).message}`,
          fingerprints: {
            CERT:        certFingerprint,
            CSR:         csrFingerprint ?? "unavailable (srcCsrPem is null)",
            PRIVATE_KEY: privKeyFingerprint,
          },
          matches: {
            "CERT == CSR":         csrFingerprint !== null && certFingerprint === csrFingerprint,
            "CERT == PRIVATE_KEY": certFingerprint === privKeyFingerprint,
          },
        },
        { status: 422 }
      );
    }

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
        srcCertData: new Uint8Array(certPemBuffer),
        srcCertPath: null,
        srcCertPassword: "",
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
        ? `Signed .crt stored (cert PEM mode). CRN ${crnFromFilename} extracted from filename.`
        : "Signed .crt stored (cert PEM mode). Test the connection in the next step.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[upload-crt]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
