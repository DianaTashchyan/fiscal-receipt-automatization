// ============================================================
// src/lib/src/errors.ts
// Error types for the SRC integration.
// ============================================================

/**
 * Thrown when the SRC service returns a non-zero `code`, or on a transport
 * failure. Mirrors the SRC response so callers can branch on `code` /
 * `srcMessage` (e.g. 104 INVALID_SEQ, 403 UNAUTHORIZED_CONNECTION).
 * Error codes & messages are listed in manual §14.
 */
export class SrcError extends Error {
  code: number | string | null;
  srcMessage: string | null;
  errorMessage: string | null;
  httpStatus: number | null;

  constructor(
    message: string,
    opts: {
      code?: number | string | null;
      srcMessage?: string | null;
      errorMessage?: string | null;
      httpStatus?: number | null;
    } = {}
  ) {
    super(message);
    this.name = "SrcError";
    this.code = opts.code ?? null;
    this.srcMessage = opts.srcMessage ?? null;
    this.errorMessage = opts.errorMessage ?? null;
    this.httpStatus = opts.httpStatus ?? null;
  }
}

/**
 * Thrown for local configuration problems BEFORE any network call — e.g.
 * missing certificate, missing CRN, invalid TIN. Kept separate from SrcError
 * so the UI can distinguish "you misconfigured this" from "SRC rejected this".
 */
export class SrcConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SrcConfigError";
  }
}

/** Thrown when local validation of a payload fails (manual field rules). */
export class SrcValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "SrcValidationError";
    this.field = field;
  }
}
