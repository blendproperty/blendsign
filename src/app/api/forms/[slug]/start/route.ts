import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createEnvelopeFromTemplate } from "@/lib/templateEnvelope";

const schema = z.object({
  recipients: z.array(z.object({ roleId: z.string(), name: z.string().min(2), email: z.string().email() })).min(1),
});

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const signForm = await prisma.signForm.findUnique({
    where: { slug: params.slug },
    include: {
      template: { include: { roles: { include: { fields: true }, orderBy: { order: "asc" } } } },
    },
  });
  if (!signForm || !signForm.active || !signForm.template.active) return NextResponse.json({ error: "SignForm not found." }, { status: 404 });
  const roleIds = new Set(signForm.template.roles.map((role) => role.id));
  const recipientRoleIds = new Set(parsed.data.recipients.map((recipient) => recipient.roleId));
  if (parsed.data.recipients.length !== roleIds.size || recipientRoleIds.size !== roleIds.size || parsed.data.recipients.some((recipient) => !roleIds.has(recipient.roleId))) {
    return NextResponse.json({ error: "Provide one recipient for every signer role." }, { status: 400 });
  }

  const result = await createEnvelopeFromTemplate({
    template: signForm.template,
    recipients: parsed.data.recipients,
    createdById: signForm.template.createdById,
    title: signForm.name,
  });
  return NextResponse.json({ signingUrl: `/sign/${result.firstSigner.token}` }, { status: 201 });
}
