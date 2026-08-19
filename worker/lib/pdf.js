const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { createHash } = require("crypto");

/**
 * Flattens signed field values onto the original PDF and appends a
 * certificate-of-completion page summarizing the audit trail. Field
 * coordinates are stored as fractions of page width/height with origin
 * at the top-left (matching how the browser-side field editor places
 * boxes over a rendered page image); pdf-lib uses a bottom-left origin,
 * so y is flipped here.
 *
 * Returns the final PDF bytes. Caller is responsible for hashing +
 * uploading + updating the Envelope record.
 */
async function flattenEnvelope({ originalBytes, fields, envelope, signers, auditEvents }) {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const page = pages[field.page - 1];
    if (!page || field.value == null) continue;
    const { width: pw, height: ph } = page.getSize();

    const boxX = field.x * pw;
    const boxW = field.width * pw;
    const boxH = field.height * ph;
    // flip y: stored fraction is distance from top
    const boxYTop = field.y * ph;
    const boxYBottom = ph - boxYTop - boxH;

    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      if (typeof field.value === "string" && field.value.startsWith("data:image/png")) {
        const base64 = field.value.split(",")[1];
        const pngBytes = Buffer.from(base64, "base64");
        const pngImage = await pdfDoc.embedPng(pngBytes);
        page.drawImage(pngImage, {
          x: boxX,
          y: boxYBottom,
          width: boxW,
          height: boxH,
        });
      }
    } else {
      // TEXT, DATE, CHECKBOX rendered as plain text
      page.drawText(String(field.value).slice(0, 200), {
        x: boxX + 2,
        y: boxYBottom + boxH * 0.25,
        size: Math.min(12, boxH * 0.7),
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }

  // Certificate of completion page
  const cert = pdfDoc.addPage();
  const { height: ch } = cert.getSize();
  let cursor = ch - 60;
  const line = (text, size = 11) => {
    cert.drawText(text, { x: 50, y: cursor, size, font, color: rgb(0, 0, 0) });
    cursor -= size + 8;
  };

  line("Certificate of Completion", 16);
  line(`Document: ${envelope.title}`);
  line(`Envelope ID: ${envelope.id}`);
  line(" ");
  line("Signers:", 13);
  for (const s of signers) {
    line(`  ${s.name} <${s.email || s.phone || "n/a"}> — ${s.status}${s.signedAt ? " at " + new Date(s.signedAt).toISOString() : ""}`);
  }
  line(" ");
  line("Audit trail:", 13);
  for (const ev of auditEvents) {
    line(`  ${new Date(ev.createdAt).toISOString()}  ${ev.eventType}  ${ev.ip || ""}`, 9);
  }
  line(" ");
  line("This document was signed electronically under the Electronic", 9);
  line("Communications and Transactions Act 25 of 2002 (South Africa).", 9);
  line("BlendSign — https://sign.blendproperty.co.za", 9);

  const finalBytes = await pdfDoc.save();
  return Buffer.from(finalBytes);
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

module.exports = { flattenEnvelope, sha256Hex };
