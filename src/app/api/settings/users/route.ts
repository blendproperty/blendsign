import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { hashPassword, temporaryPassword } from "@/lib/password";

const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(160),
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]),
  password: z.string().min(10).optional(),
});

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const memberships = await prisma.orgMembership.findMany({
    where: { orgId: context.org.id },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return NextResponse.json({ users: memberships.map(({ user, role }) => ({ ...user, passwordHash: undefined, role })) });
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid user name, email, role and password." }, { status: 400 });
  const password = parsed.data.password || temporaryPassword();
  let passwordToReveal: string | null = null;
  let user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: context.org.id,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        passwordHash: hashPassword(password),
      },
    });
    passwordToReveal = password;
  } else if (parsed.data.password) {
    user = await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name, passwordHash: hashPassword(parsed.data.password) } });
    passwordToReveal = parsed.data.password;
  }
  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: context.org.id, userId: user.id } },
    update: { role: parsed.data.role },
    create: { orgId: context.org.id, userId: user.id, role: parsed.data.role },
  });
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: parsed.data.role }, temporaryPassword: passwordToReveal }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json());
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: "User is invalid." }, { status: 400 });
  const membership = await prisma.orgMembership.findUnique({ where: { orgId_userId: { orgId: context.org.id, userId: parsed.data.id } } });
  if (!membership) return NextResponse.json({ error: "User not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.user.update({ where: { id: parsed.data.id }, data: { name: parsed.data.name, ...(parsed.data.password ? { passwordHash: hashPassword(parsed.data.password) } : {}) } }),
    prisma.orgMembership.update({ where: { orgId_userId: { orgId: context.org.id, userId: parsed.data.id } }, data: { role: parsed.data.role } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const userId = new URL(request.url).searchParams.get("id");
  if (!userId || userId === context.user.id) return NextResponse.json({ error: "You cannot remove your own access." }, { status: 400 });
  await prisma.orgMembership.deleteMany({ where: { orgId: context.org.id, userId } });
  return NextResponse.json({ ok: true });
}
