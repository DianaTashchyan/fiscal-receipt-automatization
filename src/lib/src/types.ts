// ============================================================
// src/lib/src/types.ts
// Shared types & constants for the Armenian SRC / taxservice
// Electronic ECR ("Էլեկտրոնային ՀԴՄ") web service integration.
//
// Source of truth: official SRC integration manual (src.am, Nov 2024).
// ============================================================

/** Tax regimes (taxRegime codes) — manual §8. */
export const TAX_REGIME = {
  VAT: 1, // ԱԱՀ-ով հարկվող
  VAT_EXEMPT: 2, // ԱԱՀ-ով չհարկվող
  TURNOVER: 3, // Շրջանառության հարկ
  MICRO: 7, // Միկրոձեռնարկատիրություն
} as const;

export const VALID_TAX_REGIMES = [1, 2, 3, 7] as const;
export type TaxRegime = (typeof VALID_TAX_REGIMES)[number];

/** Receipt print modes — manual §10. */
export const MODE = {
  PRODUCTS: 2, // Ապրանքներ
  PREPAYMENT: 3, // Կանխավճար
} as const;

export type PrintMode = 2 | 3;

/** `discount` field types — manual §10. */
export const DISCOUNT_TYPE = {
  PERCENT: 1, // %
  PER_UNIT: 2, // Դ — per-unit dram discount
  TOTAL: 4, // ∑ — discount off total
} as const;

/** `additionalDiscount` field types — manual §10. */
export const ADDITIONAL_DISCOUNT_TYPE = {
  PERCENT: 8,
  AMOUNT: 16, // dram
} as const;

/** Generic SRC envelope. Success => code 0. */
export type SrcResponse<T> = {
  code: number;
  message: string;
  errorMessage?: string | null;
  result?: T;
};

export type SrcDepartment = {
  dep: number;
  taxRegime: number;
};

export type SrcPrintItem = {
  adgCode: string;
  dep: number;
  goodCode: string;
  goodName: string;
  quantity: number;
  unit: string;
  price: number;
  additionalDiscount?: number;
  additionalDiscountType?: number;
  discount?: number;
  discountType?: number;
};

/** Body for the `print` method (mode 2 = products, mode 3 = prepayment). */
export type SrcPrintInput = {
  crn: string;
  cardAmount: number;
  cashAmount: number;
  partialAmount: number;
  prePaymentAmount: number;
  cashierId: number;
  mode: PrintMode;
  partnerTin: string | null;
  items: SrcPrintItem[] | null;
};

/** Result shape shared by print / printCopy / printReturnReceipt — manual §10–13. */
export type SrcPrintResult = {
  receiptId: string;
  crn: string;
  sn: string;
  tin: string;
  taxpayer: string;
  address: string;
  time: number; // GMT timestamp (ms)
  fiscal: string | null;
  total: number;
  change: number;
  qr: string;
};

export type SrcGoodListResult = {
  goodLists: Array<{
    listname: string;
    taxRegimeName: string;
    goods: Array<{ goodName: string; goodCode: string; price: number }>;
  }>;
};

export type SrcReturnedReceiptInfoResult = {
  cashierId: number;
  cardAmount: number;
  cashAmount: number;
  partialAmount: number;
  prePayment: number;
  saleType: number;
  receiptType: number;
  receiptSubType: number;
  totalAmount: number;
  time: number;
  items: Array<{
    receiptProductId: number;
    quantity: number;
    additionalDiscount?: number;
    additionalDiscountType?: number;
    dep: number;
    discount?: number;
    discountType?: number;
    vat: number;
    taxRegime: number;
    goodCode: string;
    goodName: string;
    adgCode: string;
    unit: string;
    price: number;
    totalWithoutTaxes: number;
    totalWithTaxes: number;
  }>;
};

export type SrcReturnInput = {
  crn: string;
  receiptId: string | number;
  cardAmountForReturn: number;
  cashAmountForReturn: number;
  returnItemList: Array<{ receiptProductId: number; quantity: number }>;
};

/**
 * The interface every SRC client (mock + real) implements.
 * Methods that require `seq` accept it explicitly — the caller pulls the next
 * seq from the persistent sequence store so mock and real behave identically.
 */
export interface ISrcClient {
  readonly mode: "mock" | "src_real";
  checkConnection(crn: string): Promise<SrcResponse<string>>;
  activate(crn: string): Promise<SrcResponse<string>>;
  configureDepartments(
    crn: string,
    seq: number,
    departments: SrcDepartment[]
  ): Promise<SrcResponse<string>>;
  getGoodList(params: {
    crn: string;
    taxRegime: number;
    tin: string;
  }): Promise<SrcResponse<SrcGoodListResult>>;
  print(input: SrcPrintInput, seq: number): Promise<SrcResponse<SrcPrintResult>>;
  printCopy(
    crn: string,
    seq: number,
    receiptId: string | number
  ): Promise<SrcResponse<SrcPrintResult>>;
  getReturnedReceiptInfo(
    crn: string,
    seq: number,
    receiptId: string | number
  ): Promise<SrcResponse<SrcReturnedReceiptInfoResult>>;
  printReturnReceipt(
    input: SrcReturnInput,
    seq: number
  ): Promise<SrcResponse<SrcPrintResult>>;
}
