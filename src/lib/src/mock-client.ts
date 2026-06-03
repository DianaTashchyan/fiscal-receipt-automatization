// ============================================================
// src/lib/src/mock-client.ts
// Mock SRC client. Returns manual-shaped responses without any real
// certificate or network. Lets the whole app run for demos with
// TAX_API_MODE=mock and no SRC credentials configured.
// ============================================================

import {
  ISrcClient,
  SrcDepartment,
  SrcGoodListResult,
  SrcPrintInput,
  SrcPrintResult,
  SrcResponse,
  SrcReturnedReceiptInfoResult,
  SrcReturnInput,
} from "./types";

function ok<T>(result: T): SrcResponse<T> {
  return { code: 0, message: "OK", errorMessage: null, result };
}

function buildPrintResult(
  crn: string,
  input: Pick<
    SrcPrintInput,
    "cardAmount" | "cashAmount" | "partialAmount" | "prePaymentAmount"
  >
): SrcPrintResult {
  const timestamp = Date.now();
  const cash = Number(input.cashAmount ?? 0);
  const nonCash = Number(input.cardAmount ?? 0);
  const prep = Number(input.prePaymentAmount ?? 0);
  const partial = Number(input.partialAmount ?? 0);
  const total = cash + nonCash + partial + prep;

  const receiptId = String(Math.floor(Math.random() * 1_000_000));
  const tin = process.env.SRC_TIN ?? "12345678";
  const sn = "SRC-MOCK-SN";
  const fiscal = `MOCK-${timestamp}`;
  const receiptTime = new Date(timestamp).toLocaleString("en-US");

  return {
    receiptId,
    crn,
    sn,
    tin,
    taxpayer: "Demo Restaurant (mock)",
    address: "Yerevan, Armenia",
    time: timestamp,
    fiscal,
    total,
    change: 0,
    qr: `TIN: ${tin}, CRN: ${crn}, SERIAL: ${sn}, Receipt_ID: ${receiptId}, Receipt_Time: ${receiptTime}, FISCAL: ${fiscal}, TOTAL_CASH: ${cash}, TOTAL_NONCASH: ${nonCash}, PREP_USAGE: ${prep}, PARTIAL: ${partial}, TOTAL: ${total}`,
  };
}

export class MockSrcClient implements ISrcClient {
  readonly mode = "mock" as const;

  async checkConnection(_crn?: string): Promise<SrcResponse<string>> {
    return ok("Connection with SRC mock service is successful");
  }

  async activate(_crn?: string): Promise<SrcResponse<string>> {
    return ok("Electronic cash register activated in mock mode");
  }

  async configureDepartments(
    _crn: string,
    _seq: number,
    _departments: SrcDepartment[]
  ): Promise<SrcResponse<string>> {
    return ok("Departments configured in mock mode");
  }

  async getGoodList(_params?: {
    crn: string;
    taxRegime: number;
    tin: string;
  }): Promise<SrcResponse<SrcGoodListResult>> {
    return ok({
      goodLists: [
        {
          listname: "Restaurant goods",
          taxRegimeName: "VAT taxable",
          goods: [
            { goodName: "Margherita Pizza", goodCode: "2106-90", price: 3500 },
            { goodName: "House Wine", goodCode: "2204-21", price: 1500 },
          ],
        },
      ],
    });
  }

  async print(
    input: SrcPrintInput,
    _seq: number
  ): Promise<SrcResponse<SrcPrintResult>> {
    return ok(buildPrintResult(input.crn, input));
  }

  async printCopy(
    crn: string,
    _seq: number,
    receiptId: string | number
  ): Promise<SrcResponse<SrcPrintResult>> {
    const result = buildPrintResult(crn, {
      cardAmount: 0,
      cashAmount: 0,
      partialAmount: 0,
      prePaymentAmount: 0,
    });
    return ok({ ...result, receiptId: String(receiptId) });
  }

  async getReturnedReceiptInfo(
    _crn: string,
    _seq: number,
    _receiptId: string | number
  ): Promise<SrcResponse<SrcReturnedReceiptInfoResult>> {
    return ok({
      cashierId: 3,
      cardAmount: 0,
      cashAmount: 0,
      partialAmount: 0,
      prePayment: 0,
      saleType: 2,
      receiptType: 0,
      receiptSubType: 1,
      totalAmount: 0,
      time: Date.now(),
      items: [],
    });
  }

  async printReturnReceipt(
    input: SrcReturnInput,
    _seq: number
  ): Promise<SrcResponse<SrcPrintResult>> {
    const result = buildPrintResult(input.crn, {
      cardAmount: input.cardAmountForReturn,
      cashAmount: input.cashAmountForReturn,
      partialAmount: 0,
      prePaymentAmount: 0,
    });
    return ok({ ...result, fiscal: null, receiptId: String(input.receiptId) });
  }
}
