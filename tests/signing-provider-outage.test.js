const assert = require("node:assert/strict");
const test = require("node:test");
const { createSendSigningLinkHandler } = require("../worker/handlers/sendSigningLink");

test("a bounded five-attempt provider outage is audited on every failure and never records success", async () => {
  const auditEvents = [];
  const prisma = {
    signer: {
      findUnique: async () => ({
        id: "signer-uat",
        envelopeId: "envelope-uat",
        name: "Non-production UAT signer",
        email: "uat@example.invalid",
        phone: null,
        token: "non-production-token",
        envelope: {
          title: "Provider outage simulation",
          org: { name: "BlendSign UAT", customDomain: "uat.invalid" },
        },
      }),
    },
    auditEvent: { create: async ({ data }) => auditEvents.push(data) },
  };
  let providerAttempts = 0;
  const handle = createSendSigningLinkHandler({
    prisma,
    sendSigningLinkEmail: async () => {
      providerAttempts += 1;
      throw new Error("Simulated SMTP outage");
    },
    env: {},
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(handle({ signerId: "signer-uat" }), /Simulated SMTP outage/);
  }

  assert.equal(providerAttempts, 5);
  assert.equal(auditEvents.length, 5);
  assert.ok(auditEvents.every((event) => event.eventType === "delivery_failed"));
  assert.ok(auditEvents.every((event) => event.metadata.message === "Simulated SMTP outage"));
  assert.equal(auditEvents.some((event) => event.eventType === "sent"), false);
});
