import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

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

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: "0 24px" }}>
      <h1>{signer.envelope.title}</h1>
      <p>Signing as {signer.name}</p>
      <p>Status: {signer.status}</p>
      {/* TODO: PDF.js viewer + field overlay + signature capture pad */}
      <p style={{ color: "#888" }}>
        Document viewer and signature capture to be implemented here.
      </p>
    </main>
  );
}
