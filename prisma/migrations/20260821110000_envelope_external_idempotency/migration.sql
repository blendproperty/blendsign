ALTER TABLE "Envelope"
  ADD COLUMN "externalSystem" TEXT,
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Envelope_orgId_idempotencyKey_key"
  ON "Envelope"("orgId", "idempotencyKey");

CREATE INDEX "Envelope_orgId_externalSystem_externalReference_idx"
  ON "Envelope"("orgId", "externalSystem", "externalReference");
