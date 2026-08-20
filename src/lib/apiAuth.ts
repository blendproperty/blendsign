import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/secrets";

export async function authenticateApiKey(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice(7).trim();
  if (!raw.startsWith("bs_live_")) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: sha256(raw) }, include: { org: true } });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) return null;
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key;
}
