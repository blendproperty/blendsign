import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(
  process.env.REDIS_URL || "redis://redis:6379",
  { maxRetriesPerRequest: null }
);

export const blendsignQueue = new Queue("blendsign", { connection });

export async function enqueueSendSigningLink(signerId: string) {
  await blendsignQueue.add("send-signing-link", { signerId });
}

export async function enqueueSealDocument(envelopeId: string) {
  await blendsignQueue.add(
    "seal-document",
    { envelopeId },
    { attempts: 5, backoff: { type: "exponential", delay: 3000 } }
  );
}

export async function enqueueWebhookEvent(envelopeId: string, event: string) {
  await blendsignQueue.add("deliver-webhook", { envelopeId, event }, { attempts: 5, backoff: { type: "exponential", delay: 2000 } });
}

export async function enqueueEmailDocument(envelopeId: string, emails: string[], requestedById: string) {
  await blendsignQueue.add(
    "email-document",
    { envelopeId, emails, requestedById },
    { attempts: 5, backoff: { type: "exponential", delay: 3000 } }
  );
}
