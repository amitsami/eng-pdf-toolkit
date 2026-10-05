// Monochrome line icons (24x24, stroke = currentColor) – Apple-style, palette friendly.
const D = "M6 2.5h8l4.5 4.5v14a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z M14 2.5V7h4.5"; // document
const P = {
  doc: D,
  merge: "M4 3.5h7v10H4z M13 10.5h7v10h-7z M11 8.5h4l-1.5-1.5 M15 8.5l-1.5 1.5",
  split: "M6 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M6 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M8 7.5L20 17 M8 16.5L20 7",
  trash: "M4 6.5h16 M9 6.5V4h6v2.5 M6.5 6.5l1 14h9l1-14 M10 10.5v6 M14 10.5v6",
  extract: D + " M12 18v-7 M9 13.5l3-3 3 3",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  camera: "M3.5 8h4l1.5-2.5h6L16.5 8h4v11h-17z M12 13.5m-3.2 0a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0",
  compress: "M9 3.5v5H4 M15 3.5v5h5 M9 20.5v-5H4 M15 20.5v-5h5",
  repair: "M14.5 5.5a4 4 0 0 0 4.9 4.9l-9 9a2 2 0 0 1-2.8-2.8l9-9A4 4 0 0 1 14.5 5.5z M17 3l-1 3 2 2 3-1",
  ocr: "M3.5 8V4.5h3.5 M17 4.5h3.5V8 M20.5 16v3.5H17 M7 19.5H3.5V16 M8 9h8 M8 12h8 M8 15h5",
  image: "M3.5 5h17v14h-17z M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5 M15.5 9m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  code: "M8.5 7L3.5 12l5 5 M15.5 7l5 5-5 5 M13.5 5l-3 14",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z M13.5 6.5l4 4",
  sign: "M3 17c3-6 5-9 6.5-9S9 15 11 15s2.5-4 4-4 1 4 2.5 4 2-1.5 3.5-1.5 M3 20.5h18",
  drop: "M12 3.5c3.5 4.5 6 7.7 6 10.5a6 6 0 0 1-12 0c0-2.8 2.5-6 6-10.5z",
  rotate: "M20 12a8 8 0 1 1-2.4-5.7 M20 4v4.5h-4.5",
  rotl: "M4 12a8 8 0 1 0 2.4-5.7 M4 4v4.5h4.5",
  hash: "M9.5 4L8 20 M16 4l-1.5 16 M4.5 9h15 M4 15h15",
  crop: "M6.5 2.5v15h15 M2.5 6.5h15v15",
  form: "M4 4h16v16H4z M7.5 8.5h3 M13 8.5h3.5 M7.5 12.5l1.5 1.5 3-3 M7.5 16.5h9",
  unlock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.5-2 M12 15v2.5",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2.5",
  redact: D + " M8.5 11.5h7v2.5h-7z M8.5 16.5h5",
  compare: "M3.5 4h7v16h-7z M13.5 4h7v16h-7z M6 9h2 M6 13h2 M16 9h2 M16 13h2",
  spark: "M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5L4.5 10.5 10 8.5z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  translate: "M4 5.5h9 M8.5 3.5v2 M11 5.5c-1 4-4 7-7 8.5 M6.5 9c1.2 2 3 3.5 5 4.5 M13 20.5l3.5-9 3.5 9 M14.2 17.5h4.6",
  flow: "M6 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M18 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5",
  pdfa: D + " M9 17.5l3-7 3 7 M10 15.5h4",
  md: "M3 6h18v12H3z M6 15V9l2.5 3L11 9v6 M16 9v6 M14 13l2 2 2-2",
  word: D + " M8.5 11l1.3 6 2.2-4.5 2.2 4.5 1.3-6",
  ppt: D + " M10 17.5v-7h2.5a2 2 0 0 1 0 4H10",
  xls: D + " M9 11l6 6.5 M15 11l-6 6.5",
  jpg: D + " M8.5 17l2.5-3 2 2 1.5-1.5 1.5 2.5 M10 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
  // UI
  plus: "M12 5v14 M5 12h14", x: "M6 6l12 12 M18 6L6 18", check: "M5 12.5l4.5 4.5L19 7.5",
  down: "M12 4v12 M6.5 11l5.5 5.5 5.5-5.5 M5 20h14", up: "M12 19V7 M6.5 12.5L12 7l5.5 5.5",
  back: "M19 12H6 M11.5 6.5L6 12l5.5 5.5", next: "M5 12h13 M12.5 6.5L18 12l-5.5 5.5",
  swap: "M4 8h14 M14.5 4.5L18 8l-3.5 3.5 M20 16H6 M9.5 12.5L6 16l3.5 3.5",
  sort: "M7 4v16 M3.5 16.5L7 20l3.5-3.5 M13 6h7 M13 11h5 M13 16h3",
  search: "M11 11m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0 M16 16l4.5 4.5",
  pointer: "M5 3.5l13 7.5-6 1.5-3 6z", text: "M5 6V4h14v2 M12 4v16 M9 20h6",
  rect: "M4 6h16v12H4z", ellipse: "M12 12m-8.5 0a8.5 6.5 0 1 0 17 0a8.5 6.5 0 1 0-17 0", line: "M5 19L19 5",
  arrow: "M5 19L19 5 M10 5h9v9", pen: "M4 20c2-1 3.5-4 6-7l5-5 3 3-5 5c-3 2.5-6 4-7 6z", highlight: "M9 15l-3 3h5l1-1 M9 15l7-10 4 3-7 10z M3 21h18",
  whiteout: "M4 6h16v12H4z M4 18L20 6", blank: D, save: "M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6",
  copy: "M8 8h12v12H8z M16 8V4H4v12h4", play: "M7 4.5l12 7.5-12 7.5z", move: "M12 3v18 M3 12h18 M9 6l3-3 3 3 M9 18l3 3 3-3 M6 9l-3 3 3 3 M18 9l3 3-3 3",
  upload: "M12 16V4 M6.5 9.5L12 4l5.5 5.5 M5 20h14", warn: "M12 3.5L21.5 20h-19z M12 10v4.5 M12 17.2v.3",
  alignl: "M4 6h16 M4 10h10 M4 14h16 M4 18h10", alignc: "M4 6h16 M7 10h10 M4 14h16 M7 18h10", alignr: "M4 6h16 M10 10h10 M4 14h16 M10 18h10",
  lines: "M4 7h16 M4 12h16 M4 17h16", list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.5 M4 12h.5 M4 18h.5", caret: "M4 4h16v16H4z M8.5 10.5L12 14l3.5-3.5",
  checkbox: "M4 4h16v16H4z M7.5 12.5l3 3 6-6.5", github: "M9 19c-4 1.5-4-2-6-2.5 M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  facebook: "M15.5 3.5h-2.5a4 4 0 0 0-4 4V10H6.5v3.5H9v7h3.5v-7h2.8l.7-3.5h-3.5V7.8a1 1 0 0 1 1-1h2z",
  instagram: "M4 4h16v16H4z M12 12m-3.8 0a3.8 3.8 0 1 0 7.6 0a3.8 3.8 0 1 0-7.6 0 M17 7v.1",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z", shield: "M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z M8.5 12l2.5 2.5 4.5-5",
  bolt: "M13 3L5 13.5h6L10 21l8-10.5h-6z", gift: "M4 9h16v4H4z M5.5 13h13v7.5h-13z M12 9v11.5 M12 9C10 5 7 5.5 7 7.5S12 9 12 9s5-.5 5-1.5S14 5 12 9z",
  sun: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z", monitor: "M3 4.5h18v12H3z M8 20.5h8 M12 16.5v4",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z", gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  clock: "M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0 M12 7.5V12l3 2", home: "M3.5 11L12 4l8.5 7 M6 9.5V20h12V9.5",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14.5c2 .6 3.5 2.4 3.5 5.5",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0", globe: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M3 12h18 M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  phone: "M7 2.5h10v19H7z M11 18.5h2", chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2", logout: "M15 4h4v16h-4 M10 16l4-4-4-4 M14 12H3",
  refresh: "M20 11a8 8 0 0 0-14.5-4.5L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.5 4.5L20 16 M20 20v-4h-4", pin: "M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z M12 9.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0",
  filter: "M3.5 5h17l-6.5 8v6l-4-2v-4z", command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z", wifi: "M2.5 9a14 14 0 0 1 19 0 M5.5 12.5a9.5 9.5 0 0 1 13 0 M8.8 16a4.8 4.8 0 0 1 6.4 0 M12 19.5v.1",
};
const S = (n) => P[n] || P.doc;
export function ic(name, size = 20, sw = 1.6) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", size); svg.setAttribute("height", size);
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", sw);
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("class", "ic"); svg.setAttribute("aria-hidden", "true");
  for (const d of S(name).split(/ (?=M)/)) { const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); svg.append(p); }
  return svg;
}
export const icHTML = (name, size = 20) => ic(name, size).outerHTML;
export const ICON_NAMES = new Set(Object.keys(P));
