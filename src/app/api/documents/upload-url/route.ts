import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { presignedUploadUrl } from "@/lib/storage";
import { getRequestContext } from "@/lib/account";

// POST /api/documents/upload-url — returns a presigned URL the browser
// can PUT the original PDF directly to object storage, plus the storage
// key to reference when creating the envelope.
export async function POST(req: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { filename, contentType } = await req.json();
  if (!filename || !filename.toLowerCase().endsWith(".pdf") || contentType !== "application/pdf") {
    return NextResponse.json({ error: "A PDF document is required." }, { status: 400 });
  }
  const key = `${context.org.id}/originals/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const url = await presignedUploadUrl(key, contentType || "application/pdf");
  return NextResponse.json({ url, key });
}
