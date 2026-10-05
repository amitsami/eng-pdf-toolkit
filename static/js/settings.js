// Settings, theme, ambient effects (cursor glow, ripples, magnetic buttons, glass highlights)
import { h, toast } from "./util.js";
import { ic } from "./icons.js";

const KEY = "eng_settings_v1";
// low-power devices (phones, few CPU cores, little RAM, "reduce motion") start in Calm mode automatically
const lowEnd = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || matchMedia("(pointer:coarse)").matches; } catch { return false; } })();
export const DEFAULTS = { theme: "system", motion: lowEnd ? "calm" : "full", liquid: true, cursor: !lowEnd, blur: 14, autoDownload: true, hideHeader: false };
export const S = Object.assign({}, DEFAULTS, safe(() => JSON.parse(localStorage.getItem(KEY))) || {});
function safe(f) { try { return f(); } catch { return null; } }
export function save() { localStorage.setItem(KEY, JSON.stringify(S)); apply(); }

const mq = matchMedia("(prefers-color-scheme: dark)");
export const isDark = () => S.theme === "dark" || (S.theme === "system" && mq.matches);
export function apply(animate) {
  const r = document.documentElement;
  if (animate) { r.classList.add("theme-anim"); setTimeout(() => r.classList.remove("theme-anim"), 700); }
  r.dataset.theme = isDark() ? "dark" : "light";
  r.dataset.motion = S.motion;
  r.dataset.liquid = S.liquid ? "on" : "off";
  r.dataset.cursor = S.cursor && S.motion !== "off" ? "on" : "off";
  r.style.setProperty("--blurv", S.blur + "px");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark() ? "#1B1F15" : "#F7F2EB");
  document.dispatchEvent(new CustomEvent("eng:theme"));
}
mq.addEventListener?.("change", () => S.theme === "system" && apply(true));
apply();

/* theme switch with liquid circular reveal (View Transitions API) */
export function setTheme(t, ev) {
  const go = () => { S.theme = t; save(); };
  if (!document.startViewTransition || S.motion === "off") { go(); apply(true); return; }
  const x = ev?.clientX ?? innerWidth - 60, y = ev?.clientY ?? 40;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(go);
  vt.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
    { duration: 850, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
}
export const toggleTheme = (ev) => setTheme(isDark() ? "light" : "dark", ev);

/* ---------------- segmented control with liquid indicator ---------------- */
export function segmented(items, value, onChange, cls = "") {
  const wrap = h("div", { class: "seg " + cls });
  const ind = h("span", { class: "ind" });
  wrap.append(ind);
  const btns = items.map(([v, label, icon]) => {
    const b = h("button", { type: "button", class: String(v) === String(value) ? "on" : "", "data-v": v, onclick: (e) => { setOn(v); onChange(v, e); } }, icon ? ic(icon, 15, 2) : null, label);
    wrap.append(b); return b;
  });
  const place = () => {
    const b = btns.find((x) => x.classList.contains("on")); if (!b) { ind.style.opacity = 0; return; }
    Object.assign(ind.style, { opacity: 1, left: b.offsetLeft + "px", top: b.offsetTop + "px", width: b.offsetWidth + "px", height: b.offsetHeight + "px" });
  };
  const setOn = (v) => { btns.forEach((x) => x.classList.toggle("on", x.dataset.v === String(v))); ind.classList.remove("stretch"); void ind.offsetWidth; ind.classList.add("stretch"); place(); };
  new ResizeObserver(place).observe(wrap);
  requestAnimationFrame(place);
  wrap.set = setOn;
  return wrap;
}
export const switchBtn = (on, fn) => { const b = h("button", { type: "button", class: "switch" + (on ? " on" : ""), role: "switch", "aria-checked": String(on), onclick: () => { const v = !b.classList.contains("on"); b.classList.toggle("on", v); b.setAttribute("aria-checked", v); fn(v); } }); return b; };

/* ---------------- settings drawer ---------------- */
let open = null;
export function openSettings() {
  if (open) return open();
  const scrim = h("div", { class: "scrim" });
  const row = (title, sub, ctrl, col) => h("div", { class: "set-row" + (col ? " col" : "") }, h("div", { class: "l" }, h("b", {}, title), sub ? h("small", {}, sub) : null), ctrl);
  const blurVal = h("b", { style: { fontSize: "13px", minWidth: "38px", textAlign: "right" } }, S.blur + "px");
  const clearKey = (keys, msg) => () => { keys.forEach((k) => localStorage.removeItem(k)); toast(msg); };
  const body = h("div", { class: "db" },
    h("div", { class: "set-group" }, "Appearance"),
    row("Theme", "Light, dark or follow your device", segmented([["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Auto", "monitor"]], S.theme, (v, e) => setTheme(v, e), "mini"), true),
    row("Glass blur", "How frosted the liquid glass looks", h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
      h("input", { type: "range", min: 0, max: 40, value: S.blur, style: { flex: 1 }, oninput: (e) => { S.blur = +e.target.value; blurVal.textContent = S.blur + "px"; save(); } }), blurVal), true),
    row("Liquid background", "Slowly flowing color blobs behind the page", switchBtn(S.liquid, (v) => { S.liquid = v; save(); })),
    row("Cursor glow", "A soft light that follows your pointer", switchBtn(S.cursor, (v) => { S.cursor = v; save(); })),
    h("div", { class: "set-group" }, "Motion"),
    row("Animations", "Full, calm (no looping effects) or off", segmented([["full", "Full"], ["calm", "Calm"], ["off", "Off"]], S.motion, (v) => { S.motion = v; save(); }, "mini"), true),
    row("Auto-hide header", "Hide the top bar while scrolling down", switchBtn(S.hideHeader, (v) => { S.hideHeader = v; save(); })),
    h("div", { class: "set-group" }, "Files"),
    row("Auto-download results", "Start the download as soon as a file is ready", switchBtn(S.autoDownload, (v) => { S.autoDownload = v; save(); })),
    h("div", { class: "set-group" }, "Your data (stored only in this browser)"),
    h("div", { style: { display: "grid", gap: "8px" } },
      h("button", { class: "btn", onclick: clearKey(["eng_favs", "eng_recent"], "Favorites & recent tools cleared") }, ic("star", 16, 2), "Clear favorites & recent tools"),
      h("button", { class: "btn", onclick: clearKey(["pdftk_signatures"], "Saved signatures deleted") }, ic("sign", 16, 2), "Delete saved signatures"),
      h("button", { class: "btn", onclick: clearKey(["pdftk_workflows"], "Saved workflows deleted") }, ic("flow", 16, 2), "Delete saved workflows"),
      h("button", { class: "btn", onclick: () => { Object.assign(S, DEFAULTS); save(); close(); setTimeout(openSettings, 450); toast("Settings reset"); } }, ic("rotl", 16, 2), "Reset all settings")),
    h("div", { class: "set-group" }, "Keyboard shortcuts"),
    h("div", { class: "set-row col", style: { gap: "8px", fontSize: "13.5px" } },
      [["Search tools / commands", "Ctrl K"], ["Toggle dark mode", "Shift D"], ["Open settings", ","], ["Go home", "H"], ["Close dialogs", "Esc"]].map(([a, k]) =>
        h("div", { style: { display: "flex", justifyContent: "space-between" } }, h("span", {}, a), h("span", {}, k.split(" ").map((x) => h("kbd", { style: { marginLeft: "4px" } }, x)))))),
    h("p", { class: "help", style: { textAlign: "center", marginTop: "18px" } }, "ENG PDF Toolkit · every feature is free"));
  const drawer = h("aside", { class: "drawer", role: "dialog", "aria-label": "Settings" },
    h("header", {}, h("h3", {}, "Settings"), h("button", { class: "hbtn", title: "Close", onclick: () => close() }, ic("x", 18, 2))), body);
  document.body.append(scrim, drawer);
  requestAnimationFrame(() => { scrim.classList.add("on"); drawer.classList.add("on"); });
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  scrim.onclick = () => close();
  function close() {
    scrim.classList.remove("on"); drawer.classList.remove("on"); document.removeEventListener("keydown", onKey);
    setTimeout(() => { scrim.remove(); drawer.remove(); }, 700); open = null;
  }
  open = close;
}

/* ---------------- ambient interaction effects ---------------- */
const fine = matchMedia("(pointer:fine)").matches;
const blob = h("div", { id: "cursorBlob" });
document.body.append(blob);
let tx = innerWidth / 2, ty = innerHeight / 2, cx = tx, cy = ty, raf = 0;
const loop = () => { cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12; blob.style.transform = `translate3d(${cx}px,${cy}px,0)`; raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3 ? requestAnimationFrame(loop) : 0; };
addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  tx = e.clientX; ty = e.clientY;
  if (fine) { blob.classList.add("on"); if (!raf) raf = requestAnimationFrame(loop); }
  const t = e.target.closest?.(".hl,.tile,.tool-card,.bento>*,.fcard,.creator,.tl-step");
  if (t) { const r = t.getBoundingClientRect(); t.style.setProperty("--mx", e.clientX - r.left + "px"); t.style.setProperty("--my", e.clientY - r.top + "px"); }
  blob.classList.toggle("big", !!e.target.closest?.("a,button"));
  const m = e.target.closest?.(".magnetic");
  document.querySelectorAll(".magnetic.mag-on").forEach((x) => { if (x !== m) { x.classList.remove("mag-on"); x.style.transform = ""; } });
  if (m && S.motion === "full") { const r = m.getBoundingClientRect(); m.classList.add("mag-on"); m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`; }
}, { passive: true });
document.addEventListener("mouseleave", () => blob.classList.remove("on"));
document.addEventListener("pointerdown", (e) => {
  if (S.motion === "off") return;
  const b = e.target.closest?.(".btn-big,.pill,.btn,.chipbtn,.socials a,.seg button,.tbtn,.fab");
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
  const cs = getComputedStyle(b); if (cs.position === "static") b.style.position = "relative"; if (cs.overflow !== "hidden") b.style.overflow = "hidden";
  const rp = h("span", { class: "ripple", style: { width: d + "px", height: d + "px", left: e.clientX - r.left - d / 2 + "px", top: e.clientY - r.top - d / 2 + "px" } });
  b.append(rp); setTimeout(() => rp.remove(), 800);
});
/* header: scrolled state + optional auto-hide */
let lastY = 0;
addEventListener("scroll", () => {
  const hd = document.querySelector("header.top"); if (!hd) return;
  hd.classList.toggle("scrolled", scrollY > 20);
  hd.classList.toggle("hide", S.hideHeader && scrollY > 200 && scrollY > lastY);
  lastY = scrollY;
}, { passive: true });

/* ---------------- pause animations that can't be seen ---------------- */
const offIO = new IntersectionObserver((ents) => ents.forEach((e) => e.target.classList.toggle("offscreen", !e.isIntersecting)), { rootMargin: "100px" });
const ZONES = ".orb-stage,.marquee,.bento,.creator,.timeline,.statement,.dz2,.th2,.center-box,.hero2";
export function watchOffscreen(root = document) { root.querySelectorAll(ZONES).forEach((el) => { if (!el._offW) { el._offW = 1; offIO.observe(el); } }); }
let moT = 0;
new MutationObserver(() => { if (!moT) moT = requestAnimationFrame(() => { moT = 0; watchOffscreen(); }); }).observe(document.getElementById("app") || document.body, { childList: true, subtree: true });
document.addEventListener("visibilitychange", () => document.documentElement.classList.toggle("tab-hidden", document.hidden));
