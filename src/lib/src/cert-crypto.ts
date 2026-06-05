// ============================================================
// src/lib/src/cert-crypto.ts
// AES-256-GCM encryption for SRC certificate passwords stored in the DB.
//
// Why encrypt in the DB at all? Defense in depth: the PKCS#12 cert itself is
// already password-protected, but if the DB is exfiltrated, an attacker still
// needs the password to use the cert. Encrypting at rest with a server-side key
// means both the DB dump AND the server env are required to extract usable creds.
//
// Key derivation: SHA-256(CERT_ENCRYPTION_KEY).
// IMPORTANT: if CERT_ENCRYPTION_KEY changes, all stored passwords must be
// re-encrypted. Store the key securely and never rotate it silently.
// ============================================================

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.CERT_ENCRYPTION_KEY;

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CERT_ENCRYPTION_KEY is not set. This variable is required in production to encrypt " +
        "certificate passwords and private keys stored in the database. " +
        "Generate one with: openssl rand -hex 32"
      );
    }
    // Development/test only: fall back so local runs without the key still work.
    // Never reached in production (throws above).
    const fallback = process.env.JWT_SECRET ?? "dev-only-fallback-change-in-production";
    return crypto.createHash("sha256").update(fallback).digest();
  }

  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt a plaintext password for storage in `Restaurant.srcCertPassword`.
 * Returns a compact string: `<iv_b64>:<tag_b64>:<ciphertext_b64>`.
 */
export function encryptCertPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a password previously encrypted with `encryptCertPassword`.
 * Throws if the ciphertext is malformed or the key is wrong (auth tag mismatch).
 */
export function decryptCertPassword(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password format — expected iv:tag:ciphertext");
  }
  const [ivB64, tagB64, encB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}

/** Returns true if the string looks like it was produced by encryptCertPassword. */
export function isEncryptedPassword(value: string): boolean {
  return value.split(":").length === 3;
}
