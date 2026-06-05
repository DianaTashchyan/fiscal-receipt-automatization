import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import prisma from "@/lib/prisma/client";

function money(value: unknown) {
  return `${Number(value).toFixed(2)} AMD`;
}

function text(value: unknown) {
  const s = value ? String(value) : "-";
  // StandardFonts (Helvetica) use WinAnsi which only covers U+0020–U+00FF.
  // Replace characters outside that range (e.g. Armenian script) with "?".
  return s.replace(/[^ -ÿ]/g, "?");
}

function short(value: unknown, max = 32) {
  const str = text(value);
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      restaurant: true,
      cashier: true,
      items: true,
    },
  });

  if (!receipt) {
    return new Response("Receipt not found", { status: 404 });
  }

  const qrText =
    receipt.qrData ??
    receipt.qrUrl ??
    `Receipt: ${receipt.fiscalNumber ?? receipt.id}`;

  const qrDataUrl = await QRCode.toDataURL(qrText);
  const qrBase64 = qrDataUrl.split(",")[1];

  const pdfDoc = await PDFDocument.create();

  const pageWidth = 320;
  const pageHeight = 850 + receipt.items.length * 48;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrBase64, "base64"));

  const createdDate = new Date(receipt.createdAt);
  let y = pageHeight - 35;

  const center = (value: string, size = 9, bold = false) => {
    const usedFont = bold ? boldFont : font;
    const width = usedFont.widthOfTextAtSize(value, size);

    page.drawText(value, {
      x: (pageWidth - width) / 2,
      y,
      size,
      font: usedFont,
      color: rgb(0, 0, 0),
    });

    y -= size + 6;
  };

  const line = () => {
    y -= 5;
    page.drawLine({
      start: { x: 18, y },
      end: { x: pageWidth - 18, y },
      thickness: 0.5,
      color: rgb(0.72, 0.72, 0.72),
    });
    y -= 14;
  };

  const row = (left: string, right: string, size = 8.2, bold = false) => {
    const usedFont = bold ? boldFont : font;

    page.drawText(left, {
      x: 18,
      y,
      size,
      font: usedFont,
    });

    const rightWidth = usedFont.widthOfTextAtSize(right, size);

    page.drawText(right, {
      x: pageWidth - 18 - rightWidth,
      y,
      size,
      font: usedFont,
    });

    y -= size + 6;
  };

  center("ELECTRONIC FISCAL RECEIPT", 13, true);
  center("SRC / HDM compatible structure", 7);
  center(text(receipt.restaurant.name), 11, true);
  center(short(receipt.restaurant.address, 42), 8);

  line();

  row("Taxpayer TIN", text(receipt.restaurant.tin));
  row("Cash Register CRN", text(receipt.restaurant.crn));
  row("Cash Register SN", text(receipt.srcSn ?? "-"));
  row("Receipt ID", text(receipt.receiptNumber));
  row("Fiscal Number", text(receipt.fiscalNumber));
  row("Order ID", text(receipt.externalOrderId));
  row("Cashier", text(receipt.cashier?.name));
  row("Cashier ID", text(receipt.cashier?.taxCashierId));
  row("Date", createdDate.toLocaleDateString());
  row("Time", createdDate.toLocaleTimeString());
  row("Payment", text(receipt.paymentMethod));
  row("Status", text(receipt.status));
  row("SRC Mode", text(receipt.srcMode ?? process.env.SRC_MODE ?? "mock"));

  line();

  center("ITEMS", 10, true);

  for (const item of receipt.items) {
    page.drawText(short(item.name, 36), {
      x: 18,
      y,
      size: 8.8,
      font: boldFont,
    });
    y -= 13;

    row(
      `${Number(item.quantity).toFixed(3)} ${item.unit} x ${money(item.unitPrice)}`,
      money(item.totalPrice),
      8
    );

    row("Good Code", text(item.goodCode), 7.2);
    row("ADG Code", text(item.adgCode), 7.2);
    row("Department", text(item.departmentTaxId), 7.2);
    row("Tax Regime", text(item.taxRegime), 7.2);

    if (Number(item.discountAmount) > 0) {
      row("Discount", money(item.discountAmount), 7.2);
    }

    y -= 4;
  }

  line();

  row("Cash Amount", receipt.paymentMethod === "CASH" ? money(receipt.totalAmount) : money(0), 9);
  row("Card Amount", receipt.paymentMethod !== "CASH" ? money(receipt.totalAmount) : money(0), 9);
  row("Partial Amount", money(0), 9);
  row("Prepayment Used", money(0), 9);

  line();

  row("Bill Amount", money(receipt.billAmount), 10);
  row("Tip", money(receipt.tipAmount), 10);
  row("TOTAL", money(receipt.totalAmount), 14, true);

  line();

  center("QR DATA", 9, true);

  const qrSize = 125;
  page.drawImage(qrImage, {
    x: (pageWidth - qrSize) / 2,
    y: y - qrSize,
    width: qrSize,
    height: qrSize,
  });

  y -= qrSize + 14;

  center("Scan QR code to verify receipt", 7.5);

  const qrLines = qrText.match(/.{1,42}/g) ?? [];
  for (const qrLine of qrLines.slice(0, 5)) {
    center(qrLine, 5.8);
  }

  line();

  center("Generated by Fiscal Receipt Service", 7);
  center("Real legal validity requires successful SRC fiscalization", 6);

  const pdfBytes = await pdfDoc.save();

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=receipt-${id}.pdf`,
    },
  });
}