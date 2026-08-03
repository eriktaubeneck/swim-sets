from typing import List, Tuple

from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

FONT: str = "Courier"
FONT_BOLD: str = "Courier-Bold"
MARGIN: float = 36.0
LINE_SPACING: float = 1.15
MAX_SIZE: float = 24.0
MIN_SIZE: float = 5.0
SIZE_STEP: float = 0.5


def _lines_per_page(font_size: float, avail_height: float) -> int:
    line_height = font_size * LINE_SPACING
    return max(1, int(avail_height // line_height))


def _fits_width(lines: List[str], font_size: float, avail_width: float) -> bool:
    if not lines:
        return True
    widths = (
        stringWidth(line, FONT_BOLD if i == 0 else FONT, font_size)
        for i, line in enumerate(lines)
    )
    return max(widths) <= avail_width


def _fit_font_size(
    lines: List[str], avail_width: float, avail_height: float, max_pages: int
) -> Tuple[float, int]:
    size = MAX_SIZE
    while size >= MIN_SIZE:
        if _fits_width(lines, size, avail_width):
            lpp = _lines_per_page(size, avail_height)
            pages_needed = -(-len(lines) // lpp) if lines else 1
            if pages_needed <= max_pages:
                return size, lpp
        size -= SIZE_STEP
    # best effort: smallest size, however many pages that actually takes
    return MIN_SIZE, _lines_per_page(MIN_SIZE, avail_height)


def render_pdf(text: str, path: str, max_pages: int = 1) -> None:
    lines: List[str] = [l.rstrip() for l in text.rstrip("\n").split("\n")]

    page_size = letter
    avail_w = page_size[0] - 2 * MARGIN
    avail_h = page_size[1] - 2 * MARGIN
    size, lpp = _fit_font_size(lines, avail_w, avail_h, max_pages)

    # if it still doesn't fit the width even at the smallest font, try landscape
    if not _fits_width(lines, size, avail_w):
        page_size = landscape(letter)
        avail_w = page_size[0] - 2 * MARGIN
        avail_h = page_size[1] - 2 * MARGIN
        size, lpp = _fit_font_size(lines, avail_w, avail_h, max_pages)

    c = canvas.Canvas(path, pagesize=page_size)
    line_height = size * LINE_SPACING
    page_top = page_size[1] - MARGIN - size

    chunks = [lines[i : i + lpp] for i in range(0, len(lines), lpp)] or [[]]
    for page_num, chunk in enumerate(chunks):
        y = page_top
        for i, line in enumerate(chunk):
            is_title = page_num == 0 and i == 0
            c.setFont(FONT_BOLD if is_title else FONT, size)
            c.drawString(MARGIN, y, line)
            y -= line_height
        c.showPage()
    c.save()
