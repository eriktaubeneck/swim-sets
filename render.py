from dataclasses import dataclass, field
from typing import List, Tuple

from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

FONT: str = "Courier"
FONT_BOLD: str = "Courier-Bold"
MARGIN: float = 36.0
LINE_SPACING: float = 1.15
INDENT_CHARS: float = 4.0
LANE_COL_PAD_CHARS: float = 2.0
MAX_SIZE: float = 16.0
MIN_SIZE: float = 6.0
SIZE_STEP: float = 0.5


@dataclass
class Row:
    indent: int
    text: str
    lane_times: List[str] = field(default_factory=list)


def _char_width(font_size: float) -> float:
    return stringWidth("0", FONT, font_size)


def _lines_per_page(font_size: float, avail_height: float) -> int:
    line_height = font_size * LINE_SPACING
    # one line is reserved for the repeated lane header on every page
    return max(1, int(avail_height // line_height) - 1)


def _lane_col_width(rows: List[Row], font_size: float, lanes: int) -> float:
    header_width = stringWidth("Lane 0", FONT_BOLD, font_size)
    cell_width = max(
        (stringWidth(t, FONT, font_size) for r in rows for t in r.lane_times),
        default=0.0,
    )
    return max(header_width, cell_width) + _char_width(font_size) * LANE_COL_PAD_CHARS


def _fits_width(
    rows: List[Row], font_size: float, avail_width: float, lanes: int
) -> bool:
    lane_w = _lane_col_width(rows, font_size, lanes)
    desc_w = avail_width - lanes * lane_w
    if desc_w <= 0:
        return False
    cw = _char_width(font_size)
    for r in rows:
        indent_px = r.indent * INDENT_CHARS * cw
        if indent_px + stringWidth(r.text, FONT, font_size) > desc_w:
            return False
    return True


def _fit_font_size(
    rows: List[Row], avail_width: float, avail_height: float, max_pages: int, lanes: int
) -> Tuple[float, int]:
    size = MAX_SIZE
    while size >= MIN_SIZE:
        if _fits_width(rows, size, avail_width, lanes):
            lpp = _lines_per_page(size, avail_height)
            pages_needed = -(-len(rows) // lpp) if rows else 1
            if pages_needed <= max_pages:
                return size, lpp
        size -= SIZE_STEP
    return MIN_SIZE, _lines_per_page(MIN_SIZE, avail_height)


def render_pdf(rows: List[Row], lanes: int, path: str, max_pages: int = 1) -> None:
    page_size = letter
    avail_w = page_size[0] - 2 * MARGIN
    avail_h = page_size[1] - 2 * MARGIN
    size, lpp = _fit_font_size(rows, avail_w, avail_h, max_pages, lanes)

    if not _fits_width(rows, size, avail_w, lanes):
        page_size = landscape(letter)
        avail_w = page_size[0] - 2 * MARGIN
        avail_h = page_size[1] - 2 * MARGIN
        size, lpp = _fit_font_size(rows, avail_w, avail_h, max_pages, lanes)

    lane_w = _lane_col_width(rows, size, lanes)
    desc_w = avail_w - lanes * lane_w
    cw = _char_width(size)
    lane_pad = cw
    lane_starts = [MARGIN + desc_w + i * lane_w for i in range(lanes)]

    c = canvas.Canvas(path, pagesize=page_size)
    line_height = size * LINE_SPACING
    page_top = page_size[1] - MARGIN - size

    def draw_header() -> float:
        c.setFont(FONT_BOLD, size)
        y = page_top
        for i, x in enumerate(lane_starts):
            c.drawRightString(x + lane_w - lane_pad, y, f"Lane {i + 1}")
        c.setLineWidth(0.5)
        c.line(MARGIN, y - size * 0.3, MARGIN + avail_w, y - size * 0.3)
        c.setFont(FONT, size)
        return y - line_height

    chunks = [rows[i : i + lpp] for i in range(0, len(rows), lpp)] or [[]]
    for chunk in chunks:
        y = draw_header()
        for row in chunk:
            c.drawString(MARGIN + row.indent * INDENT_CHARS * cw, y, row.text)
            for x, t in zip(lane_starts, row.lane_times):
                c.drawRightString(x + lane_w - lane_pad, y, t)
            y -= line_height
        c.showPage()
    c.save()
