// Background worker: processes email/WhatsApp delivery, PDF sealing,
// reminders, and link expiry. Runs as a separate container from the
// Next.js app (see docker-compose.yml `worker` service).
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { prisma } = require("./lib/prisma");
const { getObjectBuffer, putObjectBuffer } = require("./lib/storage");
const { flattenEnvelope, sha256Hex } = require("./lib/pdf");
const { sendSigningLinkEmail, sendCompletedDocumentEmail } = require("./lib/mail");
const { createDecipheriv, createHash, createHmac } = require("crypto");

const connection = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

async function handleSendSigningLink({ signerId }) {
  const signer = await prisma.signer.findUnique({
    where: { id: signerId },
    include: { envelope: { include: { org: true } } },
  });
  if (!signer) return;

  const appDomain = signer.envelope.org.customDomain || process.env.APP_DOMAIN || "localhost:3000";
  const baseUrl = /^https?:\/\//i.test(appDomain) ? appDomain.replace(/\/$/, "") : `https://${appDomain.replace(/\/$/, "")}`;
  const link = `${baseUrl}/sign/${signer.token}`;

  if (signer.email) {
    await sendSigningLinkEmail({
      to: signer.email,
      signerName: signer.name,
      documentTitle: signer.envelope.title,
      link,
      organisation: signer.envelope.org,
    });
  } else if (signer.phone) {
    const message = `${signer.name}, ${signer.envelope.org.name} has asked you to sign "${signer.envelope.title}": ${link}`;
    if (process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_API_VERSION) {
      const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.WHATSAPP_BUSINESS_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: signer.phone.replace(/\D/g, ""), type: "text", text: { preview_url: false, body: message } }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`WhatsApp delivery failed with HTTP ${response.status}`);
    } else {
      const waLink = `https://wa.me/${signer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
      console.log("WhatsApp delivery (manual fallback):", waLink);
    }
  } else {
    console.warn("Signer has no email or phone", signerId);
  }

  await prisma.auditEvent.create({
    data: { envelopeId: signer.envelopeId, signerId, eventType: "sent" },
  });
}

async function handleSealDocument({ envelopeId }) {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: { org: true, fields: true, signers: true, auditEvents: { orderBy: { createdAt: "asc" } } },
  });
  if (!envelope) return;

  let finalBytes;
  let signedKey = envelope.signedKey;
  let hash = envelope.sha256;
  if (envelope.status === "COMPLETED" && signedKey && hash) {
    finalBytes = await getObjectBuffer(signedKey);
  } else {
    const originalBytes = await getObjectBuffer(envelope.originalKey);
    finalBytes = await flattenEnvelope({
      originalBytes,
      fields: envelope.fields,
      envelope,
      signers: envelope.signers,
      auditEvents: envelope.auditEvents,
    });

    signedKey = envelope.originalKey.replace(/\.pdf$/i, "") + "-signed.pdf";
    await putObjectBuffer(signedKey, finalBytes);
    hash = sha256Hex(finalBytes);

    await prisma.envelope.update({
      where: { id: envelopeId },
      data: { status: "COMPLETED", signedKey, sha256: hash },
    });

    await prisma.auditEvent.create({
      data: { envelopeId, eventType: "completed", metadata: { sha256: hash } },
    });
    await handleDeliverWebhook({ envelopeId, event: "envelope.completed" });
  }

  const deliveredEmails = new Set(
    envelope.auditEvents
      .filter((event) => event.eventType === "completed_document_sent")
      .map((event) => String(event.metadata?.email || "").toLowerCase())
      .filter(Boolean)
  );
  const recipients = new Map();
  for (const signer of envelope.signers) {
    const email = signer.email?.trim().toLowerCase();
    if (!email || recipients.has(email)) continue;
    recipients.set(email, signer);
  }

  const failures = [];
  for (const [email, signer] of recipients) {
    if (deliveredEmails.has(email)) continue;
    try {
      const delivery = await sendCompletedDocumentEmail({
        to: signer.email,
        signerName: signer.name,
        documentTitle: envelope.title,
        document: finalBytes,
        documentHash: hash,
        organisation: envelope.org,
      });
      await prisma.auditEvent.create({
        data: {
          envelopeId,
          signerId: signer.id,
          eventType: "completed_document_sent",
          metadata: { email, messageId: delivery?.messageId || null },
        },
      });
    } catch (error) {
      failures.push(`${email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`Completed document delivery failed for ${failures.join("; ")}`);
}

async function handleEmailDocument({ envelopeId, emails, requestedById }) {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: { org: true, signers: true },
  });
  if (!envelope || !envelope.signedKey || !envelope.sha256) {
    throw new Error("Completed document is not available");
  }

  const document = await getObjectBuffer(envelope.signedKey);
  const recipients = [...new Set((emails || []).map((email) => String(email).trim().toLowerCase()).filter(Boolean))].slice(0, 3);
  if (!recipients.length) throw new Error("No email recipients supplied");

  for (const email of recipients) {
    const signer = envelope.signers.find((item) => item.email?.toLowerCase() === email);
    const delivery = await sendCompletedDocumentEmail({
      to: email,
      signerName: signer?.name || "Recipient",
      documentTitle: envelope.title,
      document,
      documentHash: envelope.sha256,
      organisation: envelope.org,
    });
    await prisma.auditEvent.create({
      data: {
        envelopeId,
        signerId: signer?.id,
        eventType: "document_emailed",
        metadata: { email, messageId: delivery?.messageId || null, requestedById: requestedById || null },
      },
    });
  }
}

function decryptSecret(value) {
  const [iv, tag, encrypted] = value.split(".");
  const key = createHash("sha256").update(process.env.SESSION_SECRET).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

async function handleDeliverWebhook({ envelopeId, event }) {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: { signers: true },
  });
  if (!envelope) return;
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { orgId: envelope.orgId, enabled: true, events: { has: event } },
  });
  if (!endpoints.length) return;
  const body = JSON.stringify({
    id: `evt_${Date.now()}`,
    event,
    createdAt: new Date().toISOString(),
    data: {
      envelopeId: envelope.id,
      title: envelope.title,
      status: envelope.status,
      signers: envelope.signers.map(({ id, name, email, phone, status, signedAt }) => ({ id, name, email, phone, status, signedAt })),
    },
  });
  await Promise.all(endpoints.map(async (endpoint) => {
    const signature = createHmac("sha256", decryptSecret(endpoint.secretEncrypted)).update(body).digest("hex");
    const response = await fetch(endpoint.url, { method: "POST", headers: { "content-type": "application/json", "x-blendsign-event": event, "x-blendsign-signature": `sha256=${signature}` }, body, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Webhook ${endpoint.id} returned HTTP ${response.status}`);
  }));
}

async function handleExpireEnvelopes() {
  const now = new Date();
  const expired = await prisma.envelope.updateMany({
    where: { expiresAt: { lt: now }, status: { in: ["SENT", "PARTIALLY_SIGNED"] } },
    data: { status: "EXPIRED" },
  });
  if (expired.count) console.log(`Expired ${expired.count} envelope(s)`);
}

const worker = new Worker(
  "blendsign",
  async (job) => {
    switch (job.name) {
      case "send-signing-link":
        return handleSendSigningLink(job.data);
      case "seal-document":
        return handleSealDocument(job.data);
      case "expire-envelopes":
        return handleExpireEnvelopes();
      case "deliver-webhook":
        return handleDeliverWebhook(job.data);
      case "email-document":
        return handleEmailDocument(job.data);
      default:
        console.warn("unknown job", job.name);
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.name} failed:`, err);
});

console.log("BlendSign worker started");
