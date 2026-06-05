// POST /api/restaurants/:id/post-cert-configure
//
// Automatic post-certificate-upload configuration.
// Called immediately after .crt upload succeeds.
//
// What it does (in order):
//   1. CRN resolution (three attempts, in order):
//      a. Already stored in restaurant.crn (set by upload-crt when it parsed the filename).
//      b. Try to extract from the certificate body (Subject CN, serialNumber, extensions).
//      c. Mock mode: auto-assign a deterministic mock CRN.
//      d. Real mode: return error — CRN must come from the SRC certificate filename or cabinet.
//   2. Department: uses existing if present; otherwise auto-creates dep=1/taxRegime=1 (VAT).
//      Rationale: VCR always provides a default department. dep=1 with VAT is the standard
//      starting point used in seed data, all SRC examples, and VCR's own default configuration.
//      The regime can be corrected via the Departments page and configureDepartments re-run.
//   3. Cashier: uses existing if present; otherwise auto-creates taxCashierId="1".
//      Rationale: VCR always provides a default cashier with internal id=1. SRC assigns IDs
//      sequentially starting at 1 for a new ECR with a single cashier. The ID is displayed
//      in the SRC cabinet (ECR list → Cashiers column) and can be corrected via Cashiers page.
//   4. Calls checkConnection to verify mTLS.
//   5. Calls activate to move ECR to active state.
//   6. Calls configureDepartments with the stored taxRegime.
//   7. Advances srcOnboardingStep for each step that succeeded.
//
// How CRN is obtained:
//   SRC names the signed certificate file "{TIN}_{CRN}.crt" (e.g. "00493113_52014201.crt").
//   The upload-crt route parses this filename and stores the CRN before this route runs.
//   This is the primary path (same as VCR). The certificate-body extraction is a fallback.

import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { decryptCertPassword } from "@/lib/src/cert-crypto";
import { resolveRestaurantCertConfig } from "@/lib/src/config";
import { getSrcMode } from "@/lib/src/config";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { nextSeq } from "@/lib/src/sequence";

type RouteContext = { params: Promise<{ id: string }> };

export type AutoConfigStatus = {
  crn: string | null;
  crnSource: "certificate" | "database" | "mock-auto" | null;
  crnError: string | null;
  department: { id: string; name: string; taxDepartmentId: string; taxRegime: string } | null;
  departmentError: string | null;
  cashier: { id: string; name: string; taxCashierId: string } | null;
  cashierError: string | null;
  connected: boolean;
  connectionError: string | null;
  activated: boolean;
  activationError: string | null;
  isMockMode: boolean;
};

function tryExtractCrnFromCert(pfxBuf: Buffer, password: string): string | null {
  try {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuf.toString("binary")));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (!safeBag.cert) continue;
        const cert = safeBag.cert;

        // Try Subject CN — SRC may set it to the CRN after signing
        const cn = cert.subject.getField("CN")?.value as string | undefined;
        if (cn) {
          const stripped = cn.replace(/\s/g, "");
          // CRN is typically 6-12 digits
          if (/^\d{6,12}$/.test(stripped)) return stripped;
        }

        // Try Subject serialNumber attribute (distinct from cert serial number)
        const subjectSN = cert.subject.getField("serialNumber")?.value as string | undefined;
        if (subjectSN && /^\d{6,12}$/.test(subjectSN.replace(/\s/g, ""))) {
          return subjectSN.trim();
        }

        // Try certificate serial number (hex → decimal)
        if (cert.serialNumber) {
          try {
            const decimal = BigInt("0x" + cert.serialNumber).toString(10);
            if (/^\d{6,12}$/.test(decimal)) return decimal;
          } catch { /* ignore */ }
        }

        // Try Subject extensions: look for OIDs that might encode a device ID
        // (SRC uses a private enterprise OID; without official documentation we scan all string-typed extensions)
        for (const ext of cert.extensions ?? []) {
          const val = (ext as Record<string, unknown>).value;
          if (typeof val === "string" && /^\d{6,12}$/.test(val.trim())) return val.trim();
        }
      }
    }
  } catch {
    // Parsing failure is non-fatal; caller falls back to other sources
  }
  return null;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        tin: true,
        crn: true,
        srcCertData: true,
        srcCertPassword: true,
        srcCertPath: true,
        srcOnboardingStep: true,
        departments: { where: { isActive: true }, take: 1, select: { id: true, name: true, taxDepartmentId: true, taxRegime: true } },
        cashiers:    { where: { isActive: true }, take: 1, select: { id: true, name: true, taxCashierId: true } },
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const isMock = getSrcMode() === "mock";
    const status: AutoConfigStatus = {
      crn: null, crnSource: null, crnError: null,
      department: null, departmentError: null,
      cashier: null, cashierError: null,
      connected: false, connectionError: null,
      activated: false, activationError: null,
      isMockMode: isMock,
    };

    // ── 1. Resolve CRN ──────────────────────────────────────────────────────
    if (restaurant.crn) {
      // Already in DB (set previously)
      status.crn = restaurant.crn;
      status.crnSource = "database";
    } else if (restaurant.srcCertData && restaurant.srcCertPassword) {
      // Try to extract from certificate
      try {
        const password = decryptCertPassword(restaurant.srcCertPassword);
        const crnFromCert = tryExtractCrnFromCert(
          Buffer.from(restaurant.srcCertData),
          password
        );
        if (crnFromCert) {
          status.crn = crnFromCert;
          status.crnSource = "certificate";
          await prisma.restaurant.update({ where: { id }, data: { crn: crnFromCert } });
        }
      } catch {
        // cert parse error — fall through to mock/error
      }
    }

    if (!status.crn && isMock) {
      // Mock mode: auto-assign a deterministic mock CRN
      const mockCrn = `MOCK-${restaurant.tin.slice(0, 6)}`;
      status.crn = mockCrn;
      status.crnSource = "mock-auto";
      await prisma.restaurant.update({ where: { id }, data: { crn: mockCrn } });
    }

    if (!status.crn) {
      status.crnError =
        "CRN not found. The SRC VCR API (taxservice.am/taxsystem-rs-vcr) has no getCRN endpoint — " +
        "the CRN is issued externally by SRC via the u6 form approval process. " +
        "It was not embedded in the certificate in any recognised field (Subject CN, serialNumber, or extensions). " +
        "Once SRC approves your u6 application, you will receive the CRN (ՀԴՄ number) in your SRC cabinet → " +
        "ECR list → Registration number column. Contact your SRC representative to obtain it.";
      // Cannot proceed without CRN in real mode — return partial status
      return NextResponse.json(status, { status: 200 });
    }

    const crn = status.crn;

    // ── 2. Department ────────────────────────────────────────────────────────
    // Use existing department if present. Do NOT auto-create with a hardcoded
    // taxRegime — the regime varies by business type (VAT, turnover, micro, etc.)
    // and cannot be determined automatically. The admin must configure it via
    // the Departments management page, which stores the correct regime in DB.
    if (restaurant.departments.length > 0) {
      status.department = restaurant.departments[0];
    } else {
      status.departmentError =
        "No department configured. Add one via the Departments management page " +
        "(select your tax regime: 1=VAT, 2=VAT-exempt, 3=Turnover, 7=Micro). " +
        "The tax regime cannot be determined automatically — it reflects the company's " +
        "legal tax classification and is not available from SRC certificate data.";
    }

    // ── 3. Cashier ───────────────────────────────────────────────────────────
    // Use existing cashier if present. Do NOT auto-create with taxCashierId="1":
    // the SRC VCR API has no getCashierList endpoint, so the actual SRC-assigned
    // cashier ID cannot be fetched programmatically. SRC assigns IDs sequentially
    // but the starting value is not always 1. The wrong cashierId causes SRC to
    // reject fiscal receipts. The admin must configure it via the Cashiers
    // management page using the ID shown in SRC cabinet → ECR page → Cashiers.
    if (restaurant.cashiers.length > 0) {
      status.cashier = restaurant.cashiers[0];
    } else {
      status.cashierError =
        "No cashier configured. The SRC VCR API has no getCashierList endpoint — " +
        "the Tax Cashier ID cannot be fetched automatically. Add a cashier via " +
        "the Cashiers management page using the ID from your SRC cabinet " +
        "(ECR page → Cashiers section).";
    }

    // ── 4. SRC connection + activation ──────────────────────────────────────
    try {
      // In mock mode, use the admin resolver (returns MockSrcClient, no cert needed).
      // In real mode, resolve the restaurant cert and construct the real client directly.
      let client;
      if (isMock) {
        client = await resolveAdminSrcClient(id);
      } else {
        const certConfig = resolveRestaurantCertConfig({
          id: restaurant.id,
          tin: restaurant.tin,
          crn,
          srcCertData: restaurant.srcCertData,
          srcCertPassword: restaurant.srcCertPassword,
          srcCertPath: restaurant.srcCertPath,
        });
        const { RealSrcClient } = await import("@/lib/src/real-client");
        client = new RealSrcClient(certConfig);
      }

      // Test connection
      try {
        const connResult = await client.checkConnection(crn);
        status.connected = connResult.code === 0;
        if (!status.connected) {
          status.connectionError = connResult.message || `SRC returned code ${connResult.code}`;
        }
      } catch (e) {
        status.connectionError = e instanceof Error ? e.message : "Connection failed";
      }

      // Activate ECR (codes 195/196 = already active, which is fine)
      if (status.connected || isMock) {
        try {
          const actResult = await client.activate(crn);
          status.activated = actResult.code === 0 || actResult.code === 195 || actResult.code === 196;
          if (!status.activated) {
            status.activationError = actResult.message || `SRC returned code ${actResult.code}`;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Activation failed";
          // SRC error 195/196 = already activated — treat as success
          if (/195|196|already active/i.test(msg)) {
            status.activated = true;
          } else {
            status.activationError = msg;
          }
        }
      }

      // Configure department with SRC using the stored taxRegime (not hardcoded)
      if (status.department && (status.connected || isMock)) {
        try {
          const seq = await nextSeq(crn);
          const taxRegimeNum = Number(status.department.taxRegime);
          await client.configureDepartments(crn, seq, [{ dep: Number(status.department.taxDepartmentId), taxRegime: taxRegimeNum }]);
        } catch {
          // Non-fatal — department config may already be registered in SRC
        }
      }
    } catch (e) {
      status.connectionError = e instanceof Error ? e.message : "Failed to initialise SRC client";
    }

    // Advance srcOnboardingStep only as far as operations actually succeeded.
    // Step numbering matches the old 12-step DB convention (cert=5, conn=6, dept=7, ecr=8, cashier=9).
    let achievedStep = 5; // cert uploaded — this function was called, so cert is in DB
    if (status.connected) achievedStep = 6;
    if (status.connected && status.department) achievedStep = Math.max(achievedStep, 7);
    if (status.connected && status.activated) achievedStep = Math.max(achievedStep, 8);
    if (status.cashier) achievedStep = Math.max(achievedStep, 9);

    const currentStep = restaurant.srcOnboardingStep ?? 0;
    if (achievedStep > currentStep) {
      await prisma.restaurant.update({
        where: { id },
        data: { srcOnboardingStep: achievedStep },
      });
    }

    return NextResponse.json(status, { status: 200 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[post-cert-configure]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
