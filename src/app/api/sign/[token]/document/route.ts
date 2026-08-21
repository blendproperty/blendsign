import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";
import { createUnsignedReviewPdf } from "@/lib/unsignedPdfWatermark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: { envelope: { include: { org: true } } },
  });

  if (!signer || signer.envelope.deletedAt) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const completed = signer.envelope.status === "COMPLETED" && Boolean(signer.envelope.signedKey);
    const sourceKey = completed ? signer.envelope.signedKey! : signer.envelope.originalKey;
    const source = await getObjectBuffer(sourceKey);
    const document = completed
      ? source
      : await createUnsignedReviewPdf(source, {
          accentColour: signer.envelope.org.accentColour,
          envelopeId: signer.envelope.id,
          generatedAt: new Date(),
        });
    const storedName = sourceKey.split("/").pop() || "document.pdf";
    const baseName = storedName
      .replace(/^[0-9a-f-]{36}-/i, "")
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${baseName}${completed ? "-completed" : "-unsigned-review"}.pdf`;

    return new NextResponse(new Uint8Array(document), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(document.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-BlendSign-Document-State": completed ? "completed" : "unsigned-review",
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
