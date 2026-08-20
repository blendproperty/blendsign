import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { encryptSecret, sha256 } from "@/lib/secrets";

const apiKeySchema = z.object({ type: z.literal("api-key"), name: z.string().trim().min(2).max(100) });
const webhookSchema = z.object({
  type: z.literal("webhook"),
  url: z.string().url().refine((value) => value.startsWith("https://"), "Webhook URL must use HTTPS"),
  events: z.array(z.enum(["envelope.sent", "envelope.viewed", "envelope.signed", "envelope.completed", "envelope.declined"])).min(1),
});

function systemStatus() {
  return {
    smtp: { configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD), host: process.env.SMTP_HOST || null, from: process.env.SMTP_FROM || process.env.SMTP_USER || null },
    storage: { configured: Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET), endpoint: process.env.S3_ENDPOINT || null, bucket: process.env.S3_BUCKET || null, region: process.env.S3_REGION || null },
    whatsapp: { configured: Boolean(process.env.WHATSAPP_BUSINESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_API_VERSION) },
  };
}

export async function GET() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const [apiKeys, webhooks] = await Promise.all([
    prisma.apiKey.findMany({ where: { orgId: context.org.id, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.webhookEndpoint.findMany({ where: { orgId: context.org.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const baseUrl = `https://${process.env.APP_DOMAIN || "your-domain.example"}/api/v1`;
  return NextResponse.json({ apiKeys: apiKeys.map(({ keyHash, ...apiKey }) => apiKey), webhooks: webhooks.map(({ secretEncrypted, ...webhook }) => webhook), system: systemStatus(), baseUrl });
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const body = await request.json();
  if (body.type === "api-key") {
    const parsed = apiKeySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "API key name is required." }, { status: 400 });
    const rawKey = `bs_live_${randomBytes(24).toString("base64url")}`;
    const apiKey = await prisma.apiKey.create({ data: { orgId: context.org.id, name: parsed.data.name, prefix: rawKey.slice(0, 16), keyHash: sha256(rawKey) } });
    const { keyHash, ...safeApiKey } = apiKey;
    return NextResponse.json({ apiKey: safeApiKey, secret: rawKey }, { status: 201 });
  }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid HTTPS webhook URL and select at least one event." }, { status: 400 });
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const webhook = await prisma.webhookEndpoint.create({ data: { orgId: context.org.id, url: parsed.data.url, events: parsed.data.events, secretPrefix: secret.slice(0, 14), secretEncrypted: encryptSecret(secret) } });
  return NextResponse.json({ webhook: { ...webhook, secretEncrypted: undefined }, secret }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const parsed = z.object({ id: z.string(), enabled: z.boolean() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Webhook is invalid." }, { status: 400 });
  const updated = await prisma.webhookEndpoint.updateMany({ where: { id: parsed.data.id, orgId: context.org.id }, data: { enabled: parsed.data.enabled } });
  return NextResponse.json({ ok: updated.count === 1 });
}

export async function DELETE(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const id = search.get("id");
  const type = search.get("type");
  if (!id) return NextResponse.json({ error: "Integration is required." }, { status: 400 });
  if (type === "api-key") await prisma.apiKey.updateMany({ where: { id, orgId: context.org.id }, data: { revokedAt: new Date() } });
  else await prisma.webhookEndpoint.deleteMany({ where: { id, orgId: context.org.id } });
  return NextResponse.json({ ok: true });
}
