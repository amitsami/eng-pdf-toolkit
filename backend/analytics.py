"""Visitor analytics for ENG PDF Toolkit (self-hosted, SQLite, no third-party trackers).

Every full page load is counted on the server (cannot be blocked by ad-blockers).
In-app navigation, tool usage and live presence are reported by the page itself.
"""
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.request
from pathlib import Path

DATA = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / "analytics.db"
_lock = threading.RLock()
_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS visits(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, vid TEXT, sid TEXT, ip TEXT, kind TEXT, path TEXT,
  referrer TEXT, ref_host TEXT, ua TEXT, device TEXT, os TEXT, browser TEXT, model TEXT, is_bot INTEGER,
  is_new INTEGER, lang TEXT, tz TEXT, screen TEXT, country TEXT, cc TEXT, region TEXT, city TEXT,
  lat REAL, lon REAL, isp TEXT, utm TEXT);
CREATE INDEX IF NOT EXISTS v_ts ON visits(ts);
CREATE INDEX IF NOT EXISTS v_vid ON visits(vid);
CREATE INDEX IF NOT EXISTS v_ip ON visits(ip);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, vid TEXT, ip TEXT, tool TEXT, ok INTEGER, ms INTEGER,
  files INTEGER, bytes INTEGER, error TEXT);
CREATE INDEX IF NOT EXISTS e_ts ON events(ts);
CREATE TABLE IF NOT EXISTS geo(ip TEXT PRIMARY KEY, data TEXT, ts REAL);
CREATE TABLE IF NOT EXISTS visitors(vid TEXT PRIMARY KEY, first_ts REAL, last_ts REAL, visits INTEGER);
"""


def db():
    c = getattr(_local, "c", None)
    if c is None:
        c = sqlite3.connect(DB, timeout=30, check_same_thread=False)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=" + ("DELETE" if os.environ.get("SQLITE_JOURNAL_MODE") == "DELETE" else "WAL"))
        c.execute("PRAGMA synchronous=NORMAL")
        _local.c = c
    return c


with _lock:
    db().executescript(SCHEMA)
    db().commit()

# ------------------------------------------------------------------ helpers
BOT_RE = re.compile(r"bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|python-requests|curl|wget|"
                    r"httpclient|monitor|lighthouse|pingdom|uptime|scrapy|go-http|axios|node-fetch|okhttp", re.I)


def parse_ua(ua):
    u = ua or ""
    is_bot = bool(BOT_RE.search(u)) or not u
    if re.search(r"iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))", u):
        device = "Tablet"
    elif re.search(r"Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|Opera Mini", u):
        device = "Mobile"
    else:
        device = "Desktop"
    if is_bot:
        device = "Bot"
    os_ = "Other"
    for pat, name in ((r"Windows NT 10", "Windows 10/11"), (r"Windows NT 6\.3", "Windows 8.1"), (r"Windows NT 6\.1", "Windows 7"),
                      (r"Windows", "Windows"), (r"iPhone|iPad|iPod", "iOS"), (r"Mac OS X|Macintosh", "macOS"),
                      (r"CrOS", "ChromeOS"), (r"Android", "Android"), (r"Linux", "Linux")):
        if re.search(pat, u):
            os_ = name
            break
    m = re.search(r"Android ([\d.]+)", u)
    if os_ == "Android" and m:
        os_ = f"Android {m.group(1).split('.')[0]}"
    m = re.search(r"OS (\d+)[_.]\d+.* like Mac OS X", u)
    if os_ == "iOS" and m:
        os_ = f"iOS {m.group(1)}"
    br = "Other"
    for pat, name in ((r"Edg(e|A|iOS)?/(\d+)", "Edge"), (r"OPR/(\d+)|Opera", "Opera"), (r"SamsungBrowser/(\d+)", "Samsung Internet"),
                      (r"UCBrowser", "UC Browser"), (r"YaBrowser", "Yandex"), (r"FBAN|FBAV", "Facebook app"), (r"Instagram", "Instagram app"),
                      (r"Firefox/(\d+)|FxiOS", "Firefox"), (r"CriOS/(\d+)|Chrome/(\d+)", "Chrome"), (r"Version/[\d.]+.*Safari", "Safari")):
        if re.search(pat, u):
            br = name
            break
    model = ""
    m = re.search(r"Android [\d.]+; (?:[a-z]{2}-[a-z]{2}; )?([^;)]+?)(?: Build|\))", u)
    if m and m.group(1).strip() not in ("K", "wv"):
        model = m.group(1).strip()
    elif "iPhone" in u:
        model = "iPhone"
    elif "iPad" in u:
        model = "iPad"
    elif "Macintosh" in u:
        model = "Mac"
    return {"device": device, "os": os_, "browser": br, "model": model, "is_bot": int(is_bot)}


def client_ip(req):
    if os.environ.get("TRUST_AZURE_PROXY") == "1":
        return req.remote_addr or ""  # sanitized by the trusted ingress/Waitress layer
    for h in ("CF-Connecting-IP", "True-Client-IP", "X-Real-IP"):
        v = req.headers.get(h)
        if v:
            return v.strip()
    xff = req.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return req.remote_addr or ""


def _private(ip):
    return (not ip or ip.startswith(("10.", "192.168.", "127.", "::1", "fc", "fd", "fe80", "169.254.")) or
            re.match(r"^172\.(1[6-9]|2\d|3[01])\.", ip) is not None or ip == "localhost")


def _lookup(ip):
    if _private(ip):
        return {"country": "Local network", "cc": "LAN", "region": "", "city": "This computer / Wi-Fi", "lat": None, "lon": None, "isp": ""}
    for url, conv in (
        (f"http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp",
         lambda j: j.get("status") == "success" and {"country": j["country"], "cc": j["countryCode"], "region": j.get("regionName", ""),
                                                      "city": j.get("city", ""), "lat": j.get("lat"), "lon": j.get("lon"), "isp": j.get("isp", "")}),
        (f"https://ipwho.is/{ip}",
         lambda j: j.get("success") and {"country": j["country"], "cc": j["country_code"], "region": j.get("region", ""),
                                         "city": j.get("city", ""), "lat": j.get("latitude"), "lon": j.get("longitude"),
                                         "isp": (j.get("connection") or {}).get("isp", "")}),
    ):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ENG-PDF-Toolkit"}), timeout=6) as r:
                d = conv(json.loads(r.read().decode()))
                if d:
                    return d
        except Exception:
            continue
    return None


_geo_q = []
_geo_ev = threading.Event()


def geo_for(ip):
    with _lock:
        row = db().execute("SELECT data FROM geo WHERE ip=?", (ip,)).fetchone()
    return json.loads(row["data"]) if row else None


def _geo_worker():
    while True:
        _geo_ev.wait(5)
        _geo_ev.clear()
        while _geo_q:
            ip, cf_cc = _geo_q.pop(0)
            if geo_for(ip):
                _apply_geo(ip)
                continue
            d = _lookup(ip)
            if not d and cf_cc:
                d = {"country": cf_cc, "cc": cf_cc, "region": "", "city": "", "lat": None, "lon": None, "isp": ""}
            if not d:
                continue
            with _lock:
                db().execute("INSERT OR REPLACE INTO geo VALUES(?,?,?)", (ip, json.dumps(d), time.time()))
                db().commit()
            _apply_geo(ip)
            time.sleep(1.4)  # stay well inside free API rate limits


def _apply_geo(ip):
    d = geo_for(ip)
    if not d:
        return
    with _lock:
        db().execute("UPDATE visits SET country=?,cc=?,region=?,city=?,lat=?,lon=?,isp=? WHERE ip=? AND (country IS NULL OR country='')",
                     (d["country"], d["cc"], d["region"], d["city"], d["lat"], d["lon"], d["isp"], ip))
        db().commit()


threading.Thread(target=_geo_worker, daemon=True).start()


# ------------------------------------------------------------------ recording
def record_visit(req, kind="page", path=None, extra=None):
    """Store one visit. Returns (visit_id, vid, sid, is_new)."""
    extra = extra or {}
    now = time.time()
    vid = req.cookies.get("eng_vid") or ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,40}", vid):
        vid = ""
    is_new = 0
    if not vid:
        vid = secrets.token_urlsafe(12)
        is_new = 1
    sid = req.cookies.get("eng_sid") or ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,40}", sid):
        sid = secrets.token_urlsafe(9)
    ua = req.headers.get("User-Agent", "")[:400]
    p = parse_ua(ua)
    ip = client_ip(req)
    ref = (extra.get("referrer") if extra.get("referrer") is not None else req.headers.get("Referer", "")) or ""
    ref = ref[:500]
    host = req.host.split(":")[0]
    m = re.match(r"https?://([^/]+)", ref)
    ref_host = m.group(1).split(":")[0] if m else ""
    if ref_host == host:
        ref_host = ""
    utm = req.args.get("utm_source", "") or extra.get("utm", "")
    g = geo_for(ip) or {}
    with _lock:
        c = db()
        cur = c.execute(
            "INSERT INTO visits(ts,vid,sid,ip,kind,path,referrer,ref_host,ua,device,os,browser,model,is_bot,is_new,lang,tz,screen,"
            "country,cc,region,city,lat,lon,isp,utm) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (now, vid, sid, ip, kind, (path or req.path)[:300], ref, ref_host, ua, p["device"], p["os"], p["browser"], p["model"],
             p["is_bot"], is_new, (extra.get("lang") or req.headers.get("Accept-Language", "").split(",")[0])[:20],
             (extra.get("tz") or "")[:60], (extra.get("screen") or "")[:20], g.get("country"), g.get("cc"), g.get("region"),
             g.get("city"), g.get("lat"), g.get("lon"), g.get("isp"), utm[:80]))
        c.execute("INSERT INTO visitors(vid,first_ts,last_ts,visits) VALUES(?,?,?,1) ON CONFLICT(vid) DO UPDATE SET last_ts=?, visits=visits+1",
                  (vid, now, now, now))
        c.commit()
        visit_id = cur.lastrowid
    if not g:
        _geo_q.append((ip, req.headers.get("CF-IPCountry", "")))
        _geo_ev.set()
    return visit_id, vid, sid, is_new


def enrich(visit_id, vid, data):
    fields = {"tz": 60, "screen": 20, "lang": 20, "model": 60}
    sets, vals = [], []
    for k, n in fields.items():
        v = str(data.get(k) or "")[:n]
        if v:
            sets.append(f"{k}=COALESCE(NULLIF({k},''),?)" if k != "model" else "model=?")
            vals.append(v)
    if data.get("path"):
        sets.append("path=?"); vals.append(str(data["path"])[:200])
    if data.get("referrer") is not None:
        ref = str(data["referrer"])[:500]
        m = re.match(r"https?://([^/]+)", ref)
        sets += ["referrer=?", "ref_host=?"]
        vals += [ref, (m.group(1).split(":")[0] if m else "")]
    if not sets:
        return
    with _lock:
        db().execute(f"UPDATE visits SET {','.join(sets)} WHERE id=? AND vid=?", (*vals, int(visit_id), vid))
        db().commit()


def record_event(req, tool, ok, ms, files, nbytes, error=""):
    with _lock:
        db().execute("INSERT INTO events(ts,vid,ip,tool,ok,ms,files,bytes,error) VALUES(?,?,?,?,?,?,?,?,?)",
                     (time.time(), req.cookies.get("eng_vid", ""), client_ip(req), tool, int(ok), int(ms), files, nbytes, (error or "")[:300]))
        db().commit()


ONLINE = {}  # vid -> info


def ping(req, path):
    vid = req.cookies.get("eng_vid", "")
    if not vid:
        return
    ip = client_ip(req)
    p = parse_ua(req.headers.get("User-Agent", ""))
    g = geo_for(ip) or {}
    ONLINE[vid] = {"ts": time.time(), "path": (path or "/")[:200], "ip": ip, "device": p["device"], "os": p["os"], "browser": p["browser"],
                   "country": g.get("country", ""), "city": g.get("city", ""), "cc": g.get("cc", ""), "is_bot": p["is_bot"]}


def online(window=70):
    now = time.time()
    for k in [k for k, v in ONLINE.items() if now - v["ts"] > 600]:
        ONLINE.pop(k, None)
    return [dict(v, vid=k) for k, v in ONLINE.items() if now - v["ts"] <= window]


# ------------------------------------------------------------------ reporting
def _rows(sql, args=()):
    with _lock:
        return [dict(r) for r in db().execute(sql, args).fetchall()]


def stats(days=30, bots=False, tz_offset_min=0):
    since = time.time() - days * 86400
    nb = "" if bots else " AND is_bot=0"
    W = f"ts>=?{nb}"
    one = lambda sql, a=(): (_rows(sql, a) or [{}])[0]
    pages = "kind='page'"
    tot = one(f"SELECT COUNT(*) n, COUNT(DISTINCT vid) u, COUNT(DISTINCT sid) s, COUNT(DISTINCT ip) ips, SUM(is_new) nw FROM visits WHERE {pages} AND {W}", (since,))
    views = one(f"SELECT COUNT(*) n FROM visits WHERE {W}", (since,))["n"]
    all_time = one(f"SELECT COUNT(*) n, COUNT(DISTINCT vid) u FROM visits WHERE {pages}{nb}")
    off = tz_offset_min * 60
    day0 = (int((time.time() - off) // 86400)) * 86400 + off
    today = one(f"SELECT COUNT(*) n, COUNT(DISTINCT vid) u FROM visits WHERE {pages} AND ts>=?{nb}", (day0,))
    series = _rows(f"SELECT CAST((ts-?)/86400 AS INT) d, COUNT(*) n, COUNT(DISTINCT vid) u FROM visits WHERE {pages} AND {W} GROUP BY d", (off, since))
    hours = _rows(f"SELECT CAST(((ts-?)%86400)/3600 AS INT) h, CAST(((ts-?)/86400+4)%7 AS INT) wd, COUNT(*) n FROM visits WHERE {pages} AND {W} GROUP BY h, wd", (off, off, since))
    grp = lambda col, lim=12: _rows(f"SELECT COALESCE(NULLIF({col},''),'Unknown') k, COUNT(*) n, COUNT(DISTINCT vid) u FROM visits WHERE {pages} AND {W} GROUP BY k ORDER BY n DESC LIMIT {lim}", (since,))
    sess = one(f"SELECT AVG(d) avg, AVG(c) pv FROM (SELECT MAX(ts)-MIN(ts) d, COUNT(*) c FROM visits WHERE {W} GROUP BY sid)", (since,))
    bounce = one(f"SELECT AVG(c=1) b FROM (SELECT COUNT(*) c FROM visits WHERE {W} GROUP BY sid)", (since,))
    tools = _rows("SELECT tool k, COUNT(*) n, SUM(ok) ok, AVG(ms) ms, SUM(bytes) b FROM events WHERE ts>=? GROUP BY tool ORDER BY n DESC", (since,))
    ev = one("SELECT COUNT(*) n, SUM(ok) ok, SUM(bytes) b FROM events WHERE ts>=?", (since,))
    returning = one(f"SELECT COUNT(*) n FROM visitors WHERE visits>1 AND last_ts>=?", (since,))["n"]
    geo_pts = _rows(f"SELECT ROUND(lat,1) lat, ROUND(lon,1) lon, city, country, COUNT(*) n FROM visits WHERE {pages} AND {W} AND lat IS NOT NULL GROUP BY 1,2 ORDER BY n DESC LIMIT 400", (since,))
    return {
        "range_days": days, "visits": tot.get("n") or 0, "unique": tot.get("u") or 0, "sessions": tot.get("s") or 0, "ips": tot.get("ips") or 0,
        "new": tot.get("nw") or 0, "returning": returning, "views": views, "all_time": all_time, "today": today,
        "avg_session_s": round(sess.get("avg") or 0), "pages_per_session": round(sess.get("pv") or 0, 2), "bounce": round((bounce.get("b") or 0) * 100, 1),
        "series": series, "hours": hours, "countries": _rows(f"SELECT COALESCE(NULLIF(country,''),'Locating…') k, MAX(cc) cc, COUNT(*) n, COUNT(DISTINCT vid) u FROM visits WHERE {pages} AND {W} GROUP BY k ORDER BY n DESC LIMIT 20", (since,)),
        "cities": _rows(f"SELECT COALESCE(NULLIF(city,''),'Unknown') || CASE WHEN country IS NOT NULL AND country!='' THEN ', ' || country ELSE '' END k, COUNT(*) n, COUNT(DISTINCT vid) u FROM visits WHERE {pages} AND {W} GROUP BY k ORDER BY n DESC LIMIT 15", (since,)),
        "devices": grp("device"), "os": grp("os"), "browsers": grp("browser"), "models": grp("model", 10), "referrers": grp("ref_host", 12),
        "langs": grp("lang", 10), "screens": grp("screen", 8), "isps": grp("isp", 10),
        "paths": _rows(f"SELECT path k, COUNT(*) n FROM visits WHERE {W} GROUP BY k ORDER BY n DESC LIMIT 15", (since,)),
        "tools": tools, "tool_runs": ev.get("n") or 0, "tool_ok": ev.get("ok") or 0, "bytes": ev.get("b") or 0,
        "geo": geo_pts, "online": online(),
    }


def visits(limit=100, offset=0, q="", bots=True):
    where, args = ["1=1"], []
    if not bots:
        where.append("is_bot=0")
    if q:
        where.append("(ip LIKE ? OR country LIKE ? OR city LIKE ? OR browser LIKE ? OR os LIKE ? OR device LIKE ? OR path LIKE ? OR vid LIKE ? OR isp LIKE ? OR model LIKE ?)")
        args += [f"%{q}%"] * 10
    sql = f"SELECT * FROM visits WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT ? OFFSET ?"
    rows = _rows(sql, (*args, int(limit), int(offset)))
    total = _rows(f"SELECT COUNT(*) n FROM visits WHERE {' AND '.join(where)}", args)[0]["n"]
    return {"rows": rows, "total": total}


def visitor(vid):
    return {"visits": _rows("SELECT * FROM visits WHERE vid=? ORDER BY id DESC LIMIT 300", (vid,)),
            "events": _rows("SELECT * FROM events WHERE vid=? ORDER BY id DESC LIMIT 300", (vid,)),
            "info": (_rows("SELECT * FROM visitors WHERE vid=?", (vid,)) or [{}])[0]}


def events(limit=100):
    return _rows("SELECT * FROM events ORDER BY id DESC LIMIT ?", (int(limit),))


def export_csv():
    import csv
    import io
    rows = _rows("SELECT * FROM visits ORDER BY id")
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            r = dict(r)
            r["ts"] = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(r["ts"])) + " UTC"
            w.writerow(r)
    return buf.getvalue()


def clear():
    with _lock:
        db().executescript("DELETE FROM visits; DELETE FROM events; DELETE FROM visitors;")
        db().commit()
    ONLINE.clear()
