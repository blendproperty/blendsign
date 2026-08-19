import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

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
  orgId: z.string(),
  createdById: z.string(),
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
// first-order signer(s). The PDF itself must already be uploaded via
// /api/documents/upload-url before calling this.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { orgId, createdById, title, originalKey, signers, fields } = parsed.data;

  const envelope = await prisma.envelope.create({
    data: {
      orgId,
      createdById,
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
  const { enqueueSendSigningLink } = await import("@/lib/queue");
  const lowestOrder = Math.min(...envelope.signers.map((s) => s.order));
  await Promise.all(
    envelope.signers
      .filter((s) => s.order === lowestOrder)
      .map((s) => enqueueSendSigningLink(s.id))
  );

  return NextResponse.json({ envelope }, { status: 201 });
}

export async function GET() {
  const envelopes = await prisma.envelope.findMany({
    orderBy: { createdAt: "desc" },
    include: { signers: true },
  });
  return NextResponse.json({ envelopes });
}
