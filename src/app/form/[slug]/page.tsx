import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import FormStartClient from "@/components/FormStartClient";

export const dynamic = "force-dynamic";

export default async function PublicSignFormPage({ params }: { params: { slug: string } }) {
  const signForm = await prisma.signForm.findUnique({ where: { slug: params.slug }, include: { org: true, template: { include: { roles: { orderBy: { order: "asc" } } } } } });
  if (!signForm || !signForm.active || !signForm.template.active) notFound();
  const style = { "--sign-primary": signForm.org.primaryColour, "--sign-accent": signForm.org.accentColour } as CSSProperties;
  const logoUrl = signForm.org.logoKey ? `/api/brand/${signForm.org.id}/logo?v=${signForm.org.updatedAt.getTime()}` : signForm.org.logoUrl;
  return <main className="sign-recipient public-signform" style={style}><header className="sign-recipient-header"><div className="sign-company-brand">{logoUrl ? <img src={logoUrl} alt={`${signForm.org.name} logo`} /> : <strong>{signForm.org.name}</strong>}</div><div className="sign-powered">Securely powered by <b>blendSIGN</b></div></header><div className="public-signform-body"><section className="public-signform-intro"><p className="eyebrow">Secure online form</p><h1>{signForm.name}</h1><p>{signForm.description || `Complete the details below to begin ${signForm.template.name}.`}</p></section><FormStartClient slug={signForm.slug} roles={signForm.template.roles.map(({ id, name, order }) => ({ id, name, order }))} /></div></main>;
}
