import { NextRequest, NextResponse } from "next/server";
import { nextSeq } from "@/lib/src/sequence";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { SrcConfigError, SrcValidationError } from "@/lib/src/errors";
import { validatePrintInput } from "@/lib/src/validation";
import type { SrcPrintInput } from "@/lib/src/types";
import { requireAuth } from "@/lib/utils/auth";

export async function POST(req: NextRequest) {
  try { await requireAuth(req); } catch (err) {
    if (err instanceof NextResponse) return err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const crn = body.crn ?? process.env.SRC_CRN;
  if (!crn || typeof crn !== "string" || crn.trim() === "") {
    return NextResponse.json(
      { success: false, error: "crn is required (provide in body or set SRC_CRN env)" },
      { status: 400 }
    );
  }

  const requiredNumeric = ["cashierId", "mode"] as const;
  for (const field of requiredNumeric) {
    if (body[field] === undefined || body[field] === null) {
      return NextResponse.json(
        { success: false, error: `${field} is required` },
        { status: 400 }
      );
    }
  }

  const mode = Number(body.mode);
  if (mode !== 2 && mode !== 3) {
    return NextResponse.json(
      { success: false, error: "mode must be 2 (products) or 3 (prepayment)" },
      { status: 400 }
    );
  }

  const payload: SrcPrintInput = {
    crn: crn as string,
    cardAmount: Number(body.cardAmount ?? 0),
    cashAmount: Number(body.cashAmount ?? 0),
    partialAmount: Number(body.partialAmount ?? 0),
    prePaymentAmount: Number(body.prePaymentAmount ?? 0),
    cashierId: Number(body.cashierId),
    mode: mode as 2 | 3,
    partnerTin: body.partnerTin != null ? String(body.partnerTin) : null,
    items: (body.items as SrcPrintInput["items"]) ?? null,
  };

  try {
    validatePrintInput(payload);
  } catch (err) {
    if (err instanceof SrcValidationError) {
      return NextResponse.json(
        { success: false, error: err.message, field: err.field },
        { status: 400 }
      );
    }
    throw err;
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;

  try {
    const seq = await nextSeq(payload.crn);
    const client = await resolveAdminSrcClient(restaurantId);
    const result = await client.print(payload, seq);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    if (error instanceof SrcValidationError) {
      return NextResponse.json(
        { success: false, error: error.message, field: error.field },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}