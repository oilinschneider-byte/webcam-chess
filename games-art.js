/* Little pictures of every game, for the tiles on the Classic Games page: a simple, cartoon version of what the game
   looks like (drawn as SVG, 160 × 100). CA.gameArt(id) gives the picture's markup. */
(() => {
'use strict';

const B = '#4d8dff', O = '#ff9a3c'; // the two players' colors (blue, orange)
let uid = 0;

// a cat seen from the front: x, y is the middle of its head
function cat(x, y, s, col, o) {
  o = o || {};
  const k = s || 1, c = col || O, d = shade(c);
  const body = o.body === false ? '' :
    `<ellipse cx="${x}" cy="${y + 15 * k}" rx="${8 * k}" ry="${9 * k}" fill="${c}"/>` +
    `<rect x="${x - 6 * k}" y="${y + 20 * k}" width="${4 * k}" height="${7 * k}" rx="${2 * k}" fill="${d}"/><rect x="${x + 2 * k}" y="${y + 20 * k}" width="${4 * k}" height="${7 * k}" rx="${2 * k}" fill="${d}"/>`;
  return body +
    `<path d="M${x - 10 * k} ${y - 2 * k} L${x - 9 * k} ${y - 13 * k} L${x - 3 * k} ${y - 8 * k} Z M${x + 10 * k} ${y - 2 * k} L${x + 9 * k} ${y - 13 * k} L${x + 3 * k} ${y - 8 * k} Z" fill="${c}"/>` +
    `<ellipse cx="${x}" cy="${y}" rx="${11 * k}" ry="${9.5 * k}" fill="${c}"/>` +
    `<circle cx="${x - 4 * k}" cy="${y - 1 * k}" r="${1.6 * k}" fill="#222"/><circle cx="${x + 4 * k}" cy="${y - 1 * k}" r="${1.6 * k}" fill="#222"/>` +
    `<path d="M${x - 2 * k} ${y + 3 * k} Q${x} ${y + 5 * k} ${x + 2 * k} ${y + 3 * k}" stroke="#222" stroke-width="${0.8 * k}" fill="none" stroke-linecap="round"/>` +
    (o.ring ? `<circle cx="${x}" cy="${y}" r="${15 * k}" fill="none" stroke="${o.ring}" stroke-width="${1.5 * k}"/>` : '');
}
// a cat seen from above (a round head, ears, and a ring in its color)
function catTop(x, y, s, col) {
  const k = s || 1;
  return `<circle cx="${x}" cy="${y}" r="${10 * k}" fill="${col}" opacity=".3"/><circle cx="${x}" cy="${y}" r="${10 * k}" fill="none" stroke="${col}" stroke-width="${1.6 * k}"/>` + cat(x, y + 1 * k, 0.55 * k, col === B ? '#ffb066' : O, { body: false });
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16), f = 0.72;
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('');
}
const sky = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="100" fill="url(#${id})"/>`;
const arm = (x1, y1, cx, cy, x2, y2, col, w) => `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" stroke="${shade(col)}" stroke-width="${(w || 3) + 1.4}" fill="none" stroke-linecap="round"/><path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" stroke="${col}" stroke-width="${w || 3}" fill="none" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="${(w || 3) * 0.9}" fill="#ffe0bf"/>`;
const sun = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c || '#ffe7a8'}" opacity=".9"/>`;
const text = (x, y, t, size, col) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" fill="${col || '#fff'}" stroke="#1a1020" stroke-width="${size / 7}" paint-order="stroke">${t}</text>`;
const cheese = (x, y, s, gold) => { const k = s || 1; return `<path d="M${x - 7 * k} ${y + 5 * k} L${x + 7 * k} ${y + 5 * k} L${x - 5 * k} ${y - 6 * k} Z" fill="${gold ? '#ffe066' : '#ffcf3d'}" stroke="#c98f00" stroke-width="${0.8 * k}"/><circle cx="${x - 2 * k}" cy="${y + 2 * k}" r="${1.2 * k}" fill="#d99a00"/>`; };

const ART = {
  draw: id => sky(id, '#ffb36b', '#c2526e') + sun(80, 62, 22, '#ffe0a0') +
    `<rect y="72" width="160" height="28" fill="#7a4a2a"/><rect y="72" width="160" height="3" fill="#5a3418"/>` +
    `<path d="M18 72 v-20 m0 8 h-6 m6 0 h6 M142 72 v-24 m0 10 h6" stroke="#3a6a2a" stroke-width="4" stroke-linecap="round"/>` +
    cat(44, 50, 1, B) + cat(116, 50, 1, O) + text(80, 40, '!', 30, '#ffe14d'),
  aim: id => sky(id, '#2a2340', '#141024') +
    [[42, 36, 13], [112, 62, 10], [128, 26, 7]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff4d6d"/><circle cx="${x}" cy="${y}" r="${r * 0.66}" fill="#fff"/><circle cx="${x}" cy="${y}" r="${r * 0.33}" fill="#ff4d6d"/>`).join('') +
    `<g stroke="#7dffb0" stroke-width="2" stroke-linecap="round"><circle cx="112" cy="62" r="15" fill="none"/><path d="M112 42 v8 M112 74 v8 M92 62 h8 M124 62 h8"/></g>` +
    `<circle cx="70" cy="80" r="3" fill="#fff" opacity=".6"/><circle cx="58" cy="70" r="2" fill="#fff" opacity=".4"/>`,
  dodge: id => sky(id, '#7ec8ff', '#d9f0ff') +
    `<path d="M10 82 A70 70 0 0 1 150 82" fill="none" stroke="#ff6b6b" stroke-width="5" opacity=".5"/><path d="M18 82 A62 62 0 0 1 142 82" fill="none" stroke="#ffd23f" stroke-width="5" opacity=".5"/><path d="M26 82 A54 54 0 0 1 134 82" fill="none" stroke="#4dd47a" stroke-width="5" opacity=".5"/>` +
    `<rect y="82" width="160" height="18" fill="#5cc85a"/>` +
    [[40, 22], [92, 12], [128, 30]].map(([x, y]) => `<path d="M${x - 14} ${y - 14} L${x} ${y}" stroke="#ffb02e" stroke-width="5" stroke-linecap="round" opacity=".7"/><circle cx="${x}" cy="${y}" r="6" fill="#5a4a5a"/>`).join('') +
    cat(54, 60, 0.9, B) + cat(110, 60, 0.9, O),
  barrel: id => sky(id, '#1f1440', '#5a2e6e') + sun(132, 18, 9) +
    `<path d="M0 72 L40 44 L60 56 L90 30 L130 60 L160 50 V100 H0 Z" fill="#3a2350"/><path d="M84 34 l6 -8 l6 8" fill="#ff7a3c"/>` +
    `<rect y="78" width="160" height="22" fill="#6b4a2f"/><rect y="78" width="160" height="4" fill="#4dbd5a"/>` +
    cat(36, 58, 0.95, '#57d67a') + cat(124, 58, 0.95, O) +
    `<g transform="translate(80 42) rotate(-20)"><rect x="-8" y="-10" width="16" height="20" rx="4" fill="#a8672f"/><path d="M-8 -4 h16 M-8 4 h16" stroke="#5b3413" stroke-width="2"/></g><path d="M66 50 q6 -6 12 -4" stroke="#fff" stroke-width="1.5" fill="none" opacity=".6"/>`,
  hoops: id => sky(id, '#1c2a52', '#283a6a') +
    `<rect y="70" width="160" height="30" fill="#e0a060"/><path d="M0 76 H160" stroke="#c8864a" stroke-width="1"/>` +
    `<rect x="126" y="18" width="4" height="52" fill="#9aa3b5"/><rect x="112" y="16" width="20" height="14" fill="#fff" stroke="#c0c6d4"/><rect x="104" y="30" width="16" height="2.5" fill="#ff5a3c"/><path d="M106 32 l2 8 h8 l2 -8" fill="none" stroke="#fff" stroke-width="1"/>` +
    `<path d="M50 48 Q82 0 108 30" stroke="#fff" stroke-dasharray="2 3" fill="none" opacity=".6"/><circle cx="96" cy="16" r="6" fill="#ff8a2a"/><path d="M90 16 h12 M96 10 v12" stroke="#7a3a10" stroke-width="0.8"/>` +
    cat(42, 56, 0.95, O) + arm(48, 62, 56, 40, 50, 48, O, 2.5) + cat(80, 58, 0.85, B),
  walls: id => sky(id, '#7cc760', '#5aa848') +
    Array.from({ length: 30 }, (_, n) => `<circle cx="${(n * 37) % 160}" cy="${(n * 23) % 100}" r="1.4" fill="#ffe680" opacity=".7"/>`).join('') +
    `<circle cx="80" cy="50" r="40" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>` +
    `<path d="M70 30 L100 70" stroke="#d98a3a" stroke-width="5" stroke-linecap="round"/><path d="M40 70 L60 52" stroke="#4d8dff" stroke-width="5" stroke-linecap="round"/>` +
    catTop(40, 40, 1.1, B) + catTop(118, 44, 1.1, O),
  climb: id => sky(id, '#9ec3d8', '#d9a777') + sun(126, 20, 8, '#fff6d8') +
    `<path d="M0 100 L0 78 L40 72 L70 50 L96 44 L120 20 L160 14 V100 Z" fill="#7a6a5a"/><rect x="70" y="40" width="24" height="16" fill="#a8672f"/><circle cx="118" cy="46" r="12" fill="#8a8a8a"/><rect x="132" y="8" width="18" height="6" fill="#ffd23f"/>` +
    cat(52, 56, 0.9, O) + arm(58, 62, 74, 32, 92, 38, O, 2.5),
  simon: id => sky(id, '#3a2a6e', '#1b1440') +
    `<rect x="18" y="16" width="62" height="40" rx="8" fill="#fff"/><path d="M42 56 l-6 10 l14 -10" fill="#fff"/>` + text(49, 41, 'Arms up!', 10, '#7a5cff') +
    cat(118, 50, 1.1, O) + arm(110, 60, 98, 44, 100, 30, O, 3) + arm(126, 60, 138, 44, 136, 30, O, 3) +
    `<g transform="translate(18 72)"><rect width="22" height="16" rx="3" fill="#2a2a3a"/><circle cx="11" cy="8" r="5" fill="#5ad1ff"/><rect x="7" y="-3" width="8" height="4" rx="1" fill="#2a2a3a"/></g>`,
  trails: id => `<rect width="160" height="100" fill="#06060f"/>` +
    Array.from({ length: 9 }, (_, n) => `<path d="M${n * 20} 0 V100" stroke="#1a1a40" stroke-width="1"/>`).join('') + Array.from({ length: 6 }, (_, n) => `<path d="M0 ${n * 20} H160" stroke="#1a1a40" stroke-width="1"/>`).join('') +
    `<path d="M10 70 H70 V40 H100" stroke="${B}" stroke-width="3" fill="none" style="filter:drop-shadow(0 0 3px ${B})"/><path d="M150 20 H120 V62 H96" stroke="${O}" stroke-width="3" fill="none" style="filter:drop-shadow(0 0 3px ${O})"/>` +
    `<circle cx="100" cy="40" r="4" fill="#bcd8ff"/><circle cx="96" cy="62" r="4" fill="#ffd0a1"/>`,
  box: id => `<rect width="160" height="100" fill="#d8a96a"/>` + Array.from({ length: 6 }, (_, n) => `<path d="M0 ${n * 18 + 8} H160" stroke="#b98a52" stroke-width="1.5"/>`).join('') +
    `<rect x="62" y="30" width="36" height="36" rx="3" fill="#9a6a3a" stroke="#6b4a2f" stroke-width="3"/><rect x="68" y="36" width="24" height="24" fill="#b98050"/>` +
    catTop(80, 48, 0.9, O) + catTop(30, 78, 0.9, B) + `<path d="M40 70 q10 -10 18 -4" stroke="#fff" stroke-width="1.5" fill="none" stroke-dasharray="2 2"/><path d="M58 64 l6 -2 l-2 6 z" fill="#ddd" stroke="#888"/>`,
  sumo: id => `<rect width="160" height="100" fill="#4a3426"/><circle cx="80" cy="50" r="42" fill="#d9b886"/><circle cx="80" cy="50" r="38" fill="none" stroke="#8a6a44" stroke-width="2" stroke-dasharray="3 2"/>` +
    catTop(66, 46, 1.2, B) + catTop(96, 54, 1.2, O) + `<path d="M78 40 l4 -6 l2 6 l5 -2" stroke="#fff" stroke-width="1.5" fill="none"/>`,
  pond: id => sky(id, '#a8e0ff', '#7ec06a') + `<ellipse cx="80" cy="62" rx="58" ry="24" fill="#2d7fd6"/><ellipse cx="80" cy="62" rx="50" ry="18" fill="#3c95e8"/>` +
    `<path d="M26 40 L74 62 M134 40 L86 62" stroke="#ddd" stroke-width="1"/><path d="M20 30 L30 42 M140 30 L130 42" stroke="#6b4a2f" stroke-width="2.5" stroke-linecap="round"/>` +
    `<path d="M74 62 q6 -6 12 0 q-6 6 -12 0 z M86 62 l5 -4 v8 z" fill="#ffd23f"/>` + cat(18, 50, 0.8, O) + cat(142, 50, 0.8, '#f2f2f2'),
  hockey: id => `<rect width="160" height="100" fill="#20263a"/><rect x="10" y="10" width="140" height="80" rx="8" fill="#e9f3ff"/><path d="M80 10 V90" stroke="#ff6b6b" stroke-width="1.5"/><circle cx="80" cy="50" r="12" fill="none" stroke="#ff6b6b" stroke-width="1.5"/>` +
    `<rect x="6" y="38" width="4" height="24" fill="#111"/><rect x="150" y="38" width="4" height="24" fill="#111"/>` +
    `<circle cx="40" cy="44" r="10" fill="${B}"/><circle cx="40" cy="44" r="5" fill="#a9cbff"/><circle cx="118" cy="58" r="10" fill="${O}"/><circle cx="118" cy="58" r="5" fill="#ffd0a1"/><circle cx="92" cy="40" r="5" fill="#1c1c28"/><path d="M100 36 l8 -3 M100 42 l9 0" stroke="#9ab" stroke-width="1"/>`,
  paint: id => `<rect width="160" height="100" fill="#eef2f8"/>` +
    `<path d="M0 0 H60 L70 30 L50 60 L64 100 H0 Z" fill="${B}"/><path d="M160 20 L100 30 L84 60 L110 90 L160 100 Z" fill="${O}"/>` +
    Array.from({ length: 8 }, (_, n) => `<path d="M${n * 20} 0 V100" stroke="#fff" stroke-width="0.6" opacity=".5"/>`).join('') +
    catTop(56, 34, 0.9, B) + catTop(104, 62, 0.9, O),
  cannons: id => sky(id, '#a8d8ff', '#e8f6ff') + `<ellipse cx="40" cy="20" rx="12" ry="5" fill="#fff"/><ellipse cx="120" cy="14" rx="14" ry="5" fill="#fff"/>` +
    `<path d="M0 100 V74 Q30 62 60 72 T110 60 T160 66 V100 Z" fill="#6a9a4a"/><path d="M0 100 V80 Q30 70 60 80 T110 70 T160 74 V100 Z" fill="#7a5a3a"/>` +
    `<rect x="22" y="58" width="18" height="8" rx="3" fill="#2a2a3a" transform="rotate(-30 26 64)"/><circle cx="24" cy="68" r="4" fill="#5a3a20"/>` + cat(14, 54, 0.6, O) +
    `<rect x="122" y="50" width="18" height="8" rx="3" fill="#2a2a3a" transform="rotate(210 134 54)"/><circle cx="134" cy="60" r="4" fill="#5a3a20"/>` + cat(146, 46, 0.6, B) +
    `<path d="M40 54 Q80 0 112 40" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 3" fill="none"/><circle cx="96" cy="24" r="4" fill="#222"/>`,
  golf: id => `<rect width="160" height="100" fill="#7a5a3a"/><rect x="5" y="5" width="150" height="90" rx="6" fill="#3fa34a"/>` +
    Array.from({ length: 8 }, (_, n) => `<rect x="${n * 20 + 5}" y="5" width="10" height="90" fill="#46b052" opacity=".6"/>`).join('') +
    `<rect x="54" y="5" width="16" height="40" fill="#3c95e8"/><rect x="54" y="60" width="16" height="35" fill="#3c95e8"/><circle cx="104" cy="70" r="6" fill="#ff6b9a"/><circle cx="96" cy="30" r="6" fill="#ff6b9a"/>` +
    `<circle cx="134" cy="72" r="4" fill="#111"/><path d="M134 72 V50" stroke="#fff" stroke-width="1.2"/><path d="M134 50 l10 4 l-10 4" fill="#ff3b30"/>` +
    `<circle cx="28" cy="50" r="3.5" fill="#fff"/><path d="M28 50 L110 46" stroke="#fff" stroke-width="1" stroke-dasharray="2 3"/>` + catTop(16, 64, 0.8, O),
  mouse: id => `<rect width="160" height="100" fill="#14111c"/>` +
    `<g stroke="#2e2840" stroke-width="5" stroke-linecap="square"><path d="M20 10 V40 H50 M80 10 V30 M110 20 H140 V60 M30 60 H70 V90 M100 50 V80 H130 M60 40 V60"/></g>` +
    `<path d="M80 52 L140 30 L148 66 Z" fill="#fff3b0" opacity=".25"/>` + cheese(130, 50, 1) + cheese(40, 80, 0.8) +
    `<circle cx="80" cy="52" r="7" fill="#9aa1ae"/><circle cx="75" cy="46" r="3" fill="#9aa1ae"/><circle cx="85" cy="46" r="3" fill="#9aa1ae"/><path d="M73 54 q-10 6 -14 0" stroke="#e79aa0" stroke-width="1.2" fill="none"/>`,
  kart: id => `<rect width="160" height="100" fill="#4dae4a"/><path d="M30 80 C0 60 10 20 50 22 C80 24 80 50 110 40 C150 26 160 70 120 80 Z" fill="none" stroke="#3a3a42" stroke-width="18"/><path d="M30 80 C0 60 10 20 50 22 C80 24 80 50 110 40 C150 26 160 70 120 80 Z" fill="none" stroke="#fff" stroke-width="0.8" stroke-dasharray="4 4"/>` +
    `<path d="M120 80 H30" stroke="#3a3a42" stroke-width="18"/><path d="M58 72 v16" stroke="#fff" stroke-width="3" stroke-dasharray="2 2"/>` +
    `<g transform="translate(80 80)"><rect x="-9" y="-5" width="18" height="10" rx="3" fill="${B}"/><circle cx="-6" cy="5" r="2.5" fill="#111"/><circle cx="6" cy="5" r="2.5" fill="#111"/></g><g transform="translate(104 82)"><rect x="-9" y="-5" width="18" height="10" rx="3" fill="${O}"/><circle cx="-6" cy="5" r="2.5" fill="#111"/><circle cx="6" cy="5" r="2.5" fill="#111"/></g>`,
  swords: id => sky(id, '#ffb36b', '#7b5cc4') + sun(120, 30, 12) + `<path d="M0 78 Q40 64 80 74 T160 70 V100 H0 Z" fill="#4b3a78"/><rect y="84" width="160" height="16" fill="#6b4a2f"/>` +
    cat(50, 62, 0.95, B) + cat(110, 62, 0.95, O) + `<path d="M58 66 L82 44" stroke="#e8eef8" stroke-width="3" stroke-linecap="round"/><path d="M102 66 L78 44" stroke="#e8eef8" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M80 34 l2 6 l6 -2 l-4 5 l5 4 l-6 0 l-1 6 l-3 -5 l-5 3 l2 -6 l-5 -3 l6 -1 z" fill="#ffe14d"/>`,
  stare: id => sky(id, '#2a1e3a', '#120c1a') +
    [[46, 50, B], [114, 50, O]].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="26" ry="20" fill="${c}" opacity=".25"/><ellipse cx="${x - 10}" cy="${y}" rx="8" ry="10" fill="#fff"/><ellipse cx="${x + 10}" cy="${y}" rx="8" ry="10" fill="#fff"/><circle cx="${x - 8}" cy="${y + 1}" r="4" fill="#222"/><circle cx="${x + 12}" cy="${y + 1}" r="4" fill="#222"/>`).join('') +
    text(80, 56, 'VS', 12, '#ffe14d') + `<path d="M50 80 h20 M90 80 h20" stroke="#fff" stroke-width="2" opacity=".5"/>`,
  boxing: id => sky(id, '#5a1e2a', '#2a0e16') + `<path d="M0 30 H160 M0 44 H160 M0 58 H160" stroke="#ff4d6d" stroke-width="2" opacity=".55"/>` +
    `<g transform="translate(50 56) rotate(-20)"><ellipse rx="18" ry="15" fill="#ff3b30"/><ellipse cx="-12" cy="-4" rx="6" ry="9" fill="#ff3b30"/><rect x="-10" y="12" width="20" height="8" rx="2" fill="#fff"/></g>` +
    `<g transform="translate(112 50) rotate(20)"><ellipse rx="18" ry="15" fill="${B}"/><ellipse cx="12" cy="-4" rx="6" ry="9" fill="${B}"/><rect x="-10" y="12" width="20" height="8" rx="2" fill="#fff"/></g>` + text(82, 34, 'POW!', 13, '#ffe14d'),
  parkour: id => sky(id, '#ffb36b', '#5a2e8e') + sun(124, 50, 14, '#ffd27a') +
    `<rect x="0" y="70" width="50" height="30" fill="#2a1e4a"/><rect x="66" y="62" width="40" height="38" fill="#2a1e4a"/><rect x="122" y="76" width="38" height="24" fill="#2a1e4a"/><rect x="66" y="58" width="40" height="4" fill="#ffd23f"/><rect x="0" y="66" width="50" height="4" fill="#ff5a5a"/>` +
    cat(56, 46, 0.85, O) + `<path d="M40 52 h-10 M42 58 h-12" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>` + cat(130, 56, 0.75, '#f2f2f2'),
  poop: id => `<rect width="160" height="100" fill="#cff3e6"/>` + Array.from({ length: 8 }, (_, n) => `<path d="M${n * 20} 0 V80 M0 ${n * 12} H160" stroke="#a8e0cc" stroke-width="0.8"/>`).join('') +
    `<rect y="80" width="160" height="20" fill="#ffd6ec"/>` + Array.from({ length: 8 }, (_, n) => `<rect x="${n * 20}" y="${n % 2 ? 80 : 90}" width="10" height="10" fill="#ffb0d6"/>`).join('') +
    `<g transform="translate(18 66)"><ellipse cx="6" cy="0" rx="10" ry="4" fill="#fff" stroke="#bbb"/><rect x="0" y="0" width="12" height="14" fill="#fff" stroke="#bbb"/></g><g transform="translate(130 66)"><ellipse cx="6" cy="0" rx="10" ry="4" fill="#fff" stroke="#bbb"/><rect x="0" y="0" width="12" height="14" fill="#fff" stroke="#bbb"/></g>` +
    cat(60, 54, 0.9, O) + cat(102, 54, 0.9, B) + `<path d="M76 40 q4 -6 8 0 q-4 -2 -8 0 z" fill="#7a4a2a"/><circle cx="81" cy="44" r="5" fill="#8a5a3a"/>`,
  cheese: id => sky(id, '#3a2c4f', '#5b4372') + `<ellipse cx="80" cy="10" rx="14" ry="4" fill="#120c1a"/><path d="M68 10 H92 L104 80 H56 Z" fill="#ffe68c" opacity=".2"/>` +
    `<rect y="80" width="160" height="20" fill="#7a5a3c"/>` + cheese(80, 36, 1.3) + cheese(86, 74, 1, true) +
    `<g><path d="M6 60 h24 l-3 20 h-18 z" fill="#1e3e8a"/><rect x="4" y="57" width="28" height="5" fill="${B}"/></g><g><path d="M130 60 h24 l-3 20 h-18 z" fill="#9a4700"/><rect x="128" y="57" width="28" height="5" fill="${O}"/></g>` +
    cat(50, 60, 0.85, B) + arm(55, 66, 66, 56, 72, 70, B, 2.4) + cat(112, 60, 0.85, O),
  laser: id => `<rect width="160" height="100" fill="#523a2e"/>` + Array.from({ length: 6 }, (_, n) => `<rect y="${n * 18}" width="160" height="16" fill="${n % 2 ? '#5a4033' : '#4a3328'}"/>`).join('') +
    `<circle cx="96" cy="44" r="14" fill="#ff2a2a" opacity=".25"/><circle cx="96" cy="44" r="6" fill="#ff2a2a" opacity=".7"/><circle cx="96" cy="44" r="3" fill="#ffe0e0"/>` +
    `<circle cx="40" cy="70" r="12" fill="#ff2a2a" opacity=".2"/><circle cx="40" cy="70" r="3" fill="#ffe0e0"/>` +
    [[84, 56, B], [124, 30, O]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="9" fill="${shade(c)}"/><circle cx="${x}" cy="${y + 2}" r="4" fill="#ffd8e0"/><circle cx="${x - 5}" cy="${y - 4}" r="2" fill="#ffd8e0"/><circle cx="${x}" cy="${y - 6}" r="2" fill="#ffd8e0"/><circle cx="${x + 5}" cy="${y - 4}" r="2" fill="#ffd8e0"/>`).join(''),
  gator: id => sky(id, '#1d4634', '#0b1d17') + `<rect width="160" height="8" fill="#2f7a3a"/>` +
    [[40, 34], [96, 26], [148, 30]].map(([x, y]) => `<path d="M${x} 6 Q${x + 6} ${y / 2} ${x} ${y}" stroke="#3f9a3a" stroke-width="2.5" fill="none"/><circle cx="${x}" cy="${y + 3}" r="3" fill="none" stroke="#3f9a3a" stroke-width="2"/>`).join('') +
    `<rect y="82" width="160" height="18" fill="#123f4a"/>` +
    [30, 110].map(x => `<ellipse cx="${x}" cy="84" rx="20" ry="5" fill="#2f6b2a"/><path d="M${x - 18} 83 l-14 -2 l0 4 z" fill="#3b8233"/><circle cx="${x - 14}" cy="80" r="1.6" fill="#e8d34a"/>`).join('') +
    arm(96, 26, 104, 46, 92, 60, O, 3) + cat(92, 62, 0.85, O) + arm(40, 34, 30, 50, 40, 56, B, 2.6) + cat(42, 58, 0.75, B),
  yarn: id => `<rect width="160" height="100" fill="#2b2033"/>` +
    `<path d="M20 20 C80 90 60 0 140 70" stroke="#ff4d6d" stroke-width="3" fill="none"/><path d="M20 80 C70 10 100 100 140 26" stroke="#37b4ff" stroke-width="3" fill="none"/><path d="M30 50 C60 20 110 80 140 46" stroke="#ffd23f" stroke-width="3" fill="none"/>` +
    `<path d="M20 20 C50 54 56 40 70 44" stroke="#fff" stroke-width="2" fill="none" style="filter:drop-shadow(0 0 3px #ff4d6d)"/>` +
    `<circle cx="20" cy="20" r="8" fill="#ff4d6d"/><path d="M15 18 a6 6 0 0 1 10 0 M14 23 a6 6 0 0 0 11 0" stroke="#a8243e" fill="none"/>` + text(140, 74, '🐟', 12),
  claw: id => sky(id, '#2a3e5a', '#16223a') +
    `<rect x="18" y="24" width="44" height="44" rx="8" fill="#1d2c44" stroke="${B}" stroke-width="2"/><rect x="98" y="24" width="44" height="44" rx="8" fill="#1d2c44" stroke="${O}" stroke-width="2"/>` +
    text(40, 54, '✊', 20) + text(120, 54, '✌️', 20) + text(80, 52, 'VS', 10, '#ffe14d') +
    `<g fill="#ffd8a8">${[0, 1, 2].map(n => `<circle cx="${66 + n * 14}" cy="84" r="5"/>`).join('')}</g>`,
  potato: id => sky(id, '#3a1414', '#1a0a0a') +
    cat(30, 56, 0.95, B) + cat(130, 56, 0.95, O) +
    `<path d="M48 40 Q80 4 112 40" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 3" fill="none" opacity=".5"/>` +
    `<circle cx="80" cy="40" r="14" fill="#2a2a3a"/><circle cx="76" cy="36" r="4" fill="#fff" opacity=".2"/><rect x="77" y="22" width="6" height="6" fill="#555"/><path d="M80 22 q4 -6 8 -4" stroke="#c9a77a" stroke-width="1.5" fill="none"/>` +
    `<path d="M88 18 l2 -5 l1 4 l4 -2 l-2 4 l4 1 l-5 1 l1 4 l-3 -3 z" fill="#ffb02e"/>`,
  memory: id => sky(id, '#2a3a6a', '#16203a') +
    [0, 1, 2, 3].flatMap(cx => [0, 1].map(cy => [cx, cy])).map(([cx, cy]) => {
      const x = 22 + cx * 30, y = 18 + cy * 36, up = (cx === 1 && cy === 0) || (cx === 3 && cy === 1);
      return `<rect x="${x}" y="${y}" width="26" height="32" rx="4" fill="${up ? '#fff' : '#5b6bff'}" stroke="${up ? '#3ddc84' : '#3a48c8'}" stroke-width="1.5"/>` + (up ? text(x + 13, y + 22, '🐟', 14) : `<circle cx="${x + 13}" cy="${y + 16}" r="5" fill="#7a88ff"/>`);
    }).join(''),
  sequence: id => sky(id, '#241c3a', '#120c1e') +
    [[50, 30, '#ff4d6d', 1], [110, 30, '#37b4ff', 0], [50, 74, '#ffd23f', 0], [110, 74, '#3ddc84', 1]].map(([x, y, c, on]) =>
      `<rect x="${x - 22}" y="${y - 18}" width="44" height="36" rx="10" fill="${c}" opacity="${on ? 1 : 0.35}"/>` + (on ? `<rect x="${x - 26}" y="${y - 22}" width="52" height="44" rx="12" fill="none" stroke="${c}" stroke-width="2" opacity=".6"/>` : '')).join('') +
    text(80, 57, '3', 14, '#fff'),
  speedchess: id => `<rect width="160" height="100" fill="#13213a"/>` + Array.from({ length: 36 }, (_, n) => { const x = n % 6, y = Math.floor(n / 6); return `<rect x="${32 + x * 16}" y="${2 + y * 16}" width="16" height="16" fill="${(x + y) % 2 ? '#4a86c8' : '#dbe8f8'}"/>`; }).join('') +
    text(56, 30, '♞', 14, '#111') + text(104, 62, '♛', 14, '#fff') + text(72, 78, '♟', 12, '#fff') + text(136, 54, '⏱', 12, '#ffe14d') + text(136, 70, '83', 9, '#ff6b6b'),
  chess: id => `<rect width="160" height="100" fill="#3a2a20"/>` + Array.from({ length: 36 }, (_, n) => { const x = n % 6, y = Math.floor(n / 6); return `<rect x="${32 + x * 16}" y="${2 + y * 16}" width="16" height="16" fill="${(x + y) % 2 ? '#b07a4a' : '#f0d9b5'}"/>`; }).join('') +
    text(64, 46, '♞', 16, '#fff') + text(96, 30, '♚', 16, '#111') + text(80, 78, '♜', 14, '#fff') + `<rect x="128" y="34" width="22" height="18" rx="3" fill="#2a2a3a"/><circle cx="134" cy="42" r="2" fill="#5ad1ff"/><circle cx="144" cy="42" r="2" fill="#5ad1ff"/>`,
  scramble: id => sky(id, '#1e3a3a', '#0e2020') +
    ['C', 'A', 'T', 'S'].map((l, n) => `<g transform="translate(${30 + n * 26} ${40 + (n % 2 ? 6 : -4)}) rotate(${n % 2 ? 8 : -6})"><rect x="-11" y="-12" width="22" height="24" rx="4" fill="#ffe8b0" stroke="#c9a24a" stroke-width="1.5"/>` + text(0, 7, l, 15, '#5a3a1a') + '</g>').join('') +
    `<path d="M40 78 h80" stroke="#3ddc84" stroke-width="2" stroke-dasharray="6 4"/>`,
  type: id => sky(id, '#1a2236', '#0e1422') +
    `<rect x="16" y="14" width="128" height="22" rx="5" fill="#0a0f1a" stroke="#2c3a58"/>` + `<text x="24" y="29" font-family="monospace" font-size="10" fill="#3ddc84">the quick cat</text><text x="105" y="29" font-family="monospace" font-size="10" fill="#5a6a88">jum</text>` +
    Array.from({ length: 3 }, (_, r) => Array.from({ length: 9 - r }, (_, n) => `<rect x="${20 + r * 6 + n * 14}" y="${48 + r * 14}" width="12" height="11" rx="2" fill="${r === 1 && n === 3 ? '#37b4ff' : '#2c3a58'}"/>`).join('')).join(''),
};

CA.gameArt = gid => {
  const f = ART[gid];
  if (!f) return '';
  const id = 'ga' + (++uid);
  return '<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + f(id) + '</svg>';
};

})();
