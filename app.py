"""ENG PDF Toolkit – a free, self-hosted PDF web app. Run:  python app.py   then open http://localhost:5000"""
import io
import json
import logging
import os
import secrets
import shutil
import socket
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
from pathlib import Path

from flask import Flask, g, request, jsonify, send_file, send_from_directory, abort, session, Response, make_response
from werkzeug.security import generate_password_hash, check_password_hash

from backend.core import (UserError, Upload, zip_files, safe_name, soffice_bin, gs_bin, chrome_bin,
                          tesseract_bin)
from backend import tools as T
from backend import analytics as A

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
MAX_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
log = logging.getLogger("pdftoolkit")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

MIME = {".pdf": "application/pdf", ".zip": "application/zip", ".jpg": "image/jpeg", ".png": "image/png",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"}


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if "Cache-Control" not in resp.headers or request.path.startswith("/static"):
        if request.path.startswith("/api"):
            resp.headers["Cache-Control"] = "no-store"
        elif request.path.startswith("/static/vendor/"):
            resp.headers["Cache-Control"] = "public, max-age=604800, immutable"
        else:
            resp.headers["Cache-Control"] = "no-cache"  # always fresh, but 304 via ETag = instant
    return resp


# ---------------------------------------------------------------- owner access (dashboard)
OWNER_FILE = A.DATA / "owner.json"


def _owner_cfg():
    cfg = {}
    if OWNER_FILE.exists():
        try:
            cfg = json.loads(OWNER_FILE.read_text())
        except Exception:
            cfg = {}
    changed = False
    # hosting platforms (Hugging Face, Render, Cloud Run…) can fix these via environment variables / secrets
    for key, env in (("secret", "OWNER_SECRET"), ("path", "OWNER_PATH")):
        v = (os.environ.get(env) or "").strip().strip("/")
        if v and cfg.get(key) != v:
            cfg[key] = v; changed = True
    if not cfg.get("secret"):
        cfg["secret"] = secrets.token_hex(32); changed = True
    if not cfg.get("path"):
        cfg["path"] = "owner-" + secrets.token_hex(4); changed = True
    if not cfg.get("hash"):
        pw = os.environ.get("OWNER_PASSWORD") or secrets.token_urlsafe(9)
        cfg["hash"] = generate_password_hash(pw); changed = True
        (A.DATA / "OWNER_ACCESS.txt").write_text(
            f"ENG PDF Toolkit – owner dashboard\n\nLink:      /{cfg['path']}   (e.g. http://localhost:5000/{cfg['path']})\n"
            f"Password:  {pw}\n\nChange the password from the dashboard (Settings). Delete this file afterwards.\n")
    if changed:
        OWNER_FILE.write_text(json.dumps(cfg, indent=1))
    return cfg


OWNER = _owner_cfg()
if os.environ.get("OWNER_PASSWORD") and not check_password_hash(OWNER["hash"], os.environ["OWNER_PASSWORD"]):
    OWNER["hash"] = generate_password_hash(os.environ["OWNER_PASSWORD"]); OWNER_FILE.write_text(json.dumps(OWNER, indent=1))
app.secret_key = OWNER["secret"]
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", PERMANENT_SESSION_LIFETIME=30 * 86400)
LOGIN_FAILS = {}
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("COOKIE_SECURE", "0") == "1"
CONVERSION_SLOTS = threading.BoundedSemaphore(int(os.environ.get("MAX_CONCURRENT_TOOLS", "1")))

@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})

@app.before_request
def limit_conversions():
    if request.path.startswith("/api/tool/") and request.method == "POST":
        if not CONVERSION_SLOTS.acquire(blocking=False):
            return jsonify({"error": "Another conversion is running. Please retry shortly."}), 429
        g.conversion_slot = True

@app.teardown_request
def release_conversion_slot(error):
    if getattr(g, "conversion_slot", False):
        g.conversion_slot = False
        CONVERSION_SLOTS.release()



def owner_required(fn):
    import functools

    @functools.wraps(fn)
    def w(*a, **k):
        if not session.get("owner"):
            return _error("Not signed in.", 401)
        return fn(*a, **k)
    return w


@app.get("/")
def index():
    resp = make_response(send_from_directory(STATIC, "index.html"))
    resp.headers["Cache-Control"] = "no-store"
    if request.cookies.get("eng_owner") == "1" and session.get("owner"):
        return resp  # owner chose not to count own visits
    try:
        pv, vid, sid, is_new = A.record_visit(request, "page", "/")
        resp.set_cookie("eng_vid", vid, max_age=2 * 365 * 86400, samesite="Lax")
        resp.set_cookie("eng_sid", sid, max_age=30 * 60, samesite="Lax")
        resp.set_cookie("eng_pv", str(pv), max_age=3600, samesite="Lax")
    except Exception:
        log.error("analytics failed:\n%s", traceback.format_exc())
    return resp


def _tjson():
    try:
        return json.loads(request.get_data(as_text=True) or "{}")
    except Exception:
        return {}


@app.post("/api/t/enrich")
def t_enrich():
    d = _tjson()
    try:
        A.enrich(int(d.get("pv") or 0), request.cookies.get("eng_vid", ""), d)
    except Exception:
        pass
    return ("", 204)


@app.post("/api/t/nav")
def t_nav():
    d = _tjson()
    if request.cookies.get("eng_vid") and not (request.cookies.get("eng_owner") == "1" and session.get("owner")):
        try:
            A.record_visit(request, "nav", str(d.get("path") or "/"), {"referrer": "", "tz": d.get("tz"), "screen": d.get("screen"), "lang": d.get("lang")})
        except Exception:
            pass
    resp = make_response("", 204)
    if request.cookies.get("eng_sid"):
        resp.set_cookie("eng_sid", request.cookies["eng_sid"], max_age=30 * 60, samesite="Lax")
    return resp


@app.post("/api/t/ping")
def t_ping():
    if not (request.cookies.get("eng_owner") == "1" and session.get("owner")):
        A.ping(request, str(_tjson().get("path") or "/"))
    return ("", 204)


@app.get("/<path:p>")
def owner_page(p):
    if p == OWNER["path"]:
        r = make_response(send_from_directory(STATIC, "owner.html"))
        r.headers["Cache-Control"] = "no-store"
        r.headers["X-Robots-Tag"] = "noindex, nofollow"
        return r
    abort(404)


@app.post("/api/owner/login")
def owner_login():
    ip = A.client_ip(request)
    fails = [t for t in LOGIN_FAILS.get(ip, []) if time.time() - t < 600]
    if len(fails) >= 8:
        return _error("Too many attempts. Try again in 10 minutes.", 429)
    d = _tjson()
    pw = (d.get("password") or "")
    if not check_password_hash(OWNER["hash"], pw):
        fails.append(time.time()); LOGIN_FAILS[ip] = fails
        return _error("Wrong password.", 401)
    LOGIN_FAILS.pop(ip, None)
    session.permanent = d.get("remember", True) is not False
    session["owner"] = True
    return jsonify({"ok": True})


@app.post("/api/owner/logout")
def owner_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/owner/me")
def owner_me():
    return jsonify({"owner": bool(session.get("owner"))})


@app.post("/api/owner/password")
@owner_required
def owner_password():
    d = _tjson()
    if not check_password_hash(OWNER["hash"], d.get("current") or ""):
        return _error("Current password is wrong.")
    new = d.get("new") or ""
    if len(new) < 6:
        return _error("Use at least 6 characters.")
    OWNER["hash"] = generate_password_hash(new)
    OWNER_FILE.write_text(json.dumps(OWNER, indent=1))
    try:
        (A.DATA / "OWNER_ACCESS.txt").unlink()
    except OSError:
        pass
    return jsonify({"ok": True})


@app.get("/api/owner/stats")
@owner_required
def owner_stats():
    return jsonify(A.stats(int(request.args.get("days", 30)), request.args.get("bots") == "1", int(request.args.get("tz", 0))))


@app.get("/api/owner/visits")
@owner_required
def owner_visits():
    return jsonify(A.visits(int(request.args.get("limit", 100)), int(request.args.get("offset", 0)), request.args.get("q", ""), request.args.get("bots") != "0"))


@app.get("/api/owner/visitor/<vid>")
@owner_required
def owner_visitor(vid):
    return jsonify(A.visitor(vid))


@app.get("/api/owner/events")
@owner_required
def owner_events():
    return jsonify(A.events(int(request.args.get("limit", 100))))


@app.get("/api/owner/live")
@owner_required
def owner_live():
    return jsonify({"online": A.online()})


@app.get("/api/owner/export.csv")
@owner_required
def owner_export():
    return Response(A.export_csv(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=eng-visitors.csv"})


@app.post("/api/owner/clear")
@owner_required
def owner_clear():
    A.clear()
    return jsonify({"ok": True})


@app.get("/scan/<sid>")
def scan_page(sid):
    return send_from_directory(STATIC, "scan.html")


@app.get("/api/capabilities")
def capabilities():
    langs = []
    try:
        langs = T.ocr_languages()
    except Exception:
        pass
    return jsonify({
        "libreoffice": bool(soffice_bin()), "ghostscript": bool(gs_bin()), "chrome": bool(chrome_bin()),
        "tesseract": bool(tesseract_bin()), "ocr_languages": langs, "translate_languages": T.LANGS,
        "max_upload_mb": MAX_MB,
    })


def _error(msg, code=400):
    return jsonify({"error": msg}), code


@app.errorhandler(413)
def too_large(e):
    return _error(f"Files are too large. The maximum total upload is {MAX_MB} MB.", 413)


@app.post("/api/tool/<name>")
def run_tool(name):
    fn = T.TOOLS.get(name)
    if not fn:
        return _error("Unknown tool.", 404)
    workdir = tempfile.mkdtemp(prefix="pdftk_")
    try:
        try:
            opts = json.loads(request.form.get("options") or "{}")
            passwords = json.loads(request.form.get("passwords") or "[]")
            if not isinstance(opts, dict):
                raise ValueError
        except ValueError:
            return _error("Invalid options.")
        uploads = []
        for i, f in enumerate(request.files.getlist("files")):
            if not f or not f.filename:
                continue
            fname_in = safe_name(os.path.basename(f.filename.replace("\\", "/"))) or f"file{i}"
            path = os.path.join(workdir, f"in_{i}{Path(fname_in).suffix.lower()}")
            f.save(path)
            if os.path.getsize(path) == 0:
                return _error(f"“{fname_in}” is empty.")
            pw = passwords[i] if i < len(passwords) else None
            uploads.append(Upload(fname_in, path, pw))
        if name == "watermark" and "image" in request.files:
            img = request.files["image"]
            ip = os.path.join(workdir, "wm_image" + (Path(img.filename or "x.png").suffix.lower() or ".png"))
            img.save(ip)
            uploads.append(Upload(img.filename or "watermark.png", ip))
        t0 = time.time()
        nbytes = sum(os.path.getsize(u.path) for u in uploads if os.path.exists(u.path))
        try:
            result = fn(uploads, opts, workdir)
        except Exception as ex:
            try:
                A.record_event(request, name, False, (time.time() - t0) * 1000, len(uploads), nbytes, str(ex))
            except Exception:
                pass
            raise
        log.info("tool=%s files=%d took=%.2fs", name, len(uploads), time.time() - t0)
        try:
            A.record_event(request, name, True, (time.time() - t0) * 1000, len(uploads), nbytes)
        except Exception:
            pass
        if result.data is not None:
            return jsonify(result.data)
        if not result.files:
            return _error("The tool produced no output.")
        if len(result.files) == 1:
            fname, data = result.files[0]
        else:
            fname, data = f"{name}_files.zip", zip_files(result.files)
        resp = send_file(io.BytesIO(data), as_attachment=True, download_name=fname,
                         mimetype=MIME.get(Path(fname).suffix.lower(), "application/octet-stream"))
        resp.headers["X-Filename"] = urllib.parse.quote(fname)
        resp.headers["X-Info"] = urllib.parse.quote(json.dumps(result.info, ensure_ascii=False)[:6000])
        resp.headers["X-File-Count"] = str(len(result.files))
        return resp
    except UserError as e:
        return _error(str(e))
    except MemoryError:
        return _error("The file is too large to process on this computer.", 500)
    except Exception as e:
        log.error("tool %s failed:\n%s", name, traceback.format_exc())
        return _error(f"Something went wrong while processing your file ({type(e).__name__}: {e}). "
                      "The file may be damaged – try Repair PDF.", 500)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


# ---------------------------------------------------------------- Scan to PDF (phone -> browser)
SCANS = {}
SCAN_LOCK = threading.Lock()
SCAN_TTL = 3600


def _cleanup_scans():
    now = time.time()
    with SCAN_LOCK:
        for sid in [k for k, v in SCANS.items() if now - v["t"] > SCAN_TTL]:
            SCANS.pop(sid, None)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


@app.post("/api/scan/new")
def scan_new():
    _cleanup_scans()
    sid = secrets.token_urlsafe(9)
    with SCAN_LOCK:
        SCANS[sid] = {"t": time.time(), "files": []}
    host = request.host
    hostname = host.split(":")[0]
    port = host.split(":")[1] if ":" in host else ""
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0"):
        hostname = lan_ip()
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme).split(",")[0].strip()
    if "https" in request.headers.get("Cf-Visitor", ""):
        scheme = "https"
    base = (os.environ.get("PUBLIC_BASE_URL") or f"{scheme}://{hostname}{':' + port if port else ''}").rstrip("/")
    url = f"{base}/scan/{sid}"
    svg = ""
    try:
        import qrcode
        import qrcode.image.svg
        img = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
        buf = io.BytesIO()
        img.save(buf)
        svg = buf.getvalue().decode()
    except Exception:
        pass
    return jsonify({"sid": sid, "url": url, "qr": svg})


@app.post("/api/scan/<sid>/upload")
def scan_upload(sid):
    with SCAN_LOCK:
        s = SCANS.get(sid)
    if not s:
        return _error("This scan session has expired. Scan the QR code again.", 404)
    count = 0
    for f in request.files.getlist("files"):
        data = f.read()
        if not data:
            continue
        with SCAN_LOCK:
            if len(s["files"]) >= 200:
                return _error("Too many scans in this session.")
            s["files"].append({"id": secrets.token_hex(6), "name": safe_name(f.filename or "scan.jpg") or "scan.jpg",
                               "data": data, "type": f.mimetype or "image/jpeg"})
            s["t"] = time.time()
        count += 1
    return jsonify({"ok": True, "count": count})


@app.get("/api/scan/<sid>/list")
def scan_list(sid):
    with SCAN_LOCK:
        s = SCANS.get(sid)
        if not s:
            return _error("expired", 404)
        return jsonify({"files": [{"id": f["id"], "name": f["name"]} for f in s["files"]]})


@app.get("/api/scan/<sid>/file/<fid>")
def scan_file(sid, fid):
    with SCAN_LOCK:
        s = SCANS.get(sid)
        f = next((x for x in (s or {}).get("files", []) if x["id"] == fid), None)
    if not f:
        abort(404)
    return send_file(io.BytesIO(f["data"]), mimetype=f["type"], download_name=f["name"])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("HOST", "0.0.0.0")
    print("\n  ENG PDF Toolkit is running!")
    print(f"  Open  http://localhost:{port}  in your browser")
    print(f"  (phones on the same Wi-Fi: http://{lan_ip()}:{port})")
    print(f"  Owner dashboard: http://localhost:{port}/{OWNER['path']}   (password: see data/OWNER_ACCESS.txt)\n")
    missing = [n for n, ok in (("LibreOffice", soffice_bin()), ("Ghostscript", gs_bin()),
                               ("Tesseract OCR", tesseract_bin()), ("Chrome/Chromium/Edge", chrome_bin())) if not ok]
    if missing:
        print("  Optional programs not found (some tools will be limited): " + ", ".join(missing) + "\n")
    try:
        from waitress import serve
        proxy_options = {}
        if os.environ.get("TRUST_AZURE_PROXY") == "1":
            proxy_options = {"trusted_proxy": "*", "trusted_proxy_count": 1,
                             "trusted_proxy_headers": {"x-forwarded-for", "x-forwarded-proto"}}
        serve(app, **proxy_options, host=host, port=port, threads=int(os.environ.get("SERVER_THREADS", "4")), max_request_body_size=MAX_MB * 1024 * 1024)
    except ImportError:
        app.run(host=host, port=port, threaded=True, debug=False)
