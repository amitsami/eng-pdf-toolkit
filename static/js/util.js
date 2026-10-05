// pdf.js is large – load it lazily (and warm it up in the background once the page is idle)
export let pdfjsLib = null;
let pdfjsP = null;
export function getPdfjs() {
  return (pdfjsP ||= import("/static/vendor/pdf.min.mjs").then((m) => { m.GlobalWorkerOptions.workerSrc = "/static/vendor/pdf.worker.min.mjs"; pdfjsLib = m; return m; }));
}

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith("--")) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") e.innerHTML = v;
    else if (k in e && typeof v !== "string") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(2) + " MB";
}
export function ext(name) { const m = /\.([^.]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
export function uid() { return Math.random().toString(36).slice(2, 10); }

let toastTimer;
export function toast(msg, bad = false) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = h("div", { class: "toast" + (bad ? " bad" : "") }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

export function modal(title, body, buttons = [{ label: "Close", value: null }]) {
  return new Promise((resolve) => {
    const bg = h("div", { class: "modal-bg" });
    const close = (v) => { bg.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    const foot = h("div", { class: "mf" }, buttons.map((b) =>
      h("button", { class: "btn" + (b.primary ? " primary" : ""), onclick: async () => {
        if (b.validate) { const ok = await b.validate(); if (!ok) return; }
        close(typeof b.value === "function" ? b.value() : b.value);
      } }, b.label)));
    const m = h("div", { class: "modal" }, h("h3", {}, title), h("div", { class: "mb" }, body), foot);
    bg.append(m);
    bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(null); });
    document.body.append(bg);
    const f = m.querySelector("input,textarea,select"); if (f) setTimeout(() => f.focus(), 30);
    m.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.tagName === "INPUT") { const p = buttons.findIndex((b) => b.primary); if (p >= 0) foot.children[p].click(); }
    });
  });
}

export async function askPassword(name, wrong) {
  const inp = h("input", { class: "inp", type: "password", placeholder: "Password", autocomplete: "off" });
  const body = h("div", {}, h("p", { style: { marginTop: 0 } }, wrong ? `Wrong password. Try again for “${name}”.` : `“${name}” is password protected. Enter the password to open it.`), inp);
  return modal("Password required", body, [{ label: "Cancel", value: null }, { label: "Unlock", primary: true, value: () => inp.value }]);
}

/* ----------------------------------------------------------- PDF loading */
export async function loadPdf(entry) {
  // entry: {file, password, pdf}
  if (entry.pdf) return entry.pdf;
  const [buf] = await Promise.all([entry.file.arrayBuffer(), getPdfjs()]);
  const data = new Uint8Array(buf);
  let wrong = false;
  for (;;) {
    try {
      const task = pdfjsLib.getDocument({ data: data.slice(), password: entry.password || undefined, isEvalSupported: false });
      const pdf = await task.promise;
      entry.pdf = pdf;
      entry.pages = pdf.numPages;
      return pdf;
    } catch (e) {
      if (e && e.name === "PasswordException") {
        entry.locked = true;
        const pw = await askPassword(entry.file.name, wrong || e.code === 2);
        if (pw == null) throw new Error("password-cancelled");
        entry.password = pw; wrong = true;
        continue;
      }
      throw e;
    }
  }
}

export async function renderPage(pdf, num, width, rotate = 0) {
  const page = await pdf.getPage(num);
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotate) % 360 });
  const scale = width / base.width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: scale * dpr, rotation: (page.rotate + rotate) % 360 });
  const c = document.createElement("canvas");
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  c.style.width = Math.floor(vp.width / dpr) + "px"; c.style.height = Math.floor(vp.height / dpr) + "px";
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  c.dataset.ptw = base.width; c.dataset.pth = base.height;
  return c;
}

export async function pageSize(pdf, num) {
  const page = await pdf.getPage(num);
  const v = page.getViewport({ scale: 1 });
  return { w: v.width, h: v.height };
}

/* ----------------------------------------------------------- server calls */
export function runTool(tool, entries, options, onProgress, extraFiles = {}) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("options", JSON.stringify(options || {}));
    fd.append("passwords", JSON.stringify(entries.map((e) => e.password || "")));
    for (const e of entries) fd.append("files", e.file, e.file.name);
    for (const [k, f] of Object.entries(extraFiles)) if (f) fd.append(k, f, f.name || k);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/tool/${tool}`);
    xhr.responseType = "blob";
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress("upload", e.loaded / e.total); };
    xhr.upload.onload = () => onProgress && onProgress("processing", 1);
    xhr.onerror = () => reject(new Error("Could not reach the server. Is the app still running?"));
    xhr.onload = async () => {
      const ct = xhr.getResponseHeader("Content-Type") || "";
      if (xhr.status !== 200) {
        let msg = `Error ${xhr.status}`;
        try { msg = JSON.parse(await xhr.response.text()).error || msg; } catch {}
        return reject(new Error(msg));
      }
      if (ct.includes("application/json")) {
        try { return resolve({ json: JSON.parse(await xhr.response.text()) }); } catch { return reject(new Error("Invalid server response")); }
      }
      const name = decodeURIComponent(xhr.getResponseHeader("X-Filename") || "result");
      let info = {};
      try { info = JSON.parse(decodeURIComponent(xhr.getResponseHeader("X-Info") || "{}")); } catch {}
      resolve({ blob: xhr.response, name, info, count: +(xhr.getResponseHeader("X-File-Count") || 1) });
    };
    xhr.send(fd);
  });
}

export function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
export function b64ToBlob(b64, type) {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
export function readDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
export function pickFiles(accept, multiple = true, capture) {
  return new Promise((resolve) => {
    const i = h("input", { type: "file", accept, multiple, style: { display: "none" } });
    if (capture) i.setAttribute("capture", capture);
    i.onchange = () => { resolve([...i.files]); i.remove(); };
    document.body.append(i); i.click();
  });
}
