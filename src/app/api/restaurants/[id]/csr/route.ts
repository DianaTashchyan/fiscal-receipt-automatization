// GET  /api/restaurants/:id/csr          — download CSR as .csr file
// GET  /api/restaurants/:id/csr?key=1    — download encrypted private key info (admin only)
//
// The CSR (Certificate Signing Request) is public — submit it to the SRC cabinet.
// The private key is never returned in plain text through this endpoint.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";
import { requireRestaurantAccess } from "@/lib/utils/auth";
import { decryptPrivateKey } from "@/lib/src/csr";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await requireRestaurantAccess(req, id);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      select: { tin: true, srcCsrPem: true, srcPrivateKeyEnc: true },
    });

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    if (!restaurant.srcCsrPem) {
      return NextResponse.json(
        { error: "No CSR found. Generate one first via POST /api/restaurants/:id/generate-csr" },
        { status: 404 }
      );
    }

    // ?key=1 downloads the private key (needed to build the .p12 after getting the SRC .crt)
    const wantsKey = req.nextUrl.searchParams.get("key") === "1";

    if (wantsKey) {
      if (!restaurant.srcPrivateKeyEnc) {
        return NextResponse.json({ error: "Private key not found" }, { status: 404 });
      }
      let privateKeyPem: string;
      try {
        privateKeyPem = decryptPrivateKey(restaurant.srcPrivateKeyEnc);
      } catch {
        return NextResponse.json(
          { error: "Failed to decrypt private key — CERT_ENCRYPTION_KEY may have changed" },
          { status: 500 }
        );
      }
      return new Response(privateKeyPem, {
        headers: {
          "Content-Type": "application/x-pem-file",
          "Content-Disposition": `attachment; filename="${restaurant.tin}.key.pem"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(restaurant.srcCsrPem, {
      headers: {
        "Content-Type": "application/pkcs10",
        "Content-Disposition": `attachment; filename="${restaurant.tin}.csr"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
