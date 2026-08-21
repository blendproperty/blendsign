import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { detectRoadblock, recipientTiming, reportTiming, sourceDetails, type ReportEnvelope } from "@/lib/reporting";

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
    include: { createdBy: true, signers: { include: { auditEvents: { orderBy: { createdAt: "asc" } } } }, auditEvents: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
  });

  const sourceFilter = request.nextUrl.searchParams.get("source") || "all";
  const statusFilter = request.nextUrl.searchParams.get("status") || "all";
  const roadblockFilter = request.nextUrl.searchParams.get("roadblock") || "all";
  const reports = envelopes.map((item) => {
    const envelope = item as unknown as ReportEnvelope;
    return { item, source: sourceDetails(envelope), timing: reportTiming(envelope), roadblock: detectRoadblock(envelope) };
  }).filter((row) =>
    (sourceFilter === "all" || row.source.type === sourceFilter || row.source.templateId === sourceFilter) &&
    (statusFilter === "all" || row.item.status === statusFilter) &&
    (roadblockFilter === "all" || row.roadblock.code === roadblockFilter)
  );

  const header = ["Document", "Owner", "Source", "Template", "Template key", "Template version", "Status", "Roadblock", "Created", "First sent", "First viewed", "Final signature", "Completed", "Sent to view hours", "View to sign hours", "Total turnaround hours", "Recipients", "Recipient timelines", "Hash"];
  const rows = reports.map(({ item, source, timing, roadblock }) => [
    item.title,
    item.createdBy.name,
    source.label,
    source.templateName,
    source.templateKey,
    source.templateVersion,
    item.status,
    roadblock.label,
    item.createdAt,
    timing.sentAt,
    timing.viewedAt,
    timing.finalSignedAt,
    timing.completedAt,
    timing.sentToViewHours?.toFixed(2),
    timing.viewToSignHours?.toFixed(2),
    timing.totalHours?.toFixed(2),
    item.signers.length,
    item.signers.map((signer) => { const value = recipientTiming(signer); return `${signer.name}: sent=${value.sentAt?.toISOString() || ""}; viewed=${value.viewedAt?.toISOString() || ""}; signed=${value.signedAt?.toISOString() || ""}; receipt_to_sign_hours=${value.receiptToSignHours?.toFixed(2) || ""}`; }).join(" | "),
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
