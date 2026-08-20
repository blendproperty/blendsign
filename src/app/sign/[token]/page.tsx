import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import SignClient from "./SignClient";
import { Icon } from "@/components/Icon";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

// Public, unauthenticated signer view — the tokenized link sent via
// email/WhatsApp lands here. No login required for signers.
export default async function SignPage({
  params,
}: {
  params: { token: string };
}) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: { envelope: { include: { org: true } }, fields: true },
  });

  if (!signer) return notFound();

  const docUrl = `/api/sign/${params.token}/document`;

  const organisation = signer.envelope.org;
  const logoUrl = organisation.logoKey ? `/api/brand/${organisation.id}/logo?v=${organisation.updatedAt.getTime()}` : organisation.logoUrl;
  const brandStyle = { "--sign-primary": organisation.primaryColour, "--sign-accent": organisation.accentColour } as CSSProperties;
  return (
    <main className="sign-recipient" style={brandStyle}>
      <header className="sign-recipient-header"><div className="sign-company-brand">{logoUrl ? <img src={logoUrl} alt={`${organisation.name} logo`} /> : <strong>{organisation.name}</strong>}</div><div className="sign-powered">Securely powered by <b>blendSIGN</b></div></header>
      <div className="sign-recipient-body">
        <section className="sign-document-card"><span><Icon name="file" size={25} /></span><div><small>Signature request from {organisation.name}</small><h1>{signer.envelope.title}</h1><p>Prepared for {signer.name}</p></div><a href={docUrl} target="_blank" rel="noreferrer" className="button button--outline">View PDF</a></section>
        <section className="sign-fields-card panel">
          {signer.status === "SIGNED" ? <div className="sign-complete"><span><Icon name="check" size={29} /></span><h2>Already signed</h2><p>Your signature has been securely recorded.</p></div> : <SignClient token={params.token} signerName={signer.name} documentTitle={signer.envelope.title} legalDisclosure={organisation.legalDisclosure || undefined} fields={signer.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, required: f.required, editableBySigner: f.editableBySigner, value: f.value, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height }))} />}
        </section>
      </div>
    </main>
  );
}
