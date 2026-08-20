import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TemplateRole } from "@prisma/client";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const fieldSchema = z.object({
  roleIndex: z.number().int().min(0),
  type: z.enum(["SIGNATURE", "INITIALS", "DATE", "TEXT", "CHECKBOX"]),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.02).max(1),
  height: z.number().min(0.02).max(1),
});

const templateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  originalKey: z.string().min(1),
  roles: z.array(z.object({ name: z.string().min(2).max(80), order: z.number().int().min(0) })).min(1).max(20),
  fields: z.array(fieldSchema).min(1).max(300),
});

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = templateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  if (!data.originalKey.startsWith(`${context.org.id}/originals/`)) {
    return NextResponse.json({ error: "The PDF does not belong to the active company." }, { status: 403 });
  }
  if (data.fields.some((field) => field.roleIndex >= data.roles.length)) {
    return NextResponse.json({ error: "A field has an invalid signer role." }, { status: 400 });
  }
  if (data.fields.some((field) => field.x + field.width > 1.000001 || field.y + field.height > 1.000001)) {
    return NextResponse.json({ error: "A signing field extends beyond the PDF page." }, { status: 400 });
  }

  const template = await prisma.template.create({
    data: {
      orgId: context.org.id,
      createdById: context.user.id,
      name: data.name,
      description: data.description || null,
      originalKey: data.originalKey,
    },
  });

  const roles: TemplateRole[] = [];
  for (const role of data.roles) {
    roles.push(await prisma.templateRole.create({ data: { templateId: template.id, ...role } }));
  }

  await prisma.templateField.createMany({
    data: data.fields.map((field) => ({
      templateId: template.id,
      roleId: roles[field.roleIndex].id,
      type: field.type,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    })),
  });

  return NextResponse.json({ template: { ...template, roles } }, { status: 201 });
}
