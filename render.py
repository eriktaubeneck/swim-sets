import glob
import os
from typing import List, Optional, Tuple

from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

MARGIN: float = 36.0
LINE_SPACING: float = 1.15
MAX_SIZE: float = 24.0
MIN_SIZE: float = 5.0
SIZE_STEP: float = 0.5

FONT_DIRS: List[str] = [
    os.path.expanduser("~/Library/Fonts"),
    "/Library/Fonts",
    "/System/Library/Fonts",
    "/System/Library/Fonts/Supplemental",
]


def _find_font_file(pattern: str, exclude: str = "") -> Optional[str]:
    matches = [
        f
        for d in FONT_DIRS
        for f in glob.glob(os.path.join(d, pattern))
        if not (exclude and exclude in os.path.basename(f).lower())
    ]
    return sorted(matches)[0] if matches else None


def _register_monospace_font() -> Tuple[str, str]:
    # prefer Berkeley Mono, then macOS's built-in Menlo, then the PDF-standard
    # Courier that's always available with no font files needed
    berkeley_regular = _find_font_file("*[Bb]erkeley*[Mm]ono*[Rr]egular*.[ot]tf")
    berkeley_bold = _find_font_file(
        "*[Bb]erkeley*[Mm]ono*[Bb]old*.[ot]tf", exclude="italic"
    )
    if berkeley_regular and berkeley_bold:
        pdfmetrics.registerFont(TTFont("SwimMono", berkeley_regular))
        pdfmetrics.registerFont(TTFont("SwimMono-Bold", berkeley_bold))
        return "SwimMono", "SwimMono-Bold"

    menlo_ttc = "/System/Library/Fonts/Menlo.ttc"
    if os.path.exists(menlo_ttc):
        pdfmetrics.registerFont(TTFont("SwimMono", menlo_ttc, subfontIndex=0))
        pdfmetrics.registerFont(TTFont("SwimMono-Bold", menlo_ttc, subfontIndex=1))
        return "SwimMono", "SwimMono-Bold"

    return "Courier", "Courier-Bold"


FONT, FONT_BOLD = _register_monospace_font()


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
