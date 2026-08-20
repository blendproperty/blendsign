import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "blendsign_session";
export const ENTITY_COOKIE = "blendsign_entity";

export type AdminSession = {
  email: string;
  userId: string;
  superAdmin: boolean;
  expiresAt: number;
};

function sessionSecret() {
  return process.env.SESSION_SECRET || "";
}

export function authIsConfigured() {
  const secret = process.env.SESSION_SECRET || "";
  const password = process.env.ADMIN_PASSWORD || "";
  return Boolean(process.env.ADMIN_EMAIL && secret.length >= 32 && password.length >= 12 && !secret.startsWith("replace-") && !password.startsWith("replace-"));
}

export function createSessionToken(session: Omit<AdminSession, "expiresAt">) {
  if (!sessionSecret()) throw new Error("SESSION_SECRET is not configured");
  const payload: AdminSession = { ...session, expiresAt: Date.now() + 1000 * 60 * 60 * 12 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function readSessionToken(token?: string): AdminSession | null {
  if (!token || !sessionSecret()) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(encoded).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function getAdminSession() {
  return readSessionToken(cookies().get(SESSION_COOKIE)?.value);
}

export function requirePageSession() {
  const session = getAdminSession();
  if (!session) redirect("/login");
  return session;
}
