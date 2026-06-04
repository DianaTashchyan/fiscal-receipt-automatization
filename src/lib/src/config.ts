// ============================================================
// src/lib/src/config.ts
// Central configuration & mode resolution for the SRC integration.
//
// Two independent flags exist for historical/compat reasons:
//   - TAX_API_MODE = "mock" | "src_real"   (preferred; drives the client)
//   - SRC_MODE     = "mock" | "real"       (legacy alias, still honored)
// Either being set to a "real" value selects the real client.
//
// Cert resolution priority (per-restaurant, evaluated at runtime):
//   1. Restaurant.srcCertData  (PKCS#12 bytes stored in DB)
//   2. Restaurant.srcCertPath  (file path stored in DB)
//   3. Global env SRC_CERT_PATH  (single operator-wide cert via env var)
// ============================================================

import fs from "fs";
import { SrcConfigError } from "./errors";
import { decryptCertPassword } from "./cert-crypto";

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
    certPath: process.env.SRC_CERT_PATH ?? null,
    caCertPath: process.env.SRC_CA_CERT_PATH ?? null,
    keyPath: process.env.SRC_KEY_PATH ?? null,
    certPassword: process.env.SRC_CERT_PASSWORD ?? null,
  };
}

// ============================================================
// RealCertConfig — holds RESOLVED cert bytes, not a file path.
// The cert is loaded from whatever source is appropriate
// (DB bytes, file path, or env path) before the client is built.
// ============================================================

export type RealCertConfig = {
  pfx: Buffer;            // PKCS#12 binary, ready to pass to https.Agent
  certPassword: string;   // decrypted passphrase for the PKCS#12 bundle
  caCertPath: string | null;
  baseUrl: string;
  language: "hy" | "en" | "ru";
  /** For diagnostics: which source provided the cert. */
  source: "env" | "db" | "db-path";
};

/**
 * Resolve cert config from the global environment variables.
 * Loads the cert file from disk and returns the buffer.
 * Throws SrcConfigError with actionable messages if anything is missing.
 *
 * Note on certificates: the SRC manual produces a Java keystore (.jks). Node's
 * TLS stack cannot read .jks directly, so we require a PKCS#12 bundle (.p12/.pfx)
 * at SRC_CERT_PATH (convert once with `keytool -importkeystore ... -deststoretype PKCS12`).
 */
export function getRealCertConfig(): RealCertConfig {
  const env = readSrcEnv();

  if (!env.crn) throw new SrcConfigError("SRC_CRN is not set");
  if (!env.tin) throw new SrcConfigError("SRC_TIN is not set");
  if (!/^\d{8}$/.test(env.tin)) throw new SrcConfigError("SRC_TIN is invalid");

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

  let pfx: Buffer;
  try {
    pfx = fs.readFileSync(env.certPath);
  } catch {
    throw new SrcConfigError(
      `SRC certificate is missing or unreadable at SRC_CERT_PATH (${env.certPath})`
    );
  }

  return {
    pfx,
    certPassword: env.certPassword,
    caCertPath: env.caCertPath,
    baseUrl: env.baseUrl,
    language: env.language,
    source: "env",
  };
}

/**
 * The shape of a restaurant record that includes the cert fields.
 * The Prisma Bytes type maps to Buffer in Node.
 */
export type RestaurantCertFields = {
  id: string;
  tin: string;
  crn: string | null;   // null until CRN is received from SRC after u6 approval
  // Prisma Bytes type maps to Uint8Array at runtime (not Buffer)
  srcCertData: Uint8Array | null;
  srcCertPassword: string | null;
  srcCertPath: string | null;
};

/**
 * Resolve the cert config for a specific restaurant.
 *
 * Priority:
 *   1. Restaurant.srcCertData (bytes in DB) + srcCertPassword (encrypted) — preferred
 *   2. Restaurant.srcCertPath (file path in DB) + srcCertPassword (encrypted)
 *   3. Global env cert (SRC_CERT_PATH / SRC_CERT_PASSWORD) — fallback
 *
 * Throws SrcConfigError if real mode is active and no cert is available.
 */
export function resolveRestaurantCertConfig(
  restaurant: RestaurantCertFields
): RealCertConfig {
  const env = readSrcEnv();
  const baseUrl = env.baseUrl;
  const language = env.language;
  const caCertPath = env.caCertPath;

  // 1. Cert bytes stored directly in DB
  if (restaurant.srcCertData && restaurant.srcCertPassword) {
    let certPassword: string;
    try {
      certPassword = decryptCertPassword(restaurant.srcCertPassword);
    } catch (e) {
      throw new SrcConfigError(
        `Failed to decrypt certificate password for restaurant ${restaurant.id} — ` +
          `check that CERT_ENCRYPTION_KEY has not changed. Error: ${(e as Error).message}`
      );
    }
    return {
      // Convert Uint8Array (Prisma Bytes) to Buffer (Node TLS requires Buffer)
      pfx: Buffer.from(restaurant.srcCertData),
      certPassword,
      caCertPath,
      baseUrl,
      language,
      source: "db",
    };
  }

  // 2. File path stored in DB
  if (restaurant.srcCertPath && restaurant.srcCertPassword) {
    let pfx: Buffer;
    try {
      pfx = fs.readFileSync(restaurant.srcCertPath);
    } catch {
      throw new SrcConfigError(
        `Certificate file not found at Restaurant.srcCertPath (${restaurant.srcCertPath}) ` +
          `for restaurant ${restaurant.id}`
      );
    }
    let certPassword: string;
    try {
      certPassword = decryptCertPassword(restaurant.srcCertPassword);
    } catch (e) {
      throw new SrcConfigError(
        `Failed to decrypt certificate password for restaurant ${restaurant.id}: ${(e as Error).message}`
      );
    }
    return {
      pfx,
      certPassword,
      caCertPath,
      baseUrl,
      language,
      source: "db-path",
    };
  }

  // 3. Fall back to global env cert
  return getRealCertConfig();
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
