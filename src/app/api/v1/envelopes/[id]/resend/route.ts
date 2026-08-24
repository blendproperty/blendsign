import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { enqueueSendSigningLink } from "@/lib/queue";
import { eligibleSigningReminderRecipients } from "@/lib/resendSigning";

const REQUEST_ID = /^[A-Za-z0-9-]{8,80}$/;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = await authenticateApiKey(request.headers.get("authorization"));
  if (!apiKey) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  const requestId = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!REQUEST_ID.test(requestId)) return NextResponse.json({ error: "Provide a valid Idempotency-Key header." }, { status: 400 });
  const { id } = await params;
  const envelope = await prisma.envelope.findFirst({ where: { id, orgId: apiKey.orgId, deletedAt: null }, include: { signers: { orderBy: { order: "asc" } } } });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (!["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)) return NextResponse.json({ error: "Only active signing requests can be resent." }, { status: 409 });
  const previous = await prisma.auditEvent.findFirst({ where: { envelopeId: envelope.id, eventType: "signing_reminder_queued", metadata: { path: ["requestId"], equals: requestId } } });
  if (previous) return NextResponse.json({ queued: true, idempotent: true, recipients: 0 }, { status: 200 });
  const recipients = eligibleSigningReminderRecipients(envelope.signers);
  if (!recipients.length) return NextResponse.json({ error: "No eligible signer currently requires an email reminder." }, { status: 409 });
  await Promise.all(recipients.map((signer) => enqueueSendSigningLink(signer.id, `reminder-${requestId}-${signer.id}`)));
  await prisma.auditEvent.create({ data: { envelopeId: envelope.id, eventType: "signing_reminder_queued", metadata: { requestId, signerIds: recipients.map((signer) => signer.id), source: "api_key_integration" } } });
  return NextResponse.json({ queued: true, idempotent: false, recipients: recipients.length }, { status: 202 });
}
