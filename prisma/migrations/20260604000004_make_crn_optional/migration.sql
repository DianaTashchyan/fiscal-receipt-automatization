-- Make CRN optional: entered after SRC u6 approval, not at company creation.
-- CRN is issued by SRC only after the u6 (ECR registration) application is approved.
ALTER TABLE "Restaurant" ALTER COLUMN "crn" DROP NOT NULL;
