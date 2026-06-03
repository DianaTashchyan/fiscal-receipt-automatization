// ============================================================
// src/lib/services/tax-api.service.ts
// Fiscal service layer. Sits between the Next API routes and the SRC
// provider: validates locally, maps to the SRC print payload, sends it
// (mock or real), and returns the normalized result to persist.
// ============================================================

import { printReceipt } from "@/lib/src/client";
import { getSrcMode } from "@/lib/src/config";
import { LocalSaleInput, mapToSrcPrintInput, mapSrcResultToReceiptFields } from "@/lib/src/mapper";
import {
  validatePaymentCoversTotal,
  validatePrintInput,
} from "@/lib/src/validation";
import { SrcConfigError } from "@/lib/src/errors";

export type RegisterSaleItem = {
  externalProductId: string | null;
  departmentTaxId: string;
  quantity: string;
  unitPrice: string;
  unit: string;
  name?: string;
  goodCode?: string;
  adgCode?: string;
};

export type RegisterSaleInput = {
  crn?: string;
  cashierTaxId: string;
  items: RegisterSaleItem[];
  totalAmount: string;
  customerEmail?: string | null;
  partnerTin?: string | null;
  paymentMethod?: "CASH" | "CARD" | "MIXED" | "ONLINE";
};

export type RegisterSaleResult = {
  fiscalNumber: string | null;
  receiptNumber: string | null;
  qrData: string | null;
  mode: "mock" | "src_real";
  fields: ReturnType<typeof mapSrcResultToReceiptFields>;
  rawResponse: unknown;
};

/**
 * Register a sale with the tax service (SRC). In mock mode it works without
 * certificates; in src_real mode it requires real env + certs (the client
 * throws SrcConfigError with a clear message if anything is missing).
 */
export async function registerSaleInTaxApi(
  input: RegisterSaleInput
): Promise<RegisterSaleResult> {
  const crn = input.crn ?? process.env.SRC_CRN;
  if (!crn) {
    throw new SrcConfigError("SRC_CRN is not set");
  }

  const local: LocalSaleInput = {
    crn,
    cashierId: Number(input.cashierTaxId),
    paymentMethod: input.paymentMethod ?? "CARD",
    totalAmount: input.totalAmount,
    partnerTin: input.partnerTin ?? null,
    items: input.items.map((it) => ({
      name: (it.name ?? it.externalProductId ?? "Item").toString(),
      goodCode: (it.goodCode ?? it.externalProductId ?? "UNKNOWN").toString(),
      adgCode: (it.adgCode ?? "0000").toString(),
      unit: it.unit,
      departmentTaxId: it.departmentTaxId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
  };

  const srcRequest = mapToSrcPrintInput(local);

  // Local validation against the manual's field rules BEFORE hitting SRC.
  validatePrintInput(srcRequest);
  validatePaymentCoversTotal(srcRequest);

  const srcResponse = await printReceipt(srcRequest);
  const result = srcResponse.result;
  if (!result) {
    throw new Error("SRC response result is empty");
  }

  const fields = mapSrcResultToReceiptFields(result);

  return {
    fiscalNumber: fields.fiscalNumber,
    receiptNumber: fields.receiptNumber,
    qrData: fields.qrData,
    mode: getSrcMode(),
    fields,
    rawResponse: { srcRequest, srcResponse },
  };
}
