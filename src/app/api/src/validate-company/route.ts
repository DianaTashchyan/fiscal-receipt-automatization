import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import prisma from "@/lib/prisma/client";
import { isRealMode, readSrcEnv } from "@/lib/src/config";
import { isValidCrn, isValidTin } from "@/lib/src/validation";
import { checkConnection } from "@/lib/src/client";
import { peekSeq } from "@/lib/src/sequence";
import { requireAuth } from "@/lib/utils/auth";

/**
 * POST /api/src/validate-company
 * Body: { restaurantId?, tin?, crn? }
 *
 * Produces a full readiness checklist for real fiscalization:
 *   - TIN and CRN validity
 *   - Restaurant / cashier / department / product configuration in DB
 *   - Certificate availability (per-restaurant DB cert or global env cert)
 *   - Live SRC connection test
 *   - Current seq counter
 */
export async function POST(req: NextRequest) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const env = readSrcEnv();

  let tin: string | null = body.tin ?? env.tin ?? null;
  let crn: string | null = body.crn ?? env.crn ?? null;

  let restaurantConfigured = false;
  let cashierConfigured = false;
  let departmentsConfigured = false;
  let productsConfigured = false;
  let defaultCashierTaxId: string | null = null;

  // ---- Per-restaurant cert status ----
  let restaurantCertSource: "database" | "file-path" | null = null;
  let restaurantCertReadable = false;

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

      // Check restaurant-level cert
      if (restaurant.srcCertData && restaurant.srcCertPassword) {
        restaurantCertSource = "database";
        restaurantCertReadable = true; // bytes are already in DB
      } else if (restaurant.srcCertPath && restaurant.srcCertPassword) {
        restaurantCertSource = "file-path";
        try {
          restaurantCertReadable = fs.existsSync(restaurant.srcCertPath);
        } catch {
          restaurantCertReadable = false;
        }
      }
    }
  }

  const tinValid = isValidTin(tin);
  const crnValid = isValidCrn(crn);

  // ---- Global env cert (fallback) ----
  let globalCertConfigured = false;
  if (env.certPath && env.certPassword) {
    try {
      globalCertConfigured = fs.existsSync(env.certPath);
    } catch {
      globalCertConfigured = false;
    }
  }

  // Effective cert: restaurant cert takes priority over global env cert
  const effectiveCertConfigured =
    restaurantCertReadable ||
    globalCertConfigured;

  const effectiveCertSource = restaurantCertReadable
    ? restaurantCertSource
    : globalCertConfigured
      ? "global-env"
      : null;

  // ---- Live connection check ----
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

  // ---- Current seq ----
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
    effectiveCertConfigured &&
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

    // Certificate status
    restaurantCertSource,
    restaurantCertReadable,
    globalCertConfigured,
    effectiveCertSource,
    certificatesConfigured: effectiveCertConfigured,
    certPath: env.certPath,

    srcConnectionAvailable,
    srcConnectionError,
    currentSeq,
    nextSeq: currentSeq !== null ? currentSeq + 1 : null,
    defaultCashierTaxId,
    readyForRealFiscalization,
    missingItems: [
      !tinValid && "Valid 8-digit TIN (SRC_TIN or restaurant.tin)",
      !crnValid && "CRN (SRC_CRN or restaurant.crn)",
      body.restaurantId && !restaurantConfigured && "Restaurant not found in database",
      !cashierConfigured && "Active cashier with taxCashierId",
      !departmentsConfigured && "Active department with taxDepartmentId and taxRegime",
      !productsConfigured && "Active products with goodCode and adgCode",
      !effectiveCertConfigured && realMode &&
        "PKCS#12 certificate — upload via POST /api/restaurants/:id/src-config or set SRC_CERT_PATH + SRC_CERT_PASSWORD",
      !srcConnectionAvailable && realMode && `SRC connection failed: ${srcConnectionError ?? "unknown"}`,
    ].filter(Boolean),
  });
}
