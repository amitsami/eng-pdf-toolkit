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

# ENG PDF Toolkit — All Your PDF Tools in One Place

34 tools, free to use (hosting upload and runtime limits apply): Merge, Split, Remove/Extract Pages, Organize, Scan to PDF (phone QR), Compress, Repair, OCR, JPG/Word/PowerPoint/Excel/HTML to PDF, PDF to JPG/Word/PowerPoint/Excel/PDF-A/Markdown, Edit, Sign, Watermark, Rotate, Page Numbers, Crop, PDF Forms, Unlock, Protect, Redact, Compare, AI Summarizer, Translate, and Workflow.

When run locally, files are processed on your computer. In a hosted deployment, files are processed on the server. Translation uses external online translation services.

## Run Locally

1. Install **Python 3.10+** from https://python.org. On Windows, select **Add Python to PATH**.
2. Download and extract the project, or clone this repository.
3. Start the app:
   - **Windows:** Double-click `run.bat`.
   - **macOS / Linux:** Run `bash run.sh` in a terminal.
4. Open **http://localhost:5000** in your browser.

To change the port: `PORT=8080 python app.py` (macOS/Linux shell syntax). For phone-based Scan to PDF on a local network, your phone and computer must use the same Wi-Fi network.

### Docker

Build and run the app with the optional conversion programs included:

```bash
docker build -t pdftoolkit .
docker run --rm -p 5000:7860 -e COOKIE_SECURE=0 -v pdfapp-data:/data pdftoolkit
```

Use `COOKIE_SECURE=0` only for local HTTP. Keep secure cookies enabled for hosted HTTPS deployments.

## Optional Programs

Some tools require additional software:

| Program | Used By | Installation |
|---|---|---|
| LibreOffice | Word/PowerPoint/Excel to PDF; HTML-to-PDF fallback | https://www.libreoffice.org |
| Ghostscript | PDF/A; enhanced compression and repair | https://ghostscript.com |
| Tesseract OCR | PDF OCR; scanned PDF to Word | Windows: UB-Mannheim installer; macOS: `brew install tesseract tesseract-lang`; Linux: `apt install tesseract-ocr tesseract-ocr-ben` |
| Google Chrome / Chromium | HTML to PDF | https://google.com/chrome |

The app can start without these programs, but affected tools will display an installation message. Restart the app after installing them. Bengali OCR requires the Tesseract `ben` language pack.

## Tests

Run `python tests/test_all.py` to exercise the backend tools. Some tests require the optional programs or internet access.

## Design

Apple-inspired clean interface, Liquid Glass, scroll animations, and the color palette `#8B9A6E`, `#F7F2EB`, `#EAE2D6`, and `#EEEEEE`.

## Author

**Amit Hasan Sami**

- GitHub: https://github.com/amitsami
- Facebook: https://www.facebook.com/amithsami110
- Instagram: https://www.instagram.com/_ahsami1_

## Settings, Dark Mode, and Shortcuts

- Click the header's settings button or press `,` to configure the theme (Light / Dark / Auto), glass blur, liquid background, cursor glow, animations (Full / Calm / Off), automatic header hiding, and automatic downloads.
- Click the moon button or press `Shift + D` to switch between light and dark modes.
- Press `Ctrl/Command + K` or `/` to search for a tool.
- Drop a file anywhere on the page to see suggested tools.

## Private Owner Dashboard

- On startup, the console displays the dashboard URL, such as `http://localhost:5000/owner-xxxxxxxx`.
- On first startup, the generated password is saved in `data/OWNER_ACCESS.txt`. Sign in and use **Settings → Change password** to replace it; the initial access file is then deleted automatically.
- To supply your own password, set the `OWNER_PASSWORD` environment variable before starting the app. For example, in a macOS/Linux shell: `OWNER_PASSWORD='replace-with-a-strong-password' python app.py`. Never commit credentials to the repository.
- The dashboard includes live online visitors, daily visits, unique visitors, sessions, new versus returning visitors, charts, an hourly heatmap, a world map, visitor attributes, page and tool usage, searchable visitor lists, individual visit history, CSV export, and data clearing.
- Page loads are recorded server-side. Cookies distinguish unique visitors; bots are shown separately, and the owner's browser visits are excluded from the visitor count.
- IP-based locations are approximate and use ip-api.com / ipwho.is; the server needs internet access.
- Analytics are stored in SQLite under `data/`. A privacy notice is shown to visitors. Follow applicable privacy requirements before collecting IP addresses and location data on a public website.

## Deployment

- [Azure deployment guide](AZURE_DEPLOYMENT.md)
- [Hugging Face deployment guide](HUGGINGFACE_GUIDE.md)

The Docker deployment defaults to a 50 MB upload limit and one conversion at a time. GitHub Pages cannot run this Python/Flask backend.

## Licensing

No project-wide license has been selected. Bundled Noto fonts retain the SIL Open Font License, and PDF.js retains Apache-2.0. See `third_party/` for their license texts and font copyright notices. Other dependencies retain their respective licenses.
