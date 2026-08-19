import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/account";
import { putObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

function decodeFilename(value: string | null) {
  if (!value) return "document.pdf";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const filename = decodeFilename(request.headers.get("x-file-name"));
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (!filename.toLowerCase().endsWith(".pdf") || contentType !== "application/pdf") {
    return NextResponse.json({ error: "A PDF document is required." }, { status: 400 });
  }
  if (contentLength > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF documents may not exceed 20 MB." }, { status: 413 });
  }

  const file = Buffer.from(await request.arrayBuffer());
  if (!file.length) {
    return NextResponse.json({ error: "The selected PDF is empty." }, { status: 400 });
  }
  if (file.length > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF documents may not exceed 20 MB." }, { status: 413 });
  }
  if (!file.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    return NextResponse.json({ error: "The selected file is not a valid PDF." }, { status: 400 });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${context.org.id}/originals/${randomUUID()}-${safeFilename}`;

  try {
    await putObjectBuffer(key, file, "application/pdf");
    return NextResponse.json({ key }, { status: 201 });
  } catch (error) {
    console.error("Document upload failed", error);
    return NextResponse.json({ error: "Document storage is currently unavailable." }, { status: 502 });
  }
}
