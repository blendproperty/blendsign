import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

function contentType(key: string) {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function dataUri(key: string) {
  const file = await getObjectBuffer(key);
  return `data:${contentType(key)};base64,${file.toString("base64")}`;
}

export async function applyAuthorisedCompanySignature(signerId: string) {
  const signer = await prisma.signer.findUnique({
    where: { id: signerId },
    include: { fields: true, envelope: { include: { org: true } } },
  });
  if (!signer || signer.status === "SIGNED") return Boolean(signer);
  const org = signer.envelope.org;
  if (!signer.autoSign || !org.autoSignEnabled || !org.signatureKey || !org.initialsKey || !org.authorisedSignerName) return false;

  const resolvedFields = signer.fields.map((field) => {
    if (field.value || field.type !== "TEXT") return field;
    const identity = `${field.dataKey || ""} ${field.label || ""}`.toLowerCase();
    let value: string | null = null;
    if (/signed\s*at|signing\s*(town|city|place|location)/.test(identity)) value = org.city;
    else if (/full\s*name|representative.*name|signer.*name/.test(identity)) value = org.authorisedSignerName;
    else if (/title|capacity|position/.test(identity)) value = org.authorisedSignerTitle;
    return value ? { ...field, value } : field;
  });
  const unresolved = resolvedFields.filter((field) => field.required && !field.value && !["SIGNATURE", "INITIALS", "DATE"].includes(field.type));
  if (unresolved.length) return false;
  const signature = resolvedFields.some((field) => field.type === "SIGNATURE") ? await dataUri(org.signatureKey) : null;
  const initials = resolvedFields.some((field) => field.type === "INITIALS") ? await dataUri(org.initialsKey) : null;
  const signedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const field of resolvedFields) {
      let value = field.value;
      if (field.type === "SIGNATURE") value = signature;
      else if (field.type === "INITIALS") value = initials;
      else if (field.type === "DATE" && !value) value = signedAt.toISOString().slice(0, 10);
      if (value !== field.value) await tx.field.update({ where: { id: field.id }, data: { value } });
    }
    await tx.signer.update({ where: { id: signer.id }, data: { status: "SIGNED", signedAt } });
    await tx.auditEvent.create({ data: { envelopeId: signer.envelopeId, signerId: signer.id, eventType: "auto_signed", metadata: { authorisedSignerName: org.authorisedSignerName, authorisedSignerTitle: org.authorisedSignerTitle, source: "stored_company_signing_assets" } } });
  });
  return true;
}
