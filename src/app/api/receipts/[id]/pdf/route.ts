import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import prisma from "@/lib/prisma/client";

// Helvetica (WinAnsi) covers U+0020–U+00FF; replace everything outside that range.
function san(value: unknown): string {
  return (value ? String(value) : "-").replace(/[^ -ÿ]/g, "?");
}

// "12 639.00 AMD" — space-thousands, period-decimal
function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-.-- AMD";
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${dec} AMD`;
}

// VAT included-in-price calculation
function vatAmt(totalPrice: unknown, taxRegime: unknown): number {
  if (String(taxRegime ?? "0") === "1") {
    return Math.round(Number(totalPrice) * 20 / 120 * 100) / 100;
  }
  return 0;
}

function regimeTag(taxRegime: unknown): string {
  switch (String(taxRegime ?? "0")) {
    case "1": return "VAT 20% incl.";
    case "2": return "VAT exempt";
    case "3": return "Turnover tax";
    case "7": return "Micro enterprise";
    default:  return `Regime ${taxRegime}`;
  }
}

function pmtLabel(method: string): string {
  if (method === "CASH")  return "Cash";
  if (method === "CARD")  return "Non-cash";
  if (method === "MIXED") return "Mixed";
  return method;
}

// Wrap text to lines that fit within maxPx width at given font/size.
function wrapText(
  text: string, maxPx: number, size: number,
  f: Awaited<ReturnType<PDFDocument["embedFont"]>>,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (f.widthOfTextAtSize(cand, size) > maxPx && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["-"];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const forceDownload = new URL(req.url).searchParams.has("download");

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: { restaurant: true, cashier: true, items: true },
  });
  if (!receipt) return new Response("Receipt not found", { status: 404 });

  // QR: use the SRC fiscal URL when available, else encode fiscal number as text.
  const fiscalUrl    = receipt.qrData ?? receipt.qrUrl ?? null;
  const isRealUrl    = fiscalUrl?.startsWith("http") ?? false;
  const qrInput      = fiscalUrl ?? `Fiscal: ${receipt.fiscalNumber ?? receipt.id}`;
  const qrDataUrl    = await QRCode.toDataURL(qrInput, { margin: 1, errorCorrectionLevel: "M" });

  // Per-item VAT and grand total VAT
  const itemVats  = receipt.items.map(it => vatAmt(it.totalPrice, it.taxRegime));
  const totalVat  = Math.round(itemVats.reduce((s, v) => s + v, 0) * 100) / 100;

  // Page dimensions — generous per-item allowance so QR never clips.
  const W = 320;
  const H = 630 + receipt.items.length * 100;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([W, H]);
  const reg    = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bld    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const qrPng  = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

  const PL   = 18;           // left margin
  const PR   = W - 18;      // right edge
  const CW   = PR - PL;     // content width
  const BLK  = rgb(0, 0, 0);
  const GRY  = rgb(0.42, 0.42, 0.42);
  const LGRY = rgb(0.78, 0.78, 0.78);

  let y = H - 20;

  // ── Drawing helpers ──────────────────────────────────────────────────────

  const put = (text: string, x: number, sz: number, f = reg, color = BLK) =>
    page.drawText(text, { x, y, size: sz, font: f, color });

  const cen = (text: string, sz: number, f = reg, color = BLK) => {
    const w = f.widthOfTextAtSize(text, sz);
    put(text, (W - w) / 2, sz, f, color);
    y -= sz + 5;
  };

  const hr = (color = LGRY, thickness = 0.5) => {
    y -= 4;
    page.drawLine({ start: { x: PL, y }, end: { x: PR, y }, thickness, color });
    y -= 8;
  };

  // Left label (grey) + right value (black), both at same y, then advance y.
  const col2 = (
    left: string, right: string, sz = 8,
    lf = reg, rf = reg, lc = GRY, rc = BLK,
  ) => {
    put(left, PL, sz, lf, lc);
    const rw = rf.widthOfTextAtSize(right, sz);
    put(right, PR - rw, sz, rf, rc);
    y -= sz + 5;
  };

  // Right-aligned continuation (for wrapped address / date lines, no label).
  const col2r = (right: string, sz = 8, rf = reg, rc = BLK) => {
    const rw = rf.widthOfTextAtSize(right, sz);
    put(right, PR - rw, sz, rf, rc);
    y -= sz + 5;
  };

  // Dashed item separator.
  const dash = () => {
    y -= 3;
    let x = PL;
    while (x < PR) {
      page.drawLine({ start: { x, y }, end: { x: Math.min(x + 4, PR), y }, thickness: 0.4, color: LGRY });
      x += 7;
    }
    y -= 10;
  };

  // ── HEADER ───────────────────────────────────────────────────────────────
  const recNum = san(receipt.receiptNumber ?? receipt.srcReceiptId ?? receipt.fiscalNumber ?? receipt.id);
  cen(`RECEIPT  ${recNum}`, 13, bld);
  cen(san(receipt.restaurant.name), 11, bld);
  if (receipt.restaurant.websiteUrl) {
    cen(san(receipt.restaurant.websiteUrl), 7.5, reg, GRY);
  }
  hr(LGRY, 0.8);

  // ── COMPANY INFO ─────────────────────────────────────────────────────────
  // Date/time: prefer SRC fiscal time, fall back to receipt creation time.
  const ftDate = receipt.srcFiscalTime ? new Date(receipt.srcFiscalTime) : new Date(receipt.createdAt);
  const datePart = ftDate.toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Yerevan",
  });
  const timePart = ftDate.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Yerevan",
  });
  const dtStr = `${datePart} ${timePart} (Asia/Yerevan)`;

  const cashierStr = receipt.cashier
    ? `${san(receipt.cashier.name)} (${san(receipt.cashier.taxCashierId ?? "-")})`
    : "-";

  // Legal name
  col2("Legal name", san(receipt.restaurant.name).slice(0, 32));

  // Address — wrap across multiple right-aligned lines.
  const addrLines = wrapText(san(receipt.restaurant.address ?? "-"), CW - 60, 8, reg);
  col2("Address", addrLines[0]);
  for (let i = 1; i < Math.min(addrLines.length, 3); i++) col2r(addrLines[i]);

  col2("TIN",  san(receipt.restaurant.tin));
  col2("CRN",  san(receipt.restaurant.crn ?? "-"));
  col2("SN",   san(receipt.srcSn ?? "-"));

  // Date/time — wrap if needed.
  const dtLines = wrapText(dtStr, CW - 70, 8, reg);
  col2("Date / Time", dtLines[0]);
  for (let i = 1; i < dtLines.length; i++) col2r(dtLines[i]);

  col2("Cashier", cashierStr);
  hr(LGRY, 0.8);

  // ── OPERATION TYPE BANNER ─────────────────────────────────────────────────
  const opType   = receipt.receiptType === "RETURN" ? "RETURN" : "SALE";
  const bannerH  = 24;
  const bannerY  = y - bannerH + 4;
  page.drawRectangle({
    x: PL, y: bannerY, width: CW, height: bannerH,
    borderColor: BLK, borderWidth: 0.6, color: rgb(1, 1, 1),
  });
  const opW = bld.widthOfTextAtSize(opType, 12);
  page.drawText(opType, { x: (W - opW) / 2, y: bannerY + 7, size: 12, font: bld, color: BLK });
  y -= bannerH + 10;
  hr(LGRY, 0.8);

  // ── ITEMS ─────────────────────────────────────────────────────────────────
  receipt.items.forEach((item, i) => {
    const qty = Number(item.quantity);
    const vat = itemVats[i];

    // "1. Item name (goodCode)"
    const code    = item.goodCode ? ` (${san(item.goodCode)})` : "";
    const rawName = san(`${i + 1}. ${item.name}${code}`);
    // Trim to page width
    let nameFit = rawName;
    while (nameFit.length > 2 && bld.widthOfTextAtSize(nameFit, 8.5) > CW) {
      nameFit = nameFit.slice(0, -1);
    }
    put(nameFit, PL, 8.5, bld);
    y -= 14;

    const qtyStr = `${qty % 1 === 0 ? String(qty) : qty.toFixed(3)} ${san(item.unit || "pcs")}`;
    col2("Quantity", qtyStr);
    col2("Price", money(item.unitPrice));
    if (Number(item.discountAmount) > 0) {
      col2("Discount", `-${money(item.discountAmount)}`);
    }
    col2("SUBTOTAL", money(item.totalPrice), 8, bld, bld, BLK, BLK);

    // Department + VAT regime
    const deptTag = `Dept. ${san(item.departmentTaxId ?? "-")}  ${regimeTag(item.taxRegime)}`;
    put(deptTag, PL, 7, reg, GRY);
    y -= 11;

    if (vat > 0) col2("VAT 20%", money(vat), 7.5, reg, reg, GRY, GRY);

    if (i < receipt.items.length - 1) dash();
  });

  hr(LGRY, 0.8);

  // ── PAYMENT METHOD ────────────────────────────────────────────────────────
  if (receipt.paymentMethod === "MIXED") {
    if (Number(receipt.paidCashAmount ?? 0) > 0)
      col2("Cash",     money(receipt.paidCashAmount));
    if (Number(receipt.paidCardAmount ?? 0) > 0)
      col2("Non-cash", money(receipt.paidCardAmount));
  } else {
    col2(pmtLabel(receipt.paymentMethod), money(receipt.totalAmount));
  }
  hr(LGRY, 0.8);

  // ── GRAND TOTAL ───────────────────────────────────────────────────────────
  col2("TOTAL", money(receipt.totalAmount), 11, bld, bld, BLK, BLK);
  if (totalVat > 0) col2("VAT 20%", money(totalVat), 8, reg, reg, GRY, GRY);
  hr(LGRY, 0.8);

  // ── FISCAL NUMBER ─────────────────────────────────────────────────────────
  if (receipt.fiscalNumber) {
    cen(`(F) Fiscal receipt:  ${san(receipt.fiscalNumber)}`, 9, bld);
    hr(LGRY, 0.8);
  }

  // ── QR CODE ───────────────────────────────────────────────────────────────
  const qrSize = 130;
  y -= 6;
  page.drawImage(qrPng, { x: (W - qrSize) / 2, y: y - qrSize, width: qrSize, height: qrSize });
  y -= qrSize + 10;

  // Show fiscal URL below QR only when it's a real HTTP URL.
  if (isRealUrl && fiscalUrl) {
    const urlSan = san(fiscalUrl);
    let rem = urlSan;
    while (rem) {
      let chunk = rem;
      while (chunk.length > 1 && reg.widthOfTextAtSize(chunk, 6.5) > CW) chunk = chunk.slice(0, -1);
      const cw = reg.widthOfTextAtSize(chunk, 6.5);
      put(chunk, (W - cw) / 2, 6.5, reg, GRY);
      y -= 10;
      rem = rem.slice(chunk.length);
      if (!rem.trim()) break;
    }
  }

  hr(LGRY, 0.5);

  // ── FOOTER ────────────────────────────────────────────────────────────────
  cen("Consumer rights protection agency: competition.am", 6.5, reg, GRY);
  cen(`Generated via ${san(receipt.restaurant.websiteUrl ?? "fiscal-receipt.glana.am")}`, 6.5, reg, GRY);

  // ── OUTPUT ────────────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  const filename  = `receipt-${san(receipt.receiptNumber ?? id)}.pdf`;
  const disp = forceDownload
    ? `attachment; filename="${filename}"`
    : `inline; filename="${filename}"`;

  return new Response(Buffer.from(pdfBytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": disp },
  });
}
