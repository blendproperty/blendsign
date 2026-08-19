// Background worker: processes email/WhatsApp delivery, PDF sealing,
// reminders, and link expiry. Runs as a separate container from the
// Next.js app (see docker-compose.yml `worker` service).
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { prisma } = require("./lib/prisma");
const { getObjectBuffer, putObjectBuffer } = require("./lib/storage");
const { flattenEnvelope, sha256Hex } = require("./lib/pdf");
const { sendSigningLinkEmail } = require("./lib/mail");

const connection = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

async function handleSendSigningLink({ signerId }) {
  const signer = await prisma.signer.findUnique({
    where: { id: signerId },
    include: { envelope: true },
  });
  if (!signer) return;

  const appDomain = process.env.APP_DOMAIN || "localhost:3000";
  const link = `https://${appDomain}/sign/${signer.token}`;

  if (signer.email) {
    await sendSigningLinkEmail({
      to: signer.email,
      signerName: signer.name,
      documentTitle: signer.envelope.title,
      link,
    });
  } else if (signer.phone) {
    // MVP fallback: log a wa.me deep link. Swap for the WhatsApp Business
    // API (WHATSAPP_BUSINESS_TOKEN) to send this programmatically instead
    // of relying on the signer to click a manually-shared link.
    const waLink = `https://wa.me/${signer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
      `${signer.name}, please sign "${signer.envelope.title}": ${link}`
    )}`;
    console.log("WhatsApp delivery (manual/dev fallback):", waLink);
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
    include: { fields: true, signers: true, auditEvents: { orderBy: { createdAt: "asc" } } },
  });
  if (!envelope) return;

  const originalBytes = await getObjectBuffer(envelope.originalKey);
  const finalBytes = await flattenEnvelope({
    originalBytes,
    fields: envelope.fields,
    envelope,
    signers: envelope.signers,
    auditEvents: envelope.auditEvents,
  });

  const signedKey = envelope.originalKey.replace(/\.pdf$/i, "") + "-signed.pdf";
  await putObjectBuffer(signedKey, finalBytes);
  const hash = sha256Hex(finalBytes);

  await prisma.envelope.update({
    where: { id: envelopeId },
    data: { status: "COMPLETED", signedKey, sha256: hash },
  });

  await prisma.auditEvent.create({
    data: { envelopeId, eventType: "completed", metadata: { sha256: hash } },
  });
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
