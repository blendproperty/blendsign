import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import FormStartClient from "@/components/FormStartClient";

export const dynamic = "force-dynamic";

export default async function PublicSignFormPage({ params }: { params: { slug: string } }) {
  const signForm = await prisma.signForm.findUnique({ where: { slug: params.slug }, include: { org: true, template: { include: { roles: { orderBy: { order: "asc" } } } } } });
  if (!signForm || !signForm.active) notFound();
  const style = { "--sign-primary": signForm.org.primaryColour, "--sign-accent": signForm.org.accentColour } as CSSProperties;
  return <main className="sign-recipient public-signform" style={style}><header className="sign-recipient-header"><div className="sign-company-brand">{signForm.org.logoUrl ? <img src={signForm.org.logoUrl} alt={`${signForm.org.name} logo`} /> : <strong>{signForm.org.name}</strong>}</div><div className="sign-powered">Securely powered by <b>blendSIGN</b></div></header><div className="public-signform-body"><section className="public-signform-intro"><p className="eyebrow">Secure online form</p><h1>{signForm.name}</h1><p>{signForm.description || `Complete the details below to begin ${signForm.template.name}.`}</p></section><FormStartClient slug={signForm.slug} roles={signForm.template.roles.map(({ id, name, order }) => ({ id, name, order }))} /></div></main>;
}
