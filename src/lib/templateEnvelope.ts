import { randomBytes, randomUUID } from "crypto";
import type { Template, TemplateField, TemplateRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer, putObjectBuffer } from "@/lib/storage";
import { enqueueSendSigningLink, enqueueWebhookEvent } from "@/lib/queue";
import { signerCanEditField } from "@/lib/signingFieldPolicy";

type PreparedTemplate = Template & {
  roles: (TemplateRole & { fields: TemplateField[] })[];
};

type RoleRecipient = {
  roleId: string;
  name: string;
  email: string;
  autoSign?: boolean;
};

export async function createEnvelopeFromTemplate({
  template,
  recipients,
  createdById,
  title,
  externalSystem,
  externalReference,
  idempotencyKey,
  sourceType = "TEMPLATE",
  sourceName,
  data,
}: {
  template: PreparedTemplate;
  recipients: RoleRecipient[];
  createdById: string;
  title?: string;
  externalSystem?: string;
  externalReference?: string;
  idempotencyKey?: string;
  sourceType?: "TEMPLATE" | "SIGNFORM" | "API";
  sourceName?: string;
  data?: Record<string, string>;
}) {
  const source = await getObjectBuffer(template.originalKey);
  const safeName = template.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const originalKey = `${template.orgId}/originals/${randomUUID()}-${safeName}.pdf`;
  await putObjectBuffer(originalKey, source, "application/pdf");

  const envelope = await prisma.envelope.create({
    data: {
      orgId: template.orgId,
      createdById,
      title: title?.trim() || template.name,
      externalSystem,
      externalReference,
      idempotencyKey,
      originalKey,
      status: "SENT",
      auditEvents: { create: { eventType: "created", metadata: { sourceType, sourceName, templateId: template.id, templateName: template.name, templateKey: template.apiIdentifier, templateVersion: template.version, externalSystem, externalReference } } },
    },
  });

  const recipientByRole = new Map(recipients.map((recipient) => [recipient.roleId, recipient]));
  const signerByRole = new Map<string, string>();
  const createdSigners = [];

  for (const role of template.roles.sort((a, b) => a.order - b.order)) {
    const recipient = recipientByRole.get(role.id);
    if (!recipient) throw new Error(`Recipient missing for ${role.name}`);
    const signer = await prisma.signer.create({
      data: {
        envelopeId: envelope.id,
        name: recipient.name,
        email: recipient.email,
        order: role.order,
        token: randomBytes(24).toString("hex"),
        autoSign: Boolean(recipient.autoSign),
      },
    });
    signerByRole.set(role.id, signer.id);
    createdSigners.push(signer);
  }

  const fields = template.roles.flatMap((role) =>
    role.fields.map((field) => ({
      envelopeId: envelope.id,
      signerId: signerByRole.get(role.id)!,
      type: field.type,
      label: field.label,
      dataKey: field.dataKey,
      required: field.required,
      editableBySigner: signerCanEditField({ editableBySigner: field.editableBySigner, externalSystem, dataKey: field.dataKey }),
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      value: field.dataKey && data?.[field.dataKey] !== undefined ? data[field.dataKey] : field.defaultValue,
    }))
  );
  if (fields.length) await prisma.field.createMany({ data: fields });

  const firstOrder = Math.min(...createdSigners.map((signer) => signer.order));
  await Promise.all(
    createdSigners
      .filter((signer) => signer.order === firstOrder)
      .map((signer) => enqueueSendSigningLink(signer.id))
  );
  await enqueueWebhookEvent(envelope.id, "envelope.sent");

  return {
    envelope,
    signers: createdSigners,
    firstSigner: createdSigners.find((signer) => signer.order === firstOrder)!,
  };
}
