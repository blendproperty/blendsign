import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enqueueSealDocument, enqueueSendSigningLink, enqueueWebhookEvent } from "@/lib/queue";

const submitSchema = z.object({
  fields: z.array(z.object({ fieldId: z.string(), value: z.string().max(2_000_000) })).max(100),
  consent: z.literal(true), // explicit consent to sign electronically, required
});

function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
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

  const permittedFields = await prisma.field.count({
    where: { signerId: signer.id, id: { in: parsed.data.fields.map((field) => field.fieldId) } },
  });
  if (permittedFields !== parsed.data.fields.length) {
    return NextResponse.json({ error: "One or more signing fields are invalid." }, { status: 400 });
  }

  await Promise.all(
    parsed.data.fields.map((f) =>
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

  const allSigners = await prisma.signer.findMany({
    where: { envelopeId: signer.envelopeId },
  });
  const stillPending = allSigners.filter((s) => s.status !== "SIGNED");

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
