import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { enqueueSendSigningLink } from "@/lib/queue";
import { eligibleSigningReminderRecipients } from "@/lib/resendSigning";

const inputSchema = z.object({ signerId: z.string().min(1).optional() });
const COOLDOWN_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid reminder request." }, { status: 400 });

  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
    include: { signers: { orderBy: { order: "asc" } } },
  });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (envelope.createdById !== context.user.id && !canAdminister(context)) {
    return NextResponse.json({ error: "You do not have permission to send reminders for this document." }, { status: 403 });
  }
  if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) {
    return NextResponse.json({ error: "Only active signing requests can receive reminders." }, { status: 409 });
  }

  let recipients = eligibleSigningReminderRecipients(envelope.signers);
  if (parsed.data.signerId) recipients = recipients.filter((signer) => signer.id === parsed.data.signerId);
  if (!recipients.length) return NextResponse.json({ error: "That recipient is not currently eligible for a reminder." }, { status: 409 });

  const recentEvents = await prisma.auditEvent.findMany({
    where: { envelopeId: envelope.id, eventType: "signing_reminder_queued", createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) }, signerId: { in: recipients.map((signer) => signer.id) } },
    select: { signerId: true },
  });
  const coolingDown = new Set(recentEvents.map((event) => event.signerId));
  const ready = recipients.filter((signer) => !coolingDown.has(signer.id));
  if (!ready.length) return NextResponse.json({ error: "A reminder was sent recently. Please wait 15 minutes before sending another." }, { status: 429 });

  const requestId = crypto.randomUUID();
  for (const signer of ready) {
    await enqueueSendSigningLink(signer.id, `reminder-${requestId}-${signer.id}`);
    await prisma.auditEvent.create({ data: { envelopeId: envelope.id, signerId: signer.id, eventType: "signing_reminder_queued", metadata: { requestId, requestedById: context.user.id, source: "workspace" } } });
  }
  return NextResponse.json({ queued: true, recipients: ready.map((signer) => ({ id: signer.id, email: signer.email })), skipped: recipients.length - ready.length });
}
