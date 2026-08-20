import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).optional(),
  templateId: z.string(),
});

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const template = await prisma.template.findFirst({ where: { id: parsed.data.templateId, orgId: context.org.id, active: true } });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const existing = await prisma.signForm.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return NextResponse.json({ error: "That public link is already in use." }, { status: 409 });

  const signForm = await prisma.signForm.create({
    data: {
      orgId: context.org.id,
      templateId: template.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
    },
  });
  return NextResponse.json({ signForm }, { status: 201 });
}
