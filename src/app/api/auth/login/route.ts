import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authIsConfigured, createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { ensureDefaultAccount } from "@/lib/account";
import { verifyPassword } from "@/lib/password";

const inputSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: NextRequest) {
  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Admin authentication is not configured on the server." }, { status: 503 });
  }
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address and password." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  let userId = "";
  let superAdmin = false;
  if (email === process.env.ADMIN_EMAIL?.toLowerCase() && parsed.data.password === process.env.ADMIN_PASSWORD) {
    const { user } = await ensureDefaultAccount();
    userId = user.id;
    superAdmin = true;
  } else {
    const user = await prisma.user.findUnique({ where: { email }, include: { memberships: true } });
    if (!user?.passwordHash || !user.memberships.length || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return NextResponse.json({ error: "Email address or password is incorrect." }, { status: 401 });
    }
    userId = user.id;
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken({ email, userId, superAdmin }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
