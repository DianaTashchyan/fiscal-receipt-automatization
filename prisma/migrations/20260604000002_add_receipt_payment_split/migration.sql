-- AddColumns: explicit cash/card split on Receipt
-- Stores what was actually sent to SRC as cashAmount and cardAmount.
-- Required for MIXED payments (cash + card split) and for correct retry
-- fiscalization. paidCashAmount + paidCardAmount = billAmount (tip excluded).

ALTER TABLE "Receipt"
  ADD COLUMN IF NOT EXISTS "paidCashAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "paidCardAmount" DECIMAL(10,2);
