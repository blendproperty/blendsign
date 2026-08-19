// Background worker: processes email/WhatsApp delivery, PDF sealing,
// reminders, and link expiry. Runs as a separate container from the
// Next.js app (see docker-compose.yml `worker` service).
const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "blendsign",
  async (job) => {
    switch (job.name) {
      case "send-signing-link":
        // TODO: send via email (SMTP) or WhatsApp (Business API) depending
        // on signer.phone vs signer.email
        console.log("send-signing-link", job.data);
        break;
      case "seal-document":
        // TODO: flatten signed fields into the PDF, compute sha256,
        // store in object storage, write Envelope.signedKey/sha256
        console.log("seal-document", job.data);
        break;
      case "expire-envelopes":
        // TODO: scan envelopes past expiresAt and mark EXPIRED
        console.log("expire-envelopes", job.data);
        break;
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
