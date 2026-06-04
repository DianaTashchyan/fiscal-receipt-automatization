// POST /api/restaurants/:id/post-cert-configure
//
// Automatic post-certificate-upload configuration.
// Called immediately after .crt upload succeeds.
//
// What it does (in order):
//   1. Tries to extract CRN from the stored certificate (Subject CN, SAN, serialNumber, extensions).
//      The SRC manual does not document which cert field carries the CRN — this is best-effort.
//   2. In mock mode: auto-assigns CRN if not found anywhere.
//   3. In real mode: returns a clear error if CRN cannot be determined automatically.
//   4. Creates a default department (dep 1 / Main / VAT) if the restaurant has none.
//   5. Creates a default cashier (taxCashierId=1 / Default Cashier / random PIN) if none exist.
//   6. Calls checkConnection to verify mTLS.
//   7. Calls activate to move ECR to active state.
//   8. Advances srcOnboardingStep.
//
// Why CRN cannot always be auto-fetched:
//   The SRC VCR API (taxservice.am/taxsystem-rs-vcr) has no getCRN or getDeviceInfo endpoint.
//   Every API call *sends* the CRN; none *return* it. CRN is issued by SRC via the u6
//   approval process (paper/web form), not through the VCR web service.
//   Some SRC CA implementations embed the CRN in the signed certificate — we try that here.
//
// Why cashier ID cannot be fetched:
//   The SRC VCR API has no getCashierList or getCashierInfo endpoint.
//   The print method accepts cashierId as input; SRC does not expose a read API for it.
//   We default to ID=1 which SRC assigns to the first registered cashier after u6 approval.

import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
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

    // ── 2. Department (auto-create if missing) ──────────────────────────────
    if (restaurant.departments.length > 0) {
      status.department = restaurant.departments[0];
    } else {
      try {
        const dept = await prisma.department.create({
          data: {
            restaurantId: id,
            name: "Main",
            taxDepartmentId: "1",
            taxRegime: "1",
            isDefault: true,
            isActive: true,
          },
          select: { id: true, name: true, taxDepartmentId: true, taxRegime: true },
        });
        status.department = dept;
      } catch (e) {
        status.departmentError = `Failed to create department: ${e instanceof Error ? e.message : "unknown"}`;
      }
    }

    // ── 3. Cashier (auto-create if missing, ID=1 = SRC's first cashier) ──────
    if (restaurant.cashiers.length > 0) {
      status.cashier = restaurant.cashiers[0];
    } else {
      try {
        const autoPin = randomBytes(2).toString("hex"); // 4 hex chars
        const cashier = await prisma.cashier.create({
          data: {
            restaurantId: id,
            name: "Default Cashier",
            taxCashierId: "1",
            pinCodeHash: await hash(autoPin, 12),
            isDefault: true,
            isActive: true,
          },
          select: { id: true, name: true, taxCashierId: true },
        });
        status.cashier = cashier;
      } catch (e) {
        status.cashierError = `Failed to create cashier: ${e instanceof Error ? e.message : "unknown"}`;
      }
    }

    // ── 4. SRC connection + activation ──────────────────────────────────────
    try {
      const certConfig = resolveRestaurantCertConfig({
        id: restaurant.id,
        tin: restaurant.tin,
        crn,
        srcCertData: restaurant.srcCertData,
        srcCertPassword: restaurant.srcCertPassword,
        srcCertPath: restaurant.srcCertPath,
      });

      // We need to import the real client directly when we have a resolved cert config
      const { RealSrcClient } = await import("@/lib/src/real-client");
      const client = isMock
        ? await resolveAdminSrcClient(id)
        : new RealSrcClient(certConfig);

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

      // Configure department with SRC if we have one
      if (status.department && (status.connected || isMock)) {
        try {
          const seq = await nextSeq(crn);
          await client.configureDepartments(crn, seq, [{ dep: 1, taxRegime: 1 }]);
        } catch {
          // Non-fatal — department config may already exist in SRC
        }
      }
    } catch (e) {
      status.connectionError = e instanceof Error ? e.message : "Failed to initialise SRC client";
    }

    // Advance onboarding step
    const targetStep = 9; // past CRN(4) + cert(5) + connection(6) + dept(7) + activation(8) + cashier(9)
    await prisma.restaurant.update({
      where: { id },
      data: { srcOnboardingStep: targetStep },
    });

    return NextResponse.json(status, { status: 200 });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[post-cert-configure]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
