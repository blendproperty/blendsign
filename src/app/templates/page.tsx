import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const templates = await prisma.template.findMany({
    where: { orgId: context.org.id },
    include: { _count: { select: { roles: true, fields: true, signForms: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="page">
      <section className="page-heading page-heading--row">
        <div><p className="eyebrow">Reusable workflows</p><h1>Templates</h1><p>Prepare approved documents once, including signer roles and every required field position.</p></div>
        <Link href="/templates/new" className="button button--dark"><Icon name="plus" size={18} /> Create template</Link>
      </section>
      {templates.length ? (
        <section className="template-grid">
          {templates.map((template) => (
            <article className="panel template-card" key={template.id}>
              <span className="template-card-icon"><Icon name="template" size={24} /></span>
              <div><p className="eyebrow">Signing template</p><h2>{template.name}</h2><p>{template.description || "Reusable PDF signing workflow"}</p></div>
              <dl><div><dt>Signer roles</dt><dd>{template._count.roles}</dd></div><div><dt>Fields</dt><dd>{template._count.fields}</dd></div><div><dt>SignForms</dt><dd>{template._count.signForms}</dd></div></dl>
              <div className="template-card-actions"><a className="button button--quiet" href={`/api/templates/${template.id}/document`} target="_blank" rel="noreferrer">View PDF</a><Link className="button button--quiet" href={`/templates/${template.id}/edit`}>Edit</Link><Link className="button button--accent" href={`/templates/${template.id}/use`}>Use template</Link></div>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel empty-state"><span><Icon name="template" size={34} /></span><h2>No templates yet</h2><p>Create the first reusable lease or agreement and place its signing fields visually.</p><Link className="button button--dark" href="/templates/new">Create template</Link></section>
      )}
    </div>
  );
}
