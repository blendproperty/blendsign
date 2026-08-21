import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectBuffer, putObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, { extension: string; validate: (file: Buffer) => boolean }> = {
  "image/png": { extension: "png", validate: (file) => file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", validate: (file) => file.length > 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff },
  "image/webp": { extension: "webp", validate: (file) => file.subarray(0, 4).toString() === "RIFF" && file.subarray(8, 12).toString() === "WEBP" },
};

function keyField(kind: string) {
  if (kind === "signature") return "signatureKey" as const;
  if (kind === "initials") return "initialsKey" as const;
  return null;
}

function contentTypeForKey(key: string) {
  if (key.toLowerCase().endsWith(".jpg") || key.toLowerCase().endsWith(".jpeg")) return "image/jpeg";
  if (key.toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/png";
}

export async function GET(_request: NextRequest, { params }: { params: { kind: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const field = keyField(params.kind);
  if (!field) return NextResponse.json({ error: "Unknown signing asset." }, { status: 404 });
  const key = context.org[field];
  if (!key) return NextResponse.json({ error: "Signing asset not configured." }, { status: 404 });
  try {
    const file = await getObjectBuffer(key);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeForKey(key),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("Authorised signing asset preview failed", error);
    return NextResponse.json({ error: "The signing image could not be loaded." }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { kind: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const field = keyField(params.kind);
  if (!field) return NextResponse.json({ error: "Unknown signing asset." }, { status: 404 });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  const type = TYPES[contentType];
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!type) return NextResponse.json({ error: "Upload a PNG, JPG or WebP image." }, { status: 400 });
  if (contentLength > MAX_BYTES) return NextResponse.json({ error: "Signing images may not exceed 2 MB." }, { status: 413 });
  const file = Buffer.from(await request.arrayBuffer());
  if (!file.length || file.length > MAX_BYTES || !type.validate(file)) return NextResponse.json({ error: "The selected signing image is not valid." }, { status: 400 });

  const previousKey = context.org[field];
  const key = `${context.org.id}/authorised-signing/${params.kind}-${randomUUID()}.${type.extension}`;
  try {
    await putObjectBuffer(key, file, contentType);
    const organisation = await prisma.org.update({ where: { id: context.org.id }, data: { [field]: key, autoSignEnabled: false } });
    if (previousKey && previousKey !== key) await deleteObject(previousKey).catch(() => undefined);
    return NextResponse.json({ organisation, signatureConfigured: Boolean(organisation.signatureKey), initialsConfigured: Boolean(organisation.initialsKey) });
  } catch (error) {
    console.error("Authorised signing asset upload failed", error);
    return NextResponse.json({ error: "The signing image could not be stored. Please try again." }, { status: 502 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { kind: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const field = keyField(params.kind);
  if (!field) return NextResponse.json({ error: "Unknown signing asset." }, { status: 404 });
  const previousKey = context.org[field];
  const organisation = await prisma.org.update({ where: { id: context.org.id }, data: { [field]: null, autoSignEnabled: false } });
  if (previousKey) await deleteObject(previousKey).catch(() => undefined);
  return NextResponse.json({ organisation, signatureConfigured: Boolean(organisation.signatureKey), initialsConfigured: Boolean(organisation.initialsKey) });
}
