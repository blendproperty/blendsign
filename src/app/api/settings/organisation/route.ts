import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

const optionalText = z.string().trim().max(500).optional().nullable();
const organisationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  street: optionalText,
  city: optionalText,
  province: optionalText,
  country: z.string().trim().min(2).max(100),
  postalCode: optionalText,
  email: z.string().email().optional().nullable().or(z.literal("")),
  timezone: z.string().trim().min(2).max(80),
  customDomain: optionalText,
  legalDisclosure: z.string().trim().max(10000).optional().nullable(),
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  primaryColour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  emailFromName: optionalText,
  emailFromAddress: z.string().email().optional().nullable().or(z.literal("")),
});

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  return NextResponse.json({ organisation: context.org });
}

export async function PATCH(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = organisationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the organisation and branding fields." }, { status: 400 });
  const data = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, value === "" ? null : value]));
  const organisation = await prisma.org.update({ where: { id: context.org.id }, data });
  return NextResponse.json({ organisation });
}
