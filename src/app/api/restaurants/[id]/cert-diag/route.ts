// TEMPORARY DIAGNOSTIC — remove after the certificate issue is resolved.
//
// GET /api/restaurants/:id/cert-diag
//
// Extracts and compares public key fingerprints from:
//   - srcCertData  (the uploaded SRC certificate — PEM or PKCS#12)
//   - srcCsrPem    (the CSR stored when generate-csr was last called)
//   - srcPrivateKeyEnc (the encrypted private key stored with the CSR)
//
// Returns: CERT / CSR / PRIVATE_KEY fingerprints and diagnosis A/B/C/D.
//
// Read-only. Does NOT modify any data.

import crypto from "crypto";
import forge from "node-forge";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { decryptCertPassword } from "@/lib/src/cert-crypto";
import { decryptPrivateKey } from "@/lib/src/csr";

type RouteContext = { params: Promise<{ id: string }> };

function spkiFingerprint(publicKey: forge.pki.PublicKey): string {
  const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKey as forge.pki.rsa.PublicKey)).getBytes();
  return crypto.createHash("sha256").update(Buffer.from(der, "binary")).digest("hex");
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        tin: true,
        srcCertData: true,
        srcCertPassword: true,
        srcCsrPem: true,
        srcPrivateKeyEnc: true,
        srcCsrCreatedAt: true,
        srcConfiguredAt: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const report: Record<string, unknown> = {
      restaurantId: id,
      tin: restaurant.tin,
      nodeVersion: process.version,
      opensslVersion: process.versions.openssl,
      srcCsrCreatedAt: restaurant.srcCsrCreatedAt?.toISOString() ?? null,
      srcConfiguredAt: restaurant.srcConfiguredAt?.toISOString() ?? null,
    };

    // ── 1. Extract CERT public key ────────────────────────────────────────────
    let certFingerprint: string | null = null;
    let certMode: string | null = null;

    if (!restaurant.srcCertData) {
      report.certError = "srcCertData is null — no certificate stored";
    } else {
      const certBuf = Buffer.from(restaurant.srcCertData);
      const isPem = certBuf.slice(0, 5).toString("ascii") === "-----";
      certMode = isPem ? "PEM" : "PKCS12";
      report.certMode = certMode;

      try {
        if (isPem) {
          const cert = forge.pki.certificateFromPem(certBuf.toString("utf8"));
          certFingerprint = spkiFingerprint(cert.publicKey);
        } else {
          // PKCS#12 mode — need the password
          if (!restaurant.srcCertPassword) {
            report.certError = "srcCertPassword is null — cannot decrypt PKCS#12";
          } else {
            let pw: string;
            try {
              pw = decryptCertPassword(restaurant.srcCertPassword);
            } catch (e) {
              report.certError = `srcCertPassword decrypt failed: ${(e as Error).message}`;
              pw = "";
            }
            if (pw) {
              const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(certBuf.toString("binary")));
              const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pw);
              for (const sc of p12.safeContents) {
                for (const bag of sc.safeBags) {
                  if (bag.cert) {
                    certFingerprint = spkiFingerprint(bag.cert.publicKey);
                    break;
                  }
                }
                if (certFingerprint) break;
              }
              if (!certFingerprint) report.certError = "No cert bag found in PKCS#12";
            }
          }
        }
      } catch (e) {
        report.certError = `cert parse failed: ${(e as Error).message}`;
      }
    }

    // ── 2. Extract CSR public key ─────────────────────────────────────────────
    let csrFingerprint: string | null = null;

    if (!restaurant.srcCsrPem) {
      report.csrError = "srcCsrPem is null — generate-csr was never called or DB was reset";
    } else {
      try {
        const csr = forge.pki.certificationRequestFromPem(restaurant.srcCsrPem);
        csrFingerprint = spkiFingerprint(csr.publicKey);
      } catch (e) {
        report.csrError = `CSR parse failed: ${(e as Error).message}`;
      }
    }

    // ── 3. Extract PRIVATE KEY public key ────────────────────────────────────
    let keyFingerprint: string | null = null;

    if (!restaurant.srcPrivateKeyEnc) {
      report.keyError = "srcPrivateKeyEnc is null — no private key stored";
    } else {
      try {
        const privPem = decryptPrivateKey(restaurant.srcPrivateKeyEnc);
        const privKey = forge.pki.privateKeyFromPem(privPem) as forge.pki.rsa.PrivateKey;
        const pubKey = forge.pki.rsa.setPublicKey(privKey.n, privKey.e);
        keyFingerprint = spkiFingerprint(pubKey);
      } catch (e) {
        report.keyError = `private key decrypt/parse failed: ${(e as Error).message}`;
      }
    }

    // ── 4. Print fingerprints ─────────────────────────────────────────────────
    report.fingerprints = {
      CERT:        certFingerprint ?? "ERROR",
      CSR:         csrFingerprint  ?? "ERROR",
      PRIVATE_KEY: keyFingerprint  ?? "ERROR",
    };

    // ── 5. Determine outcome A/B/C/D ─────────────────────────────────────────
    if (certFingerprint && csrFingerprint && keyFingerprint) {
      const certEqCsr  = certFingerprint === csrFingerprint;
      const certEqKey  = certFingerprint === keyFingerprint;
      const csrEqKey   = csrFingerprint  === keyFingerprint;

      report.matches = {
        "CERT == CSR":         certEqCsr,
        "CERT == PRIVATE_KEY": certEqKey,
        "CSR  == PRIVATE_KEY": csrEqKey,
      };

      if (certEqKey) {
        report.outcome = "D";
        report.diagnosis =
          "D: CERT == PRIVATE_KEY. The key and cert match. " +
          "The mismatch error is not coming from the stored data — check upload-crt logic.";
      } else if (certEqCsr && !certEqKey) {
        report.outcome = "A";
        report.diagnosis =
          "A: CERT == CSR, CERT != PRIVATE_KEY. " +
          "The certificate matches the CSR that was submitted to SRC. " +
          "The private key was replaced after the CSR was generated " +
          "(generate-csr was called again after SRC signed the cert).";
      } else if (!certEqCsr && csrEqKey) {
        report.outcome = "B";
        report.diagnosis =
          "B: CSR == PRIVATE_KEY, CERT != CSR. " +
          "The stored private key matches the stored CSR — they are a pair. " +
          "But the certificate was signed for a DIFFERENT, earlier CSR. " +
          "The CSR was regenerated after SRC signed the certificate.";
      } else {
        report.outcome = "C";
        report.diagnosis =
          "C: CSR != CERT and CSR != PRIVATE_KEY. " +
          "All three are from different key pairs. Database inconsistency or multiple overwrites.";
      }
    } else {
      report.outcome = "INCOMPLETE";
      report.diagnosis = "One or more fingerprints could not be computed — see errors above.";
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[cert-diag]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
