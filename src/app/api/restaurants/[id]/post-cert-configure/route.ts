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
//   2. Department: uses existing if present; otherwise auto-creates "Main Department" placeholder.
//      The taxDepartmentId and taxRegime must be entered manually (from SRC cabinet) via the
//      PATCH /api/restaurants/:id/departments/:deptId endpoint in the onboarding wizard step 5.
//   3. Cashier: uses existing if present; otherwise auto-creates "Online Cashier" placeholder.
//      The taxCashierId must be entered manually (from SRC cabinet) via the
//      PATCH /api/restaurants/:id/cashiers/:cashierId endpoint in the onboarding wizard step 5.
//   4. Calls checkConnection to verify mTLS.
//   5. Calls activate to move ECR to active state.
//   6. Calls configureDepartments with the stored taxRegime (only if taxDepartmentId/taxRegime are set).
//   7. Auto-generates an API key if none exists (raw key returned once — client must display and copy it).
//   8. Advances srcOnboardingStep for each step that succeeded.
//
// How CRN is obtained:
//   SRC names the signed certificate file "{TIN}_{CRN}.crt" (e.g. "00493113_52014201.crt").
//   The upload-crt route parses this filename and stores the CRN before this route runs.
//   This is the primary path (same as VCR). The certificate-body extraction is a fallback.

import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { generateApiKey, hashApiKey } from "@/lib/utils/auth";
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
  department: { id: string; name: string; taxDepartmentId: string | null; taxRegime: string | null } | null;
  departmentError: string | null;
  cashier: { id: string; name: string; taxCashierId: string | null } | null;
  cashierError: string | null;
  connected: boolean;
  connectionError: string | null;
  activated: boolean;
  activationError: string | null;
  isMockMode: boolean;
  generatedApiKey: string | null;
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
        apiKeys:     { where: { isActive: true }, select: { id: true } },
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
      generatedApiKey: null,
    };

    // ── 1. Resolve CRN ──────────────────────────────────────────────────────
    if (restaurant.crn) {
      status.crn = restaurant.crn;
      status.crnSource = "database";
    } else if (restaurant.srcCertData && restaurant.srcCertPassword) {
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
      return NextResponse.json(status, { status: 200 });
    }

    const crn = status.crn;

    // ── 2. Department — auto-create placeholder if none exists ───────────────
    // taxDepartmentId is always set to "1" because we define department numbers ourselves
    // (they are not assigned by SRC). We push dep=1 to SRC via configureDepartments.
    if (restaurant.departments.length > 0) {
      const existing = restaurant.departments[0];
      if (!existing.taxDepartmentId) {
        await prisma.department.update({ where: { id: existing.id }, data: { taxDepartmentId: "1" } });
        status.department = { ...existing, taxDepartmentId: "1" };
      } else {
        status.department = existing;
      }
    } else {
      const newDept = await prisma.department.create({
        data: {
          restaurantId: id,
          name: "Main Department",
          isDefault: true,
          isActive: true,
          taxDepartmentId: "1",
        },
      });
      status.department = { id: newDept.id, name: newDept.name, taxDepartmentId: "1", taxRegime: null };
    }

    // ── 3. Cashier — auto-create placeholder if none exists ──────────────────
    if (restaurant.cashiers.length > 0) {
      status.cashier = restaurant.cashiers[0];
    } else {
      const newCashier = await prisma.cashier.create({
        data: {
          restaurantId: id,
          name: "Online Cashier",
          isDefault: true,
          isActive: true,
        },
      });
      status.cashier = { id: newCashier.id, name: newCashier.name, taxCashierId: null };
    }

    // ── 4. SRC connection + activation ──────────────────────────────────────
    try {
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
          if (/195|196|already active/i.test(msg)) {
            status.activated = true;
          } else {
            status.activationError = msg;
          }
        }
      }

      // Configure department only when both taxDepartmentId and taxRegime are set
      if (
        status.department &&
        status.department.taxDepartmentId &&
        status.department.taxRegime &&
        (status.connected || isMock)
      ) {
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

    // ── 5. Auto-generate API key if none exists ──────────────────────────────
    if (restaurant.apiKeys.length === 0) {
      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey);
      await prisma.restaurantApiKey.create({
        data: { restaurantId: id, keyHash, label: "POS Terminal", isActive: true },
      });
      status.generatedApiKey = rawKey;
    }

    // Advance srcOnboardingStep only as far as operations actually succeeded.
    // Step numbering: cert=5, conn=6, dept=7, ecr=8, cashier=9, apiKey=11.
    let achievedStep = 5;
    if (status.connected) achievedStep = 6;
    if (status.connected && status.department) achievedStep = Math.max(achievedStep, 7);
    if (status.connected && status.activated) achievedStep = Math.max(achievedStep, 8);
    if (status.cashier) achievedStep = Math.max(achievedStep, 9);
    if (status.generatedApiKey || restaurant.apiKeys.length > 0) achievedStep = Math.max(achievedStep, 11);

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
