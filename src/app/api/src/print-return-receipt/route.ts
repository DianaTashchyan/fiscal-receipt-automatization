import { NextRequest, NextResponse } from "next/server";
import { nextSeq } from "@/lib/src/sequence";
import { resolveAdminSrcClient } from "@/lib/src/resolve-client";
import { SrcConfigError, SrcValidationError } from "@/lib/src/errors";
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

  const { receiptId, cardAmountForReturn, cashAmountForReturn, returnItemList } = body as {
    receiptId?: string | number;
    cardAmountForReturn?: unknown;
    cashAmountForReturn?: unknown;
    returnItemList?: unknown;
  };

  if (receiptId === undefined || receiptId === null) {
    return NextResponse.json({ success: false, error: "receiptId is required" }, { status: 400 });
  }

  if (!Array.isArray(returnItemList) || returnItemList.length === 0) {
    return NextResponse.json(
      { success: false, error: "returnItemList must be a non-empty array of { receiptProductId, quantity }" },
      { status: 400 }
    );
  }

  for (const rawItem of returnItemList as unknown[]) {
    const item = rawItem as Record<string, unknown>;
    if (
      typeof item !== "object" ||
      item === null ||
      !Number.isInteger(item.receiptProductId) ||
      !(Number(item.quantity) > 0)
    ) {
      return NextResponse.json(
        { success: false, error: "Each returnItemList entry must have integer receiptProductId and quantity > 0" },
        { status: 400 }
      );
    }
  }

  const cardAmt = Number(cardAmountForReturn ?? 0);
  const cashAmt = Number(cashAmountForReturn ?? 0);

  if (!Number.isFinite(cardAmt) || cardAmt < 0) {
    return NextResponse.json({ success: false, error: "cardAmountForReturn must be a non-negative number" }, { status: 400 });
  }
  if (!Number.isFinite(cashAmt) || cashAmt < 0) {
    return NextResponse.json({ success: false, error: "cashAmountForReturn must be a non-negative number" }, { status: 400 });
  }
  if (cardAmt + cashAmt <= 0) {
    return NextResponse.json(
      { success: false, error: "At least one of cardAmountForReturn or cashAmountForReturn must be greater than 0" },
      { status: 400 }
    );
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;

  try {
    const seq = await nextSeq(crn as string);
    const client = await resolveAdminSrcClient(restaurantId);
    const result = await client.printReturnReceipt(
      {
        crn: crn as string,
        receiptId,
        cardAmountForReturn: cardAmt,
        cashAmountForReturn: cashAmt,
        returnItemList: returnItemList as Array<{ receiptProductId: number; quantity: number }>,
      },
      seq
    );
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    if (error instanceof SrcValidationError) {
      return NextResponse.json({ success: false, error: error.message, field: error.field }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
