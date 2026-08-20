import { NextResponse } from "next/server";
import { getObjectBuffer } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function contentType(key: string) {
  if (key.endsWith(".svg")) return "image/svg+xml";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export async function GET(_: Request, { params }: { params: { orgId: string } }) {
  const organisation = await prisma.org.findUnique({
    where: { id: params.orgId },
    select: { logoKey: true, logoUrl: true },
  });
  if (!organisation) return new NextResponse("Not found", { status: 404 });
  if (!organisation.logoKey && organisation.logoUrl) return NextResponse.redirect(organisation.logoUrl);
  if (!organisation.logoKey) return new NextResponse("No logo configured", { status: 404 });

  try {
    const logo = await getObjectBuffer(organisation.logoKey);
    return new NextResponse(new Uint8Array(logo), {
      headers: {
        "Content-Type": contentType(organisation.logoKey),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Company logo retrieval failed", error);
    return new NextResponse("Logo unavailable", { status: 502 });
  }
}
