import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { enqueueSealDocument, enqueueWebhookEvent } from "@/lib/queue";

const selfSignSchema = z.object({
  title: z.string().trim().min(1).max(160),
  originalKey: z.string().min(1),
  fields: z.array(z.object({
    type: z.enum(["SIGNATURE", "INITIALS", "DATE", "TEXT", "CHECKBOX"]),
    page: z.number().int().min(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.02).max(1),
    height: z.number().min(0.02).max(1),
    value: z.string().min(1).max(2_000_000),
  })).min(1).max(300),
  consent: z.literal(true),
});

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = selfSignSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Complete the document and every signing field." }, { status: 400 });
  const data = parsed.data;
  if (!data.originalKey.startsWith(`${context.org.id}/originals/`)) {
    return NextResponse.json({ error: "The uploaded document does not belong to the active company." }, { status: 403 });
  }
  if (data.fields.some((field) => field.x + field.width > 1.000001 || field.y + field.height > 1.000001)) {
    return NextResponse.json({ error: "A signing field extends beyond the PDF page." }, { status: 400 });
  }

  const now = new Date();
  const envelope = await prisma.envelope.create({
    data: {
      orgId: context.org.id,
      createdById: context.user.id,
      title: data.title,
      originalKey: data.originalKey,
      status: "PARTIALLY_SIGNED",
      signers: {
        create: {
          name: context.user.name,
          email: context.user.email,
          order: 0,
          token: randomBytes(24).toString("hex"),
          status: "SIGNED",
          signedAt: now,
        },
      },
      auditEvents: {
        create: { eventType: "created", metadata: { selfSigned: true } },
      },
    },
    include: { signers: true },
  });

  await prisma.field.createMany({
    data: data.fields.map((field) => ({
      envelopeId: envelope.id,
      signerId: envelope.signers[0].id,
      type: field.type,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      value: field.value,
    })),
  });

  await prisma.auditEvent.create({
    data: {
      envelopeId: envelope.id,
      signerId: envelope.signers[0].id,
      eventType: "signed",
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") || undefined,
      metadata: { consent: true, selfSigned: true },
    },
  });

  await enqueueWebhookEvent(envelope.id, "envelope.signed");
  await enqueueSealDocument(envelope.id);

  return NextResponse.json({ envelopeId: envelope.id, status: "sealing" }, { status: 202 });
}
