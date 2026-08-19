import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function csv(value: string | number | Date | null | undefined) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const range = request.nextUrl.searchParams.get("range") || "30";
  const days = Number(range);
  const from = range === "all" ? undefined : new Date(Date.now() - ([30, 90, 365].includes(days) ? days : 30) * 86400000);
  const envelopes = await prisma.envelope.findMany({
    where: { orgId: context.org.id, deletedAt: null, ...(from ? { createdAt: { gte: from } } : {}) },
    include: { createdBy: true, signers: true },
    orderBy: { createdAt: "desc" },
  });

  const header = ["Document", "Owner", "Status", "Created", "Recipients", "Signed recipients", "Completed", "Hash"];
  const rows = envelopes.map((item) => [
    item.title,
    item.createdBy.name,
    item.status,
    item.createdAt,
    item.signers.length,
    item.signers.filter((signer) => signer.status === "SIGNED").length,
    item.status === "COMPLETED" ? item.updatedAt : null,
    item.sha256,
  ]);
  const content = [header, ...rows].map((row) => row.map(csv).join(",")).join("\r\n");
  const filename = `${context.org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-blendsign-report.csv`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
