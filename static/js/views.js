import { ic } from "./icons.js";
import { h, clamp, ext, uid, toast, modal, loadPdf, renderPage, runTool, download, b64ToBlob, readDataURL, pickFiles } from "./util.js";
import { TOOL, WORKFLOW_TOOLS, WORKFLOW_OPTS } from "./tools.js";
import { renderOptions, cleanOpts, parseRange, toRange, lazyThumbs } from "./forms.js";
import { PageEditor, createSignature, savedSignatures, deleteSignature } from "./editor.js";

const para = (text) => h("p", { style: { color: "var(--muted)", marginTop: 0, lineHeight: 1.5 } }, text);
const replaceFab = (tp) => h("div", { class: "add-fab" }, h("button", { class: "fab small", title: "Replace file", onclick: async () => tp.addFiles(await pickFiles(".pdf,application/pdf", false)) }, ic("swap",18,2)));

export const VIEWS = {
  files(tp, main, side) {
    const t = tp.t;
    const redraw = tp.fileCards(main, { sortable: t.sortable, rotatable: t.rotatable });
    if (t.rotatable) {
      const all = (d) => { tp.entries.forEach((e) => (e.rotate = d === 0 ? 0 : (e.rotate + d) % 360)); redraw(); tp.validateBtn(); };
      side.append(h("div", { class: "field" }, h("label", {}, "Rotation"), h("div", { class: "opts row" },
        h("button", { class: "opt", onclick: () => all(270) }, ic("rotl",16,2), " Left"), h("button", { class: "opt", onclick: () => all(90) }, ic("rotate",16,2), " Right"), h("button", { class: "opt", onclick: () => all(0) }, "Reset"))),
        h("div", { class: "help", style: { marginBottom: "14px" } }, "Hover a file to rotate it individually."));
    }
    if (t.options) tp.renderSideOptions(t.options);
    else if (!t.rotatable) side.append(para(t.note || "Click the button below to start."));
    if (t.id === "protect") side.append(h("div", { class: "help" }, "AES-256 encryption. Keep your password safe – it cannot be recovered."));
    if (t.id === "translate") side.append(h("div", { class: "help" }, "Text is sent to Google Translate (internet required). Layout, images and graphics are kept."));
    return {
      canRun: () => !t.rotatable || tp.entries.some((e) => e.rotate),
      collect: () => {
        const o = cleanOpts(tp.state);
        if (t.rotatable) {
          if (!tp.entries.some((e) => e.rotate)) throw new Error("Rotate at least one file first.");
          o.angle = 0; o.per_file = Object.fromEntries(tp.entries.map((e, i) => [i, e.rotate]));
        }
        if (t.id === "protect") { if (!o.password) throw new Error("Please type a password."); if (o.password !== o.confirm) throw new Error("Passwords do not match."); }
        if (t.id === "watermark" && o.type === "image" && !(tp.state._files || {}).wmimage) throw new Error("Please add a watermark image.");
        if (t.id === "watermark" && o.type === "text" && !String(o.text || "").trim()) throw new Error("Please type the watermark text.");
        if (t.id === "translate" && o.source === o.target) throw new Error("Choose a different target language.");
        return o;
      },
      extraFiles: () => (t.id === "watermark" && tp.state.type === "image" ? { image: (tp.state._files || {}).wmimage } : {}),
    };
  },

  scan(tp, main, side) {
    const v = VIEWS.files(tp, main, side);
    main.append(tp.scanQR());
    return { ...v, collect: () => ({ ...cleanOpts(tp.state), scan: true, merge: true }) };
  },

  pages(tp, main, side) {
    const e = tp.entries[0], t = tp.t, n = e.pages;
    const removeStyle = t.selectStyle === "remove";
    const grid = h("div", { class: "pgrid" });
    const sel = new Set(), cards = [];
    const update = () => { cards.forEach((c, i) => c.classList.toggle(removeStyle ? "remove" : "sel", sel.has(i))); tp.validateBtn(); };
    const hint = h("p", { style: { textAlign: "center", color: "var(--muted)", marginTop: 0 } }, `${e.file.name} · ${n} page${n > 1 ? "s" : ""} · click pages to select`);
    main.append(replaceFab(tp), hint, grid);
    let drawSide;
    for (let i = 0; i < n; i++) {
      const c = h("div", { class: "pcard", onclick: () => {
        if (t.id === "split" && tp.state.mode !== "extract") { tp.state.mode = "extract"; drawSide(); }
        sel.has(i) ? sel.delete(i) : sel.add(i);
        tp.state.pages = toRange(sel);
        const inp = side.querySelector('input[data-key="pages"]'); if (inp) inp.value = tp.state.pages;
        update();
      } }, h("div", { class: "pth" }), h("div", { class: "pn" }, i + 1));
      cards.push(c); grid.append(c);
    }
    lazyThumbs(e, cards.map((c) => c.firstChild), 128);
    drawSide = tp.renderSideOptions(t.options, side, (k) => { if (k === "pages") { sel.clear(); parseRange(tp.state.pages, n).forEach((i) => sel.add(i)); update(); } });
    if (t.id === "split") side.append(h("div", { class: "help" }, "Example: “1-3, 4-6” creates two PDFs. Several files are downloaded as a ZIP."));
    return {
      canRun: () => {
        if (t.id === "split" && tp.state.mode === "ranges") return !!String(tp.state.ranges || "").trim();
        if (t.id === "split" && tp.state.mode !== "extract") return true;
        return sel.size > 0 && !(removeStyle && sel.size >= n);
      },
      collect: () => { if (removeStyle && sel.size >= n) throw new Error("You can't remove all pages."); return cleanOpts(tp.state); },
    };
  },

  organize(tp, main, side) {
    let layout = [];
    const rebuild = () => {
      const known = new Set(layout.filter((p) => !p.blank).map((p) => p.e.id));
      tp.entries.forEach((e) => { if (!known.has(e.id)) for (let i = 0; i < e.pages; i++) layout.push({ e, page: i, rotate: 0 }); });
      layout = layout.filter((p) => p.blank || tp.entries.includes(p.e));
    };
    rebuild();
    const grid = h("div", { class: "pgrid" });
    const thumbCache = new Map();
    let drag = null;
    const thumb = (p) => {
      const key = p.e.id + ":" + p.page;
      if (!thumbCache.has(key)) thumbCache.set(key, renderPage(p.e.pdf, p.page + 1, 128).then((c) => c.toDataURL("image/jpeg", 0.85)));
      return thumbCache.get(key);
    };
    const draw = () => {
      grid.innerHTML = "";
      layout.forEach((p, idx) => {
        const holder = h("div", { class: "pth" });
        const card = h("div", { class: "pcard" + (p.blank ? " blank" : ""), draggable: "true" },
          h("div", { class: "acts" },
            h("button", { class: "iconbtn", title: "Rotate", onclick: (ev) => { ev.stopPropagation(); p.rotate = (p.rotate + 90) % 360; const x = holder.firstChild; if (x) x.style.transform = `rotate(${p.rotate}deg)`; } }, ic("rotate",16,2)),
            h("button", { class: "iconbtn", title: "Delete page", onclick: (ev) => { ev.stopPropagation(); layout.splice(idx, 1); draw(); } }, ic("x",14,2.2)),
            h("button", { class: "iconbtn", title: "Insert blank page after", onclick: (ev) => { ev.stopPropagation(); layout.splice(idx + 1, 0, { blank: true, rotate: 0 }); draw(); } }, "+")),
          holder, h("div", { class: "pn" }, p.blank ? "Blank page" : `${tp.entries.length > 1 ? String.fromCharCode(65 + tp.entries.indexOf(p.e)) + " · " : ""}${p.page + 1}`));
        card.addEventListener("dragstart", (ev) => { drag = idx; ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(idx)); card.style.opacity = ".4"; });
        card.addEventListener("dragend", () => { card.style.opacity = ""; drag = null; });
        card.addEventListener("dragover", (ev) => { if (drag !== null) { ev.preventDefault(); card.style.borderColor = "var(--olive)"; } });
        card.addEventListener("dragleave", () => { card.style.borderColor = ""; });
        card.addEventListener("drop", (ev) => { ev.preventDefault(); ev.stopPropagation(); card.style.borderColor = ""; if (drag === null || drag === idx) return; const [m] = layout.splice(drag, 1); layout.splice(idx, 0, m); drag = null; draw(); });
        grid.append(card);
        if (p.blank) holder.append(h("div", { style: { transform: `rotate(${p.rotate}deg)` } }));
        else thumb(p).then((src) => { holder.innerHTML = ""; holder.append(h("img", { src, draggable: false, style: { maxWidth: "128px", maxHeight: "165px", boxShadow: "0 1px 4px rgba(0,0,0,.2)", transform: `rotate(${p.rotate}deg)`, transition: "transform .2s" } })); }).catch(() => {});
      });
      tp.validateBtn();
    };
    const addPdf = async () => {
      const files = (await pickFiles(".pdf,application/pdf", true)).filter((f) => ext(f.name) === "pdf");
      for (const f of files) {
        const e = { id: uid(), file: f, rotate: 0 };
        try { await loadPdf(e); tp.entries.push(e); } catch (err) { if (err.message !== "password-cancelled") toast(`“${f.name}” could not be opened.`, true); }
      }
      rebuild(); draw();
    };
    main.append(h("div", { class: "add-fab" }, h("button", { class: "fab", title: "Add pages from another PDF", onclick: addPdf }, "+"),
      h("button", { class: "fab small", title: "Add blank page at the end", onclick: () => { layout.push({ blank: true, rotate: 0 }); draw(); } }, ic("blank",16,2))),
      h("p", { style: { textAlign: "center", color: "var(--muted)", marginTop: 0 } }, "Drag pages to reorder. Hover a page to rotate, delete or insert a blank page."), grid);
    side.append(para("Use + to add pages from other PDFs, or the page button to add a blank page."),
      h("button", { class: "btn", style: { width: "100%" }, onclick: () => { layout = []; rebuild(); draw(); } }, ic("rotl",16,2), " Reset all changes"));
    draw();
    return {
      canRun: () => layout.length > 0,
      collect: () => {
        if (!layout.length) throw new Error("The document must contain at least one page.");
        return { pages: layout.map((p) => (p.blank ? { blank: true, rotate: p.rotate } : { file: tp.entries.indexOf(p.e), page: p.page, rotate: p.rotate })) };
      },
    };
  },

  editor(tp, main, side) {
    const sign = tp.t.signMode;
    const e = tp.entries[0];
    const propsBox = h("div", {});
    const help = h("div", { class: "help", style: { marginBottom: "14px", fontSize: "13px", color: "var(--olive-d)" } });
    let ed;
    const placeImage = async () => {
      const [f] = await pickFiles("image/png,image/jpeg,image/gif,image/webp,image/bmp", false);
      if (!f) return;
      const src = await readDataURL(f);
      const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
      if (!img) return toast("Unsupported image", true);
      let data = src;
      if (!/^data:image\/(png|jpe?g)/.test(src)) { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0); data = c.toDataURL("image/png"); }
      ed.setMode("place", { item: { type: "image", src: data, opacity: 1 }, ratio: img.width / img.height, w: 0.3 });
      help.textContent = "Click on the page where you want to place the image.";
    };
    const placeSig = (sig) => { ed.setMode("place", { item: { type: "signature", src: sig.src, opacity: 1 }, ratio: sig.ratio, w: sig.kind === "initials" ? 0.12 : 0.25 }); help.textContent = "Click on the page where you want to place it."; };
    const savedBox = h("div", {});
    const drawSaved = () => {
      savedBox.innerHTML = "";
      const list = savedSignatures();
      if (!list.length) return;
      savedBox.append(h("div", { class: "lbl", style: { fontWeight: 700 } }, "Your saved signatures"),
        h("div", { class: "saved-sigs" }, list.map((s, i) => h("div", { class: "sg", title: "Click, then click on the page", onclick: () => placeSig(s) }, h("img", { src: s.src }),
          h("button", { class: "x", title: "Delete", onclick: (ev) => { ev.stopPropagation(); deleteSignature(i); drawSaved(); } }, ic("x",14,2.2))))),
        h("div", { class: "help", style: { marginBottom: "14px" } }, "Stored only in this browser."));
    };
    const newSig = async (kind) => { const s = await createSignature(kind); if (s) { placeSig(s); drawSaved(); } };
    const tools = sign ? [
      { id: "sig", label: "Signature", icon: "sign", action: () => newSig("signature") },
      { id: "ini", label: "Initials", icon: "AB", action: () => newSig("initials") },
      { id: "date", label: "Date", icon: "hash", action: () => { ed.setMode("place", { item: { type: "text", text: new Date().toLocaleDateString(), size: 12, color: "#000000", font: "sans", align: "left" }, w: 0.2, h: 0.025 }); help.textContent = "Click where the date should go."; } },
      { id: "text", label: "Text", icon: "text" },
      { id: "image", label: "Image", icon: "image", action: placeImage },
    ] : [
      { id: "text", label: "Text", icon: "text" }, { id: "image", label: "Image", icon: "image", action: placeImage },
      { id: "rect", label: "Rectangle", icon: "rect" }, { id: "ellipse", label: "Ellipse", icon: "ellipse" }, { id: "line", label: "Line", icon: "line" }, { id: "arrow", label: "Arrow", icon: "arrow" },
      { id: "draw", label: "Draw", icon: "pen" }, { id: "highlight", label: "Highlight", icon: "highlight" }, { id: "whiteout", label: "Whiteout", icon: "whiteout" },
      { id: "sig", label: "Sign", icon: "sign", action: () => newSig("signature") },
    ];
    const HELP = { text: "Click on the page to add text.", rect: "Drag on the page to draw a rectangle.", ellipse: "Drag on the page to draw an ellipse.", line: "Drag to draw a line.", arrow: "Drag to draw an arrow.", draw: "Draw freely on the page. Press Esc or choose Select to stop.", highlight: "Drag over text to highlight it.", whiteout: "Drag over content to cover it with white." };
    ed = new PageEditor(e, {
      tools, stickyTools: ["draw"],
      labels: { text: "Text", image: "Image", signature: "Signature", rect: "Rectangle", ellipse: "Ellipse", line: "Line", arrow: "Arrow", draw: "Drawing", highlight: "Highlight", whiteout: "Whiteout" },
      defaultSize: (it) => (it.type === "highlight" ? { w: 0.3, h: 0.02 } : { w: 0.2, h: 0.08 }),
      boxItem: (m, st) => (m === "highlight" ? { type: "highlight", fill: "#8B9A6E", opacity: 0.35 } : m === "whiteout" ? { type: "whiteout" } : { type: m, stroke: st.stroke || "#8B9A6E", fill: st.fill || "", width: st.width || 2, opacity: st.opacity ?? 1 }),
      onSelect: (it) => { propsBox.innerHTML = ""; propsBox.append(ed.props(it)); },
      onMode: (m) => { if (m !== "place") help.textContent = HELP[m] || ""; },
      onChange: () => tp.validateBtn(),
    });
    main.append(replaceFab(tp));
    ed.mount(main).catch((err) => toast("Could not display PDF: " + err.message, true));
    if (sign) { side.append(para("Create your signature, then click on the document to place it. Drag to move it, use the corner handle to resize."), savedBox); drawSaved(); }
    else side.append(para("Pick a tool above the document. Select an element to change its style, drag to move, use the corner handle to resize. The Delete key removes it."));
    side.append(help, propsBox);
    const valid = () => ed.items.filter((it) => it.type !== "text" || (it.text || "").trim());
    return {
      canRun: () => valid().length > 0,
      collect: () => ({ items: ed.serialize().filter((it) => it.type !== "text" || (it.text || "").trim()), mode: sign ? "sign" : "edit" }),
    };
  },

  redact(tp, main, side) {
    const ed = new PageEditor(tp.entries[0], {
      tools: [{ id: "area", label: "Mark area", icon: "redact" }], stickyTools: ["area"],
      boxItem: () => ({ type: "area" }),
      renderItem: (it, el) => { el.classList.add("redbox"); return true; },
      defaultSize: () => ({ w: 0.2, h: 0.03 }),
      onChange: () => tp.validateBtn(), onSelect: () => {},
    });
    main.append(replaceFab(tp), h("p", { style: { textAlign: "center", color: "var(--muted)", marginTop: 0 } }, "Drag over content to mark it for redaction, or search for words in the sidebar."));
    ed.mount(main).then(() => ed.setMode("area"));
    tp.renderSideOptions(tp.t.options, side);
    side.append(h("div", { class: "help" }, "Redaction is permanent: text, images and graphics under the marks are removed, not just covered."));
    return {
      canRun: () => true,
      collect: () => {
        const o = cleanOpts(tp.state);
        o.areas = ed.items.map((it) => ({ page: it.page, file: 0, x0: it.x, y0: it.y, x1: it.x + it.w, y1: it.y + it.h }));
        if (!o.areas.length && !String(o.terms || "").trim() && !(o.patterns || []).length) throw new Error("Mark an area, type a word or choose a pattern to redact.");
        return o;
      },
    };
  },

  forms(tp, main, side) {
    const e = tp.entries[0];
    const values = {};
    const propsBox = h("div", {});
    const status = h("div", { class: "help", style: { marginBottom: "12px", fontSize: "13px" } }, "Detecting form fields…");
    const labels = { text: "Text field", multiline: "Text area", checkbox: "Checkbox", dropdown: "Dropdown", listbox: "List box" };
    let flatten = false;
    const ed = new PageEditor(e, {
      tools: Object.entries(labels).map(([id, label]) => ({ id: "f_" + id, label, icon: { text: "rect", multiline: "lines", checkbox: "checkbox", dropdown: "caret", listbox: "list" }[id] })),
      boxItem: (m) => ({ type: "field", ftype: m.slice(2), name: "", options: m === "f_dropdown" || m === "f_listbox" ? ["Option 1", "Option 2"] : undefined }),
      defaultSize: (it) => (it.ftype === "checkbox" ? { w: 0.025, h: 0.018 } : it.ftype === "multiline" ? { w: 0.4, h: 0.08 } : { w: 0.3, h: 0.028 }),
      renderItem: (it, el) => {
        if (it.type === "fill") {
          el.classList.add("fill");
          if (!el.querySelector("input,select,textarea,div")) {
            const f = it.f;
            const setv = (v) => { values[f.id] = v; tp.validateBtn(); };
            let inp;
            if (f.type === "checkbox" || f.type === "radio") inp = h("input", { type: "checkbox", checked: !!f.value, onchange: (ev) => setv(ev.target.checked) });
            else if (f.type === "dropdown" || f.type === "listbox") inp = h("select", { onchange: (ev) => setv(ev.target.value) }, f.options.map((o) => h("option", { value: o, selected: o === f.value }, o)));
            else if (f.type === "text" && f.multiline) inp = h("textarea", { oninput: (ev) => setv(ev.target.value) }, f.value);
            else if (f.type === "text") inp = h("input", { type: "text", value: f.value, oninput: (ev) => setv(ev.target.value) });
            else inp = h("div", { style: { border: "1px dashed var(--olive)", width: "100%", height: "100%", fontSize: "10px", color: "var(--muted)" } }, f.type);
            if (f.readonly && inp.tagName !== "DIV") inp.disabled = true;
            inp.title = f.label || f.name;
            inp.addEventListener("pointerdown", (ev) => ev.stopPropagation());
            el.append(inp);
          }
          return true;
        }
        el.classList.add("field-new");
        let lab = el.querySelector(".flab");
        if (!lab) { lab = h("span", { class: "flab" }); el.prepend(lab); }
        lab.textContent = labels[it.ftype] + (it.name ? `: ${it.name}` : "");
        return true;
      },
      extraProps: (it, box) => {
        if (it.type !== "field") return;
        box.innerHTML = "";
        box.append(h("div", { class: "lbl", style: { fontWeight: 700, marginBottom: "10px" } }, "Selected: " + labels[it.ftype]),
          h("div", { class: "field" }, h("label", {}, "Field name"), h("input", { class: "inp", value: it.name || "", placeholder: "e.g. full_name", oninput: (ev) => { it.name = ev.target.value; ed.draw(it); } })),
          ["dropdown", "listbox"].includes(it.ftype) ? h("div", { class: "field" }, h("label", {}, "Options (one per line)"), h("textarea", { class: "inp", oninput: (ev) => { it.options = ev.target.value.split("\n").map((s) => s.trim()).filter(Boolean); } }, (it.options || []).join("\n"))) : null,
          ["text", "multiline"].includes(it.ftype) ? h("div", { class: "field" }, h("label", {}, "Default value"), h("input", { class: "inp", value: it.value || "", oninput: (ev) => { it.value = ev.target.value; } })) : null,
          h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!it.required, onchange: (ev) => { it.required = ev.target.checked; } }), "Required"),
          h("button", { class: "btn", style: { width: "100%", marginTop: "6px" }, onclick: () => ed.remove(it) }, ic("trash",16,2), " Delete field"));
      },
      onSelect: (it) => { propsBox.innerHTML = ""; if (it && it.type === "field") propsBox.append(ed.props(it)); },
      onChange: () => tp.validateBtn(),
    });
    main.append(replaceFab(tp));
    side.append(status, h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (ev) => (flatten = ev.target.checked) }), "Flatten form (fields become regular, non-editable content)"),
      h("hr", { style: { border: 0, borderTop: "1px solid var(--line)", margin: "14px 0" } }), propsBox);
    ed.mount(main).then(async () => {
      try {
        const { fields, detected } = (await runTool("form-fields", [e], {})).json;
        fields.forEach((f) => ed.add({ type: "fill", page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, f, fixed: true, noResize: true }));
        (detected || []).forEach((d) => ed.add({ type: "field", ftype: d.type, page: d.page, x: d.x, y: d.y, w: d.w, h: d.h, name: "" }));
        status.textContent = (fields.length ? `${fields.length} fillable field(s) found – fill them in directly on the document. ` : "No fillable fields in this PDF. ")
          + (detected && detected.length ? `${detected.length} field(s) detected automatically (blue boxes) – adjust or delete them. ` : "")
          + "Use the toolbar to add new fields.";
      } catch (err) { status.textContent = "Could not read form fields: " + err.message; }
    });
    return {
      canRun: () => Object.keys(values).length > 0 || ed.items.some((it) => it.type === "field"),
      collect: () => ({
        values, flatten,
        new_fields: ed.items.filter((it) => it.type === "field").map((it) => ({ page: it.page, type: it.ftype, x: it.x, y: it.y, w: it.w, h: it.h, name: it.name, options: it.options, value: it.value, required: it.required })),
      }),
    };
  },

  crop(tp, main, side) {
    const e = tp.entries[0];
    let page = 0;
    const box = { x0: 0.08, y0: 0.08, x1: 0.92, y1: 0.92 };
    const stage = h("div", { style: { position: "relative", display: "inline-block", boxShadow: "0 2px 12px rgba(0,0,0,.2)", touchAction: "none" } });
    const pager = h("div", { class: "pager" });
    const crop = h("div", { class: "cropbox" }, ["nw", "ne", "sw", "se"].map((c) => h("i", { class: c, "data-c": c })));
    const drawBox = () => Object.assign(crop.style, { left: box.x0 * 100 + "%", top: box.y0 * 100 + "%", width: (box.x1 - box.x0) * 100 + "%", height: (box.y1 - box.y0) * 100 + "%" });
    crop.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const r = stage.getBoundingClientRect(), corner = ev.target.dataset.c, sx = ev.clientX, sy = ev.clientY, o = { ...box };
      const mv = (m) => {
        const dx = (m.clientX - sx) / r.width, dy = (m.clientY - sy) / r.height;
        if (!corner) { const w = o.x1 - o.x0, hh = o.y1 - o.y0; box.x0 = clamp(o.x0 + dx, 0, 1 - w); box.y0 = clamp(o.y0 + dy, 0, 1 - hh); box.x1 = box.x0 + w; box.y1 = box.y0 + hh; }
        else {
          if (corner.includes("w")) box.x0 = clamp(o.x0 + dx, 0, box.x1 - 0.03);
          if (corner.includes("e")) box.x1 = clamp(o.x1 + dx, box.x0 + 0.03, 1);
          if (corner.includes("n")) box.y0 = clamp(o.y0 + dy, 0, box.y1 - 0.03);
          if (corner.includes("s")) box.y1 = clamp(o.y1 + dy, box.y0 + 0.03, 1);
        }
        drawBox();
      };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    });
    const show = async () => {
      pager.innerHTML = "";
      pager.append(h("button", { class: "tbtn", disabled: page === 0, onclick: () => { page--; show(); } }, "‹ Prev"), `Page ${page + 1} / ${e.pages}`, h("button", { class: "tbtn", disabled: page >= e.pages - 1, onclick: () => { page++; show(); } }, "Next ›"));
      const pg = await e.pdf.getPage(page + 1);
      const vp = pg.getViewport({ scale: 1 });
      const maxW = Math.max(280, Math.min(700, main.clientWidth - 60)), maxH = Math.max(320, window.innerHeight - 220);
      const w = Math.min(maxW, (maxH * vp.width) / vp.height);
      const c = await renderPage(e.pdf, page + 1, w);
      stage.innerHTML = ""; stage.append(c, crop); drawBox();
    };
    main.append(pager, h("div", { style: { textAlign: "center" } }, stage));
    show();
    const opts = [
      { key: "mode", type: "choice", label: "Crop mode", def: "box", options: [{ v: "box", l: "Select area", d: "Drag the red box on the page" }, { v: "margins", l: "Crop margins", d: "Enter margins in points (72 pt = 1 inch)" }] },
      { key: "apply", type: "choice", label: "Apply to", def: "all", row: true, options: [{ v: "all", l: "All pages" }, { v: "current", l: "Current page" }], show: (o) => o.mode === "box" },
      { key: "top", type: "number", label: "Top", min: 0, def: 0, show: (o) => o.mode === "margins" }, { key: "bottom", type: "number", label: "Bottom", min: 0, def: 0, show: (o) => o.mode === "margins" },
      { key: "left", type: "number", label: "Left", min: 0, def: 0, show: (o) => o.mode === "margins" }, { key: "right", type: "number", label: "Right", min: 0, def: 0, show: (o) => o.mode === "margins" },
      { key: "pages", type: "text", label: "Pages", def: "", placeholder: "All pages (e.g. 1-3, 5)", show: (o) => o.mode === "margins" || o.apply === "all" },
    ];
    tp.renderSideOptions(opts, side, () => { crop.style.display = tp.state.mode === "box" ? "" : "none"; });
    side.append(h("button", { class: "btn", style: { width: "100%" }, onclick: () => { Object.assign(box, { x0: 0.08, y0: 0.08, x1: 0.92, y1: 0.92 }); drawBox(); } }, "Reset crop area"));
    return {
      collect: () => {
        const o = cleanOpts(tp.state);
        if (o.mode === "box") { o.box = { ...box }; o.page = page; if (box.x0 < 0.001 && box.y0 < 0.001 && box.x1 > 0.999 && box.y1 > 0.999) throw new Error("Drag the red box to choose the crop area first."); }
        else if (!(o.top || o.bottom || o.left || o.right)) throw new Error("Enter at least one margin.");
        return o;
      },
    };
  },

  compare(tp, main, side) {
    tp.fileCards(main, {});
    side.append(para("Select two versions of a document. Removed words are shown in red, added words in green."),
      h("p", { class: "help" }, "The first file is the original, the second is the new version."));
    if (tp.entries.length === 2) side.append(h("button", { class: "btn", style: { width: "100%" }, onclick: () => { tp.entries.reverse(); tp.showWorkspace(); } }, ic("swap",16,2), " Swap order"));
    else side.append(h("div", { class: "warn", style: { margin: 0 } }, "Add one more PDF with the + button."));
    return { canRun: () => tp.entries.length === 2, collect: () => ({}) };
  },

  workflow(tp, main, side) {
    tp.fileCards(main, {});
    const KEY = "pdftk_workflows";
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
    const store = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { toast("Could not save in browser storage", true); } };
    tp.steps = tp.steps || [];
    const box = h("div", {});
    const draw = () => {
      box.innerHTML = "";
      const saved = load();
      if (saved.length) box.append(h("div", { class: "field" }, h("label", {}, "Saved workflows"), h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        saved.map((w, i) => h("div", { style: { display: "flex", gap: "6px" } },
          h("button", { class: "btn", style: { flex: 1, textAlign: "left" }, onclick: () => { tp.steps = JSON.parse(JSON.stringify(w.steps)); draw(); toast(`Loaded “${w.name}”`); } }, ic("play",16,2), " " + w.name),
          h("button", { class: "btn", title: "Delete", onclick: () => { const l = load(); l.splice(i, 1); store(l); draw(); } }, ic("trash",16,2)))))));
      const steps = h("div", { class: "steps" });
      tp.steps.forEach((s, i) => {
        const schema = WORKFLOW_OPTS[s.tool] || TOOL[s.tool].options || [];
        steps.append(h("div", { class: "step" }, h("div", { class: "sh" }, h("span", { class: "n" }, i + 1), TOOL[s.tool].title, h("span", { style: { flex: 1 } }),
          i > 0 ? h("button", { class: "tbtn", title: "Move up", onclick: () => { [tp.steps[i - 1], tp.steps[i]] = [tp.steps[i], tp.steps[i - 1]]; draw(); } }, ic("up",16,2)) : null,
          h("button", { class: "tbtn", title: "Remove", onclick: () => { tp.steps.splice(i, 1); draw(); } }, ic("x",14,2.2))),
          schema.length ? h("div", { class: "sb" }, renderOptions(schema, s.options, () => tp.validateBtn())) : null));
      });
      box.append(h("div", { class: "field" }, h("label", {}, "Steps"), tp.steps.length ? steps : h("div", { class: "help" }, "Add tools below. They run in order on every selected file.")));
      const sel = h("select", { class: "inp" }, h("option", { value: "" }, "+ Add a tool…"), WORKFLOW_TOOLS.map((id) => h("option", { value: id }, TOOL[id].title)));
      sel.onchange = () => {
        if (!sel.value) return;
        if (tp.steps.some((s) => s.tool === "protect")) { toast("Protect PDF must be the last step.", true); sel.value = ""; return; }
        tp.steps.push({ tool: sel.value, options: {} }); draw();
      };
      box.append(h("div", { class: "field" }, sel));
      if (tp.steps.length) box.append(h("button", { class: "btn", style: { width: "100%" }, onclick: async () => {
        const inp = h("input", { class: "inp", placeholder: "Workflow name" });
        const name = await modal("Save workflow", inp, [{ label: "Cancel", value: null }, { label: "Save", primary: true, value: () => inp.value.trim() || "My workflow" }]);
        if (!name) return;
        const l = load(); l.push({ name, steps: JSON.parse(JSON.stringify(tp.steps)) }); store(l); toast("Workflow saved"); draw();
      } }, ic("save",16,2), " Save this workflow"));
      tp.validateBtn();
    };
    side.append(box); draw();
    return {
      canRun: () => tp.steps.length > 0,
      collect: () => {
        if (!tp.steps.length) throw new Error("Add at least one step.");
        if (tp.steps.some((s) => s.tool === "protect" && !s.options.password)) throw new Error("Protect step: please enter a password.");
        if (tp.steps.some((s) => s.tool === "watermark" && !String(s.options.text || "").trim())) throw new Error("Watermark step: please enter the text.");
        return { steps: tp.steps.map((s) => ({ tool: s.tool, options: cleanOpts(s.options) })) };
      },
    };
  },
};

export const RESULTS = {
  compare(tp, j, box, backBtn, again) {
    box.style.maxWidth = "1200px";
    box.append(h("h2", {}, "Comparison result"),
      h("div", { class: "infobox" }, h("div", { class: "stat-big", style: { color: "var(--olive-d)" } }, j.changes ? `${j.changes} change${j.changes > 1 ? "s" : ""} found` : "The texts are identical"),
        `Similarity ${j.similarity}% · ${j.deleted_words} word(s) removed · ${j.inserted_words} word(s) added`),
      h("div", { class: "dl-row" }, backBtn, h("button", { class: "btn-big", onclick: () => download(b64ToBlob(j.report, "application/pdf"), j.report_name) }, ic("down",16,2), " Download side-by-side report"), again));
    const A = h("div", {}), B = h("div", {});
    let shown = 0;
    for (const o of j.ops) {
      if (shown > 80000) { A.append("…"); B.append("…"); break; }
      if (o.op === "equal") { const t = o.a.length > 400 ? o.a.slice(0, 180) + " … " + o.a.slice(-180) : o.a; A.append(t + " "); B.append(t + " "); }
      else { if (o.a) A.append(h("del", {}, o.a), " "); if (o.b) B.append(h("ins", {}, o.b), " "); }
      shown += o.a.length + o.b.length;
    }
    box.append(h("div", { class: "result-panel" }, h("div", { class: "diffcols" },
      h("div", {}, h("b", { style: { display: "block", marginBottom: "8px", color: "var(--olive-d)" } }, tp.entries[0].file.name), A),
      h("div", {}, h("b", { style: { display: "block", marginBottom: "8px", color: "var(--olive)" } }, tp.entries[1].file.name), B))));
  },
  summarize(tp, j, box, backBtn, again) {
    box.style.maxWidth = "900px";
    box.append(h("h2", {}, "Summary"), h("div", { class: "dl-row" }, backBtn,
      h("button", { class: "btn-big", onclick: () => download(b64ToBlob(j.download, "text/plain;charset=utf-8"), j.download_name) }, ic("down",16,2), " Download summary"),
      h("button", { class: "btn", onclick: () => navigator.clipboard.writeText(j.summary).then(() => toast("Copied!"), () => toast("Copy not allowed", true)) }, ic("copy",16,2), " Copy"), again),
      h("div", { class: "result-panel" },
        h("p", { style: { color: "var(--muted)", marginTop: 0 } }, `${j.stats.words} words → ${j.stats.summary_words} words`),
        h("h3", {}, "Key points"), h("ul", { style: { lineHeight: 1.6 } }, j.points.map((p) => h("li", {}, p))),
        h("h3", {}, "Summary"), h("p", { style: { lineHeight: 1.7 } }, j.summary),
        h("h3", {}, "Keywords"), h("div", {}, j.keywords.map((k) => h("span", { class: "kw" }, k)))));
  },
};
