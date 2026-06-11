/**
 * TEMPORARY DIAGNOSTIC — remove after investigation.
 *
 * Runs the exact same certificate + TLS flow that post-cert-configure executes,
 * and returns every intermediate result including raw errors.
 *
 * Protected by X-Debug-Token header. Must match DEBUG_PROBE_TOKEN env var,
 * or the hardcoded fallback below.
 *
 * Usage:
 *   curl -X POST https://<host>/api/debug/src-probe \
 *     -H "X-Debug-Token: src-probe-glana-2026" \
 *     -H "Content-Type: application/json" \
 *     -d '{"restaurantId":"<id>"}'
 */

import tls from "tls";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { resolveRestaurantCertConfig } from "@/lib/src/config";
import { RealSrcClient } from "@/lib/src/real-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_TOKEN = process.env.DEBUG_PROBE_TOKEN ?? "src-probe-glana-2026";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-debug-token") ?? "";
  if (token !== DEBUG_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { restaurantId?: string };
  const restaurantId = body.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const report: Record<string, unknown> = {
    ts: new Date().toISOString(),
    node: process.version,
    openssl: process.versions.openssl,
    restaurantId,
  };

  // ── 1. Load restaurant cert fields ──────────────────────────────────────────
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true, tin: true, crn: true,
      srcCertData: true, srcCertPassword: true,
      srcCertPath: true, srcPrivateKeyEnc: true,
    },
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  report.crn = restaurant.crn;
  report.srcCertData = restaurant.srcCertData
    ? `present (${restaurant.srcCertData.length} bytes)`
    : "null";
  report.srcCertPassword = restaurant.srcCertPassword ? "present" : "null";
  report.srcPrivateKeyEnc = restaurant.srcPrivateKeyEnc ? "present" : "null";

  const crn = restaurant.crn;
  if (!crn) {
    report.abort = "crn is null — cannot proceed";
    return NextResponse.json(report, { status: 200 });
  }

  // ── 2. Resolve cert config ───────────────────────────────────────────────────
  let certConfig;
  try {
    certConfig = resolveRestaurantCertConfig({
      id: restaurant.id,
      tin: restaurant.tin,
      crn: restaurant.crn,
      srcCertData: restaurant.srcCertData,
      srcCertPassword: restaurant.srcCertPassword,
      srcCertPath: restaurant.srcCertPath,
      srcPrivateKeyEnc: restaurant.srcPrivateKeyEnc,
    });
    report.certConfigSource = certConfig.source;
    report.pfxSize = certConfig.pfx ? certConfig.pfx.length : "n/a (PEM mode)";
    report.hasCertPassword = !!certConfig.certPassword;
  } catch (e) {
    report.certConfigError = (e as Error).message;
    return NextResponse.json(report, { status: 200 });
  }

  // ── 3. tls.createSecureContext — exactly what RealSrcClient hits lazily ──────
  try {
    tls.createSecureContext({ pfx: certConfig.pfx, passphrase: certConfig.certPassword });
    report.tlsCreateSecureContext = "OK";
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    report.tlsCreateSecureContext = `FAILED: code=${err.code} message=${err.message}`;
    // Do NOT abort — continue so we see what happens at the network layer too
  }

  // ── 4. Construct RealSrcClient (same as post-cert-configure line 234) ────────
  let client: RealSrcClient;
  try {
    client = new RealSrcClient(certConfig);
    report.clientConstruct = "OK";
  } catch (e) {
    report.clientConstructError = (e as Error).message;
    return NextResponse.json(report, { status: 200 });
  }

  // ── 5. checkConnection (same as post-cert-configure line 240) ────────────────
  report.checkConnection = {};
  try {
    const result = await client.checkConnection(crn);
    (report.checkConnection as Record<string, unknown>).code = result.code;
    (report.checkConnection as Record<string, unknown>).message = result.message;
    (report.checkConnection as Record<string, unknown>).connected = result.code === 0;
  } catch (e) {
    (report.checkConnection as Record<string, unknown>).error = (e as Error).message;
    (report.checkConnection as Record<string, unknown>).connected = false;
  }

  const connected = (report.checkConnection as Record<string, unknown>).connected === true;

  // ── 6. activate (same as post-cert-configure line 252) ───────────────────────
  report.activate = {};
  if (connected) {
    try {
      const result = await client.activate(crn);
      const activated = result.code === 0 || result.code === 195 || result.code === 196;
      (report.activate as Record<string, unknown>).code = result.code;
      (report.activate as Record<string, unknown>).message = result.message;
      (report.activate as Record<string, unknown>).activated = activated;
    } catch (e) {
      const msg = (e as Error).message;
      (report.activate as Record<string, unknown>).error = msg;
      (report.activate as Record<string, unknown>).activated = /195|196|already active/i.test(msg);
    }
  } else {
    (report.activate as Record<string, unknown>).skipped = "checkConnection did not succeed";
  }

  // ── 7. Final diagnosis ────────────────────────────────────────────────────────
  const tlsOk = report.tlsCreateSecureContext === "OK" ||
                (typeof report.tlsCreateSecureContext === "string" && report.tlsCreateSecureContext.startsWith("OK"));
  const checkOk = (report.checkConnection as Record<string, unknown>).connected === true;
  const activateOk = (report.activate as Record<string, unknown>).activated === true;

  if (!tlsOk) {
    report.verdict = "A — TLS certificate loading fails (tls.createSecureContext rejected the PKCS#12)";
  } else if (!checkOk) {
    const err = String((report.checkConnection as Record<string, unknown>).error ?? "");
    if (/403|UNAUTHORIZED|unauthorized/i.test(err)) {
      report.verdict = "B — SRC rejects connection (IP not registered or cert not accepted by SRC)";
    } else {
      report.verdict = "E — TLS OK, SRC checkConnection failed for another reason";
    }
  } else if (!activateOk) {
    report.verdict = "C — TLS OK, checkConnection OK, SRC rejects activation";
  } else {
    report.verdict = "D or E — TLS OK, connection OK, activation OK — problem is elsewhere (seq, payload, or department config)";
  }

  return NextResponse.json(report, { status: 200 });
}
