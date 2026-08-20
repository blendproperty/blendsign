import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import UseTemplateForm from "@/components/UseTemplateForm";

export const dynamic = "force-dynamic";

export default async function UseTemplatePage({ params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const template = await prisma.template.findFirst({
    where: { id: params.id, orgId: context.org.id, active: true },
    include: { roles: { orderBy: { order: "asc" } } },
  });
  if (!template) notFound();
  return <UseTemplateForm template={{ id: template.id, name: template.name, description: template.description, roles: template.roles.map(({ id, name, order }) => ({ id, name, order })) }} />;
}
