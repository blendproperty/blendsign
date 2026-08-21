import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    select: {
      envelope: {
        select: { status: true, signedKey: true, deletedAt: true },
      },
    },
  });

  if (!signer || signer.envelope.deletedAt) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      completed:
        signer.envelope.status === "COMPLETED" && Boolean(signer.envelope.signedKey),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
