// ============================================================
// src/lib/src/client.ts
// Public entry point for the SRC integration.
//
// Two client factories:
//   getSrcClient()                  — global env cert (admin/test routes)
//   getRestaurantSrcClient(id, cfg) — per-restaurant cert (receipt flow)
//
// Mock mode always returns a single shared MockSrcClient regardless of
// which factory is used. Real mode creates one RealSrcClient per restaurant
// (keyed by restaurantId) with an https.Agent that reuses TCP connections.
//
// Architecture: Route → service → THIS → provider → DB
// ============================================================

import { getSrcMode, RealCertConfig } from "./config";
import { MockSrcClient } from "./mock-client";
import { RealSrcClient } from "./real-client";
import { nextSeq } from "./sequence";
import {
  ISrcClient,
  SrcDepartment,
  SrcPrintInput,
  SrcReturnInput,
} from "./types";

// ---- Global env-cert singleton (used by admin/test routes) ----

let cachedClient: ISrcClient | null = null;
let cachedMode: string | null = null;

export function getSrcClient(): ISrcClient {
  const mode = getSrcMode();
  if (cachedClient && cachedMode === mode) return cachedClient;
  cachedClient = mode === "src_real" ? new RealSrcClient() : new MockSrcClient();
  cachedMode = mode;
  return cachedClient;
}

export function _resetSrcClient(): void {
  cachedClient = null;
  cachedMode = null;
  restaurantClientCache.clear();
}

// ---- Per-restaurant client cache ----
// Keyed by restaurant ID. Cache is invalidated when a restaurant's cert is
// updated (call invalidateRestaurantSrcClient after storing the new cert).

const restaurantClientCache = new Map<string, ISrcClient>();

/**
 * Return a client configured for a specific restaurant.
 * In mock mode returns the shared mock instance (cert config is ignored).
 * In real mode returns a cached RealSrcClient for this restaurant's cert.
 */
export function getRestaurantSrcClient(
  restaurantId: string,
  certConfig: RealCertConfig
): ISrcClient {
  if (getSrcMode() !== "src_real") {
    if (!cachedClient) cachedClient = new MockSrcClient();
    return cachedClient;
  }

  const cached = restaurantClientCache.get(restaurantId);
  if (cached) return cached;

  const client = new RealSrcClient(certConfig);
  restaurantClientCache.set(restaurantId, client);
  return client;
}

/**
 * Remove a restaurant's cached client so the next call creates a fresh one
 * with the updated cert. Call after storing a new cert via /api/restaurants/:id/src-config.
 */
export function invalidateRestaurantSrcClient(restaurantId: string): void {
  restaurantClientCache.delete(restaurantId);
}

// ---- Methods WITHOUT seq (global env cert — for admin/test routes) ----

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

// ---- Methods WITH seq (global env cert) ----

export async function configureDepartments(
  crn: string,
  departments: SrcDepartment[]
) {
  const seq = await nextSeq(crn);
  return getSrcClient().configureDepartments(crn, seq, departments);
}

/**
 * Print a receipt.
 * Pass `client` to use a per-restaurant cert (receipt fiscalization flow).
 * Omit to use the global env cert (direct SRC admin routes).
 */
export async function printReceipt(
  input: SrcPrintInput,
  client?: ISrcClient
) {
  const seq = await nextSeq(input.crn);
  return (client ?? getSrcClient()).print(input, seq);
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
