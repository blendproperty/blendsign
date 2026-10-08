import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!key) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers });
  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: key.orgId, deletedAt: null },
    include: { signers: { orderBy: { order: "asc" } } },
  });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404, headers });
  if (["VOIDED", "DECLINED", "EXPIRED"].includes(envelope.status) || (envelope.expiresAt && envelope.expiresAt <= new Date())) {
    return NextResponse.json({ error: "This agreement cannot be signed." }, { status: 409, headers });
  }
  const pending = envelope.signers.filter(signer => signer.status !== "SIGNED");
  const order = Math.min(...pending.map(signer => signer.order));
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return NextResponse.json({
    envelopeId: envelope.id,
    status: envelope.status,
    signers: envelope.signers.map(signer => ({
      name: signer.name, order: signer.order, status: signer.status,
      signingUrl: signer.order === order && !signer.autoSign && ["PENDING", "VIEWED"].includes(signer.status) && envelope.status !== "COMPLETED"
        ? `${base}/sign/${signer.token}` : null,
    })),
  }, { headers });
}
