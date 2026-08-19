import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const createEnvelopeSchema = z.object({
  orgId: z.string(),
  createdById: z.string(),
  title: z.string().min(1),
  originalKey: z.string(),
  signers: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        order: z.number().int().default(0),
      })
    )
    .min(1),
});

// POST /api/envelopes — create a draft envelope with signers.
// The actual PDF upload happens separately against object storage;
// this expects `originalKey` to already reference the uploaded file.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { orgId, createdById, title, originalKey, signers } = parsed.data;

  const envelope = await prisma.envelope.create({
    data: {
      orgId,
      createdById,
      title,
      originalKey,
      signers: {
        create: signers.map((s) => ({
          name: s.name,
          email: s.email,
          phone: s.phone,
          order: s.order,
          token: randomBytes(24).toString("hex"),
        })),
      },
      auditEvents: {
        create: { eventType: "created" },
      },
    },
    include: { signers: true },
  });

  return NextResponse.json({ envelope }, { status: 201 });
}

export async function GET() {
  const envelopes = await prisma.envelope.findMany({
    orderBy: { createdAt: "desc" },
    include: { signers: true },
  });
  return NextResponse.json({ envelopes });
}
