// ============================================================
// src/lib/src/startup-check.ts
// Validates the SRC configuration at application startup when
// TAX_API_MODE=src_real. Fails fast with a clear error message
// rather than discovering broken config on the first receipt attempt.
//
// Call validateSrcStartup() in instrumentation.ts (Next.js 13+).
// ============================================================

import fs from "fs";
import { getSrcMode, readSrcEnv } from "./config";
import { isValidTin, isValidCrn } from "./validation";

type CheckResult = {
  ok: boolean;
  check: string;
  detail: string;
};

export type StartupCheckReport = {
  mode: string;
  allPassed: boolean;
  checks: CheckResult[];
};

export function runSrcStartupChecks(): StartupCheckReport {
  const mode = getSrcMode();
  const env = readSrcEnv();
  const checks: CheckResult[] = [];

  const pass = (check: string, detail: string): CheckResult =>
    ({ ok: true, check, detail });
  const fail = (check: string, detail: string): CheckResult =>
    ({ ok: false, check, detail });

  // In mock mode we only verify the mode is correctly set — no cert checks.
  if (mode !== "src_real") {
    checks.push(pass("mode", `Running in mock mode (TAX_API_MODE=${env.mode}). Real SRC calls are disabled.`));
    return { mode, allPassed: true, checks };
  }

  // ---- Real mode checks ----

  checks.push(pass("mode", "TAX_API_MODE=src_real — real fiscalization is enabled"));

  // TIN
  if (!env.tin) {
    checks.push(fail("SRC_TIN", "SRC_TIN is not set. Obtain your 8-digit TIN (ՀՎՀՀ) from the SRC cabinet."));
  } else if (!isValidTin(env.tin)) {
    checks.push(fail("SRC_TIN", `SRC_TIN="${env.tin}" is invalid — must be exactly 8 digits.`));
  } else {
    checks.push(pass("SRC_TIN", `TIN: ${env.tin}`));
  }

  // CRN
  if (!env.crn) {
    checks.push(fail("SRC_CRN", "SRC_CRN is not set. Obtain the ECR registration number (ՀԴՄ) from the SRC cabinet."));
  } else if (!isValidCrn(env.crn)) {
    checks.push(fail("SRC_CRN", "SRC_CRN is blank or whitespace-only."));
  } else {
    checks.push(pass("SRC_CRN", `CRN: ${env.crn}`));
  }

  // Certificate (PKCS#12)
  if (!env.certPath) {
    if (env.jksPath) {
      checks.push(fail(
        "SRC_CERT_PATH",
        `SRC_JKS_PATH is set (${env.jksPath}) but SRC_CERT_PATH is missing. ` +
        "Node cannot read .jks files. Convert with: ./scripts/convert-jks-to-p12.sh <TIN> <jksPass> <p12Pass>"
      ));
    } else {
      checks.push(fail(
        "SRC_CERT_PATH",
        "SRC_CERT_PATH is not set. A PKCS#12 (.p12) certificate bundle is required for mTLS. " +
        "Generate and convert with the scripts in ./scripts/."
      ));
    }
  } else {
    let certReadable = false;
    try {
      certReadable = fs.existsSync(env.certPath);
    } catch { /* ignore */ }

    if (!certReadable) {
      checks.push(fail("SRC_CERT_PATH", `Certificate file not found or unreadable at: ${env.certPath}`));
    } else {
      checks.push(pass("SRC_CERT_PATH", `Certificate found at: ${env.certPath}`));
    }
  }

  // Certificate password
  if (!env.certPassword) {
    checks.push(fail("SRC_CERT_PASSWORD", "SRC_CERT_PASSWORD is not set. Required to decrypt the PKCS#12 bundle."));
  } else {
    checks.push(pass("SRC_CERT_PASSWORD", "SRC_CERT_PASSWORD is set"));
  }

  // Optional CA cert
  if (env.caCertPath) {
    let caReadable = false;
    try {
      caReadable = fs.existsSync(env.caCertPath);
    } catch { /* ignore */ }

    if (!caReadable) {
      checks.push(fail("SRC_CA_CERT_PATH", `CA certificate file not found at: ${env.caCertPath}`));
    } else {
      checks.push(pass("SRC_CA_CERT_PATH", `CA certificate found at: ${env.caCertPath}`));
    }
  } else {
    checks.push(pass("SRC_CA_CERT_PATH", "Not set (optional — server certificate chain validation disabled)"));
  }

  // Base URL
  checks.push(pass("SRC_BASE_URL", `Base URL: ${env.baseUrl}`));

  // Language
  checks.push(pass("SRC_LANGUAGE", `Language: ${env.language}`));

  const allPassed = checks.every((c) => c.ok);
  return { mode, allPassed, checks };
}

/**
 * Throw if any startup check fails. Call this from instrumentation.ts.
 * In production, a failed check means the app cannot fiscalize and should
 * not silently start accepting orders.
 */
export function validateSrcStartup(): void {
  const report = runSrcStartupChecks();
  if (!report.allPassed) {
    const failures = report.checks.filter((c) => !c.ok);
    const lines = failures.map((f) => `  [FAIL] ${f.check}: ${f.detail}`).join("\n");
    throw new Error(
      `SRC configuration is incomplete for real mode. Fix these issues before starting:\n${lines}`
    );
  }
  for (const check of report.checks) {
    console.info(`[SRC startup] ${check.ok ? "✓" : "✗"} ${check.check}: ${check.detail}`);
  }
}
