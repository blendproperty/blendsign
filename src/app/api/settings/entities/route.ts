import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext, listAccessibleOrgs } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const entitySchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email().optional().or(z.literal("")),
  country: z.string().trim().default("South Africa"),
  timezone: z.string().trim().default("Africa/Johannesburg"),
});

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!context.session.superAdmin) return NextResponse.json({ error: "Only the BlendSign administrator can create companies." }, { status: 403 });
  return NextResponse.json({ entities: await listAccessibleOrgs(), activeId: context.org.id });
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!context.session.superAdmin) return NextResponse.json({ error: "Only the BlendSign administrator can create companies." }, { status: 403 });
  const parsed = entitySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid company name and email address." }, { status: 400 });
  const entity = await prisma.org.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email || null,
      country: parsed.data.country,
      timezone: parsed.data.timezone,
      emailFromName: parsed.data.name,
      memberships: { create: { userId: context.user.id, role: "owner" } },
    },
  });
  return NextResponse.json({ entity }, { status: 201 });
}
