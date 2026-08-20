import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import NewSignForm from "@/components/NewSignForm";

export const dynamic = "force-dynamic";

export default async function NewSignFormPage() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const templates = await prisma.template.findMany({ where: { orgId: context.org.id, active: true }, orderBy: { name: "asc" }, include: { _count: { select: { roles: true, fields: true } } } });
  return <NewSignForm templates={templates.map((template) => ({ id: template.id, name: template.name, roles: template._count.roles, fields: template._count.fields }))} />;
}
