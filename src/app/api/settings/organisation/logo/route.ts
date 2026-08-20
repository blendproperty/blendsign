import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canAdminister, getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { deleteObject, putObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, { extension: string; validate: (file: Buffer) => boolean }> = {
  "image/png": { extension: "png", validate: (file) => file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { extension: "jpg", validate: (file) => file.length > 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff },
  "image/webp": { extension: "webp", validate: (file) => file.subarray(0, 4).toString() === "RIFF" && file.subarray(8, 12).toString() === "WEBP" },
  "image/svg+xml": { extension: "svg", validate: validateSvg },
};

function validateSvg(file: Buffer) {
  const source = file.toString("utf8").trim();
  if (!/(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source)) return false;
  return !/<script|<foreignObject|<!DOCTYPE|<!ENTITY|\son\w+\s*=|javascript:/i.test(source);
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  const type = TYPES[contentType];
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!type) return NextResponse.json({ error: "Upload a PNG, JPG, WebP or SVG logo." }, { status: 400 });
  if (contentLength > MAX_LOGO_BYTES) return NextResponse.json({ error: "Company logos may not exceed 5 MB." }, { status: 413 });

  const file = Buffer.from(await request.arrayBuffer());
  if (!file.length || !type.validate(file)) return NextResponse.json({ error: "The selected logo file is not valid." }, { status: 400 });
  if (file.length > MAX_LOGO_BYTES) return NextResponse.json({ error: "Company logos may not exceed 5 MB." }, { status: 413 });

  const previousKey = context.org.logoKey;
  const key = `${context.org.id}/branding/logo-${randomUUID()}.${type.extension}`;
  try {
    await putObjectBuffer(key, file, contentType);
    const organisation = await prisma.org.update({
      where: { id: context.org.id },
      data: { logoKey: key, logoUrl: null },
    });
    if (previousKey && previousKey !== key) await deleteObject(previousKey).catch(() => undefined);
    return NextResponse.json({ organisation, logoUrl: `/api/brand/${organisation.id}/logo?v=${organisation.updatedAt.getTime()}` });
  } catch (error) {
    console.error("Company logo upload failed", error);
    return NextResponse.json({ error: "The logo could not be stored. Please try again." }, { status: 502 });
  }
}

export async function DELETE() {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAdminister(context)) return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const previousKey = context.org.logoKey;
  const organisation = await prisma.org.update({ where: { id: context.org.id }, data: { logoKey: null, logoUrl: null } });
  if (previousKey) await deleteObject(previousKey).catch(() => undefined);
  return NextResponse.json({ organisation });
}
