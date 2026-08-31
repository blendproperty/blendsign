import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const resendRoute = fs.readFileSync("src/app/api/v1/envelopes/[id]/resend/route.ts", "utf8");
const createRoute = fs.readFileSync("src/app/api/v1/envelopes/from-template/route.ts", "utf8");
const documentRoute = fs.readFileSync("src/app/api/envelopes/[id]/document/route.ts", "utf8");
const certificateRoute = fs.readFileSync("src/app/api/envelopes/[id]/certificate/route.ts", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");

test("Stor24 envelope creation requires a bounded idempotency key", () => {
  assert.match(createRoute, /idempotency-key/);
  assert.match(createRoute, /length < 8 \|\| idempotencyKey\.length > 200/);
  assert.match(schema, /@@unique\(\[orgId, idempotencyKey\]\)/);
});

test("concurrent envelope creation resolves to the existing organisation-scoped envelope", () => {
  const scopedLookup = /orgId_idempotencyKey: \{ orgId: apiKey\.orgId, idempotencyKey \}/g;
  assert.equal(createRoute.match(scopedLookup)?.length, 2);
  assert.match(createRoute, /if \(raced\) return NextResponse\.json\(envelopeResponse\(raced, raced\.signers, true\)\)/);
});

test("resend is organisation-scoped and limited to active envelopes", () => {
  assert.match(resendRoute, /where: \{ id, orgId: apiKey\.orgId, deletedAt: null \}/);
  assert.match(resendRoute, /\["SENT", "PARTIALLY_SIGNED"\]\.includes\(envelope\.status\)/);
  assert.match(resendRoute, /Document not found/);
});

test("resend retries are idempotent in both audit and queue identity", () => {
  assert.match(resendRoute, /eventType: "signing_reminder_queued"/);
  assert.match(resendRoute, /metadata: \{ path: \["requestId"\], equals: requestId \}/);
  assert.match(resendRoute, /`reminder-\$\{requestId\}-\$\{signer\.id\}`/);
  assert.match(resendRoute, /idempotent: true/);
});

test("completed document retrieval is API-key organisation scoped and fails closed until sealed", () => {
  assert.match(documentRoute, /orgId = context\?\.org\.id \?\? apiKey\?\.orgId/);
  assert.match(documentRoute, /where: \{ id: params\.id, orgId, deletedAt: null \}/);
  assert.match(documentRoute, /signed && !envelope\.signedKey/);
  assert.match(documentRoute, /status: 409/);
});

test("completion certificate retrieval is organisation scoped and requires sealing evidence", () => {
  assert.match(certificateRoute, /orgId = context\?\.org\.id \?\? apiKey\?\.orgId/);
  assert.match(certificateRoute, /where: \{ id: params\.id, orgId, deletedAt: null \}/);
  assert.match(certificateRoute, /!envelope\.signedKey \|\| !envelope\.sha256/);
  assert.match(certificateRoute, /status: 409/);
});
