import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const template = await prisma.template.findFirst({ where: { id: params.id, orgId: context.org.id } });
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  try {
    const document = await getObjectBuffer(template.originalKey);
    const filename = `${template.name}.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new NextResponse(new Uint8Array(document), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(document.length),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Template PDF download failed", error);
    return NextResponse.json({ error: "The template PDF is unavailable." }, { status: 502 });
  }
}
