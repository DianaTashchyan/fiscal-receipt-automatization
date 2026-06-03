import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import prisma from "@/lib/prisma/client";
import { isRealMode, readSrcEnv } from "@/lib/src/config";
import { isValidCrn, isValidTin } from "@/lib/src/validation";
import { checkConnection } from "@/lib/src/client";
import { peekSeq } from "@/lib/src/sequence";

/**
 * POST /api/src/validate-company
 * Body: { restaurantId?, tin?, crn? }
 *
 * Produces a readiness checklist for real fiscalization. In mock mode the
 * certificate/connection checks are reported but do not block readiness for
 * demos; readyForRealFiscalization is only true when every real-mode
 * prerequisite is satisfied.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const env = readSrcEnv();

  let tin: string | null = body.tin ?? env.tin ?? null;
  let crn: string | null = body.crn ?? env.crn ?? null;

  let restaurantConfigured = false;
  let cashierConfigured = false;
  let departmentsConfigured = false;
  let productsConfigured = false;
  let defaultCashierTaxId: string | null = null;

  if (body.restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: body.restaurantId },
      include: {
        cashiers: { where: { isActive: true } },
        departments: { where: { isActive: true } },
        products: { where: { isActive: true }, take: 1 },
      },
    });

    if (restaurant) {
      restaurantConfigured = true;
      tin = tin ?? restaurant.tin;
      crn = crn ?? restaurant.crn;
      cashierConfigured = restaurant.cashiers.length > 0;
      departmentsConfigured = restaurant.departments.length > 0;
      productsConfigured = restaurant.products.length > 0;
      const defaultCashier = restaurant.cashiers.find((c) => c.isDefault);
      defaultCashierTaxId = defaultCashier?.taxCashierId ?? null;
    }
  }

  const tinValid = isValidTin(tin);
  const crnValid = isValidCrn(crn);

  // Certificate presence (real mode needs a readable PKCS#12 + password).
  let certificatesConfigured = false;
  if (env.certPath && env.certPassword) {
    try {
      certificatesConfigured = fs.existsSync(env.certPath);
    } catch {
      certificatesConfigured = false;
    }
  }

  // Live connection check (best-effort). In mock mode this always succeeds.
  let srcConnectionAvailable = false;
  let srcConnectionError: string | null = null;
  if (crnValid) {
    try {
      const res = await checkConnection(crn as string);
      srcConnectionAvailable = res.code === 0;
    } catch (e) {
      srcConnectionAvailable = false;
      srcConnectionError = e instanceof Error ? e.message : String(e);
    }
  }

  // Current seq for this CRN
  let currentSeq: number | null = null;
  if (crnValid) {
    try {
      currentSeq = await peekSeq(crn as string);
    } catch { /* DB may not be available */ }
  }

  const realMode = isRealMode();

  const readyForRealFiscalization =
    realMode &&
    tinValid &&
    crnValid &&
    restaurantConfigured &&
    cashierConfigured &&
    departmentsConfigured &&
    certificatesConfigured &&
    srcConnectionAvailable;

  return NextResponse.json({
    mode: env.mode,
    tinValid,
    crnValid,
    tin,
    crn,
    restaurantConfigured,
    cashierConfigured,
    departmentsConfigured,
    productsConfigured,
    certificatesConfigured,
    certPath: env.certPath,
    srcConnectionAvailable,
    srcConnectionError,
    currentSeq,
    nextSeq: currentSeq !== null ? currentSeq + 1 : null,
    defaultCashierTaxId,
    readyForRealFiscalization,
    missingItems: [
      !tinValid && "Valid 8-digit TIN (SRC_TIN)",
      !crnValid && "CRN (SRC_CRN)",
      !restaurantConfigured && body.restaurantId && "Restaurant not found in database",
      !cashierConfigured && "Active cashier with taxCashierId",
      !departmentsConfigured && "Active department with taxDepartmentId and taxRegime",
      !productsConfigured && "Active products with goodCode and adgCode",
      !certificatesConfigured && realMode && "PKCS#12 certificate (SRC_CERT_PATH + SRC_CERT_PASSWORD)",
      !srcConnectionAvailable && realMode && `SRC connection failed: ${srcConnectionError ?? "unknown"}`,
    ].filter(Boolean),
  });
}
