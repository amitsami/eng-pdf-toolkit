import { h, toast, readDataURL, pickFiles, renderPage } from "./util.js";

export const CAPS = { libreoffice: true, ghostscript: true, tesseract: true, chrome: true, ocr_languages: ["eng"], translate_languages: {}, max_upload_mb: 500 };
const NEEDS = { libreoffice: "LibreOffice", ghostscript: "Ghostscript", tesseract: "Tesseract OCR" };
export const missingDep = (t) => (t.needs && !CAPS[t.needs] ? NEEDS[t.needs] : null);

const OCR_NAMES = { eng: "English", ben: "Bengali", hin: "Hindi", ara: "Arabic", fra: "French", deu: "German", spa: "Spanish", chi_sim: "Chinese (Simplified)", jpn: "Japanese", rus: "Russian", por: "Portuguese", ita: "Italian", urd: "Urdu", tur: "Turkish", kor: "Korean" };

export function renderOptions(schema, state, onChange) {
  const box = h("div", {});
  const rerender = () => { const n = renderOptions(schema, state, onChange); box.replaceWith(n); onChange && onChange(); };
  for (const f of schema) {
    if (!(f.key in state) && f.def !== undefined) state[f.key] = Array.isArray(f.def) ? [...f.def] : f.def;
    if (f.show && !f.show(state)) continue;
    const v = state[f.key];
    const fld = h("div", { class: "field" });
    const set = (val, re) => { state[f.key] = val; if (re) rerender(); else onChange && onChange(f.key); };
    if (f.type !== "check" && f.label) fld.append(h("label", {}, f.label));
    switch (f.type) {
      case "choice":
        fld.append(h("div", { class: "opts" + (f.row ? " row" : "") }, f.options.map((o) => h("button", { type: "button", class: "opt" + (String(v) === String(o.v) ? " on" : ""), onclick: () => set(o.v, true) },
          h("div", {}, h("b", {}, o.l), o.d ? h("small", {}, o.d) : null)))));
        break;
      case "select":
        fld.append(h("select", { class: "inp", onchange: (e) => { const o = f.options.find((x) => String(x[0]) === e.target.value); set(o ? o[0] : e.target.value, true); } },
          f.options.map(([val, l]) => h("option", { value: val, selected: String(val) === String(v) }, l))));
        break;
      case "number":
        fld.append(h("input", { class: "inp", type: "number", value: v, min: f.min, max: f.max, step: f.step || 1, oninput: (e) => set(e.target.value === "" ? f.def : +e.target.value) }));
        break;
      case "text": case "password":
        fld.append(h("input", { class: "inp", type: f.type, value: v ?? "", placeholder: f.placeholder || "", autocomplete: f.type === "password" ? "new-password" : "off", "data-key": f.key, oninput: (e) => set(e.target.value) }));
        break;
      case "textarea":
        fld.append(h("textarea", { class: "inp", placeholder: f.placeholder || "", oninput: (e) => set(e.target.value) }, v ?? ""));
        break;
      case "check":
        fld.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!v, onchange: (e) => set(e.target.checked, true) }), f.label));
        break;
      case "color":
        fld.append(h("div", { class: "colorrow" }, h("input", { type: "color", value: v, oninput: (e) => set(e.target.value) })));
        break;
      case "range": {
        const lab = h("span", { style: { fontWeight: 600, marginLeft: "8px" } }, f.fmt ? f.fmt(v) : v);
        fld.append(h("div", { class: "colorrow" }, h("input", { type: "range", min: f.min, max: f.max, step: f.step || 1, value: v, style: { flex: 1 }, oninput: (e) => { set(+e.target.value); lab.textContent = f.fmt ? f.fmt(+e.target.value) : e.target.value; } }), lab));
        break;
      }
      case "multi":
        fld.append(h("div", {}, f.options.map(([val, l]) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: (v || []).includes(val), onchange: (e) => { const a = new Set(state[f.key] || []); e.target.checked ? a.add(val) : a.delete(val); set([...a]); } }), l))));
        break;
      case "langs": {
        const langs = CAPS.ocr_languages || [];
        if (!langs.length) { fld.append(h("div", { class: "help" }, "No OCR languages installed.")); break; }
        state[f.key] = (state[f.key] || []).filter((l) => langs.includes(l));
        if (!state[f.key].length) state[f.key] = [langs.includes("eng") ? "eng" : langs[0]];
        fld.append(h("div", { style: { maxHeight: "180px", overflow: "auto", border: "1px solid var(--line)", borderRadius: "8px", padding: "4px 10px" } },
          langs.map((l) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: state[f.key].includes(l), onchange: (e) => {
            const a = new Set(state[f.key]); e.target.checked ? a.add(l) : a.delete(l);
            if (!a.size) { e.target.checked = true; return toast("Choose at least one language"); }
            set([...a]);
          } }), OCR_NAMES[l] || l))));
        fld.append(h("div", { class: "help" }, "More languages: install Tesseract language packs (see README)."));
        break;
      }
      case "lang": {
        const L = CAPS.translate_languages || {};
        fld.append(h("select", { class: "inp", onchange: (e) => set(e.target.value) }, f.auto ? h("option", { value: "auto", selected: v === "auto" }, "Detect language") : null,
          Object.entries(L).sort((a, b) => a[1].localeCompare(b[1])).map(([k, l]) => h("option", { value: k, selected: k === v }, l))));
        break;
      }
      case "pos9": case "pos6": {
        const rows = f.type === "pos9" ? ["t", "m", "b"] : ["t", "b"];
        const g = h("div", { class: "posgrid" });
        rows.forEach((r) => ["l", "c", "r"].forEach((c) => g.append(h("button", { type: "button", class: v === r + c ? "on" : "", title: { t: "Top", m: "Middle", b: "Bottom" }[r] + " " + { l: "left", c: "center", r: "right" }[c], onclick: () => set(r + c, true) }))));
        const wrap = h("div", { style: { display: "flex", gap: "18px", alignItems: "center" } }, g);
        if (f.mosaic) wrap.append(h("label", { class: "check" }, h("input", { type: "checkbox", checked: v === "mosaic", onchange: (e) => set(e.target.checked ? "mosaic" : "mc", true) }), "Mosaic"));
        fld.append(wrap);
        break;
      }
      case "imagefile": {
        state._files = state._files || {};
        const cur = state._files[f.key];
        fld.append(h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } },
          h("button", { type: "button", class: "btn", onclick: async () => { const [fl] = await pickFiles("image/*", false); if (fl) { state._files[f.key] = fl; state._preview = await readDataURL(fl); rerender(); } } }, cur ? "Change image" : "Add image"),
          cur ? h("img", { src: state._preview, style: { maxHeight: "48px", maxWidth: "120px", border: "1px solid var(--line)", borderRadius: "6px" } }) : h("span", { class: "help" }, "PNG or JPG")));
        break;
      }
    }
    if (f.help) fld.append(h("div", { class: "help" }, f.help));
    box.append(fld);
  }
  return box;
}

export function cleanOpts(state) { const o = {}; for (const [k, v] of Object.entries(state)) if (!k.startsWith("_")) o[k] = v; return o; }

export function parseRange(spec, n) {
  const out = new Set();
  spec = (spec || "").trim().toLowerCase();
  if (!spec) return out;
  if (spec === "all") { for (let i = 0; i < n; i++) out.add(i); return out; }
  if (spec === "odd" || spec === "even") { for (let i = spec === "odd" ? 0 : 1; i < n; i += 2) out.add(i); return out; }
  for (const part of spec.split(/[,;\s]+/)) {
    const m = /^(\d*)-(\d*)$/.exec(part);
    let a, b;
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; } else if (/^\d+$/.test(part)) a = b = +part; else continue;
    if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(n, b); i++) out.add(i - 1);
  }
  return out;
}
export function toRange(set) {
  const a = [...set].sort((x, y) => x - y); const parts = [];
  for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; parts.push(i === j ? `${a[i] + 1}` : `${a[i] + 1}-${a[j] + 1}`); i = j; }
  return parts.join(", ");
}

export function lazyThumbs(entry, holders, width, getRot) {
  const io = new IntersectionObserver((ents) => {
    for (const en of ents) if (en.isIntersecting) {
      io.unobserve(en.target);
      const i = +en.target.dataset.i;
      renderPage(entry.pdf, i + 1, width).then((c) => { if (getRot) c.style.transform = `rotate(${getRot(i)}deg)`; en.target.innerHTML = ""; en.target.append(c); }).catch(() => {});
    }
  }, { rootMargin: "400px" });
  holders.forEach((hd, i) => { hd.dataset.i = i; io.observe(hd); });
}
