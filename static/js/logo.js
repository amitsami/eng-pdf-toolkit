// ENG PDF logo – ring + swoosh + bold PDF letters, recreated as SVG in the site palette.
export function logoSVG({ size = 40, animated = true, id = "lg" + Math.random().toString(36).slice(2, 7) } = {}) {
  return `<svg class="eng-logo${animated ? " anim" : ""}" viewBox="0 0 400 300" width="${size * 4 / 3}" height="${size}" role="img" aria-label="ENG PDF logo">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--logo-ring1)"/><stop offset="1" stop-color="var(--logo-ring2)"/></linearGradient>
    <linearGradient id="${id}b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--logo-sw1)"/><stop offset="1" stop-color="var(--logo-sw2)"/></linearGradient>
  </defs>
  <g class="lg-ring"><path fill="url(#${id}a)" d="M224.6 43.5 A130 130 0 1 0 224.6 256.5 A120 120 0 1 1 224.6 43.5Z"/></g>
  <g class="lg-swoosh"><path fill="url(#${id}b)" d="M235.4 82.5 A105 105 0 1 0 235.4 217.5 A100 100 0 1 1 235.4 82.5Z"/></g>
  <g class="lg-text" fill="var(--logo-ink)" fill-rule="evenodd">
    <path class="lg-p" d="M146 105H204a31 31 0 0 1 0 62H174V195H146Z M174 127V145H200a9 9 0 0 0 0-18Z"/>
    <path class="lg-d" d="M226 105H268a45 45 0 0 1 0 90H226Z M254 127V173H266a23 23 0 0 0 0-46Z"/>
    <path class="lg-f" d="M326 105H392L383 129H354V140H380L372 161H354V195H326Z"/>
  </g>
</svg>`;
}
