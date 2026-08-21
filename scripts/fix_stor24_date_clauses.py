from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas


def overlay(width: float, height: float, x: float, y: float, box_width: float, box_height: float, baseline: float, line_start: float, line_end: float) -> PdfReader:
    stream = BytesIO()
    page = canvas.Canvas(stream, pagesize=(width, height))
    page.setFillColorRGB(1, 1, 1)
    page.rect(x, y, box_width, box_height, fill=1, stroke=0)
    page.setFillColorRGB(0, 0, 0)
    page.setFont("Times-Roman", 11)
    page.drawString(x + 4, baseline, "on")
    page.setLineWidth(0.8)
    page.line(line_start, baseline - 2, line_end, baseline - 2)
    page.save()
    stream.seek(0)
    return PdfReader(stream)


def correct_date_clause(source: Path, output: Path, page_index: int, *, x: float, y: float, box_width: float, box_height: float, baseline: float, line_start: float, line_end: float) -> None:
    reader = PdfReader(source)
    target = reader.pages[page_index]
    width = float(target.mediabox.width)
    height = float(target.mediabox.height)
    patch = overlay(width, height, x, y, box_width, box_height, baseline, line_start, line_end)
    target.merge_page(patch.pages[0])

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as handle:
        writer.write(handle)


def simplify_primary_phone(source: Path, output: Path) -> None:
    reader = PdfReader(source)
    target = reader.pages[0]
    width = float(target.mediabox.width)
    height = float(target.mediabox.height)
    stream = BytesIO()
    page = canvas.Canvas(stream, pagesize=(width, height))
    page.setFillColorRGB(1, 1, 1)
    page.rect(302, 551, 72, 17, fill=1, stroke=0)
    page.rect(302, 484, 238, 24, fill=1, stroke=0)
    page.setFillColorRGB(0, 0, 0)
    page.setFont("Times-Bold", 9)
    page.drawString(305.5, 557, "Mobile number:")
    page.save()
    stream.seek(0)
    target.merge_page(PdfReader(stream).pages[0])
    writer = PdfWriter()
    for item in reader.pages:
        writer.add_page(item)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as handle:
        writer.write(handle)


if __name__ == "__main__":
    downloads = Path.home() / "Downloads"
    output_dir = Path(__file__).resolve().parents[1] / "output" / "pdf"
    correct_date_clause(
        downloads / "Stor24_Lease_Agreement.pdf",
        output_dir / "Stor24_Lease_Agreement_Date_Corrected.pdf",
        5,
        x=258,
        y=538,
        box_width=180,
        box_height=30,
        baseline=548,
        line_start=282,
        line_end=434,
    )
    with TemporaryDirectory(prefix="stor24-debit-pdf-") as temporary_dir:
        assignment_corrected = Path(temporary_dir) / "assignment-date-corrected.pdf"
        correct_date_clause(
            downloads / "Stor24_Lease_Agreement_-_Debit_Order.pdf",
            assignment_corrected,
            6,
            x=200,
            y=708,
            box_width=172,
            box_height=25,
            baseline=713,
            line_start=218,
            line_end=368,
        )
        correct_date_clause(
            assignment_corrected,
            output_dir / "Stor24_Lease_Agreement_Debit_Order_Date_Corrected.pdf",
            7,
            x=258,
            y=538,
            box_width=180,
            box_height=30,
            baseline=548,
            line_start=282,
            line_end=434,
        )
    simplify_primary_phone(
        output_dir / "Stor24_Lease_Agreement_Date_Corrected.pdf",
        output_dir / "Stor24_Lease_Agreement_Signing_Updated.pdf",
    )
    simplify_primary_phone(
        output_dir / "Stor24_Lease_Agreement_Debit_Order_Date_Corrected.pdf",
        output_dir / "Stor24_Lease_Agreement_Debit_Order_Signing_Updated.pdf",
    )
