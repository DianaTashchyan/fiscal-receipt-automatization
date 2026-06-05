// ============================================================
// src/lib/src/startup-check.ts
// Validates the SRC configuration at application startup when
// TAX_API_MODE=src_real. Fails fast with a clear error message
// rather than discovering broken config on the first receipt attempt.
//
// Certificate notes:
//   - If SRC_CERT_PATH is set, it is validated as the global fallback cert.
//   - Restaurants may also have their own cert stored in DB
//     (srcCertData / srcCertPath), which takes priority over the global cert.
//   - If neither global env cert NOR a restaurant cert is configured, the
//     first receipt for that restaurant will fail with a clear SrcConfigError.
//
// Call validateSrcStartup() in instrumentation.ts (Next.js 15+).
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
  const warn = (check: string, detail: string): CheckResult =>
    ({ ok: true, check, detail: `[WARN] ${detail}` });

  if (mode !== "src_real") {
    checks.push(pass("mode", `Running in mock mode (TAX_API_MODE=${env.mode}). Real SRC calls are disabled.`));
    return { mode, allPassed: true, checks };
  }

  // ---- Real mode checks ----

  checks.push(pass("mode", "TAX_API_MODE=src_real — real fiscalization is enabled"));

  // CERT_ENCRYPTION_KEY — required to decrypt stored cert passwords and private keys
  if (!process.env.CERT_ENCRYPTION_KEY) {
    checks.push(fail(
      "CERT_ENCRYPTION_KEY",
      "CERT_ENCRYPTION_KEY is not set. This key encrypts certificate passwords and RSA " +
        "private keys at rest in the database. Without it, certificate upload and all mTLS " +
        "operations will fail. Generate with: openssl rand -hex 32"
    ));
  } else {
    checks.push(pass("CERT_ENCRYPTION_KEY", "Set"));
  }

  // TIN (from env; individual restaurants may use their own tin field)
  if (!env.tin) {
    checks.push(warn(
      "SRC_TIN",
      "SRC_TIN is not set. Restaurants must have their own tin field configured. " +
        "Set SRC_TIN as a global default or ensure each restaurant's tin column is populated."
    ));
  } else if (!isValidTin(env.tin)) {
    checks.push(fail("SRC_TIN", `SRC_TIN="${env.tin}" is invalid — must be exactly 8 digits.`));
  } else {
    checks.push(pass("SRC_TIN", `Global TIN: ${env.tin}`));
  }

  // CRN (from env; individual restaurants may use their own crn field)
  if (!env.crn) {
    checks.push(warn(
      "SRC_CRN",
      "SRC_CRN is not set. Restaurants must have their own crn field configured."
    ));
  } else if (!isValidCrn(env.crn)) {
    checks.push(fail("SRC_CRN", "SRC_CRN is blank or whitespace-only."));
  } else {
    checks.push(pass("SRC_CRN", `Global CRN: ${env.crn}`));
  }

  // Global certificate (optional when restaurants have their own certs in DB)
  if (!env.certPath) {
    if (env.jksPath) {
      checks.push(fail(
        "SRC_CERT_PATH",
        `SRC_JKS_PATH is set (${env.jksPath}) but SRC_CERT_PATH is missing. ` +
        "Node cannot read .jks files. Convert with: ./scripts/convert-jks-to-p12.sh <TIN> <jksPass> <p12Pass>"
      ));
    } else {
      checks.push(warn(
        "SRC_CERT_PATH",
        "SRC_CERT_PATH is not set. No global fallback certificate configured. " +
          "Each restaurant must have its own certificate uploaded via " +
          "POST /api/restaurants/:id/src-config, otherwise real fiscalization will fail."
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
      checks.push(pass("SRC_CERT_PATH", `Global certificate found at: ${env.certPath}`));
    }
  }

  // Certificate password (required when certPath is set)
  if (env.certPath && !env.certPassword) {
    checks.push(fail("SRC_CERT_PASSWORD", "SRC_CERT_PASSWORD is not set. Required to decrypt the global PKCS#12 bundle."));
  } else if (env.certPath && env.certPassword) {
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

  checks.push(pass("SRC_BASE_URL", `Base URL: ${env.baseUrl}`));
  checks.push(pass("SRC_LANGUAGE", `Language: ${env.language}`));

  const allPassed = checks.every((c) => c.ok);
  return { mode, allPassed, checks };
}

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
