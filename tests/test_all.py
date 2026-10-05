import io, json, sys, os, zipfile, base64
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pymupdf
from PIL import Image, ImageDraw, ImageFont
from app import app

FIX = "/tmp/fix"; os.makedirs(FIX, exist_ok=True)
c = app.test_client()

def mk_text_pdf(path, n=5, variant=0):
    d = pymupdf.open()
    for i in range(n):
        p = d.new_page()
        p.insert_text((72, 72), f"Chapter {i+1}: The quick brown fox", fontsize=20)
        body = ("This document explains the budget plan for the project. The budget includes staff costs and "
                "equipment. Contact john.doe@example.com or call +1 555 123 4567 for details. ")
        if variant and i == 1: body = body.replace("budget plan", "revised budget plan")
        p.insert_textbox(pymupdf.Rect(72, 100, 520, 400), body * 3, fontsize=11)
        p.draw_rect(pymupdf.Rect(72, 420, 400, 520), color=(0,0,0))
        for r in range(4):
            for col in range(3):
                p.insert_text((80 + col*100, 440 + r*20), f"R{r}C{col} {r*col*10}", fontsize=10)
        p.insert_text((72, 560), "Name: ________________", fontsize=12)
    if n > 2: d[2].set_rotation(90)
    d.save(path)

mk_text_pdf(f"{FIX}/a.pdf"); mk_text_pdf(f"{FIX}/b.pdf", 3, 1)
img = Image.new("RGB", (1240, 1754), "white"); dr = ImageDraw.Draw(img)
try: fnt = ImageFont.truetype("/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf", 48)
except Exception: fnt = ImageFont.load_default(48)
dr.text((100, 200), "Scanned invoice number 12345", fill="black", font=fnt)
dr.text((100, 300), "Total amount due: 999 dollars", fill="black", font=fnt)
img.save(f"{FIX}/scan.jpg", quality=85); img.convert("RGBA").save(f"{FIX}/scan.png")
d = pymupdf.open(); p = d.new_page(); p.insert_image(p.rect, filename=f"{FIX}/scan.jpg"); d.save(f"{FIX}/scanned.pdf")
from docx import Document; doc = Document(); doc.add_heading("Hello Word", 0); doc.add_paragraph("Paragraph text আমার"); doc.save(f"{FIX}/w.docx")
from openpyxl import Workbook; wb = Workbook(); ws = wb.active; ws.append(["a","b"]); ws.append([1,2]); wb.save(f"{FIX}/x.xlsx")
from pptx import Presentation; pr = Presentation(); s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = "Slide"; pr.save(f"{FIX}/p.pptx")
open(f"{FIX}/page.html","w").write("<html><body><h1>Hello HTML</h1><p>Test page</p></body></html>")
# encrypted
e = pymupdf.open(f"{FIX}/a.pdf"); e.save(f"{FIX}/enc.pdf", encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="own")
# damaged
raw = open(f"{FIX}/a.pdf","rb").read(); open(f"{FIX}/broken.pdf","wb").write(raw[:len(raw)-300].replace(b"xref", b"xrfe"))

def call(tool, files, opts=None, passwords=None, extra=None):
    data = {"options": json.dumps(opts or {}), "passwords": json.dumps(passwords or [])}
    data["files"] = [(open(f, "rb"), os.path.basename(f)) for f in files]
    if extra: data.update(extra)
    r = c.post(f"/api/tool/{tool}", data=data, content_type="multipart/form-data")
    return r

FAIL = []
def check(label, r, expect_ok=True, kind=None):
    ok = (r.status_code == 200) == expect_ok
    info = ""
    if r.status_code == 200 and r.mimetype == "application/json":
        info = str(list(r.get_json().keys()))[:100]
    elif r.status_code == 200:
        body = r.data
        fn = r.headers.get("X-Filename")
        if kind == "pdf" and fn.endswith(".pdf"):
            try:
                dd = pymupdf.open("pdf", body); info = f"{fn} pages={dd.page_count}"
            except Exception as ex:
                ok = False; info = f"BAD PDF {ex}"
        else:
            info = f"{fn} {len(body)}B"
        info += " " + urllib_unq(r.headers.get("X-Info",""))[:120]
    else:
        info = (r.get_json() or {}).get("error", "")[:160]
    print(("PASS " if ok else "FAIL ") + label.ljust(28), r.status_code, info)
    if not ok: FAIL.append(label)
    return r

from urllib.parse import unquote as urllib_unq
A, B = f"{FIX}/a.pdf", f"{FIX}/b.pdf"
check("merge", call("merge", [A, B]), kind="pdf")
check("merge 1 file -> error", call("merge", [A]), False)
check("split ranges", call("split", [A], {"mode":"ranges","ranges":"1-2,3,4-5"}))
check("split ranges merged", call("split", [A], {"mode":"ranges","ranges":"1-2,4","merge":True}), kind="pdf")
check("split fixed", call("split", [A], {"mode":"fixed","every":2}))
check("split bad range", call("split", [A], {"mode":"ranges","ranges":"1-99"}), False)
check("remove-pages", call("remove-pages", [A], {"pages":"2,4"}), kind="pdf")
check("remove all -> error", call("remove-pages", [A], {"pages":"1-5"}), False)
check("extract-pages", call("extract-pages", [A], {"pages":"1,3"}), kind="pdf")
check("organize", call("organize", [A, B], {"pages":[{"file":1,"page":0,"rotate":90},{"blank":True},{"file":0,"page":4}]}), kind="pdf")
check("rotate", call("rotate", [A, B], {"angle":90}))
check("compress", call("compress", [f"{FIX}/scanned.pdf"], {"level":"extreme"}), kind="pdf")
check("compress text", call("compress", [A], {"level":"recommended"}), kind="pdf")
check("repair broken", call("repair", [f"{FIX}/broken.pdf"]), kind="pdf")
r = check("ocr", call("ocr", [f"{FIX}/scanned.pdf"], {"languages":["eng"]}), kind="pdf")
if r.status_code == 200: print("   OCR text:", pymupdf.open("pdf", r.data)[0].get_text()[:80].replace("\n"," | "))
check("jpg-to-pdf", call("jpg-to-pdf", [f"{FIX}/scan.jpg", f"{FIX}/scan.png"], {"pagesize":"A4","margin":"small","orientation":"auto"}), kind="pdf")
check("scan-to-pdf bw", call("scan-to-pdf", [f"{FIX}/scan.jpg"], {"filter":"bw","scan":True}), kind="pdf")
check("word-to-pdf", call("word-to-pdf", [f"{FIX}/w.docx"]), kind="pdf")
check("excel-to-pdf", call("excel-to-pdf", [f"{FIX}/x.xlsx"]), kind="pdf")
check("powerpoint-to-pdf", call("powerpoint-to-pdf", [f"{FIX}/p.pptx"]), kind="pdf")
check("word-to-pdf wrong type", call("word-to-pdf", [A]), False)
check("html-to-pdf file", call("html-to-pdf", [f"{FIX}/page.html"], {"wait":0}), kind="pdf")
check("html-to-pdf url", call("html-to-pdf", [], {"url":"example.com","wait":0}), kind="pdf")
check("pdf-to-jpg pages", call("pdf-to-jpg", [A], {"dpi":100}))
check("pdf-to-jpg extract", call("pdf-to-jpg", [f"{FIX}/scanned.pdf"], {"mode":"extract"}))
check("pdf-to-jpg extract none", call("pdf-to-jpg", [A], {"mode":"extract"}), False)
check("pdf-to-word", call("pdf-to-word", [B]))
check("pdf-to-powerpoint", call("pdf-to-powerpoint", [B]))
check("pdf-to-excel", call("pdf-to-excel", [B]))
check("pdf-to-pdfa", call("pdf-to-pdfa", [B], {"level":"2b"}), kind="pdf")
check("pdf-to-markdown", call("pdf-to-markdown", [B]))
check("page-numbers", call("page-numbers", [A], {"position":"br","format":"Page {n} of {total}","mode":"facing"}), kind="pdf")
check("watermark text", call("watermark", [A], {"type":"text","text":"CONFIDENTIAL গোপন","rotation":45,"opacity":0.3,"position":"mosaic"}), kind="pdf")
check("watermark image", call("watermark", [A, f"{FIX}/scan.png"], {"type":"image","opacity":0.5,"rotation":30,"position":"tr"}), kind="pdf")
check("crop margins", call("crop", [A], {"mode":"margins","top":50,"left":30,"right":30,"bottom":50}), kind="pdf")
check("crop box", call("crop", [A], {"mode":"box","box":{"x0":0.1,"y0":0.1,"x1":0.9,"y1":0.6},"apply":"all"}), kind="pdf")
sig = base64.b64encode(open(f"{FIX}/scan.png","rb").read()).decode()
check("edit", call("edit", [A], {"items":[
    {"page":0,"type":"text","x":0.1,"y":0.8,"w":0.5,"h":0.05,"text":"Hello আমি","size":14,"color":"#ff0000","bold":True},
    {"page":2,"type":"rect","x":0.1,"y":0.1,"w":0.2,"h":0.1,"stroke":"#0000ff","fill":"#00ff00","opacity":0.5},
    {"page":0,"type":"ellipse","x":0.5,"y":0.5,"w":0.2,"h":0.1,"stroke":"#0000ff"},
    {"page":0,"type":"arrow","x1":0.1,"y1":0.1,"x2":0.4,"y2":0.3,"stroke":"#000"},
    {"page":0,"type":"draw","points":[[0.1,0.1],[0.2,0.2],[0.3,0.1]],"stroke":"#f0f"},
    {"page":0,"type":"whiteout","x":0.1,"y":0.1,"w":0.2,"h":0.02},
    {"page":0,"type":"highlight","x":0.1,"y":0.15,"w":0.3,"h":0.02},
    {"page":1,"type":"signature","x":0.6,"y":0.85,"w":0.3,"h":0.08,"src":"data:image/png;base64,"+sig}]}), kind="pdf")
check("edit empty -> error", call("edit", [A], {"items":[]}), False)
r = check("form-fields (none)", call("form-fields", [A]))
det = r.get_json()["detected"]; print("   detected:", len(det), det[:1])
r = check("forms create", call("forms", [A], {"new_fields":[{"page":0,"type":"text","x":0.1,"y":0.9,"w":0.3,"h":0.03,"name":"full name"},
    {"page":0,"type":"checkbox","x":0.5,"y":0.9,"w":0.03,"h":0.02},{"page":1,"type":"dropdown","x":0.1,"y":0.9,"w":0.3,"h":0.03,"options":["Yes","No"]},
    {"page":2,"type":"multiline","x":0.1,"y":0.7,"w":0.4,"h":0.1}]}), kind="pdf")
open(f"{FIX}/form.pdf","wb").write(r.data)
r = check("form-fields (form)", call("form-fields", [f"{FIX}/form.pdf"]))
flds = r.get_json()["fields"]; print("   fields:", [(f["name"], f["type"], f["value"]) for f in flds])
vals = {f["id"]: ("Jane Doe" if f["type"]=="text" else True if f["type"]=="checkbox" else "No") for f in flds}
r = check("forms fill+flatten", call("forms", [f"{FIX}/form.pdf"], {"values":vals}), kind="pdf")
open(f"{FIX}/filled.pdf","wb").write(r.data)
print("   filled:", [(f["name"], f["value"]) for f in call("form-fields", [f"{FIX}/filled.pdf"]).get_json()["fields"]])
check("forms flatten", call("forms", [f"{FIX}/form.pdf"], {"values":vals,"flatten":True}), kind="pdf")
check("enc without pw -> error", call("rotate", [f"{FIX}/enc.pdf"]), False)
check("enc wrong pw -> error", call("rotate", [f"{FIX}/enc.pdf"], passwords=["bad"]), False)
check("enc right pw rotate", call("rotate", [f"{FIX}/enc.pdf"], passwords=["secret"]), kind="pdf")
r = check("unlock", call("unlock", [f"{FIX}/enc.pdf"], passwords=["secret"]), kind="pdf")
print("   unlocked needs_pass:", pymupdf.open("pdf", r.data).needs_pass)
r = check("protect", call("protect", [A], {"password":"abc","confirm":"abc","allow_print":False}))
pd_ = pymupdf.open("pdf", r.data); print("   protected needs_pass:", pd_.needs_pass, pd_.authenticate("abc"))
check("protect mismatch", call("protect", [A], {"password":"abc","confirm":"abd"}), False)
r = check("redact", call("redact", [A], {"terms":"budget","patterns":["email","phone"],"areas":[{"page":0,"x0":0.1,"y0":0.8,"x1":0.5,"y1":0.9}]}), kind="pdf")
t = pymupdf.open("pdf", r.data)[0].get_text(); print("   leftover budget/email:", "budget" in t.lower(), "example.com" in t)
check("redact nothing found", call("redact", [A], {"terms":"zzzqqq"}), False)
r = check("compare", call("compare", [A, B]))
j = r.get_json(); print("   changes", j["changes"], "sim", j["similarity"], [o for o in j["ops"] if o["op"]!="equal"][:2])
r = check("summarize", call("summarize", [A], {"length":"short"})); print("   ", r.get_json()["summary"][:150])
r = check("translate", call("translate", [B], {"target":"bn"}), kind="pdf")
if r.status_code == 200:
    pymupdf.open("pdf", r.data)[0].get_pixmap(dpi=60).save("/tmp/translated.png")
check("workflow", call("workflow", [A], {"steps":[{"tool":"rotate","options":{"angle":180}},{"tool":"page-numbers","options":{}},{"tool":"watermark","options":{"text":"DRAFT"}},{"tool":"compress","options":{}}]}), kind="pdf")
check("workflow bad", call("workflow", [A], {"steps":[{"tool":"split"}]}), False)
check("not a pdf", call("rotate", [f"{FIX}/scan.jpg"]), False)
print("\nFAILED:", FAIL if FAIL else "none")
