import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

type UnsignedWatermarkOptions = {
  accentColour: string;
  envelopeId: string;
  generatedAt: Date;
};

type ReviewField = {
  type: string;
  value: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function checkboxIsChecked(value: string) {
  return ["x", "true", "1", "yes", "on", "checked"].includes(value.trim().toLowerCase());
}

function colourFromHex(value: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  const hex = match?.[1] || "ff5a00";
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  );
}

export async function createUnsignedReviewPdf(
  original: Buffer,
  options: UnsignedWatermarkOptions,
  fields: ReviewField[] = []
) {
  // ignoreEncryption: many scanner/export PDFs carry an empty-password,
  // permissions-only encryption dictionary that pdf-lib would otherwise
  // refuse to load.
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = colourFromHex(options.accentColour);
  const generated = options.generatedAt.toISOString();
  const reference = `Envelope ${options.envelopeId}`;

  for (const field of fields) {
    if (!field.value || field.type === "SIGNATURE" || field.type === "INITIALS") continue;
    const page = pdf.getPages()[field.page - 1];
    if (!page) continue;
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const boxX = field.x * pageWidth;
    const boxWidth = field.width * pageWidth;
    const boxHeight = field.height * pageHeight;
    const boxBottom = pageHeight - field.y * pageHeight - boxHeight;
    const isCheckbox = field.type === "CHECKBOX";
    if (isCheckbox && !checkboxIsChecked(field.value)) continue;
    const text = isCheckbox ? "X" : String(field.value).slice(0, 200);
    let fontSize = Math.min(12, boxHeight * 0.7);
    while (fontSize > 6 && regular.widthOfTextAtSize(text, fontSize) > Math.max(4, boxWidth - 4)) fontSize -= 0.5;
    if (isCheckbox) {
      page.drawRectangle({ x: boxX, y: boxBottom, width: boxWidth, height: boxHeight, color: rgb(1, 1, 1) });
    }
    page.drawText(text, { x: boxX + 2, y: boxBottom + boxHeight * 0.25, size: fontSize, font: isCheckbox ? bold : regular, color: rgb(0.08, 0.08, 0.08) });
  }

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const title = "UNSIGNED DRAFT";
    const subtitle = "NOT A VALID OR EXECUTED AGREEMENT";
    const titleSize = Math.max(30, Math.min(58, width / 8.5));
    const subtitleSize = Math.max(12, Math.min(20, width / 28));
    const titleWidth = bold.widthOfTextAtSize(title, titleSize);
    const subtitleWidth = bold.widthOfTextAtSize(subtitle, subtitleSize);

    page.drawText(title, {
      x: (width - titleWidth * 0.72) / 2,
      y: height * 0.52,
      size: titleSize,
      font: bold,
      color: accent,
      opacity: 0.16,
      rotate: degrees(35),
    });
    page.drawText(subtitle, {
      x: (width - subtitleWidth * 0.82) / 2,
      y: height * 0.43,
      size: subtitleSize,
      font: bold,
      color: accent,
      opacity: 0.2,
      rotate: degrees(35),
    });

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: 38,
      color: accent,
      opacity: 0.94,
    });
    page.drawText("UNSIGNED DRAFT - FOR REVIEW ONLY", {
      x: 18,
      y: 23,
      size: 8.5,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(
      "Authentic completed copies are issued and verifiable through the BlendSign electronic signing system.",
      {
        x: 18,
        y: 11,
        size: 6.8,
        font: regular,
        color: rgb(1, 1, 1),
      }
    );
    const metadata = `${reference} | Generated ${generated}`;
    const metadataWidth = regular.widthOfTextAtSize(metadata, 6.5);
    page.drawText(metadata, {
      x: Math.max(18, width - metadataWidth - 18),
      y: 23,
      size: 6.5,
      font: regular,
      color: rgb(1, 1, 1),
    });
  }

  return Buffer.from(await pdf.save());
}
