import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
    select: { id: true, status: true, signedKey: true },
  });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ id: envelope.id, status: envelope.status, ready: Boolean(envelope.signedKey) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid document title." }, { status: 400 });
  }

  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
    select: { id: true },
  });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const updated = await prisma.envelope.update({
    where: { id: envelope.id },
    data: { title: parsed.data.title },
    select: { id: true, title: true },
  });
  await prisma.auditEvent.create({
    data: {
      envelopeId: envelope.id,
      eventType: "details_updated",
      metadata: { userId: context.user.id, title: updated.title },
    },
  });

  return NextResponse.json(updated);
}
