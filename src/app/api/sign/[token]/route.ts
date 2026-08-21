import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enqueueSealDocument, enqueueSendSigningLink, enqueueWebhookEvent } from "@/lib/queue";
import { applyAuthorisedCompanySignature } from "@/lib/authorisedSigning";
import { isStor24ControlledField } from "@/lib/signingFieldPolicy";

const submitSchema = z.object({
  fields: z.array(z.object({ fieldId: z.string(), value: z.string().min(1).max(2_000_000) })).max(300),
  consent: z.literal(true), // explicit consent to sign electronically, required
});

function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function signingDateToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// GET — fetch what the signer needs to render the page (envelope, their
// fields, doc key for viewer). Marks the signer as VIEWED on first load.
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: { envelope: true, fields: true },
  });
  if (!signer) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (signer.status === "PENDING") {
    await prisma.signer.update({
      where: { id: signer.id },
      data: { status: "VIEWED" },
    });
    await prisma.auditEvent.create({
      data: {
        envelopeId: signer.envelopeId,
        signerId: signer.id,
        eventType: "viewed",
        ip: clientIp(_req),
        userAgent: _req.headers.get("user-agent") || undefined,
      },
    });
    await enqueueWebhookEvent(signer.envelopeId, "envelope.viewed");
  }

  return NextResponse.json({ signer });
}

// POST — submit field values (signature image, typed text, etc.) and mark
// this signer as SIGNED. Requires explicit `consent: true` — this is the
// signer's affirmative act of intent to be bound, which the ECT Act
// requires be identifiable and attributable.
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: { envelope: { include: { signers: true } } },
  });
  if (!signer) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (signer.status === "SIGNED") {
    return NextResponse.json({ error: "already signed" }, { status: 409 });
  }

  const body = await req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const assignedFields = await prisma.field.findMany({
    where: { signerId: signer.id },
    select: { id: true, type: true, dataKey: true, required: true, editableBySigner: true, value: true },
  });
  const assignedById = new Map(assignedFields.map((field) => [field.id, field]));
  const normalisedFields = parsed.data.fields.map((field) => ({ ...field, value: assignedById.get(field.fieldId)?.type === "DATE" ? signingDateToday() : field.value }));
  const submittedById = new Map(normalisedFields.map((field) => [field.fieldId, field.value]));
  if (submittedById.size !== parsed.data.fields.length || parsed.data.fields.some((field) => !assignedById.has(field.fieldId))) {
    return NextResponse.json({ error: "A submitted field does not belong to this signer." }, { status: 400 });
  }
  if (assignedFields.some((field) => field.required && !(submittedById.get(field.id) || field.value))) {
    return NextResponse.json({ error: "Complete every signing field before submitting." }, { status: 400 });
  }
  if (assignedFields.some((field) => (!field.editableBySigner || (signer.envelope.externalSystem === "stor24" && isStor24ControlledField(field.dataKey))) && submittedById.has(field.id) && submittedById.get(field.id) !== field.value)) {
    return NextResponse.json({ error: "A pre-filled field cannot be changed." }, { status: 400 });
  }
  const repeatedKeys = new Set(assignedFields.map((field) => field.dataKey).filter((key): key is string => Boolean(key)));
  if (Array.from(repeatedKeys).some((key) => new Set(assignedFields.filter((field) => field.dataKey === key).map((field) => submittedById.get(field.id) || field.value || "")).size > 1)) {
    return NextResponse.json({ error: "Matching PDF fields must contain the same value." }, { status: 400 });
  }

  await Promise.all(
    normalisedFields.map((f) =>
      prisma.field.update({ where: { id: f.fieldId }, data: { value: f.value } })
    )
  );

  await prisma.signer.update({
    where: { id: signer.id },
    data: { status: "SIGNED", signedAt: new Date() },
  });

  await prisma.auditEvent.create({
    data: {
      envelopeId: signer.envelopeId,
      signerId: signer.id,
      eventType: "signed",
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") || undefined,
      metadata: { consent: true },
    },
  });
  await enqueueWebhookEvent(signer.envelopeId, "envelope.signed");

  let allSigners = await prisma.signer.findMany({
    where: { envelopeId: signer.envelopeId },
  });
  let stillPending = allSigners.filter((s) => s.status !== "SIGNED");

  while (stillPending.length) {
    const nextOrder = Math.min(...stillPending.map((s) => s.order));
    const nextTier = stillPending.filter((s) => s.order === nextOrder);
    if (!nextTier.length || nextTier.some((s) => !s.autoSign)) break;
    const applied = await Promise.all(nextTier.map((s) => applyAuthorisedCompanySignature(s.id)));
    if (applied.some((value) => !value)) break;
    await Promise.all(nextTier.map((s) => enqueueWebhookEvent(s.envelopeId, "envelope.signed")));
    allSigners = await prisma.signer.findMany({ where: { envelopeId: signer.envelopeId } });
    stillPending = allSigners.filter((s) => s.status !== "SIGNED");
  }

  if (stillPending.length === 0) {
    // everyone's signed — flatten, hash, and seal the final document
    await enqueueSealDocument(signer.envelopeId);
  } else {
    await prisma.envelope.update({
      where: { id: signer.envelopeId },
      data: { status: "PARTIALLY_SIGNED" },
    });
    // advance routing: notify the next order tier if this was the last
    // signer at the current lowest pending order
    const nextOrder = Math.min(...stillPending.map((s) => s.order));
    const readyNow = stillPending.filter((s) => s.order === nextOrder);
    const alreadySentOrders = allSigners
      .filter((s) => s.status === "SIGNED")
      .map((s) => s.order);
    if (!alreadySentOrders.includes(nextOrder) || nextOrder > signer.order) {
      await Promise.all(readyNow.map((s) => enqueueSendSigningLink(s.id)));
    }
  }

  return NextResponse.json({ ok: true });
}
