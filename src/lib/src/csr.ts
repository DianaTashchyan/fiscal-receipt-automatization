// ============================================================
// src/lib/src/csr.ts
// RSA key pair generation + PKCS#10 CSR creation using node-forge.
//
// The SRC manual (§1) requires the CSR subject DN:
//   CN=<TIN> Tin, OU=<TIN> Tin, O=<TIN> Tin, L=Yerevan, ST=Yerevan, C=AM
//
// The private key is encrypted before storage (see cert-crypto.ts).
// The CSR is public — safe to return and download.
// ============================================================

import forge from "node-forge";
import { encryptCertPassword, decryptCertPassword } from "./cert-crypto";

export type GeneratedCsr = {
  csrPem: string;
  privateKeyEnc: string; // AES-256-GCM encrypted PEM
};

/**
 * Generate an RSA-2048 keypair and a CSR with the SRC-mandated DN.
 * Returns the CSR (public, shareable) and the encrypted private key.
 */
export function generateSrcCsr(tin: string): GeneratedCsr {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;

  // Exact DN from SRC manual §1
  csr.setSubject([
    { name: "commonName",             value: `${tin} Tin` },
    { name: "organizationalUnitName", value: `${tin} Tin` },
    { name: "organizationName",       value: `${tin} Tin` },
    { name: "localityName",           value: "Yerevan" },
    { name: "stateOrProvinceName",    value: "Yerevan" },
    { name: "countryName",            value: "AM" },
  ]);

  csr.sign(keys.privateKey, forge.md.sha256.create());

  const csrPem = forge.pki.certificationRequestToPem(csr);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const privateKeyEnc = encryptCertPassword(privateKeyPem);

  return { csrPem, privateKeyEnc };
}

/**
 * Decrypt and return the PEM private key from the encrypted string.
 * Only called when the customer needs to download the key to create a .p12.
 */
export function decryptPrivateKey(enc: string): string {
  return decryptCertPassword(enc);
}
