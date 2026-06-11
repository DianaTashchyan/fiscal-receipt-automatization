// POST /api/restaurants/:id/upload-crt
// Accepts a signed .crt (base64) from SRC, combines it server-side with the
// encrypted private key stored from the CSR generation step, and stores the
// certificate PEM directly — without ever exposing the private key to the browser.
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

function spkiFingerprint(pub: forge.pki.PublicKey): string {
  const der = forge.asn1.toDer(
    forge.pki.publicKeyToAsn1(pub as forge.pki.rsa.PublicKey)
  ).getBytes();
  return crypto.createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true, tin: true,
        srcPrivateKeyEnc: true,
        srcCsrPem: true,
        srcCsrCreatedAt: true,
      },
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

    // Compute public-key fingerprints for all three objects so we can prove
    // exactly which key pair the .crt belongs to. These are returned in the
    // 422 body when validation fails.
    let certFingerprint: string | null = null;
    let csrFingerprint: string | null = null;
    let privKeyFingerprint: string | null = null;

    try {
      const cert = forge.pki.certificateFromPem(crtPem);
      certFingerprint = spkiFingerprint(cert.publicKey);
    } catch (e) {
      return NextResponse.json(
        { error: `Cannot parse .crt file: ${(e as Error).message}` },
        { status: 422 }
      );
    }

    try {
      const privKey = forge.pki.privateKeyFromPem(privateKeyPem) as forge.pki.rsa.PrivateKey;
      privKeyFingerprint = spkiFingerprint(forge.pki.rsa.setPublicKey(privKey.n, privKey.e));
    } catch { /* decryption already succeeded; parse failure is unexpected but non-fatal here */ }

    if (restaurant.srcCsrPem) {
      try {
        const csr = forge.pki.certificationRequestFromPem(restaurant.srcCsrPem);
        if (csr.publicKey) csrFingerprint = spkiFingerprint(csr.publicKey);
      } catch { /* non-fatal */ }
    }

    // Validate cert + key using the exact same call that happens at connection time.
    // tls.createSecureContext throws immediately on key/cert mismatch or invalid PEM.
    try {
      tls.createSecureContext({ cert: crtPem, key: privateKeyPem });
    } catch (e) {
      // Scan every other restaurant record with the same TIN to find
      // which stored key (if any) matches the certificate's public key.
      const allSameTin = await prisma.restaurant.findMany({
        where: { tin: restaurant.tin },
        select: {
          id: true, tin: true,
          srcPrivateKeyEnc: true,
          srcCsrPem: true,
          srcCsrCreatedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      });

      const keySearch = await Promise.all(
        allSameTin.map(async (r) => {
          let kfp: string | null = null;
          let cfp: string | null = null;
          try {
            if (r.srcPrivateKeyEnc) {
              const kpem = decryptPrivateKey(r.srcPrivateKeyEnc);
              const k = forge.pki.privateKeyFromPem(kpem) as forge.pki.rsa.PrivateKey;
              kfp = spkiFingerprint(forge.pki.rsa.setPublicKey(k.n, k.e));
            }
          } catch { /* decrypt or parse failure */ }
          try {
            if (r.srcCsrPem) {
              const csr = forge.pki.certificationRequestFromPem(r.srcCsrPem);
              if (csr.publicKey) cfp = spkiFingerprint(csr.publicKey);
            }
          } catch { /* non-fatal */ }
          return {
            restaurantId: r.id,
            createdAt: r.createdAt.toISOString(),
            srcCsrCreatedAt: r.srcCsrCreatedAt?.toISOString() ?? null,
            keyFingerprint: kfp,
            csrFingerprint: cfp,
            "CERT == KEY": certFingerprint !== null && kfp !== null && certFingerprint === kfp,
            "CERT == CSR": certFingerprint !== null && cfp !== null && certFingerprint === cfp,
          };
        })
      );

      return NextResponse.json(
        {
          error: `Certificate/key mismatch: ${(e as Error).message}`,
          diagnosis: {
            currentRestaurant: {
              id: restaurant.id,
              srcCsrCreatedAt: restaurant.srcCsrCreatedAt?.toISOString() ?? null,
            },
            fingerprints: {
              CERT:        certFingerprint,
              CSR:         csrFingerprint  ?? "unavailable",
              PRIVATE_KEY: privKeyFingerprint ?? "unavailable",
            },
            matches: {
              "CERT == CSR":         csrFingerprint  !== null && certFingerprint === csrFingerprint,
              "CERT == PRIVATE_KEY": privKeyFingerprint !== null && certFingerprint === privKeyFingerprint,
              "CSR  == PRIVATE_KEY": csrFingerprint  !== null && privKeyFingerprint !== null
                                       && csrFingerprint === privKeyFingerprint,
            },
            allRestaurantsWithSameTin: keySearch,
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
        srcCertData: new Uint8Array(Buffer.from(crtPem, "utf8")),
        srcCertPassword: null,
        srcCertPath: null,
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
        ? `Certificate stored. CRN ${crnFromFilename} extracted from filename.`
        : "Certificate stored. Test the connection in the next step.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[upload-crt]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
