-- AddColumns: per-restaurant SRC certificate storage
-- Allows each restaurant to have its own PKCS#12 certificate and password
-- instead of relying solely on global SRC_CERT_PATH / SRC_CERT_PASSWORD env vars.
--
-- Priority at runtime: srcCertData > srcCertPath > env SRC_CERT_PATH.
-- srcCertPassword is stored AES-256-GCM encrypted with CERT_ENCRYPTION_KEY.

ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "srcCertData"     BYTEA,
  ADD COLUMN IF NOT EXISTS "srcCertPassword" TEXT,
  ADD COLUMN IF NOT EXISTS "srcCertPath"     TEXT,
  ADD COLUMN IF NOT EXISTS "srcConfiguredAt" TIMESTAMP(3);
