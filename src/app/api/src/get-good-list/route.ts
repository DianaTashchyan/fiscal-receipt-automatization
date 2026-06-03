import { NextRequest, NextResponse } from "next/server";
import { getGoodList } from "@/lib/src/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const crn = body.crn ?? process.env.SRC_CRN;
    const tin = body.tin ?? process.env.SRC_TIN;
    const taxRegime = body.taxRegime ?? 1;

    if (!crn) {
      return NextResponse.json(
        { error: "crn is required" },
        { status: 400 }
      );
    }

    if (!tin) {
      return NextResponse.json(
        { error: "tin is required" },
        { status: 400 }
      );
    }

    const result = await getGoodList({
      crn,
      tin,
      taxRegime,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}