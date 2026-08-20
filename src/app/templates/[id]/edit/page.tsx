import { notFound, redirect } from "next/navigation";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import TemplateEditor from "@/components/TemplateEditor";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const template = await prisma.template.findFirst({
    where: { id: params.id, orgId: context.org.id },
    include: { roles: { orderBy: { order: "asc" } }, fields: { orderBy: [{ page: "asc" }, { id: "asc" }] } },
  });
  if (!template) notFound();
  const roleIndex = new Map(template.roles.map((role, index) => [role.id, index]));

  return <TemplateEditor initial={{
    id: template.id,
    name: template.name,
    description: template.description || "",
    apiIdentifier: template.apiIdentifier || "",
    version: template.version,
    active: template.active,
    canEditIdentifier: canAdminister(context),
    documentUrl: `/api/templates/${template.id}/document`,
    roles: template.roles.map(({ name, order }) => ({ name, order })),
    fields: template.fields.map(({ id, roleId, type, label, dataKey, defaultValue, required, editableBySigner, page, x, y, width, height }) => ({
      id,
      roleIndex: roleIndex.get(roleId) ?? 0,
      type,
      label: label || `${template.roles[roleIndex.get(roleId) ?? 0]?.name || "Signer"} ${type.toLowerCase()}`,
      dataKey: dataKey || "",
      defaultValue: defaultValue || "",
      required,
      editableBySigner,
      page,
      x,
      y,
      width,
      height,
    })),
  }} />;
}
