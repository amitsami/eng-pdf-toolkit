import { h } from "./util.js";
import { ic } from "./icons.js";
import { TOOLS, TOOL, CATEGORIES } from "./tools.js";
import { missingDep } from "./forms.js";
import { logoSVG } from "./logo.js";
import { segmented } from "./settings.js";

export const AUTHOR = {
  name: "Amit Hasan Sami",
  links: [["github", "GitHub", "https://github.com/amitsami"], ["facebook", "Facebook", "https://www.facebook.com/amithsami110"], ["instagram", "Instagram", "https://www.instagram.com/_ahsami1_"]],
};
const CAT_INFO = { organize: "Arrange pages and files", optimize: "Smaller, cleaner, searchable", convert: "To and from PDF", edit: "Write, sign and mark up", security: "Lock, unlock and redact", ai: "Understand documents faster", workflow: "Automate repeat jobs" };

/* ---------- favorites / recents ---------- */
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
export const favs = () => load("eng_favs").filter((id) => TOOL[id]);
export const recents = () => load("eng_recent").filter((id) => TOOL[id]);
export function pushRecent(id) { const r = [id, ...recents().filter((x) => x !== id)].slice(0, 8); localStorage.setItem("eng_recent", JSON.stringify(r)); }
function toggleFav(id) { const f = favs(); const n = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f]; localStorage.setItem("eng_favs", JSON.stringify(n)); return n.includes(id); }
export const variant = (t) => ["", "v2", "v3", "v4"][TOOLS.filter((x) => x.cat === t.cat).indexOf(t) % 4];
export const ticon = (t, size = 26) => h("div", { class: "ticon " + variant(t) }, ic(t.icon, size, 1.6));

/* ---------- scroll engine ---------- */
let io;
const scrollFx = new Set();
export function observeReveals(root = document) {
  if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  root.querySelectorAll(".reveal:not(.in),.split-words:not(.in)").forEach((el) => io.observe(el));
}
export function clearScrollFx() { scrollFx.clear(); }
let ticking = false;
function onScroll() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => { ticking = false; scrollFx.forEach((fn) => { if (!fn.el.isConnected) scrollFx.delete(fn); else fn(); }); });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
const reveal = (el, d = 0) => { el.classList.add("reveal"); if (d) el.style.setProperty("--d", d + "s"); return el; };
const words = (text, cls = "") => h("span", { class: "split-words " + cls }, text.split(" ").map((w, i) => [h("span", { class: "w", style: { "--wi": i } }, w), " "]));

/* ---------- footer ---------- */
export function renderFooter(el) {
  el.innerHTML = "";
  el.append(
    h("div", { class: "fl" }, h("span", { html: logoSVG({ size: 33, animated: false }) }),
      h("div", { class: "made" }, "Made by ", h("b", {}, AUTHOR.name), h("small", {}, `ENG PDF Toolkit · © ${new Date().getFullYear()} · every feature free`))),
    h("div", { class: "fs" }, AUTHOR.links.map(([i, l, u]) => h("a", { href: u, target: "_blank", rel: "noopener", title: l, "aria-label": l }, ic(i, 18, 1.8)))));
}

/* ---------- home ---------- */
export function renderHome(app, cat, scrollToTools) {
  app.innerHTML = "";
  document.title = "ENG PDF Toolkit – Beautifully simple PDF tools";
  const N = TOOLS.length;

  // HERO
  const chips = [["merge", "Merged", "", "14%", "4%", "0s"], ["sign", "Signed", "s2", "-2%", "62%", "1.2s"], ["lock", "Protected", "s3", "76%", "10%", ".6s"], ["compress", "-78% size", "", "70%", "74%", "1.8s"]]
    .map(([i, l, c, x, y, d]) => h("div", { class: "float-chip " + c, style: { left: x, top: y, "--dl": d } }, h("span", {}, ic(i, 15, 2)), l));
  const stage = h("div", { class: "orb-stage" }, h("div", { class: "orb-goo" }, h("i"), h("i"), h("i"), h("i")), h("div", { class: "orb-glass", html: logoSVG({ size: 200 }) }), chips);
  const counter = (n, suf, label) => { const b = h("b", { "data-n": n, "data-s": suf }, "0" + suf); return h("div", {}, b, h("span", {}, label)); };
  const meta = h("div", { class: "hero-meta" }, counter(N, "", "tools"), counter(100, "%", "free"), counter(0, "", "sign-ups"), counter(256, "-bit", "encryption"));
  const hero = h("section", { class: "hero2" },
    h("div", { class: "copy" },
      h("div", { class: "eyebrow" }, h("b", {}, "FREE"), `${N} PDF tools · no account · no watermark`),
      h("h1", {}, words("Your PDFs,"), h("br"), h("span", { class: "grad" }, words("fluidly")), " ", words("handled.")),
      h("p", { class: "lead reveal", style: { "--d": ".35s" } }, "A calm, liquid-smooth workspace to merge, edit, sign, convert and protect documents. Tools are free to use. Files are processed on this Azure server; translation uses external services."),
      h("div", { class: "hero-cta reveal", style: { "--d": ".5s" } },
        h("a", { class: "pill solid magnetic", href: "#tools", onclick: (e) => { e.preventDefault(); document.getElementById("tools").scrollIntoView({ behavior: "smooth" }); } }, "Browse tools", ic("down", 18, 2)),
        h("a", { class: "pill ghost magnetic", href: "#/edit" }, ic("edit", 18, 2), "Open the editor")),
      reveal(meta, 0.65)),
    stage);
  const heroFx = () => {
    const y = Math.min(scrollY, 1000);
    stage.style.transform = `translateY(${y * 0.18}px) scale(${1 - y * 0.00025}) rotate(${y * 0.012}deg)`;
    stage.style.opacity = String(Math.max(0, 1 - y / 900));
  };
  heroFx.el = stage; scrollFx.add(heroFx);
  const cIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; cIO.disconnect();
    meta.querySelectorAll("b").forEach((b) => { const n = +b.dataset.n, s = b.dataset.s, t0 = performance.now(); const st = (t) => { const k = Math.min(1, (t - t0) / 1600); b.textContent = Math.round(n * (1 - Math.pow(1 - k, 4))) + s; if (k < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); });
  }));
  cIO.observe(meta);

  // MARQUEE
  const mItems = TOOLS.map((t) => h("a", { href: `#/${t.id}` }, ic(t.icon, 17, 1.8), t.title));
  const marquee = h("div", { class: "marquee" }, h("div", { class: "track" }, mItems, mItems.map((n) => n.cloneNode(true))));

  // STATEMENT
  const wordsArr = "One place for every PDF task. Calm, private, and completely free.".split(" ");
  const acc = new Set(["every", "free."]);
  const h2 = h("h2", {}, wordsArr.map((w, i) => [h("span", { class: acc.has(w) ? "acc" : "" }, w), i < wordsArr.length - 1 ? " " : ""]));
  const statement = h("section", { class: "statement" }, h("div", { class: "stick" }, h2));
  const spans = [...h2.querySelectorAll("span")];
  const stFx = () => { const r = statement.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (innerHeight * 0.55 - r.top) / (r.height - innerHeight * 0.5))); const n = Math.round(p * spans.length); spans.forEach((s, i) => s.classList.toggle("on", i < n)); };
  stFx.el = statement; scrollFx.add(stFx);

  // BENTO
  const bento = h("section", {},
    reveal(h("div", { class: "sec-head" }, h("div", { class: "k" }, "Why ENG"), h("h2", {}, "Crafted to feel effortless."), h("p", {}, "Serious PDF power, wrapped in glass, light and motion."))),
    h("div", { class: "bento" },
      reveal(h("div", { class: "b1 hl" }, h("div", { class: "wave-art" }), h("div", { class: "fi" }, ic("gift", 26, 1.7)), h("div", { class: "big" }, "100%"), h("h3", {}, "Free. Every single feature."), h("p", {}, `All ${N} tools are unlocked for everyone — no premium plan, no watermarks, no account. Uploads are limited to 50 MB, with one conversion at a time.`))),
      reveal(h("div", { class: "b2 hl" }, h("div", { class: "fi" }, ic("shield", 26, 1.7)), h("h3", {}, "Private by design"), h("p", {}, "Conversion uploads are deleted after processing. Phone scans are temporary; translation sends text to external services.")), 0.08),
      reveal(h("div", { class: "b3 hl" }, h("div", { class: "fi" }, ic("bolt", 26, 1.7)), h("h3", {}, "Fast & fluid"), h("p", {}, "Live previews, drag-and-drop pages and instant downloads keep you in the flow.")), 0.14),
      reveal(h("div", { class: "b4 hl" }, h("div", { class: "num" }, "50+"), h("h3", {}, "Languages"), h("p", {}, "Translate documents and keep the layout.")), 0.1),
      reveal(h("div", { class: "b5 hl" }, h("div", { class: "num" }, "AES"), h("h3", {}, "256-bit security"), h("p", {}, "Protect, unlock and permanently redact.")), 0.16),
      reveal(h("div", { class: "b6 hl" }, h("div", { class: "num" }, "Ctrl K"), h("h3", {}, "Keyboard first"), h("p", {}, "Jump to any tool instantly from anywhere.")), 0.22)));

  // TOOLS
  let curCat = cat;
  const search = h("input", { class: "search-tools", placeholder: `Search ${N} tools…`, oninput: () => fill() });
  const list = h("div", {});
  const shelfBox = h("div", {});
  const seg = segmented(CATEGORIES.map(([k, l]) => [k, l]), cat, (k) => { curCat = k; history.replaceState(null, "", k === "all" ? "#/" : `#/?cat=${k}`); fill(); });
  const tile = (t, i) => {
    const miss = missingDep(t);
    const star = h("button", { class: "star" + (favs().includes(t.id) ? " on" : ""), title: "Add to favorites", onclick: (e) => { e.preventDefault(); e.stopPropagation(); star.classList.toggle("on", toggleFav(t.id)); drawShelf(); } }, ic("star", 17, 1.8));
    return h("a", { class: "tile hl", href: `#/${t.id}`, style: { "--i": i } }, ticon(t),
      h("div", { class: "tx" }, h("h4", {}, t.title, miss ? h("span", { class: "tag", title: `Needs ${miss}` }, "Setup") : t.badge ? h("span", { class: "tag new" }, t.badge) : null), h("p", {}, t.desc)),
      star, h("span", { class: "arr" }, ic("next", 18, 2)));
  };
  const fill = () => {
    list.innerHTML = "";
    const q = search.value.trim().toLowerCase();
    const match = (t) => (curCat === "all" || t.cat === curCat) && (!q || (t.title + " " + t.desc + " " + t.cat).toLowerCase().includes(q));
    let i = 0;
    for (const [k, label] of CATEGORIES.slice(1)) {
      const ts = TOOLS.filter((t) => t.cat === k && match(t));
      if (!ts.length) continue;
      list.append(h("div", { class: "cat-block" }, h("div", { class: "cat-title" }, h("h3", {}, label), h("span", {}, CAT_INFO[k] || "")), h("div", { class: "tiles" }, ts.map((t) => tile(t, i++)))));
    }
    if (!list.children.length) list.append(h("p", { style: { color: "var(--muted)", textAlign: "center", padding: "40px 0" } }, "No tools match your search."));
  };
  const drawShelf = () => {
    shelfBox.innerHTML = "";
    const chipRow = (title, iconName, ids) => ids.length ? h("div", { class: "shelf" }, h("div", { class: "cat-title" }, h("h3", { style: { fontSize: "17px", display: "flex", gap: "8px", alignItems: "center" } }, ic(iconName, 18, 2), title)),
      h("div", { class: "row" }, ids.map((id) => h("a", { class: "chipbtn", href: `#/${id}` }, ticon(TOOL[id], 17), TOOL[id].title)))) : null;
    const f = chipRow("Favorites", "star", favs()), r = chipRow("Recently used", "clock", recents());
    if (f) shelfBox.append(f); if (r) shelfBox.append(r);
  };
  fill(); drawShelf();
  const tools = h("section", { id: "tools" },
    reveal(h("div", { class: "sec-head" }, h("div", { class: "k" }, "The toolkit"), h("h2", {}, "Everything, neatly arranged."), h("p", {}, "Star the ones you love — they'll wait for you at the top."))),
    shelfBox, h("div", { class: "tools-bar" }, seg, h("div", { class: "search-wrap" }, ic("search", 18, 2), search)), list);

  // TIMELINE
  const rail = h("i");
  const steps = [["01", "Pick a tool", `Choose from ${N} tools, or press Ctrl K and type what you need.`], ["02", "Drop your files", "Drag them in — even onto the home page. Arrange, preview and tune the options."], ["03", "Download & continue", "Your file is ready in seconds. Hand it straight to the next tool."]]
    .map(([n, t, d], i) => reveal(h("div", { class: "tl-step hl" }, h("span", { class: "dot" }), h("div", { class: "n" }, "STEP " + n), h("h3", {}, t), h("p", {}, d)), i * 0.12));
  const timeline = h("div", { class: "timeline" }, h("div", { class: "rail" }, rail), steps);
  const tlFx = () => { const r = timeline.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.2))); timeline.style.setProperty("--p", p.toFixed(3)); steps.forEach((s, i) => s.classList.toggle("lit", p > (i + 0.3) / 3)); };
  tlFx.el = timeline; scrollFx.add(tlFx);
  const how = h("section", {}, reveal(h("div", { class: "sec-head c" }, h("div", { class: "k" }, "How it works"), h("h2", {}, "Three steps. That's all."))), timeline);

  // CREATOR
  const initials = AUTHOR.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const creator = reveal(h("section", { class: "creator hl" }, h("div", { class: "goo-bg" }, h("i"), h("i")), h("div", { class: "avatar" }, initials), h("div", { class: "k" }, "Made by"), h("h2", {}, AUTHOR.name),
    h("p", {}, "Designed and built ENG PDF Toolkit so anyone can work with PDFs beautifully — and for free."),
    h("div", { class: "socials" }, AUTHOR.links.map(([i, l, u]) => h("a", { href: u, target: "_blank", rel: "noopener", class: "magnetic" }, ic(i, 18, 1.8), l)))));

  app.append(hero, marquee, statement, bento, tools, how, creator);
  requestAnimationFrame(() => hero.querySelectorAll(".split-words").forEach((s) => s.classList.add("in")));
  observeReveals(app);
  onScroll();
  if (scrollToTools) setTimeout(() => document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" }), 120);
}
