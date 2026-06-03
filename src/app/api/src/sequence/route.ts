// ============================================================
// GET  /api/src/sequence?crn=<crn>  — peek the current seq without incrementing
// POST /api/src/sequence             — { crn, value } seed/override the seq
//
// Use POST when migrating from another system that has already used SRC.
// SRC returns error 104 (INVALID_SEQ) if the sent seq ≤ the last accepted
// value. Use peekSeq to read the current value and setSeq to fast-forward
// to the correct starting point.
//
// WARNING: Setting seq incorrectly (too low) causes INVALID_SEQ errors on
// every subsequent receipt. Setting it too high wastes seq numbers but is
// safe. When in doubt, set it to the last known SRC seq + 1000.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { peekSeq, setSeq } from "@/lib/src/sequence";
import { isValidCrn } from "@/lib/src/validation";

export async function GET(req: NextRequest) {
  const crn = req.nextUrl.searchParams.get("crn") ?? process.env.SRC_CRN;

  if (!crn || !isValidCrn(crn)) {
    return NextResponse.json(
      { success: false, error: "crn query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const lastSeq = await peekSeq(crn);
    return NextResponse.json({
      success: true,
      crn,
      lastSeq,
      nextSeq: lastSeq + 1,
      note: "lastSeq is the last value sent to SRC. nextSeq is what the next call will use.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const crn = body.crn ?? process.env.SRC_CRN;
  if (!crn || typeof crn !== "string" || !isValidCrn(crn)) {
    return NextResponse.json(
      { success: false, error: "crn is required" },
      { status: 400 }
    );
  }

  const value = Number(body.value);
  if (!Number.isInteger(value) || value < 0) {
    return NextResponse.json(
      { success: false, error: "value must be a non-negative integer (the last seq accepted by SRC)" },
      { status: 400 }
    );
  }

  try {
    const before = await peekSeq(crn);
    await setSeq(crn, value);
    const after = await peekSeq(crn);

    return NextResponse.json({
      success: true,
      crn,
      before,
      after,
      nextSeq: after + 1,
      warning:
        value < before
          ? `WARNING: You decreased the seq from ${before} to ${value}. ` +
            "If SRC already processed requests with seq > ${value}, those calls will fail with INVALID_SEQ (104)."
          : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
