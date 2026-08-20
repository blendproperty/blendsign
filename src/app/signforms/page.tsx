import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SignForms() {
  const context = await getRequestContext();
  if (!context) redirect("/login");
  const signForms = await prisma.signForm.findMany({
    where: { orgId: context.org.id },
    include: { template: { include: { _count: { select: { roles: true, fields: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
  const domain = process.env.APP_DOMAIN || "localhost:3000";

  return <div className="page"><section className="page-heading page-heading--row"><div><p className="eyebrow">Public signing links</p><h1>SignForms</h1><p>Share a reusable link that creates a fresh, auditable signing request from an approved template.</p></div><Link href="/signforms/new" className="button button--dark"><Icon name="plus" size={18} /> Create SignForm</Link></section>{signForms.length ? <section className="signform-list">{signForms.map((form) => <article className="panel signform-card" key={form.id}><span className="signform-card-icon"><Icon name="link" size={23} /></span><div><div className="signform-title-line"><h2>{form.name}</h2><span className={`status ${form.active ? "status--completed" : ""}`}>{form.active ? "Active" : "Paused"}</span></div><p>{form.description || `Based on ${form.template.name}`}</p><a href={`https://${domain}/form/${form.slug}`} target="_blank" rel="noreferrer">https://{domain}/form/{form.slug}</a><small>{form.template._count.roles} signer role{form.template._count.roles === 1 ? "" : "s"} · {form.template._count.fields} fields</small></div><div className="signform-card-actions"><Link className="button button--quiet" href={`/signforms/${form.id}/edit`}>Edit</Link><a className="button button--quiet" href={`/form/${form.slug}`} target="_blank" rel="noreferrer">Open form</a></div></article>)}</section> : <section className="panel empty-state"><span><Icon name="link" size={34} /></span><h2>No SignForms yet</h2><p>Create a template first, then publish it as a secure public signing link.</p><Link className="button button--dark" href="/signforms/new">Create SignForm</Link></section>}</div>;
}
