// ============================================================
// src/lib/src/mapper.ts
// Maps local (DB / form) receipt data to the SRC `print` payload and
// normalizes SRC responses back into fields we persist on Receipt.
// ============================================================

import { money, quantity } from "./validation";
import {
  DISCOUNT_TYPE,
  MODE,
  PrintMode,
  SrcPrintInput,
  SrcPrintItem,
  SrcPrintResult,
} from "./types";
import { SrcValidationError } from "./errors";

export type LocalSaleItem = {
  name: string;
  goodCode: string;
  adgCode: string;
  unit: string;
  departmentTaxId: string;
  quantity: number | string;
  unitPrice: number | string;
  /** Total AMD discount for this line (e.g. 500 = 500 AMD off the line total). */
  discountAmount?: number | string;
  /**
   * SRC discount type for this line.
   * 1 = PERCENT, 2 = PER_UNIT dram, 4 = TOTAL dram (default).
   * Only relevant when discountAmount > 0.
   */
  discountType?: number;
};

export type LocalSaleInput = {
  crn: string;
  cashierId: number | string;
  paymentMethod?: "CASH" | "CARD" | "MIXED" | "ONLINE";
  /**
   * The DB-stored total including tip. Used only for storage; NOT sent to SRC.
   * Use srcPaymentAmount for the SRC payment fields.
   */
  totalAmount: number | string;
  /**
   * The amount to send SRC as the payment (cardAmount + cashAmount combined).
   * Must exclude tips — SRC computes items total independently and flags
   * any payment that doesn't match. Equals billAmount (pre-tip).
   * Defaults to totalAmount if omitted (backward compat for tip-free receipts).
   */
  srcPaymentAmount?: number | string;
  /**
   * MIXED payments: explicit cash portion. Required when paymentMethod=MIXED.
   * cashAmount + cardAmount must equal srcPaymentAmount.
   */
  explicitCashAmount?: number | string;
  /**
   * MIXED payments: explicit card portion. Required when paymentMethod=MIXED.
   */
  explicitCardAmount?: number | string;
  partnerTin?: string | null;
  prePaymentAmount?: number | string;
  partialAmount?: number | string;
  mode?: PrintMode;
  items: LocalSaleItem[];
};

/**
 * Split the payment into SRC cashAmount and cardAmount.
 *
 * Rules:
 *   CASH           → cashAmount = srcPaymentAmount, cardAmount = 0
 *   CARD / ONLINE  → cardAmount = srcPaymentAmount, cashAmount = 0
 *   MIXED          → requires explicitCashAmount + explicitCardAmount
 *                    (their sum must equal srcPaymentAmount ± 0.01)
 */
function splitPayment(input: LocalSaleInput): {
  cardAmount: number;
  cashAmount: number;
} {
  const payAmt = money(input.srcPaymentAmount ?? input.totalAmount);

  if (input.paymentMethod === "CASH") {
    return { cardAmount: 0, cashAmount: payAmt };
  }
  if (input.paymentMethod === "CARD" || input.paymentMethod === "ONLINE") {
    return { cardAmount: payAmt, cashAmount: 0 };
  }
  if (input.paymentMethod === "MIXED") {
    if (
      input.explicitCashAmount === undefined ||
      input.explicitCardAmount === undefined
    ) {
      throw new SrcValidationError(
        "paymentMethod MIXED requires explicit cashAmount and cardAmount. " +
          "Both must be provided and must sum to billAmount.",
        "cashAmount"
      );
    }
    const cash = money(input.explicitCashAmount);
    const card = money(input.explicitCardAmount);
    const sum = money(cash + card);
    if (Math.abs(sum - payAmt) > 0.01) {
      throw new SrcValidationError(
        `MIXED cashAmount (${cash}) + cardAmount (${card}) = ${sum} ` +
          `but billAmount is ${payAmt}. They must match.`,
        "cashAmount"
      );
    }
    return { cashAmount: cash, cardAmount: card };
  }
  // Unknown paymentMethod — treat as card
  return { cardAmount: payAmt, cashAmount: 0 };
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

  const items: SrcPrintItem[] = input.items.map((it) => {
    const item: SrcPrintItem = {
      adgCode: it.adgCode,
      dep: Number(it.departmentTaxId),
      goodCode: it.goodCode.slice(0, 50),
      goodName: it.name.slice(0, 50),
      quantity: quantity(it.quantity),
      unit: it.unit.slice(0, 50),
      price: money(it.unitPrice),
    };

    const discAmt = it.discountAmount !== undefined ? Number(it.discountAmount) : 0;
    if (discAmt > 0) {
      item.discount = money(discAmt);
      item.discountType = it.discountType ?? DISCOUNT_TYPE.TOTAL;
    }

    return item;
  });

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
