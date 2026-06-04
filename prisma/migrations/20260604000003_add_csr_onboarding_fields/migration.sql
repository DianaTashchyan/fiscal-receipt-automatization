-- AddColumns: CSR generation + onboarding step tracking
-- srcPrivateKeyEnc: RSA private key, AES-256-GCM encrypted with CERT_ENCRYPTION_KEY
-- srcCsrPem:        PEM-format CSR, safe to expose for download
-- srcCsrCreatedAt:  when the CSR was generated
-- srcOnboardingStep: 0=new, 1=info saved, 2=csr generated, 3=cert uploaded,
--                    4=connection tested, 5=cashier added, 6=depts configured,
--                    7=activated, 8=products added, 9=complete

ALTER TABLE "Restaurant"
  ADD COLUMN IF NOT EXISTS "srcPrivateKeyEnc"  TEXT,
  ADD COLUMN IF NOT EXISTS "srcCsrPem"         TEXT,
  ADD COLUMN IF NOT EXISTS "srcCsrCreatedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "srcOnboardingStep" INTEGER NOT NULL DEFAULT 0;
