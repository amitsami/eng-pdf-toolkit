import { ic } from "./icons.js";
import { getPdfjs, h, $, fmtSize, ext, uid, toast, askPassword, loadPdf, renderPage, runTool, download, pickFiles } from "./util.js";
import { TOOLS, TOOL, CATEGORIES, PDF_OUT, NEXT_TOOLS } from "./tools.js";
import { CAPS, missingDep, renderOptions, cleanOpts } from "./forms.js";
import { VIEWS, RESULTS } from "./views.js";
import { renderHome, renderFooter, observeReveals, clearScrollFx, pushRecent, ticon } from "./home.js";
import { S, apply, openSettings, toggleTheme, isDark } from "./settings.js";
import { openPalette, initDropAnywhere } from "./ui.js";
import { trackStart, trackNav } from "./track.js";
import { logoSVG } from "./logo.js";

const app = $("#app");
let handoff = null; // result file passed to the next tool
let current = null;

function setStatus(ok) {
  const st = $("#srvStatus");
  st.className = "status-dot " + (ok ? "ok" : "bad");
  st.lastChild.textContent = ok ? "Server online" : "Server offline";
}
async function loadCaps() {
  try { Object.assign(CAPS, await (await fetch("/api/capabilities")).json()); setStatus(true); } catch { setStatus(false); }
}

/* ================================================================ router */
function route() {
  doRoute();
  if (S.motion !== "off") { app.classList.remove("page-in"); void app.offsetWidth; app.classList.add("page-in"); }
  trackNav();
  markNav();
}
function markNav() {
  const hsh = location.hash || "#/";
  document.querySelectorAll("#topNav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === hsh));
}
function doRoute() {
  if (current) current.destroy();
  current = null;
  const hash = location.hash.replace(/^#\/?/, "");
  const [path, q] = hash.split("?");
  clearScrollFx();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (path && TOOL[path]) current = new ToolPage(TOOL[path]);
  else { const c = new URLSearchParams(q || "").get("cat"); renderHome(app, c || "all", !!c); }
}
window.addEventListener("hashchange", route);
document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href^=\"#/\"]"); if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); route(); } });

/* ================================================================ ToolPage */
export class ToolPage {
  constructor(tool) {
    this.t = tool;
    this.entries = [];
    this.state = {};
    app.innerHTML = "";
    document.title = `${tool.title} – ENG PDF Toolkit`;
    this.root = h("div", { class: "tool-page" });
    app.append(this.root);
    pushRecent(tool.id);
    if (handoff) { const files = handoff; handoff = null; this.addFiles(files); } else this.showUpload();
  }
  destroy() { clearInterval(this.scanTimer); this.dead = true; }

  acceptFile(f) {
    const acc = this.t.accept.split(",").map((s) => s.trim().toLowerCase());
    const e = "." + ext(f.name);
    return acc.some((a) => a === e || (a.endsWith("/*") && (f.type || "").startsWith(a.slice(0, -1))) || a === (f.type || "").toLowerCase());
  }

  showUpload() {
    const t = this.t;
    this.root.innerHTML = "";
    const miss = missingDep(t);
    const cat = CATEGORIES.find((c) => c[0] === t.cat);
    this.root.append(h("div", { class: "th2" },
      h("div", { class: "crumbs" }, h("a", { href: "#/" }, "Home"), " / ", cat ? h("a", { href: `#/?cat=${cat[0]}` }, cat[1]) : null, cat ? " / " : null, h("span", {}, t.title)),
      ticon(t, 34), h("div", {}, h("h1", {}, t.title), h("p", {}, t.desc),
      h("div", { class: "tags" }, h("span", { class: "tag" }, "Free"), h("span", { class: "tag" }, "No sign-up"), h("span", { class: "tag" }, "Files auto-deleted")))));
    if (miss) this.root.append(h("div", { class: "warn" }, `This tool needs the free program “${miss}”, which was not found on this computer. Install it (see README.md) and restart the app.`));
    if (t.view === "html") return this.showHtml();
    const label = t.accept.startsWith("image") ? "Select images" : t.accept.startsWith(".pdf") ? (t.multiple || t.min > 1 ? "Select PDF files" : "Select PDF file") : "Select files";
    const dz = h("div", { class: "dz2 dropzone" },
      h("div", { class: "dz-goo" }, h("i"), h("i"), h("i")),
      h("div", { class: "dz-ic" }, ic("upload", 30, 1.7)),
      h("h3", {}, "Drop your files here"),
      h("div", { class: "drop-hint" }, `Accepted: ${[...new Set(t.accept.split(",").map((x) => x.trim()).filter((x) => x.startsWith(".") || x === "image/*").map((x) => x === "image/*" ? "images" : x.slice(1).toUpperCase()))].slice(0, 7).join(", ")}${t.max === 1 ? " · one file" : ""}`),
      h("button", { class: "btn-big magnetic", onclick: async () => this.addFiles(await pickFiles(t.accept, t.max !== 1)) }, label));
    if (t.view === "scan") dz.append(h("div", { style: { marginTop: "14px" } }, h("button", { class: "btn", onclick: async () => this.addFiles(await pickFiles("image/*", true, "environment")) }, ic("camera",16,2), " Use this device's camera")));
    this.bindDrop(dz);
    this.root.append(dz);
    if (t.view === "scan") this.root.append(this.scanQR());
  }

  bindDrop(el) {
    el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); el.classList.add("drag"); } });
    el.addEventListener("dragleave", () => el.classList.remove("drag"));
    el.addEventListener("drop", (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); el.classList.remove("drag"); this.addFiles([...e.dataTransfer.files]); });
  }

  async addFiles(files) {
    if (!files || !files.length) return;
    const ok = files.filter((f) => this.acceptFile(f));
    if (files.length - ok.length) toast(`${files.length - ok.length} file(s) skipped – wrong file type for ${this.t.title}.`, true);
    if (!ok.length) { if (!this.entries.length) this.showUpload(); return; }
    let list = ok.map((f) => ({ id: uid(), file: f, rotate: 0 }));
    if (this.t.max && this.entries.length + list.length > this.t.max) {
      if (this.t.max === 1) { this.entries = []; list = list.slice(0, 1); }
      else { list = list.slice(0, Math.max(0, this.t.max - this.entries.length)); toast(`This tool accepts at most ${this.t.max} files.`, true); }
    }
    const total = [...this.entries, ...list].reduce((s, e) => s + e.file.size, 0);
    if (total > CAPS.max_upload_mb * 1048576) { toast(`Total size exceeds ${CAPS.max_upload_mb} MB.`, true); return; }
    for (const e of list) {
      if (ext(e.file.name) !== "pdf") continue;
      try { await loadPdf(e); } catch (err) {
        if (err.message === "password-cancelled") { e.skip = true; toast(`“${e.file.name}” skipped (no password).`, true); }
        else { e.broken = true; if (this.t.id !== "repair") toast(`“${e.file.name}” could not be opened – it may be damaged. Try Repair PDF.`, true); }
      }
    }
    list = list.filter((e) => !e.skip && (!e.broken || this.t.id === "repair"));
    if (this.dead) return;
    this.entries.push(...list);
    if (!this.entries.length) return this.showUpload();
    this.showWorkspace();
  }

  /* ---------------------------------------------------------------- workspace */
  showWorkspace() {
    const t = this.t;
    clearInterval(this.scanTimer);
    this.root.innerHTML = "";
    const main = h("div", { class: "ws-main" });
    const sideBody = h("div", { class: "side-body" });
    this.btn = h("button", { class: "btn-big", onclick: () => this.process() }, t.btn);
    this.root.append(h("div", { class: "workspace" }, main, h("aside", { class: "ws-side" }, h("h2", {}, t.title), sideBody, h("div", { class: "side-foot" }, this.btn))));
    this.main = main; this.sideBody = sideBody;
    this.bindDrop(main);
    const miss = missingDep(t);
    if (miss) sideBody.append(h("div", { class: "warn", style: { margin: "0 0 14px" } }, `Needs “${miss}” – not installed.`));
    this.view = null;
    this.view = (VIEWS[t.view] || VIEWS.files)(this, main, sideBody);
    this.validateBtn();
  }
  renderSideOptions(schema, target = this.sideBody, onChange) {
    const wrap = h("div", {});
    const draw = () => { wrap.innerHTML = ""; wrap.append(renderOptions(schema, this.state, (k) => { onChange && onChange(k); this.validateBtn(); })); };
    draw();
    target.append(wrap);
    return draw;
  }
  validateBtn() {
    if (!this.btn) return;
    let ok = this.entries.length >= (this.t.min ?? 1);
    if (this.view && this.view.canRun) ok = ok && this.view.canRun();
    this.btn.disabled = !ok;
  }

  fileCards(container, { sortable, rotatable } = {}) {
    const wrap = h("div", { class: "files" });
    let dragId = null;
    const draw = () => {
      wrap.innerHTML = "";
      this.entries.forEach((e, idx) => {
        const th = h("div", { class: "fthumb" });
        const card = h("div", { class: "fcard", draggable: sortable ? "true" : null },
          h("div", { class: "acts" },
            rotatable ? h("button", { class: "iconbtn", title: "Rotate left", onclick: () => { e.rotate = (e.rotate + 270) % 360; this.drawThumb(e, th); this.validateBtn(); } }, ic("rotl",16,2)) : null,
            rotatable ? h("button", { class: "iconbtn", title: "Rotate right", onclick: () => { e.rotate = (e.rotate + 90) % 360; this.drawThumb(e, th); this.validateBtn(); } }, ic("rotate",16,2)) : null,
            h("button", { class: "iconbtn", title: "Remove", onclick: () => { this.entries.splice(idx, 1); if (!this.entries.length) return this.showUpload(); if (this.view && this.view.rebuild) return this.showWorkspace(); draw(); this.validateBtn(); } }, ic("x",14,2.2))),
          e.password ? h("span", { class: "lock ok", title: "Password entered" }, "unlocked") : null, th,
          h("div", { class: "fname", title: e.file.name }, e.file.name),
          h("div", { class: "fmeta" }, fmtSize(e.file.size) + (e.pages ? ` · ${e.pages} page${e.pages > 1 ? "s" : ""}` : "") + (e.broken ? " · damaged" : "")));
        if (sortable) {
          card.addEventListener("dragstart", (ev) => { dragId = e.id; card.classList.add("dragging"); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", e.id); });
          card.addEventListener("dragend", () => card.classList.remove("dragging"));
          card.addEventListener("dragover", (ev) => { if (dragId) { ev.preventDefault(); card.classList.add("over"); } });
          card.addEventListener("dragleave", () => card.classList.remove("over"));
          card.addEventListener("drop", (ev) => {
            if (!dragId) return;
            ev.preventDefault(); ev.stopPropagation(); card.classList.remove("over");
            const from = this.entries.findIndex((x) => x.id === dragId); dragId = null;
            if (from < 0 || from === idx) return;
            const [m] = this.entries.splice(from, 1); this.entries.splice(idx, 0, m); draw();
          });
        }
        wrap.append(card);
        this.drawThumb(e, th);
      });
    };
    draw();
    const multi = this.t.max !== 1;
    container.append(h("div", { class: "add-fab" },
      multi ? h("button", { class: "fab", title: "Add more files", onclick: async () => this.addFiles(await pickFiles(this.t.accept, true)) }, "+")
        : h("button", { class: "fab small", title: "Replace file", onclick: async () => this.addFiles(await pickFiles(this.t.accept, false)) }, ic("swap",18,2)),
      sortable ? h("button", { class: "fab small", title: "Sort A→Z", onclick: () => { this.entries.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })); draw(); } }, ic("sort",18,2)) : null));
    if (this.t.note) container.append(h("p", { style: { textAlign: "center", color: "var(--muted)", marginTop: 0 } }, this.t.note));
    container.append(wrap);
    return draw;
  }

  async drawThumb(e, th) {
    const x = ext(e.file.name);
    try {
      if (e.pdf) {
        if (!e.thumbUrl) { const c = await renderPage(e.pdf, 1, 150); e.thumbUrl = c.toDataURL("image/jpeg", 0.85); }
        th.innerHTML = "";
        th.append(h("img", { src: e.thumbUrl, style: { transform: `rotate(${e.rotate || 0}deg)`, maxWidth: e.rotate % 180 ? "150px" : "100%" } }));
      } else if ((e.file.type || "").startsWith("image/") && !/heic|heif|tiff?/.test(x)) {
        e.url = e.url || URL.createObjectURL(e.file);
        th.innerHTML = "";
        th.append(h("img", { src: e.url, style: { transform: `rotate(${e.rotate || 0}deg)` } }));
      } else { th.innerHTML = ""; th.append(h("div", { class: "ext" }, x.toUpperCase() || "FILE")); }
    } catch { th.innerHTML = ""; th.append(h("div", { class: "ext" }, x.toUpperCase())); }
  }

  /* ---------------------------------------------------------------- processing */
  async process() {
    const t = this.t;
    let options, extraFiles = {};
    try {
      options = this.view && this.view.collect ? await this.view.collect() : cleanOpts(this.state);
      if (options == null) return;
      extraFiles = this.view && this.view.extraFiles ? this.view.extraFiles() : {};
    } catch (e) { return toast(e.message, true); }
    const files = this.entries;
    const prog = h("div", { class: "progress" }, h("div", {}));
    const pct = h("div", { class: "pct" }, "0%");
    const liquid = h("div", { class: "liquid" }, h("div", { class: "wave" }), pct);
    const label = h("p", { style: { color: "var(--muted)" } }, "Uploading files…");
    const saved = [...this.root.childNodes];
    this.root.innerHTML = "";
    this.root.append(h("div", { class: "center-box" }, liquid, h("h2", {}, t.id === "compare" ? "Comparing documents" : t.title, h("span", { class: "dots" })), prog, label));
    const restore = () => { this.root.innerHTML = ""; saved.forEach((n) => this.root.append(n)); };
    try {
      const res = await runTool(t.id, files, options, (phase, f) => {
        if (phase === "upload") { const v = Math.round(f * 100); prog.firstChild.style.width = v + "%"; liquid.style.setProperty("--fill", Math.max(8, v * 0.9) + "%"); pct.textContent = v + "%"; label.textContent = `Uploading… ${v}%`; }
        else { prog.classList.add("indet"); liquid.classList.add("indet"); pct.textContent = ""; pct.append(ic("bolt", 34, 1.6)); label.textContent = "Processing — almost there"; }
      }, extraFiles);
      if (this.dead) return;
      this.showResult(res, restore);
    } catch (e) {
      if (this.dead) return;
      restore();
      this.sideBody.querySelectorAll(".err").forEach((x) => x.remove());
      const err = h("div", { class: "err" }, "" + e.message);
      if (this.sideBody.isConnected) { this.sideBody.prepend(err); this.sideBody.scrollTop = 0; } else toast(e.message, true);
      if (/password/i.test(e.message)) {
        const ent = files.find((x) => e.message.includes(x.file.name));
        if (ent) { const pw = await askPassword(ent.file.name, /wrong/i.test(e.message)); if (pw != null) { ent.password = pw; err.remove(); this.process(); } }
      }
    }
  }

  showResult(res, back) {
    const t = this.t;
    this.root.innerHTML = "";
    const box = h("div", { class: "center-box" });
    this.root.append(box);
    const backBtn = h("button", { class: "btn", onclick: () => back() }, ic("back",16,2), " Back");
    const again = h("button", { class: "btn", onclick: () => { this.entries = []; this.state = {}; this.showUpload(); } }, "Start over");
    if (res.json) return RESULTS[t.id] ? RESULTS[t.id](this, res.json, box, backBtn, again) : box.append(h("pre", {}, JSON.stringify(res.json, null, 2)));
    const titles = { compress: "PDFs have been compressed!", merge: "PDFs have been merged!", split: "PDF has been split!", protect: "PDFs have been protected!", unlock: "PDFs have been unlocked!", sign: "Your document has been signed!", edit: "Your PDF has been edited!", ocr: "OCR complete!", translate: "Your PDF has been translated!", repair: "PDF has been repaired!" };
    box.append(h("div", { class: "done-mark", html: '<svg width="44" height="44" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' }), h("h2", {}, titles[t.id] || `${t.title} – done!`));
    box.append(h("div", { class: "dl-row" }, backBtn, h("button", { class: "btn-big", onclick: () => download(res.blob, res.name) }, `Download ${/\.zip$/i.test(res.name) ? "files (ZIP)" : ext(res.name).toUpperCase()}`)));
    box.append(h("p", { style: { color: "var(--muted)" } }, `${res.name} · ${fmtSize(res.blob.size)}` + (res.count > 1 ? ` · ${res.count} files` : "")));
    const info = res.info || {};
    if (t.id === "compress" && info.before) {
      const pct = info.saved_percent;
      box.append(h("div", { class: "infobox" }, h("div", { class: "stat-big" }, pct > 0 ? `Your PDF is now ${pct}% smaller!` : "Already optimized"), h("div", {}, `${fmtSize(info.before)} → ${fmtSize(info.after)}`),
        pct <= 0 ? h("div", { class: "help" }, "This PDF was already well optimized, so the original is kept. Try “Extreme compression” or grayscale.") : null));
    }
    if (t.id === "ocr") box.append(h("div", { class: "infobox" }, info.ocr_pages ? `Text recognized on ${info.ocr_pages} page(s). Your PDF is now searchable and selectable.` : "All pages already contained text – nothing needed OCR. Uncheck “Skip pages that already contain text” to force OCR."));
    if (t.id === "redact") box.append(h("div", { class: "infobox" }, `${info.redactions || 0} area(s) permanently redacted.`));
    if (t.id === "forms") box.append(h("div", { class: "infobox" }, `${info.filled || 0} field(s) filled · ${info.created || 0} new field(s) created.`));
    if (t.id === "pdf-to-pdfa" && info.level) box.append(h("div", { class: "infobox" }, `Converted to ${info.level}.`));
    if (t.id === "pdf-to-markdown" && info.preview) box.append(h("div", { class: "result-panel" }, h("div", { class: "mdprev" }, info.preview)));
    box.append(h("div", { class: "dl-row", style: { marginTop: "20px" } }, again, h("a", { class: "btn", href: "#/", style: { textDecoration: "none" } }, "All tools")));
    if (PDF_OUT.has(t.id) && /\.pdf$/i.test(res.name)) {
      const file = new File([res.blob], res.name, { type: "application/pdf" });
      box.append(h("div", { class: "continue" }, h("h3", {}, "Continue to…"), h("div", { class: "list" },
        NEXT_TOOLS.filter((x) => x !== t.id).map((id) => h("a", { href: `#/${id}`, onclick: () => { handoff = [file]; } }, ticon(TOOL[id], 16), TOOL[id].title)))));
    }
    if (S.autoDownload) setTimeout(() => { if (!this.dead) download(res.blob, res.name); }, 300);
  }

  /* ---------------------------------------------------------------- HTML to PDF */
  showHtml() {
    const url = h("input", { class: "inp", placeholder: "https://example.com", style: { fontSize: "18px", padding: "14px" } });
    const errBox = h("div", {});
    this.state = {};
    const go = (files = []) => {
      if (!files.length && !url.value.trim()) return toast("Enter a URL or choose an HTML file", true);
      this.entries = files.map((f) => ({ id: uid(), file: f }));
      this.view = { collect: () => ({ ...cleanOpts(this.state), url: files.length ? "" : url.value.trim() }) };
      this.sideBody = errBox;
      this.process();
    };
    const box = h("div", { class: "dropzone glass", style: { textAlign: "left" } },
      errBox, h("div", { class: "field" }, h("label", {}, "Website URL"), url),
      renderOptions(this.t.options, this.state),
      h("div", { style: { textAlign: "center" } }, h("button", { class: "btn-big", onclick: () => go() }, "Convert to PDF"),
        h("div", { class: "drop-hint" }, "or ", h("a", { href: "javascript:void 0", onclick: async () => { const f = await pickFiles(".html,.htm", false); if (f.length) go(f); } }, "upload an HTML file"))));
    url.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    this.bindDrop = () => {};
    this.root.append(box);
    setTimeout(() => url.focus(), 50);
  }

  /* ---------------------------------------------------------------- Scan: phone QR */
  scanQR() {
    const box = h("div", { class: "qrbox" }, h("div", {}, "Preparing phone link…"));
    const seen = this.scanSeen = this.scanSeen || new Set();
    const poll = async (sid) => {
      if (this.dead) return clearInterval(this.scanTimer);
      try {
        const r = await fetch(`/api/scan/${sid}/list`);
        if (r.status === 404) return clearInterval(this.scanTimer);
        const { files } = await r.json();
        const fresh = files.filter((f) => !seen.has(f.id));
        if (!fresh.length) return;
        fresh.forEach((f) => seen.add(f.id));
        const blobs = await Promise.all(fresh.map(async (f) => { const b = await (await fetch(`/api/scan/${sid}/file/${f.id}`)).blob(); return new File([b], f.name, { type: b.type || "image/jpeg" }); }));
        toast(`${blobs.length} new scan(s) received from your phone`);
        this.addFiles(blobs);
      } catch {}
    };
    const start = ({ sid, url, qr }) => {
      this.scan = { sid, url, qr };
      box.innerHTML = "";
      box.append(h("div", { class: "qr", html: qr || "" }), h("div", { style: { maxWidth: "420px" } }, h("h3", { style: { marginTop: 0 } }, "Scan with your phone"),
        h("ol", { style: { lineHeight: 1.7, paddingLeft: "18px" } }, h("li", {}, "Connect your phone to the same Wi-Fi as this computer."), h("li", {}, "Scan this QR code with the phone camera."), h("li", {}, "Take photos – they appear here automatically.")),
        h("div", {}, "Or open: ", h("code", {}, url))));
      clearInterval(this.scanTimer);
      this.scanTimer = setInterval(() => poll(sid), 2000);
    };
    if (this.scan) start(this.scan);
    else fetch("/api/scan/new", { method: "POST" }).then((r) => r.json()).then(start).catch(() => { box.textContent = "Phone scanning unavailable (server not reachable)."; });
    return box;
  }
}

/* ================================================================ shell */
$("#hdrLogo").innerHTML = logoSVG({ size: 34, animated: true });
$("#splashLogo").innerHTML = logoSVG({ size: 120, animated: true });
const btnS = $("#btnSearch"); btnS.append(ic("search", 16, 2), h("span", {}, "Search"), h("kbd", {}, /Mac|iPhone/.test(navigator.platform) ? "⌘K" : "Ctrl K"));
btnS.onclick = () => openPalette();
const btnT = $("#btnTheme");
const drawThemeBtn = () => { btnT.innerHTML = ""; btnT.append(ic(isDark() ? "sun" : "moon", 18, 1.8)); };
btnT.onclick = (e) => { toggleTheme(e); setTimeout(drawThemeBtn, 30); };
drawThemeBtn();
document.addEventListener("eng:theme", drawThemeBtn);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { apply(); drawThemeBtn(); });
const btnG = $("#btnSettings"); btnG.append(ic("gear", 18, 1.8)); btnG.onclick = () => openSettings();
document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".modal-bg,.palette,.drawer")) return;
  if (e.shiftKey && e.key.toLowerCase() === "d") { toggleTheme(); setTimeout(drawThemeBtn, 30); }
  else if (e.key === ",") openSettings();
  else if (e.key === "/") { e.preventDefault(); openPalette(); }
});
initDropAnywhere((id, files) => { handoff = files; if (location.hash === "#/" + id) route(); else location.hash = "#/" + id; });
renderFooter(document.getElementById("siteFooter"));
trackStart();
doRoute(); markNav();
requestAnimationFrame(() => setTimeout(() => { const sp = document.getElementById("splash"); if (sp) { sp.classList.add("gone"); setTimeout(() => sp.remove(), 900); } }, 350));
loadCaps();
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => getPdfjs());
setInterval(() => fetch("/api/capabilities").then((r) => setStatus(r.ok)).catch(() => setStatus(false)), 30000);
