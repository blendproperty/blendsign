import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

type UnsignedWatermarkOptions = {
  accentColour: string;
  envelopeId: string;
  generatedAt: Date;
};

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
  options: UnsignedWatermarkOptions
) {
  const pdf = await PDFDocument.load(original);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = colourFromHex(options.accentColour);
  const generated = options.generatedAt.toISOString();
  const reference = `Envelope ${options.envelopeId}`;

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
