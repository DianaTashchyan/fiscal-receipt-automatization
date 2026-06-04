// ============================================================
// src/lib/services/tax-api.service.ts
// Fiscal service layer. Sits between the Next API routes and the SRC
// provider: validates locally, maps to the SRC print payload, sends it
// (mock or real), and returns the normalized result to persist.
// ============================================================

import { getRestaurantSrcClient, printReceipt } from "@/lib/src/client";
import { getSrcMode, resolveRestaurantCertConfig, RestaurantCertFields } from "@/lib/src/config";
import { LocalSaleInput, mapToSrcPrintInput, mapSrcResultToReceiptFields } from "@/lib/src/mapper";
import { validatePaymentCoversTotal, validatePrintInput } from "@/lib/src/validation";
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
  /**
   * Total AMD discount for this line item. Sent to SRC as `discount` with
   * discountType=TOTAL (4). If the POS already bakes the discount into unitPrice,
   * leave this as "0".
   */
  discountAmount?: string;
};

export type RegisterSaleInput = {
  /** Full restaurant record including cert fields. Used to resolve the SRC client. */
  restaurant: RestaurantCertFields;
  cashierTaxId: string;
  items: RegisterSaleItem[];
  /**
   * The amount WITHOUT tip that will be sent to SRC as cardAmount/cashAmount.
   * Must equal sum(item unitPrice * quantity - discountAmount).
   * Tips are excluded from the fiscal receipt.
   */
  billAmount: string;
  /** MIXED only: explicit cash portion. billAmount = paidCashAmount + paidCardAmount. */
  paidCashAmount?: string;
  /** MIXED only: explicit card portion. */
  paidCardAmount?: string;
  /** B2B partner TIN (8 digits). Null for B2C sales. */
  partnerTin?: string | null;
  customerEmail?: string | null;
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

export async function registerSaleInTaxApi(
  input: RegisterSaleInput
): Promise<RegisterSaleResult> {
  const { restaurant } = input;
  const crn = restaurant.crn;

  if (!crn) {
    throw new SrcConfigError("Restaurant CRN is not set");
  }

  const mode = getSrcMode();
  let srcClient;
  if (mode === "src_real") {
    const certConfig = resolveRestaurantCertConfig(restaurant);
    srcClient = getRestaurantSrcClient(restaurant.id, certConfig);
  } else {
    srcClient = getRestaurantSrcClient(restaurant.id, {
      pfx: Buffer.alloc(0),
      certPassword: "",
      caCertPath: null,
      baseUrl: "",
      language: "en",
      source: "env",
    });
  }

  const local: LocalSaleInput = {
    crn,
    cashierId: Number(input.cashierTaxId),
    paymentMethod: input.paymentMethod ?? "CARD",
    totalAmount: input.billAmount,   // mapper uses srcPaymentAmount for the payment fields
    srcPaymentAmount: input.billAmount,
    explicitCashAmount: input.paidCashAmount !== undefined ? Number(input.paidCashAmount) : undefined,
    explicitCardAmount: input.paidCardAmount !== undefined ? Number(input.paidCardAmount) : undefined,
    partnerTin: input.partnerTin ?? null,
    items: input.items.map((it) => ({
      name: (it.name ?? it.externalProductId ?? "Item").toString(),
      goodCode: (it.goodCode ?? it.externalProductId ?? "UNKNOWN").toString(),
      adgCode: (it.adgCode ?? "0000").toString(),
      unit: it.unit,
      departmentTaxId: it.departmentTaxId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountAmount: it.discountAmount ?? "0",
    })),
  };

  const srcRequest = mapToSrcPrintInput(local);

  validatePrintInput(srcRequest);
  validatePaymentCoversTotal(srcRequest);

  const srcResponse = await printReceipt(srcRequest, srcClient);
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
