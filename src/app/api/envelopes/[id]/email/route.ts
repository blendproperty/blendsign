import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { enqueueEmailDocument } from "@/lib/queue";

const emailSchema = z.object({
  emails: z.array(z.string().trim().email()).min(1).max(3),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const parsed = emailSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter between one and three valid email addresses." }, { status: 400 });
  }
  const emails = [...new Set(parsed.data.emails.map((email) => email.toLowerCase()))];

  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
    select: { id: true, signedKey: true },
  });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (!envelope.signedKey) {
    return NextResponse.json({ error: "The completed PDF is not ready yet." }, { status: 409 });
  }

  await enqueueEmailDocument(envelope.id, emails, context.user.id);
  return NextResponse.json({ queued: true, recipients: emails.length }, { status: 202 });
}
