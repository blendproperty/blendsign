import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  const envelopes = await prisma.envelope.findMany({ where: { orgId: key.orgId, deletedAt: null }, include: { signers: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ data: envelopes, count: envelopes.length });
}
