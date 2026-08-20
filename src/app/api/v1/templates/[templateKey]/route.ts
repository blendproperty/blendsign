import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { templateKey: string } }
) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  const templateKey = params.templateKey.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateKey)) {
    return NextResponse.json({ error: "Invalid template key." }, { status: 400 });
  }

  const template = await prisma.template.findFirst({
    where: { orgId: key.orgId, apiIdentifier: templateKey },
    select: {
      apiIdentifier: true,
      name: true,
      description: true,
      version: true,
      active: true,
      updatedAt: true,
      roles: {
        select: {
          name: true,
          order: true,
          fields: {
            select: {
              type: true,
              label: true,
              dataKey: true,
              defaultValue: true,
              required: true,
              editableBySigner: true,
              page: true,
            },
            orderBy: [{ page: "asc" }, { id: "asc" }],
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  const fields = template.roles.flatMap((role) =>
    role.fields.map((field) => ({
      label: field.label,
      dataKey: field.dataKey,
      type: field.type,
      role: role.name,
      signingOrder: role.order,
      required: field.required,
      editableBySigner: field.editableBySigner,
      defaultValue: field.defaultValue,
      page: field.page,
    }))
  );

  const mergeFieldMap = new Map<string, {
    dataKey: string;
    labels: Set<string>;
    types: Set<string>;
    roles: Set<string>;
    pages: Set<number>;
    required: boolean;
    editableBySigner: boolean;
    occurrenceCount: number;
  }>();

  for (const field of fields) {
    if (!field.dataKey) continue;
    const current = mergeFieldMap.get(field.dataKey) || {
      dataKey: field.dataKey,
      labels: new Set<string>(),
      types: new Set<string>(),
      roles: new Set<string>(),
      pages: new Set<number>(),
      required: false,
      editableBySigner: false,
      occurrenceCount: 0,
    };
    if (field.label) current.labels.add(field.label);
    current.types.add(field.type);
    current.roles.add(field.role);
    current.pages.add(field.page);
    current.required ||= field.required;
    current.editableBySigner ||= field.editableBySigner;
    current.occurrenceCount += 1;
    mergeFieldMap.set(field.dataKey, current);
  }

  const mergeFields = Array.from(mergeFieldMap.values())
    .map((field) => ({
      dataKey: field.dataKey,
      labels: Array.from(field.labels),
      types: Array.from(field.types),
      roles: Array.from(field.roles),
      pages: Array.from(field.pages).sort((a, b) => a - b),
      required: field.required,
      editableBySigner: field.editableBySigner,
      occurrenceCount: field.occurrenceCount,
    }))
    .sort((a, b) => a.dataKey.localeCompare(b.dataKey));

  return NextResponse.json(
    {
      data: {
        key: template.apiIdentifier,
        name: template.name,
        description: template.description,
        version: template.version,
        active: template.active,
        updatedAt: template.updatedAt,
        roles: template.roles.map((role) => ({ name: role.name, signingOrder: role.order, fieldCount: role.fields.length })),
        mergeFields,
        fields,
      },
      company: { id: key.org.id, name: key.org.name },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
