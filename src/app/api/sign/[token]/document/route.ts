import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: { envelope: true },
  });

  if (!signer || signer.envelope.deletedAt) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const document = await getObjectBuffer(signer.envelope.originalKey);
    const storedName = signer.envelope.originalKey.split("/").pop() || "document.pdf";
    const filename = storedName.replace(/^[0-9a-f-]{36}-/i, "").replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(new Uint8Array(document), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(document.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Signer document download failed", error);
    return NextResponse.json(
      { error: "The document is currently unavailable." },
      { status: 502 }
    );
  }
}
