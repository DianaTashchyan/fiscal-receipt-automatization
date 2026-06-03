// ============================================================
// src/lib/src/client.ts
// Public entry point for the SRC integration.
//
// Picks the mock or real client based on env (TAX_API_MODE / SRC_MODE),
// pulls the next persistent `seq` for seq-bearing methods, and exposes
// thin typed wrappers used by the API routes and the fiscal service.
//
// Architecture: Frontend -> Next API -> fiscal service -> THIS -> provider -> DB
// No SRC logic lives in React components.
// ============================================================

import { getSrcMode } from "./config";
import { MockSrcClient } from "./mock-client";
import { RealSrcClient } from "./real-client";
import { nextSeq } from "./sequence";
import {
  ISrcClient,
  SrcDepartment,
  SrcPrintInput,
  SrcReturnInput,
} from "./types";

let cachedClient: ISrcClient | null = null;
let cachedMode: string | null = null;

/**
 * Resolve the active client. The real client is constructed lazily so mock
 * mode never touches certificates. Re-created if the mode env changes.
 */
export function getSrcClient(): ISrcClient {
  const mode = getSrcMode();
  if (cachedClient && cachedMode === mode) return cachedClient;

  cachedClient = mode === "src_real" ? new RealSrcClient() : new MockSrcClient();
  cachedMode = mode;
  return cachedClient;
}

/** Test-only: clear the cached client (e.g. after changing env in a test). */
export function _resetSrcClient(): void {
  cachedClient = null;
  cachedMode = null;
}

// ---- Methods WITHOUT seq ----

export function checkConnection(crn: string) {
  return getSrcClient().checkConnection(crn);
}

export function activate(crn: string) {
  return getSrcClient().activate(crn);
}

export function getGoodList(params: {
  crn: string;
  taxRegime: number;
  tin: string;
}) {
  return getSrcClient().getGoodList(params);
}

// ---- Methods WITH seq (seq pulled from persistent store) ----

export async function configureDepartments(
  crn: string,
  departments: SrcDepartment[]
) {
  const seq = await nextSeq(crn);
  return getSrcClient().configureDepartments(crn, seq, departments);
}

export async function printReceipt(input: SrcPrintInput) {
  const seq = await nextSeq(input.crn);
  return getSrcClient().print(input, seq);
}

export async function printCopy(crn: string, receiptId: string | number) {
  const seq = await nextSeq(crn);
  return getSrcClient().printCopy(crn, seq, receiptId);
}

export async function getReturnedReceiptInfo(
  crn: string,
  receiptId: string | number
) {
  const seq = await nextSeq(crn);
  return getSrcClient().getReturnedReceiptInfo(crn, seq, receiptId);
}

export async function printReturnReceipt(input: SrcReturnInput) {
  const seq = await nextSeq(input.crn);
  return getSrcClient().printReturnReceipt(input, seq);
}
