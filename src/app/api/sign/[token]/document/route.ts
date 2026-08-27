import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";
import { createUnsignedReviewPdf } from "@/lib/unsignedPdfWatermark";
import { isEnvelopeCompleted } from "@/lib/envelopeStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const signer = await prisma.signer.findUnique({
    where: { token: params.token },
    include: { envelope: { include: { org: true, fields: true } } },
  });

  if (!signer || signer.envelope.deletedAt) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const completed = isEnvelopeCompleted(signer.envelope);
    const requestedState = new URL(request.url).searchParams.get("state");
    if (requestedState === "completed" && !completed) {
      return NextResponse.json(
        { error: "The completed signed document is still being prepared." },
        { status: 409 }
      );
    }
    const serveCompleted = requestedState === "completed" && completed;
    const sourceKey = serveCompleted ? signer.envelope.signedKey! : signer.envelope.originalKey;
    const source = await getObjectBuffer(sourceKey);
    const document = serveCompleted
      ? source
        : await createUnsignedReviewPdf(source, {
          accentColour: signer.envelope.org.accentColour,
          envelopeId: signer.envelope.id,
          generatedAt: new Date(),
        }, signer.envelope.fields).catch((error) => {
          // Watermarking failed (e.g. a permission-restricted/encrypted
          // source PDF pdf-lib can't fully parse). Fall back to the
          // original bytes so the signer isn't blocked from reviewing
          // the document — matches the pre-watermark passthrough
          // behaviour for anything pdf-lib can't handle.
          console.error("Unsigned review watermarking failed; serving original bytes", error);
          return source;
        });
    const storedName = sourceKey.split("/").pop() || "document.pdf";
    const baseName = storedName
      .replace(/^[0-9a-f-]{36}-/i, "")
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${baseName}${serveCompleted ? "-completed" : "-unsigned-review"}.pdf`;

    return new NextResponse(new Uint8Array(document), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(document.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-BlendSign-Document-State": serveCompleted ? "completed" : "unsigned-review",
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
