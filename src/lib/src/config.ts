// ============================================================
// src/lib/src/config.ts
// Central configuration & mode resolution for the SRC integration.
//
// Two independent flags exist for historical/compat reasons:
//   - TAX_API_MODE = "mock" | "src_real"   (preferred; drives the client)
//   - SRC_MODE     = "mock" | "real"       (legacy alias, still honored)
// Either being set to a "real" value selects the real client.
// ============================================================

import { SrcConfigError } from "./errors";

export type SrcMode = "mock" | "src_real";

export const SRC_DEFAULTS = {
  productionBaseUrl: "https://ecrm.taxservice.am/taxsystem-rs-vcr",
  testBaseUrl: "https://10.3.14.123:447",
};

/** Resolve the effective mode from env. Defaults to mock for safe demos. */
export function getSrcMode(): SrcMode {
  const taxApiMode = (process.env.TAX_API_MODE ?? "").toLowerCase();
  const srcMode = (process.env.SRC_MODE ?? "").toLowerCase();

  if (taxApiMode === "src_real" || taxApiMode === "real") return "src_real";
  if (srcMode === "real" || srcMode === "src_real") return "src_real";
  return "mock";
}

export function isRealMode(): boolean {
  return getSrcMode() === "src_real";
}

/** Base URL: explicit override -> production default. Test URL via SRC_TEST_BASE_URL. */
export function getBaseUrl(): string {
  return (
    process.env.SRC_BASE_URL?.replace(/\/+$/, "") ??
    SRC_DEFAULTS.productionBaseUrl
  );
}

export function getLanguage(): "hy" | "en" | "ru" {
  const lang = (process.env.SRC_LANGUAGE ?? "en").toLowerCase();
  if (lang === "hy" || lang === "en" || lang === "ru") return lang;
  return "en";
}

/** Plain (non-throwing) view of the env, used by /validate-company checklist. */
export function readSrcEnv() {
  return {
    mode: getSrcMode(),
    baseUrl: getBaseUrl(),
    testBaseUrl: process.env.SRC_TEST_BASE_URL ?? SRC_DEFAULTS.testBaseUrl,
    language: getLanguage(),
    tin: process.env.SRC_TIN ?? null,
    crn: process.env.SRC_CRN ?? null,
    cashierId: process.env.SRC_CASHIER_ID ?? null,
    jksPath: process.env.SRC_JKS_PATH ?? null,
    jksPassword: process.env.SRC_JKS_PASSWORD ?? null,
    // For Node TLS we need a PKCS#12 (.p12/.pfx) or PEM cert/key pair.
    certPath: process.env.SRC_CERT_PATH ?? null,
    caCertPath: process.env.SRC_CA_CERT_PATH ?? null,
    keyPath: process.env.SRC_KEY_PATH ?? null,
    certPassword: process.env.SRC_CERT_PASSWORD ?? null,
  };
}

export type RealCertConfig = {
  certPath: string;
  certPassword: string;
  caCertPath: string | null;
  baseUrl: string;
  language: "hy" | "en" | "ru";
};

/**
 * Validate the env required for REAL SRC calls and return a resolved config.
 * Throws SrcConfigError with the exact messages requested in the spec.
 *
 * Note on certificates: the SRC manual produces a Java keystore (.jks). Node's
 * TLS stack cannot read .jks directly, so for real mode we require a PKCS#12
 * bundle (.p12/.pfx) at SRC_CERT_PATH (convert once with `keytool
 * -importkeystore ... -deststoretype PKCS12`). SRC_JKS_PATH is still recorded
 * so operators know which keystore the .p12 came from.
 */
export function getRealCertConfig(): RealCertConfig {
  const env = readSrcEnv();

  if (!env.crn) throw new SrcConfigError("SRC_CRN is not set");
  if (!env.tin) throw new SrcConfigError("SRC_TIN is not set");
  if (!/^\d{8}$/.test(env.tin)) throw new SrcConfigError("SRC_TIN is invalid");

  // We need either a .p12 bundle OR a .jks to point at. The actual TLS material
  // used by Node is the .p12 (SRC_CERT_PATH).
  if (!env.certPath) {
    if (env.jksPath) {
      throw new SrcConfigError(
        "SRC_CERT_PATH is missing — Node needs a PKCS#12 (.p12) bundle; convert your .jks with `keytool -importkeystore`"
      );
    }
    throw new SrcConfigError("SRC certificate is missing");
  }
  if (!env.certPassword) {
    throw new SrcConfigError("SRC_CERT_PASSWORD is missing");
  }

  return {
    certPath: env.certPath,
    certPassword: env.certPassword,
    caCertPath: env.caCertPath,
    baseUrl: env.baseUrl,
    language: env.language,
  };
}

// Backwards-compatible export retained for any older imports.
export const SRC_CONFIG = {
  get baseUrl() {
    return getBaseUrl();
  },
  get crn() {
    return process.env.SRC_CRN;
  },
  get tin() {
    return process.env.SRC_TIN;
  },
  get language() {
    return getLanguage();
  },
};
