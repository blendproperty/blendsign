import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(160),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  countryCode: z.string().trim().max(8).default("+27"),
  shared: z.boolean().default(true),
});

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const contacts = await prisma.contact.findMany({ where: { orgId: context.org.id }, orderBy: { name: "asc" } });
  return NextResponse.json({ contacts });
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = contactSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid contact name and email address." }, { status: 400 });
  const contact = await prisma.contact.create({ data: { ...parsed.data, email: parsed.data.email || null, orgId: context.org.id } });
  return NextResponse.json({ contact }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = contactSchema.safeParse(await request.json());
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: "Contact is invalid." }, { status: 400 });
  const existing = await prisma.contact.findFirst({ where: { id: parsed.data.id, orgId: context.org.id } });
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const { id, ...data } = parsed.data;
  const contact = await prisma.contact.update({ where: { id }, data: { ...data, email: data.email || null } });
  return NextResponse.json({ contact });
}

export async function DELETE(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Contact is required." }, { status: 400 });
  await prisma.contact.deleteMany({ where: { id, orgId: context.org.id } });
  return NextResponse.json({ ok: true });
}
