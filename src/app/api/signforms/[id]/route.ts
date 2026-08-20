import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).optional(),
  templateId: z.string(),
  active: z.boolean(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const signForm = await prisma.signForm.findFirst({ where: { id: params.id, orgId: context.org.id } });
  if (!signForm) return NextResponse.json({ error: "SignForm not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const template = await prisma.template.findFirst({ where: { id: parsed.data.templateId, orgId: context.org.id } });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  if (parsed.data.active && !template.active) {
    return NextResponse.json({ error: "An active SignForm requires an active template." }, { status: 409 });
  }
  const duplicate = await prisma.signForm.findFirst({ where: { slug: parsed.data.slug, id: { not: signForm.id } } });
  if (duplicate) return NextResponse.json({ error: "That public link is already in use." }, { status: 409 });

  const updated = await prisma.signForm.update({
    where: { id: signForm.id },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      templateId: template.id,
      active: parsed.data.active,
    },
  });
  return NextResponse.json({ signForm: updated });
}
