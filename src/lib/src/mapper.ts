// ============================================================
// src/lib/src/mapper.ts
// Maps local (DB / form) receipt data to the SRC `print` payload and
// normalizes SRC responses back into fields we persist on Receipt.
// ============================================================

import { money, quantity } from "./validation";
import { MODE, PrintMode, SrcPrintInput, SrcPrintItem, SrcPrintResult } from "./types";

export type LocalSaleItem = {
  name: string;
  goodCode: string;
  adgCode: string;
  unit: string;
  departmentTaxId: string; // dep number, stored as string locally
  quantity: number | string;
  unitPrice: number | string;
};

export type LocalSaleInput = {
  crn: string;
  cashierId: number | string;
  paymentMethod?: "CASH" | "CARD" | "MIXED" | "ONLINE";
  totalAmount: number | string;
  partnerTin?: string | null;
  prePaymentAmount?: number | string;
  partialAmount?: number | string;
  mode?: PrintMode;
  items: LocalSaleItem[];
};

/** Split the total into card/cash buckets based on payment method. */
function splitPayment(input: LocalSaleInput): {
  cardAmount: number;
  cashAmount: number;
} {
  const total = money(input.totalAmount);
  if (input.paymentMethod === "CASH") {
    return { cardAmount: 0, cashAmount: total };
  }
  // CARD / MIXED / ONLINE -> treat as non-cash by default for the MVP.
  return { cardAmount: total, cashAmount: 0 };
}

export function mapToSrcPrintInput(input: LocalSaleInput): SrcPrintInput {
  const mode: PrintMode = input.mode ?? MODE.PRODUCTS;
  const { cardAmount, cashAmount } = splitPayment(input);

  const base: SrcPrintInput = {
    crn: input.crn,
    cardAmount,
    cashAmount,
    partialAmount: money(input.partialAmount ?? 0),
    prePaymentAmount: money(input.prePaymentAmount ?? 0),
    cashierId: Number(input.cashierId),
    mode,
    partnerTin: input.partnerTin ?? null,
    items: null,
  };

  if (mode === MODE.PREPAYMENT) {
    return base;
  }

  const items: SrcPrintItem[] = input.items.map((it) => ({
    adgCode: it.adgCode,
    dep: Number(it.departmentTaxId),
    goodCode: it.goodCode.slice(0, 50),
    goodName: it.name.slice(0, 50),
    quantity: quantity(it.quantity),
    unit: it.unit.slice(0, 50),
    price: money(it.unitPrice),
  }));

  return { ...base, items };
}

/** Normalize an SRC print result into the columns we store on Receipt. */
export function mapSrcResultToReceiptFields(result: SrcPrintResult) {
  return {
    srcReceiptId: result.receiptId != null ? String(result.receiptId) : null,
    receiptNumber: result.receiptId != null ? String(result.receiptId) : null,
    fiscalNumber: result.fiscal ?? null,
    srcSn: result.sn ?? null,
    srcTin: result.tin ?? null,
    srcTaxpayer: result.taxpayer ?? null,
    srcAddress: result.address ?? null,
    srcFiscalTime: result.time ? new Date(result.time) : null,
    srcTotal: result.total != null ? money(result.total) : null,
    srcChange: result.change != null ? money(result.change) : null,
    qrData: result.qr ?? null,
  };
}
