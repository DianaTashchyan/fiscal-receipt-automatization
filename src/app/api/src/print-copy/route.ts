import { NextRequest, NextResponse } from "next/server";
import { printCopy } from "@/lib/src/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const crn = body.crn ?? process.env.SRC_CRN;
    const receiptId = body.receiptId;

    if (!crn) {
      return NextResponse.json({ error: "crn is required" }, { status: 400 });
    }
    if (receiptId === undefined || receiptId === null) {
      return NextResponse.json({ error: "receiptId is required" }, { status: 400 });
    }

    const result = await printCopy(crn, receiptId);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
