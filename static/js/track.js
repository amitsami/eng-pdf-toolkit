// First-party visit analytics (data goes only to this site's own server)
const cookie = (k) => (document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)")) || [])[1];
const post = (url, data) => {
  const body = JSON.stringify(data);
  try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return; } catch {}
  fetch(url, { method: "POST", body, keepalive: true, credentials: "same-origin" }).catch(() => {});
};
const base = () => ({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "", screen: `${screen.width}x${screen.height}`, lang: navigator.language || "" });

export async function trackStart() {
  const pv = cookie("eng_pv");
  const d = { pv, ...base(), referrer: document.referrer || "", path: (location.hash || "#/").replace(/^#/, "") || "/" };
  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      const v = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]);
      if (v.model) d.model = v.model;
    }
  } catch {}
  if (pv) post("/api/t/enrich", d);
  ping();
  setInterval(() => { if (document.visibilityState === "visible") ping(); }, 25000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && ping());
}
let lastPath = location.hash || "#/";
export function trackNav() {
  const p = location.hash || "#/";
  if (p === lastPath) return;
  lastPath = p;
  post("/api/t/nav", { path: p.replace(/^#/, "") || "/", ...base() });
  ping();
}
function ping() { post("/api/t/ping", { path: (location.hash || "#/").replace(/^#/, "") || "/" }); }
