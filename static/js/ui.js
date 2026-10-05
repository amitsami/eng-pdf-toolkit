// Command palette (Ctrl/Cmd+K) and drop-anywhere smart suggestions
import { h, toast } from "./util.js";
import { ic } from "./icons.js";
import { TOOLS, TOOL } from "./tools.js";
import { ticon, recents } from "./home.js";
import { openSettings, toggleTheme, setTheme } from "./settings.js";

let palOpen = null;
export function openPalette() {
  if (palOpen) return palOpen();
  const input = h("input", { placeholder: "Search tools or type a command…", autocomplete: "off", spellcheck: "false" });
  const listEl = h("div", { class: "pl" });
  const cmds = [
    { label: "Toggle dark / light mode", sub: "Appearance", icon: "moon", run: (e) => toggleTheme(e) },
    { label: "Light mode", sub: "Appearance", icon: "sun", run: (e) => setTheme("light", e) },
    { label: "Dark mode", sub: "Appearance", icon: "moon", run: (e) => setTheme("dark", e) },
    { label: "Open settings", sub: "Preferences", icon: "gear", run: () => openSettings() },
    { label: "Go home", sub: "Navigation", icon: "home", run: () => { location.hash = "#/"; } },
    { label: "Browse all tools", sub: "Navigation", icon: "grid", run: () => { location.hash = "#/?cat=all"; } },
  ];
  let sel = 0, items = [];
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const rec = recents();
    let tools = TOOLS.filter((t) => !q || (t.title + " " + t.desc + " " + t.cat).toLowerCase().includes(q));
    if (!q) tools = [...rec.map((id) => TOOL[id]), ...tools.filter((t) => !rec.includes(t.id))];
    const cs = cmds.filter((c) => !q || (c.label + " " + c.sub).toLowerCase().includes(q));
    items = [...tools.map((t) => ({ t, run: () => { location.hash = `#/${t.id}`; } })), ...cs];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    listEl.innerHTML = "";
    if (tools.length) listEl.append(h("div", { class: "ph" }, q ? "Tools" : rec.length ? "Recent & all tools" : "Tools"));
    items.forEach((it, i) => {
      if (i === tools.length && cs.length) listEl.append(h("div", { class: "ph" }, "Commands"));
      const row = h("div", { class: "po" + (i === sel ? " on" : ""), onmouseenter: () => { sel = i; mark(); }, onclick: (e) => choose(i, e) },
        it.t ? ticon(it.t, 18) : h("div", { class: "ticon v3" }, ic(it.icon, 18, 1.8)),
        h("div", {}, h("b", {}, it.t ? it.t.title : it.label), h("small", {}, it.t ? it.t.desc : it.sub)));
      listEl.append(row);
    });
    if (!items.length) listEl.append(h("p", { style: { textAlign: "center", color: "var(--muted)", padding: "20px" } }, "Nothing found"));
  };
  const rows = () => [...listEl.querySelectorAll(".po")];
  const mark = () => rows().forEach((r, i) => r.classList.toggle("on", i === sel));
  const choose = (i, e) => { const it = items[i]; if (!it) return; close(); it.run(e); };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); rows()[sel]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); rows()[sel]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
    else if (e.key === "Escape") close();
  });
  const scrim = h("div", { class: "scrim" });
  const wrap = h("div", { class: "palette-wrap", onmousedown: (e) => { if (e.target === wrap) close(); } },
    h("div", { class: "palette" }, h("div", { class: "pi" }, ic("search", 20, 2), input, h("kbd", {}, "Esc")), listEl));
  document.body.append(scrim, wrap);
  requestAnimationFrame(() => scrim.classList.add("on"));
  draw(); setTimeout(() => input.focus(), 20);
  function close() { scrim.classList.remove("on"); wrap.remove(); setTimeout(() => scrim.remove(), 500); palOpen = null; }
  palOpen = close;
}

/* drop files anywhere on the home page -> suggest matching tools */
export function initDropAnywhere(onPick) {
  const ov = h("div", { class: "drop-overlay" }, ic("upload", 46, 1.6), "Drop to choose a tool", h("small", { style: { fontSize: "14px", fontWeight: 500, color: "var(--muted)" } }, "We'll suggest tools that fit your files"));
  document.body.append(ov);
  let depth = 0;
  const isHome = () => !/^#\/[a-z]/.test(location.hash);
  addEventListener("dragenter", (e) => { if (!isHome() || !e.dataTransfer?.types?.includes("Files")) return; depth++; ov.classList.add("on"); });
  addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; ov.classList.remove("on"); } });
  addEventListener("dragover", (e) => { if (isHome() && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  addEventListener("drop", (e) => {
    if (!isHome() || !e.dataTransfer?.files?.length) return;
    e.preventDefault(); depth = 0; ov.classList.remove("on");
    const files = [...e.dataTransfer.files];
    const fits = TOOLS.filter((t) => t.id !== "html-to-pdf" && files.every((f) => accepts(t, f)) && (!t.max || files.length <= t.max));
    if (!fits.length) return toast("No tool accepts these files.", true);
    const scrim = h("div", { class: "scrim" });
    const wrap = h("div", { class: "palette-wrap", onmousedown: (ev) => { if (ev.target === wrap) close(); } },
      h("div", { class: "palette" }, h("div", { class: "pi" }, ic("upload", 20, 2), h("b", { style: { flex: 1 } }, `${files.length} file${files.length > 1 ? "s" : ""} ready — pick a tool`), h("kbd", {}, "Esc")),
        h("div", { class: "pl" }, fits.map((t) => h("div", { class: "po", onclick: () => { close(); onPick(t.id, files); } }, ticon(t, 18), h("div", {}, h("b", {}, t.title), h("small", {}, t.desc)))))));
    const onKey = (ev) => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    document.body.append(scrim, wrap); requestAnimationFrame(() => scrim.classList.add("on"));
    function close() { scrim.classList.remove("on"); wrap.remove(); document.removeEventListener("keydown", onKey); setTimeout(() => scrim.remove(), 500); }
  });
}
export function accepts(t, f) {
  const acc = t.accept.split(",").map((s) => s.trim().toLowerCase());
  const e = "." + ((/\.([^.]+)$/.exec(f.name) || [])[1] || "").toLowerCase();
  return acc.some((a) => a === e || (a.endsWith("/*") && (f.type || "").startsWith(a.slice(0, -1))) || a === (f.type || "").toLowerCase());
}
