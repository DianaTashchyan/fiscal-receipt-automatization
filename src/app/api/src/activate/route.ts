import { NextRequest, NextResponse } from "next/server";
import { activate } from "@/lib/src/client";
import { SrcConfigError } from "@/lib/src/errors";

export async function POST(req: NextRequest) {
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

  try {
    const result = await activate(crn as string);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}