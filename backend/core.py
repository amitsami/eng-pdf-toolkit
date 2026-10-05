"""Shared helpers for all PDF tools."""
import io
import os
import re
import html
import shutil
import tempfile
import subprocess
import zipfile
import platform
from pathlib import Path

import pymupdf

BASE_DIR = Path(__file__).resolve().parent.parent
FONT_DIR = BASE_DIR / "fonts"


class UserError(Exception):
    """An error caused by user input – shown to the user as-is."""


class Upload:
    def __init__(self, name, path, password=None):
        self.name = name
        self.path = path
        self.password = password or None

    @property
    def stem(self):
        s = Path(self.name).stem
        return safe_name(s) or "file"

    @property
    def ext(self):
        return Path(self.name).suffix.lower()


class Result:
    """files: list of (filename, bytes). data: JSON-able dict (for JSON-only tools)."""

    def __init__(self, files=None, info=None, data=None):
        self.files = files or []
        self.info = info or {}
        self.data = data


def safe_name(name):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", str(name)).strip(" .")
    return name[:120]


# --------------------------------------------------------------------------- #
# PDF opening / saving
# --------------------------------------------------------------------------- #
def open_pdf(up: Upload):
    try:
        doc = pymupdf.open(up.path, filetype="pdf")
    except Exception:
        raise UserError(f"“{up.name}” is not a valid PDF or is badly damaged. Try the Repair PDF tool first.")
    if doc.needs_pass:
        if not up.password:
            doc.close()
            raise UserError(f"“{up.name}” is password protected. Please enter its password.")
        if not doc.authenticate(up.password):
            doc.close()
            raise UserError(f"Wrong password for “{up.name}”.")
    if doc.page_count == 0:
        doc.close()
        raise UserError(f"“{up.name}” has no pages. Try the Repair PDF tool first.")
    return doc


def pdf_bytes(doc, garbage=3, **kw):
    kw.setdefault("deflate", True)
    kw.setdefault("encryption", pymupdf.PDF_ENCRYPT_NONE)
    return doc.tobytes(garbage=garbage, **kw)


def decrypted_path(up: Upload, workdir):
    """Return path of an unencrypted copy of the PDF (for external programs)."""
    doc = open_pdf(up)
    try:
        if not doc.is_encrypted and not up.password:
            return up.path
        out = os.path.join(workdir, f"dec_{os.getpid()}_{id(up)}.pdf")
        doc.save(out, encryption=pymupdf.PDF_ENCRYPT_NONE, garbage=1)
        return out
    finally:
        doc.close()


def require_pdfs(files, min_count=1, max_count=None):
    pdfs = [f for f in files if f.ext == ".pdf" or _looks_pdf(f.path)]
    if len(files) != len(pdfs):
        bad = [f.name for f in files if f not in pdfs]
        raise UserError("These files are not PDFs: " + ", ".join(bad))
    if len(pdfs) < min_count:
        raise UserError(f"Please select at least {min_count} PDF file{'s' if min_count > 1 else ''}.")
    if max_count and len(pdfs) > max_count:
        raise UserError(f"Please select at most {max_count} PDF file{'s' if max_count > 1 else ''}.")
    return pdfs


def _looks_pdf(path):
    try:
        with open(path, "rb") as fh:
            return b"%PDF" in fh.read(1024)
    except OSError:
        return False


def zip_files(files):
    buf = io.BytesIO()
    used = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files:
            n, i = name, 1
            while n in used:
                p = Path(name)
                n = f"{p.stem} ({i}){p.suffix}"
                i += 1
            used.add(n)
            z.writestr(n, data)
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# Page range parsing
# --------------------------------------------------------------------------- #
def parse_pages(spec, count, allow_empty=False):
    """'1-3, 5, 8-' -> [0,1,2,4,7..count-1]. Also: all, odd, even, last."""
    spec = (spec or "").strip().lower()
    if not spec or spec == "all":
        if allow_empty and not spec:
            return []
        return list(range(count))
    if spec == "odd":
        return list(range(0, count, 2))
    if spec == "even":
        return list(range(1, count, 2))
    result = []
    for part in re.split(r"[,;\s]+", spec):
        if not part:
            continue
        part = part.replace("last", str(count)).replace("–", "-").replace("—", "-")
        m = re.fullmatch(r"(\d*)-(\d*)", part)
        if m:
            a = int(m.group(1)) if m.group(1) else 1
            b = int(m.group(2)) if m.group(2) else count
        elif part.isdigit():
            a = b = int(part)
        else:
            raise UserError(f"Invalid page range: “{part}”. Use e.g. 1-3, 5, 8-")
        if a < 1 or b < 1 or a > count or b > count:
            raise UserError(f"Page range “{part}” is out of bounds (document has {count} pages).")
        if a > b:
            a, b = b, a
        result.extend(range(a - 1, b))
    seen, out = set(), []
    for p in result:
        if p not in seen:
            seen.add(p)
            out.append(p)
    if not out and not allow_empty:
        raise UserError("No pages selected.")
    return out


def parse_ranges(spec, count):
    """'1-3, 4, 5-9' -> [[0,1,2],[3],[4..8]] (keeps groups)."""
    groups = []
    for part in re.split(r"[,;]+", spec or ""):
        part = part.strip()
        if part:
            groups.append(parse_pages(part, count))
    if not groups:
        raise UserError("Please enter at least one page range.")
    return groups


# --------------------------------------------------------------------------- #
# Colors, fonts, text
# --------------------------------------------------------------------------- #
def hex_to_rgb(value, default=(0, 0, 0)):
    if value is None or value == "":
        return default
    if isinstance(value, (list, tuple)):
        return tuple(float(v) for v in value[:3])
    v = str(value).strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    try:
        return tuple(int(v[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except (ValueError, IndexError):
        return default


def rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c * 255)))) for c in rgb)


_ARCHIVE = None


def font_archive():
    global _ARCHIVE
    if _ARCHIVE is None:
        _ARCHIVE = pymupdf.Archive(str(FONT_DIR)) if FONT_DIR.is_dir() else pymupdf.Archive()
    return _ARCHIVE


_FACES = [("NotoSans", "UniSans"), ("NotoSansBengali", "UniBn"),
          ("NotoSansDevanagari", "UniDv"), ("NotoSansArabic", "UniAr")]


def font_css():
    css = []
    for fname, fam in _FACES:
        if (FONT_DIR / f"{fname}.ttf").exists():
            css.append(f"@font-face{{font-family:{fam};src:url({fname}.ttf);}}")
        if (FONT_DIR / f"{fname}-Bold.ttf").exists():
            css.append(f"@font-face{{font-family:{fam};font-weight:bold;src:url({fname}-Bold.ttf);}}")
    return "".join(css)


def font_family(key):
    uni = ", ".join(f for _, f in _FACES[1:])
    if key == "serif":
        return f"serif, {uni}"
    if key == "mono":
        return f"monospace, {uni}"
    return f"UniSans, sans-serif, {uni}"


def text_css(size=12, color="#000000", family="sans", bold=False, italic=False, align="left",
             line_height=1.2, nowrap=False):
    return (font_css() +
            "* {margin:0;padding:0;}"
            f"body{{font-family:{font_family(family)};font-size:{float(size):.2f}px;color:{color};"
            f"font-weight:{'bold' if bold else 'normal'};font-style:{'italic' if italic else 'normal'};"
            f"text-align:{align};line-height:{line_height};"
            f"{'white-space:nowrap;' if nowrap else 'white-space:pre-wrap;'}}}")


def text_html(text):
    return html.escape(str(text)).replace("\n", "<br/>")


def insert_text_box(page, rect, text, size=12, color="#000000", family="sans", bold=False,
                    italic=False, align="left", rotate=0, overlay=True):
    """Insert Unicode-shaped text into rect, shrinking the font if needed."""
    css = text_css(size, color, family, bold, italic, align)
    return page.insert_htmlbox(pymupdf.Rect(rect), text_html(text), css=css, archive=font_archive(),
                               scale_low=0, rotate=rotate, overlay=overlay)


def make_text_stamp(text, size=48, color="#000000", family="sans", bold=False, italic=False,
                    opacity=1.0):
    """Create a 1-page PDF containing only the text (tight clip rect returned)."""
    doc = pymupdf.open()
    width = max(400, min(14000, len(text) * size * 1.4 + 50))
    height = size * 3 * (text.count("\n") + 1) + 20
    page = doc.new_page(width=width, height=height)
    css = text_css(size, color, family, bold, italic, "left", nowrap=True)
    page.insert_htmlbox(page.rect, text_html(text), css=css, archive=font_archive(), scale_low=0)
    bbox = pymupdf.Rect()
    for b in page.get_text("dict")["blocks"]:
        bbox |= pymupdf.Rect(b["bbox"])
    if bbox.is_empty:
        raise UserError("Watermark text could not be rendered.")
    bbox = (bbox + (-2, -2, 2, 2)) & page.rect
    if opacity < 1:
        set_page_opacity(doc, page, opacity)
    return doc, bbox


def set_page_opacity(doc, page, alpha):
    alpha = max(0.0, min(1.0, float(alpha)))
    page.clean_contents()
    xrefs = page.get_contents()
    if not xrefs:
        return
    xref = xrefs[0]
    doc.update_stream(xref, b"/StampGS gs\n" + doc.xref_stream(xref))
    doc.xref_set_key(page.xref, "Resources/ExtGState/StampGS",
                     f"<</Type/ExtGState/ca {alpha:.3f}/CA {alpha:.3f}>>")


def normalize_page(page):
    """Bake page rotation so that coordinates match what the user sees."""
    if page.rotation:
        page.remove_rotation()


# --------------------------------------------------------------------------- #
# External programs
# --------------------------------------------------------------------------- #
def _which(names, extra_paths=()):
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    for p in extra_paths:
        if p and os.path.exists(p):
            return p
    return None


def soffice_bin():
    return _which(["soffice", "libreoffice", "soffice.exe"], [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/lib/libreoffice/program/soffice",
        "/opt/libreoffice/program/soffice",
    ])


def gs_bin():
    extra = []
    for root in (r"C:\Program Files\gs", r"C:\Program Files (x86)\gs"):
        if os.path.isdir(root):
            for d in sorted(os.listdir(root), reverse=True):
                extra += [os.path.join(root, d, "bin", "gswin64c.exe"), os.path.join(root, d, "bin", "gswin32c.exe")]
    return _which(["gs", "gswin64c", "gswin32c"], extra)


def chrome_bin():
    return _which(["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome",
                   "microsoft-edge", "msedge"], [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ])


def tesseract_bin():
    return _which(["tesseract", "tesseract.exe"], [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract",
    ])


def run(cmd, timeout=300, cwd=None):
    kwargs = {}
    if platform.system() == "Windows":
        kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout, cwd=cwd, **kwargs)
    except subprocess.TimeoutExpired:
        raise UserError("The operation took too long and was stopped. Try a smaller file.")


def libreoffice_convert(src, fmt, outdir, filter_opts=None):
    exe = soffice_bin()
    if not exe:
        raise UserError("LibreOffice is required for this conversion but was not found. "
                        "Install it from libreoffice.org (free) and restart the app.")
    profile = tempfile.mkdtemp(prefix="lo_profile_")
    try:
        target = fmt if not filter_opts else f"{fmt}:{filter_opts}"
        cmd = [exe, f"-env:UserInstallation={Path(profile).as_uri()}", "--headless", "--invisible",
               "--norestore", "--nologo", "--convert-to", target, "--outdir", outdir, src]
        proc = run(cmd, timeout=300)
        out = Path(outdir) / (Path(src).stem + "." + fmt.split(":")[0])
        if not out.exists():
            msg = (proc.stderr or b"").decode("utf-8", "ignore").strip()[:300]
            raise UserError(f"Conversion failed for “{Path(src).name}”. The file may be damaged or unsupported. {msg}")
        return str(out)
    finally:
        shutil.rmtree(profile, ignore_errors=True)
