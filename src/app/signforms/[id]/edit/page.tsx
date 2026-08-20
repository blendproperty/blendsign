import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import NewSignForm from "@/components/NewSignForm";

export const dynamic = "force-dynamic";

export default async function EditSignFormPage({ params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const signForm = await prisma.signForm.findFirst({ where: { id: params.id, orgId: context.org.id } });
  if (!signForm) notFound();
  const templates = await prisma.template.findMany({
    where: { orgId: context.org.id, OR: [{ active: true }, { id: signForm.templateId }] },
    orderBy: { name: "asc" },
    include: { _count: { select: { roles: true, fields: true } } },
  });

  return <NewSignForm
    templates={templates.map((template) => ({ id: template.id, name: template.name, roles: template._count.roles, fields: template._count.fields }))}
    initial={{ id: signForm.id, name: signForm.name, slug: signForm.slug, description: signForm.description || "", templateId: signForm.templateId, active: signForm.active }}
  />;
}
