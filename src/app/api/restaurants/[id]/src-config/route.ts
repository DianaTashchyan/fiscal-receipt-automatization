// ============================================================
// /api/restaurants/:id/src-config
// Manage per-restaurant SRC certificate configuration.
//
// GET    — return cert status (configured/not, source, configuredAt). Never returns cert bytes or password.
// POST   — store a new cert. Accepts certBase64 or certPath + certPassword.
//          Validates the cert by attempting to build an https.Agent with it.
// DELETE — remove the stored cert (falls back to global env cert or fails with 503 in real mode).
// ============================================================

import https from "https";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { encryptCertPassword } from "@/lib/src/cert-crypto";
import { invalidateRestaurantSrcClient } from "@/lib/src/client";
import { isRealMode } from "@/lib/src/config";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        tin: true,
        crn: true,
        srcCertPath: true,
        srcConfiguredAt: true,
        // srcCertData and srcCertPassword are never returned — only their presence
        srcCertData: false,
        srcCertPassword: false,
      },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const r = await prisma.restaurant.findUnique({
      where: { id },
      select: { srcCertData: true, srcCertPassword: true, srcCertPath: true, srcConfiguredAt: true },
    });

    const certSource = r?.srcCertData
      ? "database"
      : r?.srcCertPath
        ? "file-path"
        : null;

    const globalEnvConfigured = Boolean(
      process.env.SRC_CERT_PATH && process.env.SRC_CERT_PASSWORD
    );

    return NextResponse.json({
      restaurantId: id,
      tin: restaurant.tin,
      crn: restaurant.crn,
      certSource,
      certConfiguredAt: r?.srcConfiguredAt ?? null,
      certFilePath: r?.srcCertPath ?? null,
      passwordSet: Boolean(r?.srcCertPassword),
      globalEnvCertConfigured: globalEnvConfigured,
      effectiveCertSource: certSource ?? (globalEnvConfigured ? "global-env" : "none"),
      readyForRealFiscalization:
        isRealMode() && (certSource !== null || globalEnvConfigured),
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const body = await req.json();
    const { certBase64, certPath, certPassword } = body as {
      certBase64?: string;
      certPath?: string;
      certPassword?: string;
    };

    if (!certPassword || typeof certPassword !== "string" || certPassword.trim() === "") {
      return NextResponse.json(
        { error: "certPassword is required" },
        { status: 400 }
      );
    }
    if (!certBase64 && !certPath) {
      return NextResponse.json(
        {
          error: "Provide either certBase64 (base64-encoded PKCS#12 bytes) or certPath (server file path)",
        },
        { status: 400 }
      );
    }

    // Resolve the cert buffer
    let pfxBuffer: Buffer;
    let storedCertData: Buffer | null = null;
    let storedCertPath: string | null = null;

    if (certBase64) {
      try {
        pfxBuffer = Buffer.from(certBase64, "base64");
      } catch {
        return NextResponse.json({ error: "certBase64 is not valid base64" }, { status: 400 });
      }
      storedCertData = pfxBuffer;
    } else {
      // certPath: read from disk to validate, but don't store the bytes
      const fs = await import("fs");
      try {
        pfxBuffer = fs.readFileSync(certPath!);
      } catch {
        return NextResponse.json(
          { error: `Certificate file not found or unreadable at: ${certPath}` },
          { status: 400 }
        );
      }
      storedCertPath = certPath!;
    }

    // Validate the cert + password by attempting to create an https.Agent
    try {
      new https.Agent({
        pfx: pfxBuffer,
        passphrase: certPassword,
        rejectUnauthorized: false, // validation only — we just check the cert parses
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: `Certificate validation failed — wrong password or invalid PKCS#12 format: ${(e as Error).message}`,
        },
        { status: 422 }
      );
    }

    // Encrypt the password before storing
    const encryptedPassword = encryptCertPassword(certPassword);

    await prisma.restaurant.update({
      where: { id },
      data: {
        // Prisma Bytes field expects Uint8Array; Buffer satisfies Uint8Array at runtime
        // but TypeScript is strict — use new Uint8Array() to satisfy the type checker.
        srcCertData: storedCertData ? new Uint8Array(storedCertData) : null,
        srcCertPath: storedCertPath,
        srcCertPassword: encryptedPassword,
        srcConfiguredAt: new Date(),
      },
    });

    // Invalidate the cached SRC client so the next receipt uses the new cert
    invalidateRestaurantSrcClient(id);

    return NextResponse.json({
      success: true,
      restaurantId: id,
      certSource: storedCertData ? "database" : "file-path",
      certFilePath: storedCertPath,
      configuredAt: new Date().toISOString(),
      message:
        "Certificate stored. Test the connection with POST /api/src/check-connection and run " +
        "POST /api/src/activate once before issuing real receipts.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { srcCertData: true, srcCertPath: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (!restaurant.srcCertData && !restaurant.srcCertPath) {
      return NextResponse.json(
        { error: "No restaurant-specific certificate is configured" },
        { status: 404 }
      );
    }

    await prisma.restaurant.update({
      where: { id },
      data: {
        srcCertData: null,
        srcCertPassword: null,
        srcCertPath: null,
        srcConfiguredAt: null,
      },
    });

    invalidateRestaurantSrcClient(id);

    const globalEnvFallback = Boolean(
      process.env.SRC_CERT_PATH && process.env.SRC_CERT_PASSWORD
    );

    return NextResponse.json({
      success: true,
      message: globalEnvFallback
        ? "Restaurant certificate removed. Falling back to global env cert (SRC_CERT_PATH)."
        : "Restaurant certificate removed. No global env cert is configured — real fiscalization will fail for this restaurant.",
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
