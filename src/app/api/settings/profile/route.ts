import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({
  firstName: z.string().trim().max(80).optional().nullable(),
  lastName: z.string().trim().max(80).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  dateFormat: z.string().trim().max(50),
  timezone: z.string().trim().max(80),
});

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ profile: context.user });
}

export async function PATCH(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the profile fields and try again." }, { status: 400 });
  const name = [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ") || context.user.name;
  const profile = await prisma.user.update({ where: { id: context.user.id }, data: { ...parsed.data, name } });
  return NextResponse.json({ profile });
}
