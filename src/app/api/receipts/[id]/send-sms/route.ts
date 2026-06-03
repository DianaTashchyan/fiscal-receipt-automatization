import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma/client";

/**
 * POST /api/receipts/[id]/send-sms
 *
 * SMS delivery is not implemented — no SMS provider SDK is installed.
 * To enable SMS delivery:
 *   1. Choose a provider (e.g. Twilio, MessageBird, AMIO for Armenian numbers)
 *   2. Install their SDK
 *   3. Add SMS_PROVIDER, SMS_API_KEY (or equivalent) to environment variables
 *   4. Implement the send logic below and remove the 501 response
 *
 * Returns 501 until a provider is wired up so callers get a clear signal
 * instead of silent fake success.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({ where: { id } });
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const phone = body.phone || receipt.customerPhone;

  if (!phone) {
    return NextResponse.json({ error: "Customer phone is required" }, { status: 400 });
  }

  // Validate Armenian/international phone format (+374XXXXXXXX or similar)
  if (!/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
    return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
  }

  await prisma.receiptEvent.create({
    data: {
      receiptId: receipt.id,
      event: "SMS_DELIVERY_ATTEMPTED",
      fromStatus: receipt.status,
      toStatus: receipt.status,
      payload: { phone, error: "No SMS provider configured" },
    },
  });

  return NextResponse.json(
    {
      success: false,
      error: "SMS delivery is not yet configured. No SMS provider has been integrated.",
      configurationRequired: [
        "Install an SMS provider SDK (e.g. Twilio: npm install twilio)",
        "Add SMS_PROVIDER_ACCOUNT_SID and SMS_PROVIDER_AUTH_TOKEN environment variables",
        "Implement the send logic in /api/receipts/[id]/send-sms/route.ts",
      ],
    },
    { status: 501 }
  );
}