import { NextResponse } from "next/server";
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { getRequestContext } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

function formatDate(date: Date | null | undefined) {
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const context = await getRequestContext();
  if (!context) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const envelope = await prisma.envelope.findFirst({
    where: { id: params.id, orgId: context.org.id, deletedAt: null },
    include: {
      org: true,
      createdBy: true,
      signers: { orderBy: { order: "asc" } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!envelope) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (!envelope.signedKey || !envelope.sha256) {
    return NextResponse.json({ error: "The completion certificate is not ready yet." }, { status: 409 });
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = rgb(0.13, 0.55, 0.39);
  const ink = rgb(0.09, 0.09, 0.09);
  const muted = rgb(0.38, 0.37, 0.35);
  let page: PDFPage;
  let y: number;

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    page.drawText("BLENDSIGN", { x: MARGIN, y, size: 9, font: bold, color: accent });
    page.drawText("CERTIFICATE OF COMPLETION", { x: PAGE_WIDTH - MARGIN - 180, y, size: 9, font: bold, color: muted });
    y -= 34;
  };
  const ensureSpace = (height: number) => {
    if (y - height < MARGIN + 20) newPage();
  };
  const line = (text: string, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = options.font || regular;
    const size = options.size || 10;
    const lines = wrapText(text, font, size, PAGE_WIDTH - MARGIN * 2);
    const height = lines.length * (size + 4) + (options.gap || 0);
    ensureSpace(height);
    for (const item of lines) {
      page.drawText(item, { x: MARGIN, y, size, font, color: options.color || ink });
      y -= size + 4;
    }
    y -= options.gap || 0;
  };
  const divider = () => {
    ensureSpace(18);
    y -= 7;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.7, color: rgb(0.82, 0.81, 0.78) });
    y -= 15;
  };

  newPage();
  line("Certificate of completion", { font: bold, size: 25, gap: 7 });
  line(`This certificate records the electronic signing history for \"${envelope.title}\".`, { size: 11, color: muted, gap: 10 });
  divider();
  line("DOCUMENT", { font: bold, size: 9, color: accent, gap: 6 });
  line(`Title: ${envelope.title}`);
  line(`Company: ${envelope.org.name}`);
  line(`Document ID: ${envelope.id}`);
  line(`Owner: ${envelope.createdBy.name} (${envelope.createdBy.email})`);
  line(`Created: ${formatDate(envelope.createdAt)}`);
  line(`Completed: ${formatDate(envelope.auditEvents.find((event) => event.eventType === "completed")?.createdAt || envelope.updatedAt)}`);
  line(`SHA-256: ${envelope.sha256}`, { size: 8, color: muted });
  divider();
  line("RECIPIENTS", { font: bold, size: 9, color: accent, gap: 7 });
  for (const signer of envelope.signers) {
    line(`${signer.name} | ${signer.email || signer.phone || "No delivery address"}`, { font: bold, size: 10 });
    line(`Status: ${signer.status} | Signed: ${formatDate(signer.signedAt)}`, { size: 9, color: muted, gap: 7 });
  }
  divider();
  line("AUDIT TRAIL", { font: bold, size: 9, color: accent, gap: 7 });
  for (const event of envelope.auditEvents) {
    const signer = envelope.signers.find((item) => item.id === event.signerId);
    const actor = signer ? ` | ${signer.name}` : "";
    const network = event.ip ? ` | IP ${event.ip}` : "";
    line(`${formatDate(event.createdAt)} | ${event.eventType.replaceAll("_", " ")}${actor}${network}`, { size: 8, color: muted, gap: 3 });
  }
  divider();
  line("Integrity statement", { font: bold, size: 11, gap: 5 });
  line("The completed PDF is sealed and identified by the SHA-256 digest above. Any change to the completed PDF will produce a different digest.", { size: 9, color: muted });

  for (const certificatePage of pdf.getPages()) {
    certificatePage.drawText(`Generated ${formatDate(new Date())} | ${envelope.id}`, {
      x: MARGIN,
      y: 28,
      size: 7,
      font: regular,
      color: muted,
    });
  }

  const bytes = await pdf.save();
  const filename = `${envelope.title}-completion-certificate.pdf`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
