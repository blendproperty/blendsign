import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ENTITY_COOKIE, getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const parsed = z.object({ entityId: z.string().min(1) }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Entity is required." }, { status: 400 });
  const entity = await prisma.org.findUnique({ where: { id: parsed.data.entityId } });
  if (!entity) return NextResponse.json({ error: "Entity not found." }, { status: 404 });
  if (!session.superAdmin) {
    const membership = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: entity.id, userId: session.userId } },
    });
    if (!membership) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const response = NextResponse.json({ entity });
  response.cookies.set(ENTITY_COOKIE, entity.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
