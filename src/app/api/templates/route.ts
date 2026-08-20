import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TemplateRole } from "@prisma/client";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const fieldSchema = z.object({
  roleIndex: z.number().int().min(0),
  type: z.enum(["SIGNATURE", "INITIALS", "DATE", "TEXT", "CHECKBOX"]),
  label: z.string().trim().min(2).max(120),
  dataKey: z.string().trim().max(120).refine((value) => !value || /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/.test(value), "Use a dotted data key such as tenant.fullName."),
  defaultValue: z.string().max(500),
  required: z.boolean(),
  editableBySigner: z.boolean(),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.02).max(1),
  height: z.number().min(0.02).max(1),
}).superRefine((field, context) => {
  if ((field.type === "SIGNATURE" || field.type === "INITIALS") && (field.dataKey || field.defaultValue)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Signature and initials fields cannot have a data key or default value." });
  }
  if ((field.type === "SIGNATURE" || field.type === "INITIALS") && !field.editableBySigner) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Signature and initials fields must be completed by the signer." });
  }
});

const apiIdentifierSchema = z.string().trim().min(3).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens only.")
  .refine((value) => !/^bs[-_]live[-_]/i.test(value), "Use a public template identifier such as stor24-unit-lease, not a company API secret.");

const templateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  apiIdentifier: apiIdentifierSchema,
  active: z.boolean().default(true),
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
  if (new Set(data.roles.map((role) => role.name.trim().toLowerCase())).size !== data.roles.length) {
    return NextResponse.json({ error: "Signer role names must be unique." }, { status: 400 });
  }
  const duplicate = await prisma.template.findFirst({ where: { orgId: context.org.id, apiIdentifier: data.apiIdentifier } });
  if (duplicate) {
    return NextResponse.json({ error: "That template identifier is already in use for this company." }, { status: 409 });
  }

  const template = await prisma.template.create({
    data: {
      orgId: context.org.id,
      createdById: context.user.id,
      name: data.name,
      description: data.description || null,
      apiIdentifier: data.apiIdentifier,
      active: data.active,
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
      label: field.label,
      dataKey: field.dataKey || null,
      defaultValue: field.defaultValue || null,
      required: field.required,
      editableBySigner: field.editableBySigner,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    })),
  });

  return NextResponse.json({ template: { ...template, roles } }, { status: 201 });
}
