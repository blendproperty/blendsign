import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { presignedDownloadUrl } from "@/lib/storage";
import SignClient from "./SignClient";

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
    include: { envelope: true, fields: true },
  });

  if (!signer) return notFound();

  const docUrl = await presignedDownloadUrl(signer.envelope.originalKey);

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 24px" }}>
      <h1>{signer.envelope.title}</h1>
      <p>Signing as {signer.name}</p>

      {signer.status === "SIGNED" ? (
        <p>You&rsquo;ve already signed this document.</p>
      ) : (
        <>
          <p>
            <a href={docUrl} target="_blank" rel="noreferrer">
              View the full document →
            </a>
          </p>
          <SignClient
            token={params.token}
            documentTitle={signer.envelope.title}
            fields={signer.fields.map((f) => ({
              id: f.id,
              type: f.type,
              page: f.page,
              x: f.x,
              y: f.y,
              width: f.width,
              height: f.height,
            }))}
          />
        </>
      )}
    </main>
  );
}
