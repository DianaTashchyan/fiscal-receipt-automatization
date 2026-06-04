import { NextRequest, NextResponse } from "next/server";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { SrcConfigError } from "@/lib/src/errors";
import { requireAuth } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* allow empty body */ }

  const crn = body.crn ?? process.env.SRC_CRN;
  if (!crn || typeof crn !== "string" || crn.trim() === "") {
    return NextResponse.json(
      { success: false, error: "crn is required (provide in body or set SRC_CRN env)" },
      { status: 400 }
    );
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;

  try {
    const client = await resolveAdminSrcClient(restaurantId);
    const result = await client.checkConnection(crn);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
