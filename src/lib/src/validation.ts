// ============================================================
// src/lib/src/validation.ts
// Field-level validation + money/quantity formatting helpers,
// implementing the rules from the SRC manual (§9, §10, §14).
// ============================================================

import { SrcValidationError } from "./errors";
import {
  SrcDepartment,
  SrcPrintInput,
  SrcPrintItem,
  VALID_TAX_REGIMES,
} from "./types";

// ---- Formatting (manual §10: money 2 decimals, quantity 3 decimals) ----

/** Round half-up to 2 decimals (manual: 0.005 -> 0.01, 0.004 -> 0). */
export function money(value: number | string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new SrcValidationError(`Invalid money value: ${value}`);
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round to max 3 decimals for quantities. */
export function quantity(value: number | string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new SrcValidationError(`Invalid quantity value: ${value}`);
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function hasMaxDecimals(value: number, max: number): boolean {
  const s = String(value);
  const dot = s.indexOf(".");
  if (dot === -1) return true;
  return s.length - dot - 1 <= max;
}

// ---- Primitive validators ----

export function isValidTin(tin: unknown): tin is string {
  return typeof tin === "string" && /^\d{8}$/.test(tin);
}

export function isValidCrn(crn: unknown): crn is string {
  return typeof crn === "string" && crn.trim().length > 0;
}

export function isValidTaxRegime(tr: unknown): boolean {
  return (
    typeof tr === "number" &&
    (VALID_TAX_REGIMES as readonly number[]).includes(tr)
  );
}

export function assertTin(tin: unknown, field = "tin"): asserts tin is string {
  if (!isValidTin(tin)) {
    throw new SrcValidationError(`${field} must be an 8-digit number`, field);
  }
}

export function assertCrn(crn: unknown): asserts crn is string {
  if (!isValidCrn(crn)) {
    throw new SrcValidationError("crn is required", "crn");
  }
}

export function assertPartnerTin(value: unknown): void {
  if (value === null || value === undefined) return;
  if (!isValidTin(value)) {
    throw new SrcValidationError(
      "partnerTin must be null or a valid 8-digit TIN",
      "partnerTin"
    );
  }
}

// ---- Department validation (configureDepartments) ----

export function validateDepartments(departments: SrcDepartment[]): void {
  if (!Array.isArray(departments) || departments.length === 0) {
    throw new SrcValidationError("departments must be a non-empty array", "departments");
  }
  for (const d of departments) {
    if (!Number.isInteger(d.dep)) {
      throw new SrcValidationError("dep must be an integer", "dep");
    }
    if (!isValidTaxRegime(d.taxRegime)) {
      throw new SrcValidationError("taxRegime must be one of 1, 2, 3, 7", "taxRegime");
    }
  }
}

// ---- Item validation (print, mode 2) ----

export function validatePrintItem(item: SrcPrintItem): void {
  if (!item.goodName || item.goodName.length === 0 || item.goodName.length > 50) {
    throw new SrcValidationError("goodName must be non-empty and max 50 characters", "goodName");
  }
  if (!item.goodCode || item.goodCode.length === 0 || item.goodCode.length > 50) {
    throw new SrcValidationError("goodCode must be non-empty and max 50 characters", "goodCode");
  }
  if (!item.unit || item.unit.length === 0 || item.unit.length > 50) {
    throw new SrcValidationError("unit must be non-empty and max 50 characters", "unit");
  }
  if (!Number.isInteger(item.dep)) {
    throw new SrcValidationError("dep must be an integer", "dep");
  }
  if (!(item.quantity > 0) || !hasMaxDecimals(item.quantity, 3)) {
    throw new SrcValidationError(
      "quantity must be > 0 with at most 3 decimal digits",
      "quantity"
    );
  }
  if (!(item.price > 0) || !hasMaxDecimals(item.price, 2)) {
    throw new SrcValidationError(
      "price must be > 0 with at most 2 decimal digits",
      "price"
    );
  }
}

// ---- Whole print payload validation ----

export function validatePrintInput(input: SrcPrintInput): void {
  assertCrn(input.crn);

  if (!Number.isInteger(input.cashierId)) {
    throw new SrcValidationError("cashierId must be an integer", "cashierId");
  }
  if (input.mode !== 2 && input.mode !== 3) {
    throw new SrcValidationError("mode must be 2 or 3", "mode");
  }
  assertPartnerTin(input.partnerTin);

  const moneyFields: Array<[string, number]> = [
    ["cardAmount", input.cardAmount],
    ["cashAmount", input.cashAmount],
    ["partialAmount", input.partialAmount],
    ["prePaymentAmount", input.prePaymentAmount],
  ];
  for (const [name, val] of moneyFields) {
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      throw new SrcValidationError(`${name} must be a non-negative number`, name);
    }
    if (!hasMaxDecimals(val, 2)) {
      throw new SrcValidationError(`${name} must have at most 2 decimal digits`, name);
    }
  }

  if (input.mode === 3) {
    // Prepayment: items must be null/empty (manual error 187 INVALID_ITEMS).
    if (input.items && input.items.length > 0) {
      throw new SrcValidationError(
        "items must be empty for prepayment mode (mode 3)",
        "items"
      );
    }
    return;
  }

  // Products mode (2)
  if (!input.items || input.items.length === 0) {
    throw new SrcValidationError("items are required for products mode (mode 2)", "items");
  }
  for (const item of input.items) {
    validatePrintItem(item);
  }
}

/**
 * Compute the receipt total from a products payload and validate that the
 * paid amounts cover it (manual error 152 PAID_AMOUNT_LESS_THAN_TOTAL).
 * Returns the computed line total (sum of price*quantity less line discounts
 * is intentionally NOT applied here — SRC recomputes discounts server-side;
 * we only sanity-check the gross totals).
 */
export function computeItemsTotal(items: SrcPrintItem[]): number {
  return money(
    items.reduce((sum, it) => sum + money(it.price) * quantity(it.quantity), 0)
  );
}

export function validatePaymentCoversTotal(input: SrcPrintInput): void {
  const paid = money(
    input.cardAmount +
      input.cashAmount +
      input.partialAmount +
      input.prePaymentAmount
  );
  if (input.mode === 2 && input.items) {
    const total = computeItemsTotal(input.items);
    if (paid + 1e-9 < total) {
      throw new SrcValidationError(
        `Paid amount ${paid} is less than items total ${total}`,
        "cardAmount"
      );
    }
  }
}
