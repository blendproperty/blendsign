import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { createEnvelopeFromTemplate } from "@/lib/templateEnvelope";

const sendSchema = z.object({
  title: z.string().max(120).optional(),
  recipients: z.array(z.object({ roleId: z.string(), name: z.string().min(2), email: z.string().email() })).min(1),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = sendSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const template = await prisma.template.findFirst({
    where: { id: params.id, orgId: context.org.id },
    include: { roles: { include: { fields: true }, orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  if (!template.active) {
    return NextResponse.json({ error: "Activate this template before use." }, { status: 409 });
  }
  const roleIds = new Set(template.roles.map((role) => role.id));
  const recipientRoleIds = new Set(parsed.data.recipients.map((recipient) => recipient.roleId));
  if (parsed.data.recipients.length !== template.roles.length || recipientRoleIds.size !== roleIds.size || parsed.data.recipients.some((recipient) => !roleIds.has(recipient.roleId))) {
    return NextResponse.json({ error: "Provide one recipient for every signer role." }, { status: 400 });
  }

  const result = await createEnvelopeFromTemplate({
    template,
    recipients: parsed.data.recipients,
    createdById: context.user.id,
    title: parsed.data.title,
  });
  return NextResponse.json({ envelopeId: result.envelope.id }, { status: 201 });
}
