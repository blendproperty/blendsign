import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiAuth";

export async function GET(request: NextRequest) {
  const key = await authenticateApiKey(request.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401 });
  return NextResponse.json({ ok: true, service: "BlendSign API", entity: { id: key.org.id, name: key.org.name }, timestamp: new Date().toISOString() });
}
