import { NextRequest, NextResponse } from "next/server";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { SrcConfigError } from "@/lib/src/errors";
import { requireAuth } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
  try {
    try { await requireAuth(req); } catch (err) {
      if (err instanceof NextResponse) return err;
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const crn = body.crn ?? process.env.SRC_CRN;
    const tin = body.tin ?? process.env.SRC_TIN;
    const taxRegime = body.taxRegime ?? 1;
    const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;

    if (!crn) {
      return NextResponse.json({ error: "crn is required" }, { status: 400 });
    }
    if (!tin) {
      return NextResponse.json({ error: "tin is required" }, { status: 400 });
    }

    const client = await resolveAdminSrcClient(restaurantId);
    const result = await client.getGoodList({ crn, tin, taxRegime });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
