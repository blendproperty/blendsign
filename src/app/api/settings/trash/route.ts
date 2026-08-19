import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage";

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required for permanent deletion." }, { status: 403 });
  const documents = await prisma.envelope.findMany({ where: { orgId: context.org.id, deletedAt: { not: null } }, include: { createdBy: true, signers: true }, orderBy: { deletedAt: "desc" } });
  return NextResponse.json({ documents });
}

export async function PATCH(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = z.object({ id: z.string() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Document is required." }, { status: 400 });
  await prisma.envelope.updateMany({ where: { id: parsed.data.id, orgId: context.org.id }, data: { deletedAt: null } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required for permanent deletion." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Document is required." }, { status: 400 });
  const existing = await prisma.envelope.findFirst({ where: { id, orgId: context.org.id, deletedAt: { not: null } } });
  if (!existing) return NextResponse.json({ error: "Document not found in trash." }, { status: 404 });
  await deleteObject(existing.originalKey);
  if (existing.signedKey) await deleteObject(existing.signedKey);
  await prisma.envelope.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
