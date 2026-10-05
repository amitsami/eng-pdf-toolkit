import { h, clamp, uid, renderPage, loadPdf, pickFiles, readDataURL, toast, modal } from "./util.js";
import { ic, ICON_NAMES } from "./icons.js";

const NS = "http://www.w3.org/2000/svg";
const svg = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

/* Page editor used by Edit PDF, Sign PDF, Redact PDF and PDF Forms. Coordinates are fractions of the page. */
export class PageEditor {
  constructor(entry, cfg) {
    this.entry = entry;
    this.cfg = cfg; // {tools:[{id,label,icon}], defaults, onChange, onSelect, fillFields}
    this.items = [];
    this.pages = [];
    this.mode = "select";
    this.sel = null;
    this.style = Object.assign({ color: "#000000", size: 14, font: "sans", bold: false, italic: false, stroke: "#8B9A6E", fill: "", width: 2, opacity: 1 }, cfg.defaults || {});
    this.el = h("div", { class: "editor" });
    this.toolbar = h("div", { class: "etools" });
    this.el.append(this.toolbar);
    this.onKey = (e) => {
      if (!this.el.isConnected) { document.removeEventListener("keydown", this.onKey); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && this.sel && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
        e.preventDefault(); this.remove(this.sel);
      }
      if (e.key === "Escape") { this.setMode("select"); this.select(null); }
    };
    document.addEventListener("keydown", this.onKey);
    this.buildToolbar();
  }

  buildToolbar() {
    this.toolbar.innerHTML = "";
    const tools = [{ id: "select", label: "Select", icon: "pointer" }, ...this.cfg.tools];
    for (const t of tools) {
      const b = h("button", { class: "tbtn" + (this.mode === t.id ? " on" : ""), title: t.title || t.label, onclick: () => (t.action ? t.action() : this.setMode(t.id)) }, t.icon ? (ICON_NAMES.has(t.icon) ? ic(t.icon, 16) : h("span", { class: "tlbl" }, t.icon)) : null, t.label);
      this.toolbar.append(b);
    }
  }
  setMode(m, payload) {
    this.mode = m; this.payload = payload;
    this.buildToolbar();
    for (const p of this.pages) p.over.classList.toggle("mode-add", m !== "select");
    this.cfg.onMode && this.cfg.onMode(m);
  }

  async mount(container) {
    container.append(this.el);
    const pdf = await loadPdf(this.entry);
    const avail = Math.max(320, Math.min(900, container.clientWidth - 40));
    for (let i = 1; i <= pdf.numPages; i++) {
      const wrap = h("div", { class: "epage" });
      const holder = h("div", { style: { width: avail + "px", height: Math.round(avail * 1.3) + "px", background: "#fff" } });
      wrap.append(holder, h("div", { class: "epnum" }, `Page ${i} of ${pdf.numPages}`));
      const over = h("div", { class: "eover" });
      wrap.append(over);
      this.el.append(wrap);
      const pg = { num: i - 1, wrap, over, holder, w: avail, h: avail * 1.3, ptw: 612, pth: 792 };
      this.pages.push(pg);
      this.bindPage(pg);
    }
    // render lazily
    const io = new IntersectionObserver((ents) => {
      for (const en of ents) if (en.isIntersecting) { io.unobserve(en.target); this.renderPg(this.pages[+en.target.dataset.i]); }
    }, { rootMargin: "800px" });
    this.pages.forEach((p, i) => { p.wrap.dataset.i = i; io.observe(p.wrap); });
    // make sure first pages get sizes right away
    await Promise.all(this.pages.slice(0, 2).map((p) => this.renderPg(p)));
    if (this.cfg.onReady) this.cfg.onReady(this);
  }
  async renderPg(p) {
    if (p.rendered) return p.rendered;
    p.rendered = (async () => {
      const c = await renderPage(this.entry.pdf, p.num + 1, p.w);
      p.ptw = +c.dataset.ptw; p.pth = +c.dataset.pth;
      p.h = parseFloat(c.style.height);
      p.holder.replaceWith(c); p.holder = c;
      this.items.filter((it) => it.page === p.num).forEach((it) => this.draw(it));
    })();
    return p.rendered;
  }
  scale(p) { return p.w / p.ptw; } // px per pt

  pt(e, p) {
    const r = p.over.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  }

  bindPage(p) {
    p.over.addEventListener("pointerdown", (e) => {
      if (e.target !== p.over) return;
      if (this.mode === "select") { this.select(null); return; }
      e.preventDefault();
      const s = this.pt(e, p);
      const m = this.mode;
      const st = this.style;
      if (m === "text") {
        const it = this.add({ page: p.num, type: "text", x: s.x, y: s.y, w: Math.min(0.4, 1 - s.x), h: (st.size * 1.5) / p.pth, text: "", size: st.size, color: st.color, font: st.font, bold: st.bold, italic: st.italic, align: "left" });
        this.setMode("select"); this.select(it, true);
        return;
      }
      if (m === "place") { // image / signature / date etc.
        const pl = this.payload;
        const w = pl.w || 0.25, hh = pl.h ? pl.h : (w * p.ptw / pl.ratio) / p.pth;
        const it = this.add({ page: p.num, ...pl.item, x: clamp(s.x - w / 2, 0, 1 - w), y: clamp(s.y - hh / 2, 0, 1 - hh), w, h: hh });
        if (!pl.sticky) this.setMode("select");
        this.select(it);
        return;
      }
      if (m === "draw") {
        const it = this.add({ page: p.num, type: "draw", points: [[s.x, s.y]], stroke: st.stroke, width: st.width, opacity: st.opacity });
        const move = (ev) => { const q = this.pt(ev, p); it.points.push([q.x, q.y]); this.bboxFromPoints(it); this.draw(it); };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (it.points.length < 2) this.remove(it); else this.changed(); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
        return;
      }
      if (m === "line" || m === "arrow") {
        const it = this.add({ page: p.num, type: m, x1: s.x, y1: s.y, x2: s.x, y2: s.y, stroke: st.stroke, width: st.width, opacity: st.opacity });
        const move = (ev) => { const q = this.pt(ev, p); it.x2 = q.x; it.y2 = q.y; this.bboxFromPoints(it); this.draw(it); };
        const up = () => {
          window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
          if (Math.hypot((it.x2 - it.x1) * p.w, (it.y2 - it.y1) * p.h) < 4) { it.x2 = Math.min(1, it.x1 + 0.15); this.bboxFromPoints(it); this.draw(it); }
          this.setMode("select"); this.select(it);
        };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
        return;
      }
      // box-shaped tools
      const base = this.cfg.boxItem ? this.cfg.boxItem(m, st) : { type: m, stroke: st.stroke, fill: st.fill, width: st.width, opacity: st.opacity };
      if (!base) return;
      const it = this.add({ page: p.num, ...base, x: s.x, y: s.y, w: 0.001, h: 0.001 });
      const move = (ev) => {
        const q = this.pt(ev, p);
        it.x = Math.min(s.x, q.x); it.y = Math.min(s.y, q.y); it.w = Math.abs(q.x - s.x); it.h = Math.abs(q.y - s.y);
        this.draw(it);
      };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        if (it.w * p.w < 6 || it.h * p.h < 6) {
          const d = (this.cfg.defaultSize && this.cfg.defaultSize(it)) || { w: 0.2, h: 0.06 };
          it.w = Math.min(d.w, 1 - it.x); it.h = Math.min(d.h, 1 - it.y); this.draw(it);
        }
        if (!this.cfg.stickyTools || !this.cfg.stickyTools.includes(m)) this.setMode("select");
        this.select(it); this.changed();
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }

  bboxFromPoints(it) {
    const pts = it.type === "draw" ? it.points : [[it.x1, it.y1], [it.x2, it.y2]];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    it.x = Math.min(...xs); it.y = Math.min(...ys); it.w = Math.max(...xs) - it.x; it.h = Math.max(...ys) - it.y;
  }

  add(it) { it.id = it.id || uid(); this.items.push(it); this.draw(it); this.changed(); return it; }
  remove(it) { this.items = this.items.filter((x) => x !== it); it.el && it.el.remove(); if (this.sel === it) this.select(null); this.changed(); }
  changed() { this.cfg.onChange && this.cfg.onChange(this.items); }
  select(it, focus) {
    if (this.sel && this.sel.el) this.sel.el.classList.remove("sel");
    this.sel = it;
    if (it && it.el) { it.el.classList.add("sel"); if (focus) { const t = it.el.querySelector(".txt"); if (t) { t.focus(); setTimeout(() => t.focus(), 0); } } }
    this.cfg.onSelect && this.cfg.onSelect(it);
  }

  draw(it) {
    const p = this.pages[it.page];
    if (!p) return;
    let el = it.el;
    if (!el) {
      el = it.el = h("div", { class: "item" });
      p.over.append(el);
      this.bindItem(it);
    }
    const W = p.w, H = p.h, sc = this.scale(p);
    const pad = it.type === "line" || it.type === "arrow" || it.type === "draw" ? Math.max(6, (it.width || 2) * sc) : 0;
    Object.assign(el.style, { left: it.x * W - pad + "px", top: it.y * H - pad + "px", width: Math.max(2, it.w * W) + 2 * pad + "px", height: Math.max(2, it.h * H) + 2 * pad + "px" });
    if (this.cfg.renderItem && this.cfg.renderItem(it, el, p, this)) { this.ensureHandles(it); return; }
    const t = it.type;
    if (t === "text") {
      let tx = el.querySelector(".txt");
      if (!tx) {
        tx = h("div", { class: "txt", contenteditable: "true", spellcheck: "false" });
        tx.innerText = it.text || "";
        tx.addEventListener("input", () => {
          it.text = tx.innerText.replace(/\n$/, "");
          const need = tx.scrollHeight / H;
          if (need > it.h) { it.h = Math.min(1 - it.y, need + 0.002); el.style.height = it.h * H + "px"; }
          this.changed();
        });
        tx.addEventListener("pointerdown", (e) => { e.stopPropagation(); if (this.sel !== it) this.select(it); });
        tx.addEventListener("blur", () => { if (!it.text.trim() && this.items.includes(it)) this.remove(it); });
        el.append(tx);
      }
      Object.assign(tx.style, {
        fontSize: it.size * sc + "px", color: it.color, fontWeight: it.bold ? "700" : "400", fontStyle: it.italic ? "italic" : "normal", textAlign: it.align || "left",
        fontFamily: it.font === "serif" ? "'Times New Roman',Times,'Noto Serif Bengali',serif" : it.font === "mono" ? "'Courier New',monospace" : "Helvetica,Arial,'Noto Sans','Noto Sans Bengali',sans-serif",
        background: it.bg || "transparent",
      });
    } else if (t === "image" || t === "signature") {
      let img = el.querySelector("img");
      if (!img) { img = h("img", { src: it.src, draggable: false }); el.append(img); }
      img.style.opacity = it.opacity ?? 1;
    } else {
      el.querySelectorAll("svg").forEach((s) => s.remove());
      const w = it.w * W, hh = it.h * H;
      const s = svg("svg", { viewBox: `${-pad} ${-pad} ${w + 2 * pad} ${hh + 2 * pad}` });
      const lw = Math.max(0.5, (it.width || 2) * sc);
      const stroke = it.stroke || "none";
      const op = it.opacity ?? 1;
      if (t === "rect" || t === "whiteout" || t === "highlight") {
        const fill = t === "whiteout" ? "#fff" : t === "highlight" ? (it.fill || "#8B9A6E") : (it.fill || "none");
        s.append(svg("rect", { x: 0, y: 0, width: w, height: hh, fill, "fill-opacity": t === "highlight" ? (it.opacity ?? 0.4) : t === "whiteout" ? 1 : op, stroke: t === "rect" ? stroke : t === "whiteout" ? "#ddd" : "none", "stroke-width": t === "whiteout" ? 1 : lw, "stroke-opacity": op, "stroke-dasharray": t === "whiteout" ? "3 3" : "" }));
      } else if (t === "ellipse") {
        s.append(svg("ellipse", { cx: w / 2, cy: hh / 2, rx: w / 2, ry: hh / 2, fill: it.fill || "none", "fill-opacity": op, stroke, "stroke-width": lw, "stroke-opacity": op }));
      } else if (t === "line" || t === "arrow") {
        const x1 = (it.x1 - it.x) * W, y1 = (it.y1 - it.y) * H, x2 = (it.x2 - it.x) * W, y2 = (it.y2 - it.y) * H;
        s.append(svg("line", { x1, y1, x2, y2, stroke, "stroke-width": lw, "stroke-linecap": "round", "stroke-opacity": op }));
        if (t === "arrow") {
          const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(8 * sc, lw * 4);
          for (const d of [2.6, -2.6]) s.append(svg("line", { x1: x2, y1: y2, x2: x2 + L * Math.cos(a + d), y2: y2 + L * Math.sin(a + d), stroke, "stroke-width": lw, "stroke-linecap": "round", "stroke-opacity": op }));
        }
      } else if (t === "draw") {
        const pts = it.points.map(([a, b]) => `${(a - it.x) * W},${(b - it.y) * H}`).join(" ");
        s.append(svg("polyline", { points: pts, fill: "none", stroke, "stroke-width": lw, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-opacity": op }));
      }
      el.prepend(s);
    }
    this.ensureHandles(it);
  }

  ensureHandles(it) {
    const el = it.el;
    if (el.querySelector(".del")) return;
    const del = h("button", { class: "del", title: "Delete", onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); this.remove(it); } }, ic("x",14,2.2));
    el.append(del);
    if (it.type === "text") {
      const mv = h("div", { class: "mv", title: "Move" }, ic("move",12,2.2));
      el.append(mv);
      mv.addEventListener("pointerdown", (e) => this.startMove(e, it));
    }
    if (!["line", "arrow", "draw"].includes(it.type) && !it.noResize) {
      const hd = h("div", { class: "h" });
      el.append(hd);
      hd.addEventListener("pointerdown", (e) => this.startResize(e, it));
    }
  }

  bindItem(it) {
    it.el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".txt,.h,.del,.mv,input,select,textarea")) return;
      if (this.mode !== "select" && this.mode !== "place") this.setMode("select");
      this.startMove(e, it);
    });
  }
  startMove(e, it) {
    e.preventDefault(); e.stopPropagation();
    if (it.fixed) return;
    this.select(it);
    const p = this.pages[it.page];
    const s = this.pt(e, p);
    const o = { x: it.x, y: it.y, pts: it.points ? it.points.map((q) => [...q]) : null, l: [it.x1, it.y1, it.x2, it.y2] };
    const move = (ev) => {
      const q = this.pt(ev, p);
      const dx = clamp(q.x - s.x, -o.x, 1 - o.x - it.w), dy = clamp(q.y - s.y, -o.y, 1 - o.y - it.h);
      it.x = o.x + dx; it.y = o.y + dy;
      if (o.pts) it.points = o.pts.map(([a, b]) => [a + dx, b + dy]);
      if (it.type === "line" || it.type === "arrow") { it.x1 = o.l[0] + dx; it.y1 = o.l[1] + dy; it.x2 = o.l[2] + dx; it.y2 = o.l[3] + dy; }
      this.draw(it);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); this.changed(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  startResize(e, it) {
    e.preventDefault(); e.stopPropagation();
    const p = this.pages[it.page];
    const keep = it.type === "image" || it.type === "signature";
    const ratio = (it.w * p.w) / (it.h * p.h);
    const move = (ev) => {
      const q = this.pt(ev, p);
      let w = clamp(q.x - it.x, 8 / p.w, 1 - it.x), hh = clamp(q.y - it.y, 8 / p.h, 1 - it.y);
      if (keep) { hh = (w * p.w) / ratio / p.h; if (it.y + hh > 1) { hh = 1 - it.y; w = (hh * p.h * ratio) / p.w; } }
      it.w = w; it.h = hh; this.draw(it);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); this.changed(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  serialize() {
    return this.items.map(({ el, id, fixed, noResize, ...rest }) => rest);
  }

  /* property panel for currently selected item */
  props(it) {
    const box = h("div", {});
    if (!it) return box;
    const set = (k, v) => { it[k] = v; this.style[k] = v; this.draw(it); this.changed(); };
    const row = (label, input) => h("div", { class: "field" }, h("label", {}, label), input);
    const color = (k, allowNone) => {
      const inp = h("input", { type: "color", value: it[k] || "#000000", oninput: (e) => set(k, e.target.value) });
      const wrap = h("div", { class: "colorrow" }, inp);
      if (allowNone) wrap.append(h("label", { class: "check", style: { margin: 0 } }, h("input", { type: "checkbox", checked: !it[k], onchange: (e) => set(k, e.target.checked ? "" : inp.value) }), "None"));
      return wrap;
    };
    const num = (k, min, max, step = 1) => h("input", { class: "inp", type: "number", min, max, step, value: it[k], oninput: (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) set(k, clamp(v, min, max)); } });
    const range = (k, min, max, step) => h("input", { type: "range", min, max, step, value: it[k] ?? 1, style: { width: "100%" }, oninput: (e) => set(k, parseFloat(e.target.value)) });
    const t = it.type;
    box.append(h("div", { class: "lbl", style: { fontWeight: 700, marginBottom: "10px" } }, "Selected: " + (this.cfg.labels?.[t] || t)));
    if (t === "text") {
      box.append(row("Font", h("select", { class: "inp", onchange: (e) => set("font", e.target.value) }, [["sans", "Sans-serif"], ["serif", "Serif"], ["mono", "Monospace"]].map(([v, l]) => h("option", { value: v, selected: it.font === v }, l)))));
      box.append(row("Size (pt)", num("size", 4, 200)), row("Color", color("color")));
      box.append(h("div", { class: "toolbar-top", style: { justifyContent: "flex-start" } },
        h("button", { class: "tbtn" + (it.bold ? " on" : ""), onclick: (e) => { set("bold", !it.bold); e.currentTarget.classList.toggle("on"); } }, h("b", {}, "B")),
        h("button", { class: "tbtn" + (it.italic ? " on" : ""), onclick: (e) => { set("italic", !it.italic); e.currentTarget.classList.toggle("on"); } }, h("i", {}, "I")),
        ["left", "center", "right"].map((a) => h("button", { class: "tbtn" + (it.align === a ? " on" : ""), onclick: () => { set("align", a); this.cfg.onSelect(it); } }, ic(a === "left" ? "alignl" : a === "center" ? "alignc" : "alignr", 16)))));
      box.append(row("Background", color("bg", true)));
    } else if (t === "image" || t === "signature") {
      box.append(row("Opacity", range("opacity", 0.1, 1, 0.05)));
    } else if (t === "highlight") {
      box.append(row("Color", color("fill")), row("Opacity", range("opacity", 0.1, 1, 0.05)));
    } else if (t === "rect" || t === "ellipse") {
      box.append(row("Border color", color("stroke", true)), row("Fill color", color("fill", true)), row("Border width", num("width", 0, 30, 0.5)), row("Opacity", range("opacity", 0.1, 1, 0.05)));
    } else if (t === "line" || t === "arrow" || t === "draw") {
      box.append(row("Color", color("stroke")), row("Width", num("width", 0.5, 30, 0.5)), row("Opacity", range("opacity", 0.1, 1, 0.05)));
    }
    if (this.cfg.extraProps) this.cfg.extraProps(it, box, set);
    box.append(h("button", { class: "btn", style: { width: "100%", marginTop: "6px" }, onclick: () => this.remove(it) }, ic("trash",16,2), " Delete element"));
    return box;
  }
}

/* ------------------------------------------------------------- signatures */
const SIG_KEY = "pdftk_signatures";
export function savedSignatures() { try { return JSON.parse(localStorage.getItem(SIG_KEY) || "[]"); } catch { return []; } }
function storeSignatures(list) { try { localStorage.setItem(SIG_KEY, JSON.stringify(list.slice(-12))); } catch { toast("Could not save signature in browser storage", true); } }
export function deleteSignature(i) { const l = savedSignatures(); l.splice(i, 1); storeSignatures(l); }

function trimCanvas(c) {
  const ctx = c.getContext("2d");
  const { width, height } = c;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (d[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const o = document.createElement("canvas");
  o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext("2d").drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

const SIG_FONTS = ["'Brush Script MT','Segoe Script','Lucida Handwriting',cursive", "'Segoe Script','Comic Sans MS',cursive", "'Lucida Handwriting','Apple Chancery','URW Chancery L',cursive", "Georgia,'Times New Roman',serif"];

export async function createSignature(kind = "signature") {
  let tab = "draw", color = "#1a237e", fontIdx = 0, uploaded = null;
  const body = h("div", {});
  const tabs = h("div", { class: "tabs" });
  const pane = h("div", {});
  const colors = h("div", { class: "colorrow", style: { marginTop: "12px" } }, "Color:",
    ["#000000", "#1a237e", "#8B9A6E", "#313626"].map((c) => h("button", { style: { width: "28px", height: "28px", borderRadius: "50%", border: "3px solid #fff", boxShadow: "0 0 0 1px #aaa", background: c }, onclick: () => { color = c; redraw(); } })));
  const pad = h("canvas", { class: "sigpad", width: 1100, height: 400 });
  const name = h("input", { class: "inp", placeholder: kind === "initials" ? "Your initials" : "Your full name", oninput: () => redraw() });
  const fonts = h("div", { class: "sigfonts" });
  let strokes = [];
  const pctx = pad.getContext("2d");
  const drawPad = () => {
    pctx.clearRect(0, 0, pad.width, pad.height);
    pctx.strokeStyle = color; pctx.lineWidth = 5; pctx.lineCap = "round"; pctx.lineJoin = "round";
    for (const s of strokes) { pctx.beginPath(); s.forEach(([x, y], i) => (i ? pctx.lineTo(x, y) : pctx.moveTo(x, y))); if (s.length === 1) pctx.lineTo(s[0][0] + 0.1, s[0][1]); pctx.stroke(); }
  };
  pad.addEventListener("pointerdown", (e) => {
    pad.setPointerCapture(e.pointerId);
    const r = pad.getBoundingClientRect();
    const P = (ev) => [(ev.clientX - r.left) * pad.width / r.width, (ev.clientY - r.top) * pad.height / r.height];
    const s = [P(e)]; strokes.push(s); drawPad();
    const mv = (ev) => { s.push(P(ev)); drawPad(); };
    const up = () => { pad.removeEventListener("pointermove", mv); pad.removeEventListener("pointerup", up); };
    pad.addEventListener("pointermove", mv); pad.addEventListener("pointerup", up);
  });
  const redraw = () => {
    if (tab === "draw") drawPad();
    fonts.innerHTML = "";
    SIG_FONTS.forEach((f, i) => fonts.append(h("button", { class: i === fontIdx ? "on" : "", style: { fontFamily: f, color }, onclick: () => { fontIdx = i; redraw(); } }, name.value || (kind === "initials" ? "AB" : "Your Name"))));
  };
  const render = () => {
    tabs.innerHTML = "";
    [["draw", "Draw"], ["type", "Aa Type"], ["upload", "Upload"]].forEach(([k, l]) => tabs.append(h("button", { class: tab === k ? "on" : "", onclick: () => { tab = k; render(); } }, l)));
    pane.innerHTML = "";
    if (tab === "draw") pane.append(pad, h("div", { style: { display: "flex", justifyContent: "space-between", marginTop: "6px" } }, h("small", { style: { color: "var(--muted)" } }, "Draw with your mouse, finger or stylus"), h("button", { class: "tbtn", onclick: () => { strokes = []; drawPad(); } }, "Clear")), colors);
    if (tab === "type") pane.append(name, h("div", { style: { height: "10px" } }), fonts, colors);
    if (tab === "upload") {
      const prev = h("div", { style: { marginTop: "12px", textAlign: "center" } }, uploaded ? h("img", { src: uploaded, style: { maxWidth: "100%", maxHeight: "160px" } }) : "");
      pane.append(h("button", { class: "btn primary", onclick: async () => { const [f] = await pickFiles("image/*", false); if (f) { uploaded = await readDataURL(f); render(); } } }, "Choose image…"), h("p", { style: { fontSize: "13px", color: "var(--muted)" } }, "Tip: a PNG with transparent background looks best."), prev);
    }
    redraw();
  };
  body.append(tabs, pane);
  render();
  const res = await modal(kind === "initials" ? "Create your initials" : "Create your signature", body, [
    { label: "Cancel", value: null },
    { label: "Apply", primary: true, value: () => {
      if (tab === "upload") return uploaded;
      let c;
      if (tab === "draw") { if (!strokes.length) return null; c = trimCanvas(pad); }
      else {
        const txt = name.value.trim(); if (!txt) return null;
        const cv = document.createElement("canvas"); cv.width = 1400; cv.height = 300;
        const cx = cv.getContext("2d"); cx.fillStyle = color; cx.textBaseline = "middle";
        let fs = 160; cx.font = `${fs}px ${SIG_FONTS[fontIdx]}`;
        while (cx.measureText(txt).width > 1340 && fs > 20) { fs -= 8; cx.font = `${fs}px ${SIG_FONTS[fontIdx]}`; }
        cx.fillText(txt, 20, 150); c = trimCanvas(cv);
      }
      return c ? c.toDataURL("image/png") : null;
    } }]);
  if (!res) return null;
  const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = res; });
  if (!img) { toast("Invalid image", true); return null; }
  const sig = { src: res, ratio: img.width / img.height, kind };
  const list = savedSignatures(); list.push(sig); storeSignatures(list);
  return sig;
}

export function textToImage(text, size = 48, color = "#000") {
  const c = document.createElement("canvas"); const cx = c.getContext("2d");
  cx.font = `${size}px Helvetica, Arial, sans-serif`;
  c.width = Math.ceil(cx.measureText(text).width + 10); c.height = Math.ceil(size * 1.4);
  cx.font = `${size}px Helvetica, Arial, sans-serif`; cx.fillStyle = color; cx.textBaseline = "middle"; cx.fillText(text, 5, c.height / 2);
  return { src: c.toDataURL("image/png"), ratio: c.width / c.height };
}
