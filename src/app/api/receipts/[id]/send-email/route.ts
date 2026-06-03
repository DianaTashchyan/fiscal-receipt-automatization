import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import prisma from "@/lib/prisma/client";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  return { host, user, password, from, port, secure };
}

function isSmtpConfigured(): boolean {
  const { host, user, password, from } = getSmtpConfig();
  return Boolean(host && user && password && from);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const receipt = await prisma.receipt.findUnique({
      where: { id },
      include: { restaurant: true },
    });

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const email = body.email || receipt.customerEmail;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM environment variables.",
          configurationRequired: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"],
        },
        { status: 501 }
      );
    }

    const { host, user, password, from, port, secure } = getSmtpConfig();

    const transporter = nodemailer.createTransport({
      host: host!,
      port,
      secure,
      auth: { user: user!, pass: password! },
    });

    // Build the absolute PDF URL from request headers (works on Render + local)
    const requestUrl = new URL(req.url);
    const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
    const pdfUrl = `${baseUrl}/api/receipts/${receipt.id}/pdf`;

    const fiscalInfo = receipt.fiscalNumber
      ? `Fiscal #: ${receipt.fiscalNumber}`
      : "Receipt pending SRC fiscalization";

    await transporter.sendMail({
      from: from!,
      to: email,
      subject: `Your Fiscal Receipt — Order ${receipt.externalOrderId}`,
      text: [
        `Dear customer,`,
        ``,
        `Your fiscal receipt for order ${receipt.externalOrderId} is ready.`,
        ``,
        `Restaurant: ${receipt.restaurant.name}`,
        `Total: ${receipt.totalAmount} AMD`,
        `Payment: ${receipt.paymentMethod}`,
        `${fiscalInfo}`,
        ``,
        `View / download your receipt PDF:`,
        pdfUrl,
        ``,
        `This is an official fiscal receipt issued under Armenian SRC regulations.`,
      ].join("\n"),
      html: `
        <p>Dear customer,</p>
        <p>Your fiscal receipt for order <strong>${receipt.externalOrderId}</strong> is ready.</p>
        <table>
          <tr><td><strong>Restaurant:</strong></td><td>${receipt.restaurant.name}</td></tr>
          <tr><td><strong>Total:</strong></td><td>${receipt.totalAmount} AMD</td></tr>
          <tr><td><strong>Payment:</strong></td><td>${receipt.paymentMethod}</td></tr>
          <tr><td><strong>Fiscal:</strong></td><td>${receipt.fiscalNumber ?? "pending"}</td></tr>
        </table>
        <p><a href="${pdfUrl}">Download Receipt PDF</a></p>
        <p><small>This is an official fiscal receipt issued under Armenian SRC regulations.</small></p>
      `,
    });

    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { customerEmail: email, deliveryMethod: "EMAIL", sentAt: new Date() },
    });

    await prisma.receiptEvent.create({
      data: {
        receiptId: receipt.id,
        event: "EMAIL_SENT",
        fromStatus: receipt.status,
        toStatus: receipt.status,
        payload: { email, pdfUrl, smtpHost: host },
      },
    });

    return NextResponse.json({ success: true, email, pdfUrl });
  } catch (error) {
    console.error("[send-email]", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}