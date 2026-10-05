// ENG PDF Toolkit — private owner dashboard (visitors, locations, devices, tool usage)
import { h, toast, modal, fmtSize } from "./util.js";
import { ic } from "./icons.js";
import { S, save, isDark, toggleTheme, segmented, switchBtn } from "./settings.js";
import { logoSVG } from "./logo.js";
import { WORLD } from "./worldpath.js";

const root = document.getElementById("owner");
const TZ = new Date().getTimezoneOffset();
const OK = "eng_owner_dash_v1";
const P = Object.assign({ days: 30, bots: false, auto: true }, JSON.parse(localStorage.getItem(OK) || "{}"));
const saveP = () => localStorage.setItem(OK, JSON.stringify(P));
let timer = null, liveTimer = null, page = 0, q = "", lastStats = null;
const PER = 50;

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts });
  if (r.status === 401) { showLogin(); throw new Error("Not signed in"); }
  const ct = r.headers.get("content-type") || "";
  const d = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}
const fb = (list) => (P.bots ? list : list.filter((v) => !v.is_bot));
const num = (n) => (n || 0).toLocaleString();
const flag = (cc) => cc && /^[A-Z]{2}$/i.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : "🌐";
const dur = (s) => (s = Math.round(s || 0)) < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m " + (s % 60) + "s" : Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
const ago = (ts) => { const s = Date.now() / 1000 - ts; return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : Math.floor(s / 86400) + " d ago"; };
const when = (ts) => new Date(ts * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const loc = (r) => [r.city, r.region, r.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || (r.country === "" ? "Locating…" : "Unknown");
const card = (cls, title, hint, ...body) => h("section", { class: `o-card glass ${cls}` }, h("h3", {}, title, hint ? h("span", { class: "hint" }, hint) : null), ...body);

/* ------------------------------------------------------------------ login */
function showLogin(msg) {
  clearInterval(timer); clearInterval(liveTimer);
  root.innerHTML = "";
  const pw = h("input", { class: "inp", type: "password", placeholder: "Owner password", autocomplete: "current-password", name: "password" });
  const rm = h("input", { type: "checkbox", checked: true });
  const m = h("div", { class: "msg" }, msg || "");
  const btn = h("button", { class: "btn-big", type: "submit" }, "Sign in");
  const box = h("form", { class: "card glass", onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; m.textContent = "";
    try {
      const r = await fetch("/api/owner/login", { method: "POST", credentials: "same-origin", body: JSON.stringify({ password: pw.value, remember: rm.checked }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Sign-in failed");
      showDash();
    } catch (err) { m.textContent = err.message; box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); pw.select(); }
    btn.disabled = false;
  } }, h("div", { html: logoSVG({ size: 84 }) }), h("h1", {}, "Owner dashboard"), h("p", {}, "Private area for the site owner of ENG PDF Toolkit."), pw,
    h("label", { class: "rm" }, rm, "Keep me signed in on this browser"), btn, m);
  root.append(h("div", { class: "o-login" }, box));
  setTimeout(() => pw.focus(), 60);
}

/* ------------------------------------------------------------------ dashboard */
async function showDash() {
  root.innerHTML = "";
  document.cookie = "eng_owner=" + (localStorage.getItem("eng_owner_skip") === "0" ? "0" : "1") + ";path=/;max-age=63072000;samesite=lax";
  const themeBtn = h("button", { class: "hbtn", title: "Light / dark", onclick: (e) => { toggleTheme(e); setTimeout(drawTheme, 30); } });
  const drawTheme = () => { themeBtn.innerHTML = ""; themeBtn.append(ic(isDark() ? "sun" : "moon", 18, 1.8)); };
  drawTheme();
  const live = h("span", { class: "live-pill", title: "Visitors active in the last ~70 seconds" }, h("i"), h("span", { id: "liveN" }, "0 online"));
  
  const top = h("header", { class: "o-top glass" },
    h("a", { class: "ttl", href: "/", target: "_blank", title: "Open the public site", style: { textDecoration: "none" } }, h("span", { html: logoSVG({ size: 30 }) }), h("span", {}, "ENG PDF · Owner", h("small", {}, "Visitor analytics"))),
    live, h("div", { class: "sp" }),
    segmented([[1, "24h"], [7, "7d"], [30, "30d"], [90, "90d"], [365, "1y"]], P.days, (v) => { P.days = +v; saveP(); load(); }),
    h("label", { class: "tg" }, switchBtn(P.bots, (v) => { P.bots = v; saveP(); load(); }), "Bots"),
    h("label", { class: "tg" }, switchBtn(P.auto, (v) => { P.auto = v; saveP(); schedule(); }), "Auto-refresh"),
    h("button", { class: "hbtn", title: "Refresh now", onclick: () => load() }, ic("refresh", 18, 1.8)),
    h("a", { class: "hbtn", title: "Export all visits as CSV", href: "/api/owner/export.csv" }, ic("down", 18, 1.8)),
    themeBtn,
    h("button", { class: "hbtn", title: "Dashboard settings", onclick: openSet }, ic("gear", 18, 1.8)),
    h("button", { class: "hbtn", title: "Sign out", onclick: async () => { await fetch("/api/owner/logout", { method: "POST" }); showLogin("Signed out."); } }, ic("logout", 18, 1.8)));
  const body = h("div", { class: "o-wrap", id: "body" }, h("div", { class: "empty" }, "Loading…"));
  root.append(top, body);
  await load();
  schedule();
}
function schedule() {
  clearInterval(timer); clearInterval(liveTimer);
  if (P.auto) { timer = setInterval(() => document.visibilityState === "visible" && load(true), 15000); liveTimer = setInterval(() => document.visibilityState === "visible" && loadLive(), 5000); }
}

async function load(quiet) {
  let st;
  try { st = await api(`/api/owner/stats?days=${P.days}&bots=${P.bots ? 1 : 0}&tz=${TZ}`); } catch (e) { if (!quiet) toast(e.message, true); return; }
  lastStats = st;
  const body = document.getElementById("body"); if (!body) return;
  const y = scrollY;
  body.innerHTML = "";
  body.append(kpis(st));
  const g = h("div", { class: "o-grid", style: { marginTop: "16px" } });
  g.append(
    card("c8 chart", "Visits over time", `${P.days === 1 ? "last 24 hours" : "last " + P.days + " days"}`, h("div", { class: "legend" }, h("span", {}, h("b"), "Visits"), h("span", {}, h("b", { class: "b" }), "Unique visitors")), chart(st)),
    card("c4", "Online now", "updates every 5 s", h("div", { class: "live-list", id: "liveList" }, liveItems(fb(st.online)))),
    card("c7 map", "Where visitors come from", `${st.geo.length} location${st.geo.length === 1 ? "" : "s"}`, worldMap(st.geo)),
    card("c5", "Countries", "visits · unique", bars(st.countries, (r) => [flag(r.cc), " ", r.k])),
    card("c6", "Busiest hours", "local time · weekday × hour", heat(st.hours)),
    card("c3", "Cities", "", bars(st.cities)),
    card("c3", "Devices", "", bars(st.devices, (r) => [ic(r.k === "Mobile" ? "phone" : r.k === "Tablet" ? "doc" : r.k === "Bot" ? "spark" : "monitor", 14, 1.8), " ", r.k])),
    card("c3", "Operating systems", "", bars(st.os)),
    card("c3", "Browsers", "", bars(st.browsers)),
    card("c3", "Device models", "", bars(st.models)),
    card("c3", "Referrers", "where they clicked from", bars(st.referrers.map((r) => ({ ...r, k: r.k === "Unknown" ? "Direct / none" : r.k })))),
    card("c4", "Languages", "", bars(st.langs)),
    card("c4", "Screen sizes", "", bars(st.screens)),
    card("c4", "Internet providers", "", bars(st.isps)),
    card("c6", "Pages & tools opened", "", bars(st.paths)),
    card("c6", "Tool runs", `${num(st.tool_runs)} total`, bars(st.tools.map((t) => ({ k: t.k, n: t.n, u: Math.round(100 * (t.ok || 0) / t.n) + "% ok" })))),
    card("c12", "Visitors", "click a row for full history", visitorTable()),
    card("c12", "Recent tool activity", "", h("div", { id: "evBox" }, h("div", { class: "empty" }, "Loading…"))));
  body.append(g, h("p", { class: "foot-note" }, h("b", { id: "upd" }), " · Location is approximate (based on IP address). Counts are recorded on the server for every page load, so ad-blockers can't hide visits. Your own visits are not counted on this browser."));
  scrollTo(0, y);
  loadVisits(); loadEvents();
  document.getElementById("liveN").textContent = `${fb(st.online).length} online`;
  document.getElementById("upd").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function kpis(s) {
  const k = (label, v, sub, icon, cls = "") => h("div", { class: "kpi glass " + cls }, h("div", { class: "k" }, ic(icon, 14, 2), label), h("div", { class: "v", "data-v": typeof v === "number" ? v : "" }, typeof v === "number" ? "0" : v), sub ? h("div", { class: "s" }, sub) : null);
  const ok = s.tool_runs ? Math.round(100 * s.tool_ok / s.tool_runs) : 0;
  const el = h("div", { class: "kpis" },
    k("Online now", fb(s.online).length, "active in the last minute", "wifi", "hero"),
    k("Today", s.today.n || 0, `${num(s.today.u)} unique visitors`, "clock"),
    k("Visits", s.visits, `${num(s.views)} page views incl. navigation`, "eye"),
    k("Unique visitors", s.unique, `${num(s.ips)} different IPs`, "users"),
    k("Sessions", s.sessions, `${s.pages_per_session} pages / session`, "chart"),
    k("New visitors", s.new, `${num(s.returning)} returning`, "star"),
    k("Avg. session", dur(s.avg_session_s), `bounce rate ${s.bounce}%`, "clock"),
    k("Tool runs", s.tool_runs, `${ok}% successful`, "bolt"),
    k("Data processed", fmtSize(s.bytes || 0), "uploaded to tools", "upload"),
    k("All time", s.all_time.n || 0, `${num(s.all_time.u)} unique visitors`, "globe"));
  requestAnimationFrame(() => el.querySelectorAll(".v[data-v]").forEach((x) => countUp(x, +x.dataset.v)));
  el.querySelectorAll(".kpi").forEach((x, i) => (x.style.animationDelay = i * 40 + "ms"));
  return el;
}
function countUp(el, to) {
  if (!to || S.motion === "off") { el.textContent = num(to); return; }
  const t0 = performance.now(), d = 900;
  const f = (t) => { const p = Math.min(1, (t - t0) / d); el.textContent = num(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

function chart(s) {
  const off = TZ * 60, now = Date.now() / 1000;
  const today = Math.floor((now - off) / 86400);
  const n = Math.max(2, Math.min(s.range_days, 365));
  const map = Object.fromEntries(s.series.map((r) => [r.d, r]));
  const pts = []; for (let d = today - n + 1; d <= today; d++) pts.push({ d, n: map[d]?.n || 0, u: map[d]?.u || 0 });
  const W = 800, H = 260, L = 34, B = 24, T = 10;
  const max = Math.max(4, ...pts.map((p) => p.n));
  const x = (i) => L + (i * (W - L - 6)) / (pts.length - 1), yv = (v) => T + (H - T - B) * (1 - v / max);
  const smooth = (key) => pts.map((p, i) => { const X = x(i), Y = yv(p[key]); if (!i) return `M${X} ${Y}`; const px = x(i - 1), py = yv(pts[i - 1][key]); const cx = (px + X) / 2; return `C${cx} ${py} ${cx} ${Y} ${X} ${Y}`; }).join("");
  const a = smooth("n"), b = smooth("u");
  const grid = [0, .25, .5, .75, 1].map((f) => { const v = Math.round(max * f); return `<line class="gl" x1="${L}" x2="${W}" y1="${yv(v)}" y2="${yv(v)}"/><text class="ax" x="${L - 6}" y="${yv(v) + 3}" text-anchor="end">${v}</text>`; }).join("");
  const step = Math.ceil(pts.length / 8);
  const lbl = pts.map((p, i) => (i % step && i !== pts.length - 1) ? "" : `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${new Date((p.d * 86400 + off) * 1000).toLocaleDateString([], { month: "short", day: "numeric" })}</text>`).join("");
  const wrap = h("div", { class: "chart", style: { position: "relative" } });
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--olive)" stop-opacity=".45"/><stop offset="1" stop-color="var(--olive)" stop-opacity="0"/></linearGradient></defs>${grid}${lbl}
    <path d="${a}L${x(pts.length - 1)} ${H - B}L${L} ${H - B}Z" fill="url(#ga)"/><path class="ln b" d="${b}"/><path class="ln a" d="${a}"/><circle class="dot" r="0" cx="0" cy="0"/></svg><div class="tip"></div>`;
  const svg = wrap.firstChild, tip = wrap.lastChild, dot = svg.querySelector(".dot");
  svg.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((fx - L) / (W - L - 6)) * (pts.length - 1)))); const p = pts[i];
    dot.setAttribute("r", 5); dot.setAttribute("cx", x(i)); dot.setAttribute("cy", yv(p.n));
    tip.style.left = (x(i) / W) * r.width + "px"; tip.style.top = (yv(p.n) / H) * r.height + "px"; tip.style.opacity = 1;
    tip.innerHTML = `<b>${new Date((p.d * 86400 + off) * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</b><br>${p.n} visits · ${p.u} unique`;
  });
  svg.addEventListener("mouseleave", () => { tip.style.opacity = 0; dot.setAttribute("r", 0); });
  return wrap;
}

function heat(rows) {
  const m = {}; let max = 1;
  rows.forEach((r) => { m[r.wd + "-" + r.h] = r.n; max = Math.max(max, r.n); });
  const g = h("div", { class: "heat" }, h("span"));
  for (let hh = 0; hh < 24; hh++) g.append(h("span", { style: { textAlign: "center" } }, hh % 3 ? "" : String(hh)));
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d, wd) => {
    g.append(h("span", { class: "lbl" }, d));
    for (let hh = 0; hh < 24; hh++) { const v = m[wd + "-" + hh] || 0; g.append(h("span", { class: "c", title: `${d} ${hh}:00 – ${v} visit${v === 1 ? "" : "s"}`, style: { opacity: v ? 0.2 + 0.8 * (v / max) : 0.07 } })); }
  });
  return g;
}

function worldMap(geo) {
  const wrap = h("div", { class: "map" });
  let grat = ""; for (let lon = 0; lon <= 360; lon += 30) grat += `M${lon} 0V180`; for (let lat = 0; lat <= 180; lat += 30) grat += `M0 ${lat}H360`;
  const max = Math.max(1, ...geo.map((g) => g.n));
  const pts = geo.map((g, i) => { const X = (g.lon + 180).toFixed(1), Y = (90 - g.lat).toFixed(1), r = (1.2 + 3.3 * Math.sqrt(g.n / max)).toFixed(2);
    return `<g><circle class="pt" cx="${X}" cy="${Y}" r="${r}"><title>${(g.city || "Unknown")}, ${g.country || ""} – ${g.n} visit${g.n === 1 ? "" : "s"}</title></circle>${i < 12 ? `<circle class="pulse" cx="${X}" cy="${Y}" r="${r}" style="animation-delay:${i * 0.2}s"/>` : ""}</g>`; }).join("");
  wrap.innerHTML = `<svg viewBox="0 8 360 142"><path class="grat" d="${grat}"/><path class="land" d="${WORLD}"/>${pts}</svg>`;
  if (!geo.length) wrap.append(h("div", { class: "empty" }, "No located visits yet – locations appear a few seconds after a visit (needs internet on the server)."));
  return wrap;
}

function bars(rows, label) {
  if (!rows || !rows.length) return h("div", { class: "empty" }, "No data yet");
  const max = Math.max(...rows.map((r) => r.n));
  return h("div", { class: "bars" }, rows.map((r, i) => h("div", { class: "bar", title: `${r.k}: ${r.n}` },
    h("span", { class: "fill", style: { width: (100 * r.n) / max + "%", animationDelay: i * 50 + "ms" } }),
    h("span", { class: "nm" }, label ? label(r) : r.k), h("span", { class: "n" }, num(r.n)), r.u != null ? h("span", { class: "u" }, typeof r.u === "number" ? num(r.u) + " uniq" : r.u) : null)));
}

function liveItems(list) {
  if (!list.length) return h("div", { class: "empty" }, "Nobody online right now.");
  return list.sort((a, b) => b.ts - a.ts).map((v) => h("div", { class: "live-item", style: { cursor: "pointer" }, onclick: () => openVisitor(v.vid) },
    h("span", { class: "fl" }, flag(v.cc)),
    h("div", { style: { flex: 1, minWidth: 0 } }, h("b", {}, [v.city, v.country].filter(Boolean).join(", ") || "Locating…"), h("small", {}, `${v.device} · ${v.os} · ${v.browser}`), h("small", {}, `on ${v.path} · ${ago(v.ts)}`)),
    h("code", { style: { fontSize: "11px" } }, v.ip)));
}
async function loadLive() {
  try {
    const { online } = await api("/api/owner/live");
    const l = document.getElementById("liveList"); if (!l) return;
    l.innerHTML = ""; [liveItems(fb(online))].flat().forEach((x) => l.append(x));
    document.getElementById("liveN").textContent = `${fb(online).length} online`;
  } catch {}
}

function visitorTable() {
  const inp = h("input", { class: "inp", placeholder: "Search IP, city, country, device, browser, page…", value: q });
  let t; inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { q = inp.value.trim(); page = 0; loadVisits(); }, 300); });
  return h("div", {}, h("div", { class: "tbl-tools" }, inp, h("span", { class: "tg", id: "vTotal", style: { color: "var(--muted)", fontSize: "13px" } }, "")),
    h("div", { class: "o-tbl-wrap" }, h("table", { class: "o-tbl" }, h("thead", {}, h("tr", {}, ["Time", "IP address", "Location", "Device", "System / browser", "Page", "Came from", "Visitor"].map((x) => h("th", {}, x)))), h("tbody", { id: "vBody" }))),
    h("div", { class: "pager" }, h("button", { class: "btn sm", id: "pPrev", onclick: () => { if (page > 0) { page--; loadVisits(); } } }, ic("back", 14, 2), "Newer"), h("span", { id: "pInfo" }), h("button", { class: "btn sm", id: "pNext", onclick: () => { page++; loadVisits(); } }, "Older", ic("next", 14, 2))));
}
const visitRow = (r, click = true) => h("tr", { class: click ? "click" : "", onclick: click ? () => openVisitor(r.vid) : null },
  h("td", {}, when(r.ts), h("small", {}, ago(r.ts) + (r.kind === "nav" ? " · in-app" : ""))),
  h("td", {}, h("code", {}, r.ip || "–"), h("small", {}, r.isp || "")),
  h("td", {}, flag(r.cc), " ", loc(r), h("small", {}, r.tz || "")),
  h("td", {}, r.device || "–", r.is_bot ? [" ", h("span", { class: "badge2 bot" }, "bot")] : null, h("small", {}, [r.model, r.screen].filter(Boolean).join(" · "))),
  h("td", {}, `${r.os || "–"} · ${r.browser || "–"}`, h("small", {}, r.lang || "")),
  h("td", {}, r.path || "/"),
  h("td", {}, r.ref_host || "Direct"),
  h("td", {}, h("span", { class: "badge2" + (r.is_new ? " new" : "") }, r.is_new ? "new" : "returning"), h("small", {}, (r.vid || "").slice(0, 8))));
async function loadVisits() {
  try {
    const d = await api(`/api/owner/visits?limit=${PER}&offset=${page * PER}&q=${encodeURIComponent(q)}&bots=${P.bots ? 1 : 0}`);
    const b = document.getElementById("vBody"); if (!b) return;
    b.innerHTML = "";
    if (!d.rows.length) b.append(h("tr", {}, h("td", { colspan: 8, class: "empty" }, "No visits found.")));
    d.rows.forEach((r) => b.append(visitRow(r)));
    const pages = Math.max(1, Math.ceil(d.total / PER));
    document.getElementById("pInfo").textContent = `Page ${page + 1} of ${pages}`;
    document.getElementById("vTotal").textContent = `${num(d.total)} records`;
    document.getElementById("pPrev").disabled = page === 0;
    document.getElementById("pNext").disabled = page + 1 >= pages;
  } catch {}
}
const evTable = (rows, showIp = true) => rows.length ? h("div", { class: "o-tbl-wrap" }, h("table", { class: "o-tbl", style: { minWidth: "720px" } },
  h("thead", {}, h("tr", {}, ["Time", "Tool", "Result", "Files", "Size", "Duration", showIp ? "IP / visitor" : null].filter(Boolean).map((x) => h("th", {}, x)))),
  h("tbody", {}, rows.map((e) => h("tr", { class: showIp && e.vid ? "click" : "", onclick: showIp && e.vid ? () => openVisitor(e.vid) : null },
    h("td", {}, when(e.ts), h("small", {}, ago(e.ts))), h("td", {}, h("b", {}, e.tool)),
    h("td", {}, e.ok ? h("span", { class: "badge2 new" }, "success") : h("span", { class: "badge2 bad", title: e.error }, "failed"), e.ok ? null : h("small", {}, e.error)),
    h("td", {}, e.files), h("td", {}, fmtSize(e.bytes || 0)), h("td", {}, (e.ms / 1000).toFixed(1) + " s"),
    showIp ? h("td", {}, h("code", {}, e.ip), h("small", {}, (e.vid || "").slice(0, 8))) : null))))) : h("div", { class: "empty" }, "No tool runs yet.");
async function loadEvents() {
  try { const ev = await api("/api/owner/events?limit=60"); const b = document.getElementById("evBox"); if (b) { b.innerHTML = ""; b.append(evTable(ev)); } } catch {}
}

async function openVisitor(vid) {
  let d; try { d = await api(`/api/owner/visitor/${encodeURIComponent(vid)}`); } catch (e) { return toast(e.message, true); }
  const last = d.visits[0] || {}, info = d.info || {};
  const kv = (k, v) => h("div", {}, h("small", {}, k), v || "–");
  const body = h("div", {},
    h("div", { class: "vd-grid" }, kv("Visitor ID", h("code", {}, vid.slice(0, 12))), kv("First seen", info.first_ts ? when(info.first_ts) : "–"), kv("Last seen", info.last_ts ? when(info.last_ts) : "–"),
      kv("Total visits", num(info.visits)), kv("Latest IP", last.ip), kv("Location", flag(last.cc) + " " + loc(last)), kv("Internet provider", last.isp), kv("Coordinates", last.lat != null ? `${last.lat.toFixed(2)}, ${last.lon.toFixed(2)}` : ""),
      kv("Device", `${last.device || ""} ${last.model ? "· " + last.model : ""}`), kv("System", last.os), kv("Browser", last.browser), kv("Screen", last.screen), kv("Language", last.lang), kv("Time zone", last.tz),
      kv("Tool runs", num(d.events.length))),
    h("h4", { style: { margin: "6px 0 10px" } }, "Visit history"),
    h("div", { class: "o-tbl-wrap", style: { maxHeight: "320px" } }, h("table", { class: "o-tbl" }, h("thead", {}, h("tr", {}, ["Time", "IP address", "Location", "Device", "System / browser", "Page", "Came from", "Visitor"].map((x) => h("th", {}, x)))), h("tbody", {}, d.visits.map((r) => visitRow(r, false))))),
    h("h4", { style: { margin: "18px 0 10px" } }, "Tools used"), evTable(d.events, false),
    h("details", { style: { marginTop: "14px", fontSize: "12px", color: "var(--muted)" } }, h("summary", {}, "Raw user agent"), h("code", { style: { wordBreak: "break-all" } }, last.ua || "")));
  modal("Visitor details", body);
  requestAnimationFrame(() => document.querySelector(".modal")?.classList.add("wide"));
}

function openSet() {
  const cur = h("input", { class: "inp", type: "password", placeholder: "Current password", autocomplete: "current-password" });
  const nw = h("input", { class: "inp", type: "password", placeholder: "New password (min. 6 characters)", autocomplete: "new-password" });
  const skip = localStorage.getItem("eng_owner_skip") !== "0";
  const body = h("div", { class: "set-list" },
    h("div", { class: "row" }, h("div", {}, "Don't count my own visits", h("small", {}, "Visits from this browser are ignored while you are signed in")), switchBtn(skip, (v) => { localStorage.setItem("eng_owner_skip", v ? "1" : "0"); document.cookie = `eng_owner=${v ? 1 : 0};path=/;max-age=63072000;samesite=lax`; toast(v ? "Your visits won't be counted" : "Your visits will be counted"); })),
    h("div", { class: "row" }, h("div", {}, "Theme", h("small", {}, "Shared with the main site")), segmented([["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Auto", "monitor"]], S.theme, (v) => { S.theme = v; save(); })),
    h("div", { class: "row", style: { flexDirection: "column", alignItems: "stretch" } }, h("div", {}, "Change password"), cur, nw,
      h("button", { class: "btn primary", onclick: async () => { try { await api("/api/owner/password", { method: "POST", body: JSON.stringify({ current: cur.value, new: nw.value }) }); toast("Password changed"); cur.value = nw.value = ""; } catch (e) { toast(e.message, true); } } }, "Save new password")),
    h("div", { class: "row" }, h("div", {}, "Export data", h("small", {}, "Every recorded visit as a spreadsheet (CSV)")), h("a", { class: "btn sm", href: "/api/owner/export.csv" }, ic("down", 14, 2), "Download CSV")),
    h("div", { class: "row" }, h("div", {}, "Reset statistics", h("small", {}, "Permanently deletes all visits and tool history")), h("button", { class: "btn sm", onclick: async () => {
      const ok = await modal("Delete all statistics?", h("p", {}, "This cannot be undone. Consider exporting a CSV first."), [{ label: "Cancel", value: false }, { label: "Delete everything", value: true, primary: true }]);
      if (ok) { await api("/api/owner/clear", { method: "POST" }); toast("All statistics deleted"); document.querySelector(".modal-bg")?.remove(); load(); }
    } }, ic("trash", 14, 2), "Clear")));
  modal("Dashboard settings", body);
}

/* ------------------------------------------------------------------ boot */
fetch("/api/owner/me", { credentials: "same-origin" }).then((r) => r.json()).then((d) => (d.owner ? showDash() : showLogin())).catch(() => showLogin("Server not reachable."));
