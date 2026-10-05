---
title: ENG PDF Toolkit
emoji: 📄
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Free PDF tools – merge, split, compress, convert, edit, sign
---

# ENG PDF Toolkit — shob PDF tool, ek jaygay, free

34 ta tool (free to use; hosting-er upload/runtime limits apply): Merge, Split, Remove/Extract pages, Organize, Scan to PDF (phone QR), Compress, Repair, OCR,
JPG/Word/PowerPoint/Excel/HTML → PDF, PDF → JPG/Word/PowerPoint/Excel/PDF-A/Markdown, Edit, Sign,
Watermark, Rotate, Page numbers, Crop, PDF Forms, Unlock, Protect, Redact, Compare, AI Summarizer,
Translate, Workflow. Locally chalale file nijer computer-e process hoy; hosted version-e server-e process hoy. Translate external online translation services use kore.

## Kivabe chalaben (Run)
1. **Python 3.10+** install korun (https://python.org — Windows-e "Add Python to PATH" tick din).
2. Folder-ta unzip korun.
3. - **Windows:** `run.bat` double-click korun
   - **Mac / Linux:** terminal-e `bash run.sh`
4. Browser-e khulun: **http://localhost:5000**

Port bodlate: `PORT=8080 python app.py`. Phone theke Scan to PDF-er jonno phone ar PC eki Wi-Fi-te thakte hobe.

**Docker:** `docker build -t pdftoolkit . && docker run --rm -p 5000:7860 -e COOKIE_SECURE=0 -v pdfapp-data:/data pdftoolkit` (shob optional program shoho).

## Optional program (kichu tool-er jonno dorkar)
| Program | Kon tool | Install |
|---|---|---|
| LibreOffice | Word/PowerPoint/Excel → PDF (HTML→PDF fallback) | https://www.libreoffice.org |
| Ghostscript | PDF/A, aro bhalo Compress/Repair | https://ghostscript.com |
| Tesseract OCR | OCR PDF, scanned PDF → Word | Windows: UB-Mannheim installer; Mac: `brew install tesseract tesseract-lang`; Linux: `apt install tesseract-ocr tesseract-ocr-ben` |
| Google Chrome / Chromium | HTML → PDF (best quality) | https://google.com/chrome |

Program install na thakle app chalu hobe, shudhu oi tool-e "install korun" message dekhabe.
Install korar por app restart korun. Bangla OCR-er jonno Tesseract-er `ben` language pack lagbe.

## Tests
`python tests/test_all.py` — shob backend tool test kore.

## Design
Apple-style clean UI · Liquid Glass · scroll animation · palette: `#8B9A6E` `#F7F2EB` `#EAE2D6` `#EEEEEE`

---
**Made by: Amit Hasan Sami**
- GitHub: https://github.com/amitsami
- Facebook: https://www.facebook.com/amithsami110
- Instagram: https://www.instagram.com/_ahsami1_

## Settings, dark mode & shortcuts
- Header-er ⚙️ button (ba `,` key) → Settings: Light / Dark / Auto theme, glass blur, liquid background, cursor glow, animation (Full / Calm / Off), auto-hide header, auto-download.
- 🌙 button ba `Shift + D` → light/dark switch. `Ctrl/⌘ + K` ba `/` → tool search. Page-er jekono jaygay file drop korle matching tool suggest kore.

## Owner dashboard (private)
- App start korle console-e dashboard link dekhabe, jemon `http://localhost:5055/owner-xxxxxxxx`.
- Prothom bar chalale password `data/OWNER_ACCESS.txt` file-e lekha thake. Login kore **Settings → Change password** diye bodle nin (tarpor file-ta nije theke muche jay).
- Nijer password set korte chaile: `OWNER_PASSWORD=amarPassword python app.py`
- Dashboard-e: online now (live), today/visits/unique/sessions/new vs returning, chart, busiest hours heatmap, world map, country/city/device/OS/browser/model/referrer/language/screen/ISP, page & tool usage, visitor list (IP, location, device) + search, visitor-er full history, CSV export, data clear.
- Counting: protiti page load server-e record hoy (ad-blocker ateke na), cookie diye unique visitor alada kora hoy, bot alada dekhay, nijer browser-er visit count hoy na.
- Location IP theke approximate (free ip-api.com / ipwho.is, server-e internet lagbe).
- Shob data `data/` folder-e (SQLite). Site-e visitor-der jonno privacy notice dekhano hoy — public site-e IP/location rakhar age apnar desher privacy niyom follow korun.

## Azure deployment

See [Azure deployment guide (Bangla)](AZURE_DEPLOYMENT_BANGLA.md). The Docker deployment defaults to a 50 MB upload limit and one conversion at a time. Set `COOKIE_SECURE=0` only for local HTTP; retain secure cookies for hosted HTTPS. GitHub Pages cannot run this Python/Flask backend.

## Licensing

No project-wide license has been selected. Bundled Noto fonts retain the SIL Open Font License, and PDF.js retains Apache-2.0. See `third_party/` for their license texts and font copyright notices. Other dependencies retain their respective licenses.
