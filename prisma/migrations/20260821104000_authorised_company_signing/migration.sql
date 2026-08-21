ALTER TABLE "Org"
  ADD COLUMN "authorisedSignerName" TEXT,
  ADD COLUMN "authorisedSignerTitle" TEXT,
  ADD COLUMN "signatureKey" TEXT,
  ADD COLUMN "initialsKey" TEXT,
  ADD COLUMN "autoSignEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Signer"
  ADD COLUMN "autoSign" BOOLEAN NOT NULL DEFAULT false;
