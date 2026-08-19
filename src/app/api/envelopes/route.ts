import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/account";

const fieldSchema = z.object({
  signerIndex: z.number().int(), // index into `signers` array below
  type: z.enum(["SIGNATURE", "INITIALS", "DATE", "TEXT", "CHECKBOX"]),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const createEnvelopeSchema = z.object({
  title: z.string().min(1),
  originalKey: z.string(),
  signers: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        order: z.number().int().default(0),
      })
    )
    .min(1),
  fields: z.array(fieldSchema).default([]),
});

// POST /api/envelopes — create a draft envelope with signers and field
// placements, then move it straight to SENT and enqueue delivery to the
// first-order signer(s). The PDF itself must already be uploaded through
// /api/documents/upload before calling this.
export async function POST(req: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = await req.json();
  const parsed = createEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { title, originalKey, signers, fields } = parsed.data;
  if (!originalKey.startsWith(`${context.org.id}/originals/`)) {
    return NextResponse.json({ error: "The uploaded document does not belong to the active company." }, { status: 403 });
  }

  const envelope = await prisma.envelope.create({
    data: {
      orgId: context.org.id,
      createdById: context.user.id,
      title,
      originalKey,
      status: "SENT",
      signers: {
        create: signers.map((s) => ({
          name: s.name,
          email: s.email,
          phone: s.phone,
          order: s.order,
          token: randomBytes(24).toString("hex"),
        })),
      },
      auditEvents: {
        create: { eventType: "created" },
      },
    },
    include: { signers: true },
  });

  // fields reference signers by array index; map to the created signer IDs
  if (fields.length) {
    await prisma.field.createMany({
      data: fields.map((f) => ({
        envelopeId: envelope.id,
        signerId: envelope.signers[f.signerIndex].id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
    });
  }

  // enqueue delivery to whichever signer(s) sit at the lowest routing order
  const { enqueueSendSigningLink, enqueueWebhookEvent } = await import("@/lib/queue");
  const lowestOrder = Math.min(...envelope.signers.map((s) => s.order));
  await Promise.all(
    envelope.signers
      .filter((s) => s.order === lowestOrder)
      .map((s) => enqueueSendSigningLink(s.id))
  );
  await enqueueWebhookEvent(envelope.id, "envelope.sent");

  return NextResponse.json({ envelope }, { status: 201 });
}

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const envelopes = await prisma.envelope.findMany({
    where: { orgId: context.org.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { signers: true },
  });
  return NextResponse.json({ envelopes });
}

export async function DELETE(req: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Envelope is required." }, { status: 400 });
  const result = await prisma.envelope.updateMany({ where: { id, orgId: context.org.id }, data: { deletedAt: new Date() } });
  if (!result.count) return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
