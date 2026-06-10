// ============================================================
// src/lib/src/real-client.ts
// Real SRC client. Talks to the taxservice web service over mutual TLS
// (the PKCS#12 certificate IS the credential — there is no API key).
//
// Cert resolution happens BEFORE this class is constructed:
//   - resolveRestaurantCertConfig(restaurant) → RealCertConfig.pfx
//   - getRealCertConfig() → loads from env SRC_CERT_PATH
// The constructor receives a fully-resolved RealCertConfig; it never
// touches the file system. This allows both DB-stored and file-based
// certs to work identically.
//
// Key facts from the manual / README:
//   - All calls: POST {root}/api/v1.0/{method}, JSON, UTF-8.
//   - `language` header: hy | en | ru.
//   - Auth = client certificate presented over TLS; the registered IP must
//     match the outbound IP or SRC returns 403 UNAUTHORIZED_CONNECTION.
//   - Node cannot read .jks; we require a PKCS#12 (.p12) buffer.
//   - Every request includes crn; seq-bearing methods include seq.
// ============================================================

import fs from "fs";
import https from "https";
import { URL } from "url";
import { getRealCertConfig, RealCertConfig } from "./config";
import { SrcConfigError, SrcError } from "./errors";
import {
  ISrcClient,
  SrcDepartment,
  SrcGoodListResult,
  SrcPrintInput,
  SrcPrintResult,
  SrcResponse,
  SrcReturnedReceiptInfoResult,
  SrcReturnInput,
} from "./types";

const TIMEOUT_MS = 30_000;

export class RealSrcClient implements ISrcClient {
  readonly mode = "src_real" as const;
  private cfg: RealCertConfig;
  private agent: https.Agent;

  constructor(cfg?: RealCertConfig) {
    this.cfg = cfg ?? getRealCertConfig();

    let ca: Buffer | undefined;
    if (this.cfg.caCertPath) {
      try {
        ca = fs.readFileSync(this.cfg.caCertPath);
      } catch {
        throw new SrcConfigError(
          `SRC_CA_CERT_PATH is set but unreadable (${this.cfg.caCertPath})`
        );
      }
    }

    this.agent = new https.Agent({
      ...(this.cfg.cert
        ? { cert: this.cfg.cert, key: this.cfg.key }
        : { pfx: this.cfg.pfx, passphrase: this.cfg.certPassword }),
      ca,
      keepAlive: true,
      rejectUnauthorized: true,
    });
  }

  private async post<T>(
    method: string,
    body: Record<string, unknown>
  ): Promise<SrcResponse<T>> {
    const url = new URL(`${this.cfg.baseUrl}/api/v1.0/${method}`);
    const payload = JSON.stringify(body);

    const raw = await new Promise<{ status: number; text: string }>(
      (resolve, reject) => {
        const req = https.request(
          {
            method: "POST",
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            agent: this.agent,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Length": Buffer.byteLength(payload),
              language: this.cfg.language,
            },
            timeout: TIMEOUT_MS,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(c as Buffer));
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                text: Buffer.concat(chunks).toString("utf8"),
              })
            );
          }
        );
        req.on("timeout", () =>
          req.destroy(new SrcError(`SRC request timed out after ${TIMEOUT_MS}ms`))
        );
        req.on("error", (e) =>
          reject(new SrcError(`SRC transport error: ${e.message}`))
        );
        req.write(payload);
        req.end();
      }
    );

    let json: SrcResponse<T>;
    try {
      json = JSON.parse(raw.text) as SrcResponse<T>;
    } catch {
      throw new SrcError(
        `Non-JSON response from SRC (HTTP ${raw.status}): ${raw.text.slice(0, 300)}`,
        { httpStatus: raw.status }
      );
    }

    if (json.code !== 0) {
      const errMsg = json.errorMessage || json.message || `SRC error code ${json.code}`;

      if (json.code === 104) {
        throw new SrcError(
          `SRC rejected the request sequence number (INVALID_SEQ, code 104). ` +
          `The seq counter may be out of sync with SRC. ` +
          `Use GET /api/src/sequence?crn=<crn> to inspect the current counter ` +
          `and POST /api/src/sequence with { crn, value } to resync it to the ` +
          `last seq SRC accepted. SRC message: ${errMsg}`,
          { code: json.code, srcMessage: json.message, errorMessage: json.errorMessage ?? null, httpStatus: raw.status }
        );
      }

      if (raw.status === 403 || String(json.code) === "403") {
        throw new SrcError(
          `SRC rejected the connection (UNAUTHORIZED_CONNECTION). ` +
          `The outbound IP of this server must be registered in the SRC u6 application ` +
          `under "IP address" (section 5.2). If this server is on Render, use a static ` +
          `outbound IP add-on and register that IP with SRC. SRC message: ${errMsg}`,
          { code: json.code, srcMessage: json.message, errorMessage: json.errorMessage ?? null, httpStatus: raw.status }
        );
      }

      throw new SrcError(errMsg, {
        code: json.code,
        srcMessage: json.message,
        errorMessage: json.errorMessage ?? null,
        httpStatus: raw.status,
      });
    }
    return json;
  }

  async checkConnection(crn: string) {
    return this.post<string>("checkConnection", { crn });
  }

  async activate(crn: string) {
    return this.post<string>("activate", { crn });
  }

  async configureDepartments(
    crn: string,
    seq: number,
    departments: SrcDepartment[]
  ) {
    return this.post<string>("configureDepartments", { crn, seq, departments });
  }

  async getGoodList(params: { crn: string; taxRegime: number; tin: string }) {
    return this.post<SrcGoodListResult>("getGoodList", { ...params });
  }

  async print(input: SrcPrintInput, seq: number) {
    return this.post<SrcPrintResult>("print", { ...input, seq });
  }

  async printCopy(crn: string, seq: number, receiptId: string | number) {
    return this.post<SrcPrintResult>("printCopy", { crn, seq, receiptId });
  }

  async getReturnedReceiptInfo(
    crn: string,
    seq: number,
    receiptId: string | number
  ) {
    return this.post<SrcReturnedReceiptInfoResult>("getReturnedReceiptInfo", {
      crn,
      seq,
      receiptId,
    });
  }

  async printReturnReceipt(input: SrcReturnInput, seq: number) {
    return this.post<SrcPrintResult>("printReturnReceipt", { ...input, seq });
  }
}
