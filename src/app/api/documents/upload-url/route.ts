import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { presignedUploadUrl } from "@/lib/storage";

// POST /api/documents/upload-url — returns a presigned URL the browser
// can PUT the original PDF directly to object storage, plus the storage
// key to reference when creating the envelope.
export async function POST(req: NextRequest) {
  const { filename, contentType } = await req.json();
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  const key = `originals/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const url = await presignedUploadUrl(key, contentType || "application/pdf");
  return NextResponse.json({ url, key });
}
