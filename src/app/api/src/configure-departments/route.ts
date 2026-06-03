import { NextRequest, NextResponse } from "next/server";
import { configureDepartments } from "@/lib/src/client";
import { SrcConfigError, SrcValidationError } from "@/lib/src/errors";
import { validateDepartments } from "@/lib/src/validation";

export async function POST(req: NextRequest) {
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

  if (!Array.isArray(body.departments) || body.departments.length === 0) {
    return NextResponse.json(
      { success: false, error: "departments must be a non-empty array of { dep: number, taxRegime: number }" },
      { status: 400 }
    );
  }

  try {
    validateDepartments(body.departments);
  } catch (err) {
    if (err instanceof SrcValidationError) {
      return NextResponse.json(
        { success: false, error: err.message, field: err.field },
        { status: 400 }
      );
    }
    throw err;
  }

  try {
    const result = await configureDepartments(crn as string, body.departments);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof SrcConfigError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}