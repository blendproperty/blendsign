import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  const templates = await prisma.template.findMany({
    where: { orgId: key.orgId, apiIdentifier: { not: null } },
    select: {
      apiIdentifier: true,
      name: true,
      description: true,
      version: true,
      active: true,
      updatedAt: true,
      _count: { select: { roles: true, fields: true } },
      fields: { where: { dataKey: { not: null } }, select: { dataKey: true } },
    },
    orderBy: { name: "asc" },
  });

  const data = templates.map((template) => ({
    key: template.apiIdentifier,
    name: template.name,
    description: template.description,
    version: template.version,
    active: template.active,
    roleCount: template._count.roles,
    fieldCount: template._count.fields,
    mergeFieldCount: new Set(template.fields.map((field) => field.dataKey).filter(Boolean)).size,
    updatedAt: template.updatedAt,
    schemaUrl: `/api/v1/templates/${template.apiIdentifier}`,
  }));

  return NextResponse.json(
    { data, count: data.length, company: { id: key.org.id, name: key.org.name } },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
