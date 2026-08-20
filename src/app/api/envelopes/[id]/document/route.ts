import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const context = await getRequestContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
  });
  if (!envelope) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const requestedVersion = request.nextUrl.searchParams.get("version");
  const signed = requestedVersion === "signed";
  if (signed && !envelope.signedKey) {
    return NextResponse.json(
      { error: "The completed document is not ready yet." },
      { status: 409 }
    );
  }

  const key = signed ? envelope.signedKey! : envelope.originalKey;
  try {
    const document = await getObjectBuffer(key);
    const suffix = signed ? "-signed" : "-original";
    const filename = `${envelope.title}${suffix}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";

    return new NextResponse(new Uint8Array(document), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Content-Length": String(document.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Envelope document download failed", error);
    return NextResponse.json(
      { error: "The document is currently unavailable." },
      { status: 502 }
    );
  }
}
