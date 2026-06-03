-- AddColumns: SRC response fields on Receipt
-- These columns were previously applied via prisma db push and are now
-- tracked in the migration history for safe production deploys.

ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS "srcReceiptId" TEXT,
  ADD COLUMN IF NOT EXISTS "srcSn"         TEXT,
  ADD COLUMN IF NOT EXISTS "srcTin"        TEXT,
  ADD COLUMN IF NOT EXISTS "srcTaxpayer"   TEXT,
  ADD COLUMN IF NOT EXISTS "srcAddress"    TEXT,
  ADD COLUMN IF NOT EXISTS "srcFiscalTime" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "srcTotal"      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "srcChange"     DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "srcRawResponse" JSONB,
  ADD COLUMN IF NOT EXISTS "srcMode"       TEXT;

-- CreateTable: SRC sequence counter (per-CRN, atomic increment)
CREATE TABLE IF NOT EXISTS "SrcSequence" (
    "crn"       TEXT        NOT NULL,
    "lastSeq"   BIGINT      NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SrcSequence_pkey" PRIMARY KEY ("crn")
);
