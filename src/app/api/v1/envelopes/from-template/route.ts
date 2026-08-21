import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { createEnvelopeFromTemplate } from "@/lib/templateEnvelope";

const requestSchema = z.object({
  templateKey: z.string().trim().min(1).max(120),
  externalReference: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(120).optional(),
  data: z.record(z.string(), z.string().max(5000)).default({}),
  recipients: z.array(z.object({
    role: z.string().trim().min(1).max(120),
    name: z.string().trim().min(2).max(160),
    email: z.string().email(),
    autoSign: z.boolean().optional().default(false),
  })).min(1),
});

function envelopeResponse(envelope: { id: string; status: string }, signers: Array<{ id: string; name: string; email: string | null; order: number; token: string }>, idempotent: boolean) {
  const baseUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  return {
    envelopeId: envelope.id,
    status: envelope.status,
    idempotent,
    signers: signers.map((signer) => ({
      id: signer.id,
      name: signer.name,
      email: signer.email,
      order: signer.order,
      signingUrl: baseUrl ? `${baseUrl}/sign/${signer.token}` : `/sign/${signer.token}`,
    })),
  };
}

export async function POST(request: NextRequest) {
  const apiKey = await authenticateApiKey(request.headers.get("authorization"));
  if (!apiKey) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return NextResponse.json({ error: "Provide an Idempotency-Key header between 8 and 200 characters." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.envelope.findUnique({
    where: { orgId_idempotencyKey: { orgId: apiKey.orgId, idempotencyKey } },
    include: { signers: { orderBy: { order: "asc" } } },
  });
  if (existing) return NextResponse.json(envelopeResponse(existing, existing.signers, true));

  const template = await prisma.template.findFirst({
    where: { orgId: apiKey.orgId, apiIdentifier: parsed.data.templateKey, active: true },
    include: { roles: { include: { fields: true }, orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Active template not found." }, { status: 404 });

  const allowedKeys = new Set(template.roles.flatMap((role) => role.fields.map((field) => field.dataKey).filter((value): value is string => Boolean(value))));
  const unknownKeys = Object.keys(parsed.data.data).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) return NextResponse.json({ error: "Unknown template data keys.", unknownKeys }, { status: 400 });

  const roleByName = new Map(template.roles.map((role) => [role.name.toLowerCase(), role]));
  const suppliedRoles = new Set(parsed.data.recipients.map((recipient) => recipient.role.toLowerCase()));
  if (parsed.data.recipients.length !== template.roles.length || suppliedRoles.size !== template.roles.length || parsed.data.recipients.some((recipient) => !roleByName.has(recipient.role.toLowerCase()))) {
    return NextResponse.json({ error: "Provide one recipient for every template role." }, { status: 400 });
  }

  const recipients = parsed.data.recipients.map((recipient) => ({
    roleId: roleByName.get(recipient.role.toLowerCase())!.id,
    name: recipient.name,
    email: recipient.email,
    autoSign: recipient.autoSign,
  }));

  if (recipients.some((recipient) => recipient.autoSign)) {
    const organisation = await prisma.org.findUnique({ where: { id: apiKey.orgId }, select: { autoSignEnabled: true, signatureKey: true, initialsKey: true, authorisedSignerName: true } });
    if (!organisation?.autoSignEnabled || !organisation.signatureKey || !organisation.initialsKey || !organisation.authorisedSignerName) {
      return NextResponse.json({ error: "Authorised company auto-signing is not fully configured or enabled." }, { status: 409 });
    }
    if (recipients.filter((recipient) => recipient.autoSign).length > 1) {
      return NextResponse.json({ error: "Only one authorised company recipient may auto-sign an envelope." }, { status: 400 });
    }
  }

  try {
    const result = await createEnvelopeFromTemplate({
      template,
      recipients,
      createdById: template.createdById,
      title: parsed.data.title,
      externalSystem: "stor24",
      externalReference: parsed.data.externalReference,
      idempotencyKey,
      data: parsed.data.data,
    });
    return NextResponse.json(envelopeResponse(result.envelope, result.signers, false), { status: 201 });
  } catch (error) {
    const raced = await prisma.envelope.findUnique({
      where: { orgId_idempotencyKey: { orgId: apiKey.orgId, idempotencyKey } },
      include: { signers: { orderBy: { order: "asc" } } },
    });
    if (raced) return NextResponse.json(envelopeResponse(raced, raced.signers, true));
    throw error;
  }
}
