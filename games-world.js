/* Classic Games: Flag Quiz and GeoGuessr (find famous places on a world map).
   The flags are drawn here because Windows can't show flag emojis. */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, shuffle, startTimer, stopTimer, roundMatch } = CA.games.kit;
const skillOf = ctx => (ctx.bot ? (ctx.bot.level - 1) / 8 : 0); // 0 = easy bot … 1 = hard bot
const msOf = v => (v && Number.isFinite(v.ms) ? v.ms : Infinity);
const secs = ms => (ms / 1000).toFixed(1) + 's';

/* ================= FLAG DRAWING (30 × 20) ================= */

const FW = 30;
const FH = 20;
const n2 = v => +(+v).toFixed(2);
const rect = (x, y, w, h, fill) => '<rect x="' + n2(x) + '" y="' + n2(y) + '" width="' + n2(w) + '" height="' + n2(h) + '" fill="' + fill + '"/>';
const circle = (cx, cy, r, fill) => '<circle cx="' + n2(cx) + '" cy="' + n2(cy) + '" r="' + n2(r) + '" fill="' + fill + '"/>';
const poly = (pts, fill) => '<polygon points="' + pts + '" fill="' + fill + '"/>';

function bands(colors, weights, vertical) {
  const ws = weights || colors.map(() => 1);
  const total = ws.reduce((a, b) => a + b, 0);
  let at = 0;
  return colors.map((c, i) => {
    const size = (vertical ? FW : FH) * ws[i] / total;
    const s = vertical ? rect(at, 0, size + 0.05, FH, c) : rect(0, at, FW, size + 0.05, c);
    at += size;
    return s;
  }).join('');
}
const hb = (colors, weights) => bands(colors, weights, false);
const vb = (colors, weights) => bands(colors, weights, true);

function star(cx, cy, r, fill, rot = -90, points = 5, inner = 0.382) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const a = (rot + i * 180 / points) * Math.PI / 180;
    const rr = i % 2 ? r * inner : r;
    d += (i ? 'L' : 'M') + n2(cx + rr * Math.cos(a)) + ',' + n2(cy + rr * Math.sin(a));
  }
  return '<path d="' + d + 'Z" fill="' + fill + '"/>';
}

// A five-pointed star drawn as lines (Morocco, Ethiopia).
function pentagram(cx, cy, r, color, width) {
  const pts = [];
  for (let i = 0; i < 5; i++) { const a = (-90 + i * 72) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return '<path d="' + [0, 2, 4, 1, 3].map((k, i) => (i ? 'L' : 'M') + n2(pts[k][0]) + ',' + n2(pts[k][1])).join('') +
    'Z" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linejoin="round"/>';
}

// A crescent opening to the right: a circle (radius R) minus a smaller circle (radius r) moved d to the right.
function crescent(cx, cy, R, r, d, fill) {
  const x = (R * R - r * r + d * d) / (2 * d), y = Math.sqrt(R * R - x * x);
  const p1 = n2(cx + x) + ',' + n2(cy - y), p2 = n2(cx + x) + ',' + n2(cy + y);
  return '<path d="M' + p1 + ' A' + R + ',' + R + ' 0 1 0 ' + p2 + ' A' + r + ',' + r + ' 0 1 1 ' + p1 + 'Z" fill="' + fill + '"/>';
}

function nordic(bg, cross, inner) {
  if (!inner) return rect(0, 0, FW, FH, bg) + rect(9, 0, 4, FH, cross) + rect(0, 8, FW, 4, cross);
  return rect(0, 0, FW, FH, bg) + rect(8.5, 0, 5, FH, cross) + rect(0, 7.5, FW, 5, cross) + rect(9.75, 0, 2.5, FH, inner) + rect(0, 8.75, FW, 2.5, inner);
}

const UNION_JACK = '<rect width="60" height="30" fill="#012169"/>' +
  '<path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" stroke-width="6"/>' +
  '<path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2"/>' +
  '<path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" stroke-width="10"/>' +
  '<path d="M30,0 V30 M0,15 H60" stroke="#C8102E" stroke-width="6"/>';
const unionJack = (x, y, w, h) => '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="0 0 60 30" preserveAspectRatio="none">' + UNION_JACK + '</svg>';

const MAPLE = [[0, -5], [1, -3], [2.2, -3.6], [1.8, -1.2], [4, -2.6], [3.6, -1.6], [5, -1.4], [3.8, 0.2], [4.2, 0.8], [1.4, 1.6], [1.6, 2.6],
  [0.3, 2.2], [0.3, 4.6], [-0.3, 4.6], [-0.3, 2.2], [-1.6, 2.6], [-1.4, 1.6], [-4.2, 0.8], [-3.8, 0.2], [-5, -1.4], [-3.6, -1.6],
  [-4, -2.6], [-1.8, -1.2], [-2.2, -3.6], [-1, -3]];
const maple = (cx, cy, s, fill) => poly(MAPLE.map(([x, y]) => n2(cx + x * s) + ',' + n2(cy + y * s)).join(' '), fill);

const INDIA_WHEEL = (() => {
  let s = '<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width="0.45"/>' + circle(15, 10, 0.5, '#000080');
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    s += '<line x1="15" y1="10" x2="' + n2(15 + 2.5 * Math.cos(a)) + '" y2="' + n2(10 + 2.5 * Math.sin(a)) + '" stroke="#000080" stroke-width="0.22"/>';
  }
  return s;
})();

const KOREA = (() => {
  const trigram = (cx, cy, a) => '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + a + ')">' +
    [-1.3, 0, 1.3].map(y => rect(-2.5, y - 0.4, 5, 0.8, '#000000')).join('') + '</g>';
  return rect(0, 0, FW, FH, '#FFFFFF') +
    '<g transform="rotate(33.69 15 10)"><path d="M10,10 A5,5 0 0 1 20,10 Z" fill="#CD2E3A"/><path d="M10,10 A5,5 0 0 0 20,10 Z" fill="#0047A0"/>' +
    circle(12.5, 10, 2.5, '#CD2E3A') + circle(17.5, 10, 2.5, '#0047A0') + '</g>' +
    trigram(7.18, 4.79, 123.69) + trigram(22.82, 15.21, 123.69) + trigram(22.82, 4.79, 56.31) + trigram(7.18, 15.21, 56.31);
})();

const GREECE = (() => {
  const c = FH * 5 / 9;
  return hb(Array.from({ length: 9 }, (_, i) => (i % 2 ? '#FFFFFF' : '#0D5EAF'))) +
    rect(0, 0, c, c, '#0D5EAF') + rect(c * 0.4, 0, c * 0.2, c, '#FFFFFF') + rect(0, c * 0.4, c, c * 0.2, '#FFFFFF');
})();

const USA = (() => {
  let s = hb(Array.from({ length: 13 }, (_, i) => (i % 2 ? '#FFFFFF' : '#B22234'))) + rect(0, 0, 12, FH * 7 / 13, '#3C3B6E');
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) s += circle(1.1 + c * 1.95, 1.1 + r * 2.07, 0.42, '#FFFFFF');
  return s;
})();

const MOROCCO = rect(0, 0, FW, FH, '#C1272D') + pentagram(15, 10, 4.6, '#006233', 0.9);

// Stars with a white rim (New Zealand).
const rimStar = (cx, cy, r) => star(cx, cy, r + 0.4, '#FFFFFF') + star(cx, cy, r, '#C8102E');

const FLAGS = {
  fr: ['France', vb(['#0055A4', '#FFFFFF', '#EF4135'])],
  it: ['Italy', vb(['#009246', '#FFFFFF', '#CE2B37'])],
  ie: ['Ireland', vb(['#169B62', '#FFFFFF', '#FF883E'])],
  be: ['Belgium', vb(['#000000', '#FDDA24', '#EF3340'])],
  ro: ['Romania', vb(['#002B7F', '#FCD116', '#CE1126'])],
  ng: ['Nigeria', vb(['#008751', '#FFFFFF', '#008751'])],
  mx: ['Mexico', vb(['#006847', '#FFFFFF', '#CE1126']) + circle(15, 10, 2.3, '#8C5A2B') + '<path d="M12.6,11.6 Q15,14.2 17.4,11.6" stroke="#2E7D32" stroke-width="0.7" fill="none"/>'],
  ca: ['Canada', vb(['#D52B1E', '#FFFFFF', '#D52B1E'], [1, 2, 1]) + maple(15, 10.4, 1.25, '#D52B1E')],
  pe: ['Peru', vb(['#D91023', '#FFFFFF', '#D91023'])],
  de: ['Germany', hb(['#000000', '#DD0000', '#FFCE00'])],
  nl: ['Netherlands', hb(['#AE1C28', '#FFFFFF', '#21468B'])],
  ru: ['Russia', hb(['#FFFFFF', '#0039A6', '#D52B1E'])],
  at: ['Austria', hb(['#ED2939', '#FFFFFF', '#ED2939'])],
  hu: ['Hungary', hb(['#CD2A3E', '#FFFFFF', '#436F4D'])],
  ua: ['Ukraine', hb(['#0057B7', '#FFD700'])],
  pl: ['Poland', hb(['#FFFFFF', '#DC143C'])],
  id: ['Indonesia', hb(['#FF0000', '#FFFFFF'])],
  co: ['Colombia', hb(['#FCD116', '#003893', '#CE1126'], [2, 1, 1])],
  es: ['Spain', hb(['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1])],
  ar: ['Argentina', hb(['#74ACDF', '#FFFFFF', '#74ACDF']) + star(15, 10, 2.3, '#F6B40E', -90, 16, 0.6) + circle(15, 10, 1.3, '#F6B40E')],
  in: ['India', hb(['#FF9933', '#FFFFFF', '#138808']) + INDIA_WHEEL],
  th: ['Thailand', hb(['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], [1, 1, 2, 1, 1])],
  eg: ['Egypt', hb(['#CE1126', '#FFFFFF', '#000000']) + '<path d="M15,7.9 L16.4,9.6 L16,12 L14,12 L13.6,9.6 Z" fill="#C09300"/>'],
  se: ['Sweden', nordic('#006AA7', '#FECC00')],
  dk: ['Denmark', nordic('#C8102E', '#FFFFFF')],
  no: ['Norway', nordic('#BA0C2F', '#FFFFFF', '#00205B')],
  fi: ['Finland', nordic('#FFFFFF', '#002F6C')],
  is: ['Iceland', nordic('#02529C', '#FFFFFF', '#DC1E35')],
  jp: ['Japan', rect(0, 0, FW, FH, '#FFFFFF') + circle(15, 10, 6, '#BC002D')],
  bd: ['Bangladesh', rect(0, 0, FW, FH, '#006A4E') + circle(13.5, 10, 6, '#F42A41')],
  kr: ['South Korea', KOREA],
  ch: ['Switzerland', rect(0, 0, FW, FH, '#DA291C') + rect(12.9, 4.5, 4.2, 11, '#FFFFFF') + rect(9.5, 7.9, 11, 4.2, '#FFFFFF')],
  gr: ['Greece', GREECE],
  us: ['United States', USA],
  gb: ['United Kingdom', unionJack(0, 0, FW, FH)],
  br: ['Brazil', rect(0, 0, FW, FH, '#009C3B') + poly('2.6,10 15,2 27.4,10 15,18', '#FFDF00') + circle(15, 10, 4.6, '#002776') +
    '<path d="M10.5,9.2 Q15,7.7 19.6,10.9" stroke="#FFFFFF" stroke-width="0.9" fill="none"/>'],
  cn: ['China', rect(0, 0, FW, FH, '#DE2910') + star(5, 5, 3, '#FFDE00') + star(10, 2, 1, '#FFDE00', -60) + star(12, 4, 1, '#FFDE00', -80) +
    star(12, 7, 1, '#FFDE00', -100) + star(10, 9, 1, '#FFDE00', -120)],
  vn: ['Vietnam', rect(0, 0, FW, FH, '#DA251D') + star(15, 10, 6, '#FFFF00')],
  tr: ['Turkey', rect(0, 0, FW, FH, '#E30A17') + circle(11, 10, 5, '#FFFFFF') + circle(12.25, 10, 4, '#E30A17') + star(16.6, 10, 2.2, '#FFFFFF', 180)],
  il: ['Israel', rect(0, 0, FW, FH, '#FFFFFF') + rect(0, 2, FW, 2.8, '#0038B8') + rect(0, 15.2, FW, 2.8, '#0038B8') +
    '<path d="M15,6.2 L18.3,11.9 L11.7,11.9 Z M15,13.8 L11.7,8.1 L18.3,8.1 Z" fill="none" stroke="#0038B8" stroke-width="0.9"/>'],
  jm: ['Jamaica', rect(0, 0, FW, FH, '#009B3A') + poly('0,0 12,10 0,20', '#000000') + poly('30,0 18,10 30,20', '#000000') +
    '<path d="M0,0 L30,20 M30,0 L0,20" stroke="#FED100" stroke-width="2.6"/>'],
  za: ['South Africa', rect(0, 0, FW, FH, '#002395') + rect(0, 0, FW, 10, '#E03C31') +
    '<path d="M0,0 L12.5,10 L30,10 M0,20 L12.5,10" stroke="#FFFFFF" stroke-width="6.4" fill="none"/>' +
    '<path d="M0,0 L12.5,10 L30,10 M0,20 L12.5,10" stroke="#007749" stroke-width="4" fill="none"/>' +
    poly('0,3.1 8.6,10 0,16.9', '#FFB81C') + poly('0,4.7 6.6,10 0,15.3', '#000000')],
  au: ['Australia', rect(0, 0, FW, FH, '#012169') + unionJack(0, 0, 15, 10) + star(7.5, 15, 2.4, '#FFFFFF', -90, 7, 0.45) +
    star(22.5, 16.3, 1.2, '#FFFFFF', -90, 7, 0.45) + star(22.5, 3.6, 1.2, '#FFFFFF', -90, 7, 0.45) + star(18.6, 8.6, 1.2, '#FFFFFF', -90, 7, 0.45) +
    star(26.2, 7.4, 1.2, '#FFFFFF', -90, 7, 0.45) + star(24.3, 11.2, 0.65, '#FFFFFF')],
  cl: ['Chile', rect(0, 0, FW, FH, '#FFFFFF') + rect(0, 10, FW, 10, '#D52B1E') + rect(0, 0, 10, 10, '#0039A6') + star(5, 5, 2.6, '#FFFFFF')],
  cu: ['Cuba', hb(['#002A8F', '#FFFFFF', '#002A8F', '#FFFFFF', '#002A8F']) + poly('0,0 13,10 0,20', '#CF142B') + star(4.4, 10, 2.4, '#FFFFFF')],
  cz: ['Czechia', hb(['#FFFFFF', '#D7141A']) + poly('0,0 15,10 0,20', '#11457E')],
  ph: ['Philippines', hb(['#0038A8', '#CE1126']) + poly('0,0 17.3,10 0,20', '#FFFFFF') + star(5.6, 10, 3.1, '#FCD116', -90, 8, 0.45) +
    circle(5.6, 10, 1.9, '#FCD116') + star(1.8, 2.3, 0.9, '#FCD116') + star(1.8, 17.7, 0.9, '#FCD116') + star(14.6, 10, 0.9, '#FCD116')],
  pk: ['Pakistan', rect(0, 0, 7.5, FH, '#FFFFFF') + rect(7.5, 0, 22.5, FH, '#01411C') + circle(19.2, 10.6, 5.4, '#FFFFFF') +
    circle(20.6, 9.2, 4.6, '#01411C') + star(21.9, 7.9, 1.6, '#FFFFFF', -45)],
  pt: ['Portugal', rect(0, 0, 12, FH, '#006600') + rect(12, 0, 18, FH, '#FF0000') + circle(12, 10, 4.2, '#FFCC00') +
    rect(10.4, 7.6, 3.2, 4.6, '#FF0000') + rect(11.1, 8.4, 1.8, 3, '#FFFFFF')],
  ma: ['Morocco', MOROCCO],
  gh: ['Ghana', hb(['#CE1126', '#FCD116', '#006B3F']) + star(15, 10, 3.2, '#000000')],
  ve: ['Venezuela', hb(['#FFCC00', '#00247D', '#CF142B']) + Array.from({ length: 8 }, (_, i) => {
    const a = (200 + i * 20) * Math.PI / 180;
    return star(15 + 4.6 * Math.cos(a), 12.4 + 4.6 * Math.sin(a), 0.75, '#FFFFFF');
  }).join('')],
  ke: ['Kenya', rect(0, 0, FW, 6, '#000000') + rect(0, 6, FW, 1.2, '#FFFFFF') + rect(0, 7.2, FW, 5.6, '#BB0000') + rect(0, 12.8, FW, 1.2, '#FFFFFF') +
    rect(0, 14, FW, 6, '#006600') + '<path d="M11.5,4 L18.5,16 M18.5,4 L11.5,16" stroke="#FFFFFF" stroke-width="0.5"/>' +
    '<ellipse cx="15" cy="10" rx="2.8" ry="5.6" fill="#BB0000" stroke="#000000" stroke-width="0.5"/><ellipse cx="15" cy="10" rx="1.1" ry="3.6" fill="#FFFFFF"/>'],
  sg: ['Singapore', hb(['#EF3340', '#FFFFFF']) + circle(6.2, 5, 3.1, '#FFFFFF') + circle(7.5, 5, 2.8, '#EF3340') +
    [0, 1, 2, 3, 4].map(i => { const a = (-90 + i * 72) * Math.PI / 180; return star(9.8 + 1.6 * Math.cos(a), 5 + 1.6 * Math.sin(a), 0.55, '#FFFFFF'); }).join('')],
  // (harder ones: each looks a lot like others in HARD_GROUPS below)
  ci: ["Côte d'Ivoire", vb(['#F77F00', '#FFFFFF', '#009E60'])],
  lv: ['Latvia', hb(['#9E3039', '#FFFFFF', '#9E3039'], [2, 1, 2])],
  ye: ['Yemen', hb(['#CE1126', '#FFFFFF', '#000000'])],
  sy: ['Syria', hb(['#CE1126', '#FFFFFF', '#000000']) + star(10.5, 10, 1.8, '#007A3D') + star(19.5, 10, 1.8, '#007A3D')],
  sd: ['Sudan', hb(['#D21034', '#FFFFFF', '#000000']) + poly('0,0 10,10 0,20', '#007229')],
  ml: ['Mali', vb(['#14B53A', '#FCD116', '#CE1126'])],
  gn: ['Guinea', vb(['#CE1126', '#FCD116', '#009460'])],
  sn: ['Senegal', vb(['#00853F', '#FDEF42', '#E31B23']) + star(15, 10, 2.8, '#00853F')],
  cm: ['Cameroon', vb(['#007A5E', '#CE1126', '#FCD116']) + star(15, 10, 2.8, '#FCD116')],
  bo: ['Bolivia', hb(['#D52B1E', '#F9E300', '#007934'])],
  lt: ['Lithuania', hb(['#FDB913', '#006A44', '#C1272D'])],
  et: ['Ethiopia', hb(['#078930', '#FCDD09', '#DA121A']) + circle(15, 10, 4.4, '#0F47AF') + pentagram(15, 10.3, 3.2, '#FCDD09', 0.55)],
  ec: ['Ecuador', hb(['#FFD100', '#0072CE', '#EF3340'], [2, 1, 1]) +
    '<ellipse cx="15" cy="10" rx="2.4" ry="3" fill="#6DA9D2" stroke="#8B5A2B" stroke-width="0.5"/>' +
    '<path d="M11.4,7 Q15,4.6 18.6,7 Q15,6 11.4,7Z" fill="#3E2B1A"/>' + rect(14.4, 11.2, 1.2, 1.6, '#2E7D32')],
  hn: ['Honduras', hb(['#0073CF', '#FFFFFF', '#0073CF']) + [[15, 10], [11.2, 8.4], [18.8, 8.4], [11.2, 11.6], [18.8, 11.6]].map(([x, y]) => star(x, y, 1.05, '#0073CF')).join('')],
  ni: ['Nicaragua', hb(['#0067C6', '#FFFFFF', '#0067C6']) + '<circle cx="15" cy="10" r="2.4" fill="none" stroke="#C9A227" stroke-width="0.45"/>' +
    poly('13.3,11.2 15,8.2 16.7,11.2', '#3A9BD9') + rect(13.6, 10.5, 2.8, 0.7, '#3E8E41')],
  gt: ['Guatemala', vb(['#4997D0', '#FFFFFF', '#4997D0']) + '<circle cx="15" cy="10" r="2.7" fill="none" stroke="#3A8F3A" stroke-width="0.9"/>' +
    rect(13.4, 9.3, 3.2, 1.4, '#F0E4B0') + circle(15, 8.3, 0.7, '#2E9E5B')],
  tn: ['Tunisia', rect(0, 0, FW, FH, '#E70013') + circle(15, 10, 5, '#FFFFFF') + crescent(14.6, 10, 3.8, 3.05, 1, '#E70013') + star(16.2, 10, 2, '#E70013', -90)],
  dz: ['Algeria', vb(['#006233', '#FFFFFF']) + crescent(15.4, 10, 5, 4, 1.3, '#D21034') + star(17.6, 10, 2.2, '#D21034', -108)],
  nz: ['New Zealand', rect(0, 0, FW, FH, '#012169') + unionJack(0, 0, 15, 10) + rimStar(22.6, 15.8, 1.3) + rimStar(19.6, 9, 1.1) + rimStar(25.6, 8.2, 1.1) + rimStar(22.6, 4, 1)],
  fj: ['Fiji', rect(0, 0, FW, FH, '#68BFE5') + unionJack(0, 0, 15, 10) +
    '<path d="M19.8,6.4 H25.2 V10.6 Q25.2,13.2 22.5,14.3 Q19.8,13.2 19.8,10.6 Z" fill="#FFFFFF" stroke="#CE1126" stroke-width="0.3"/>' +
    rect(19.8, 6.4, 5.4, 1.6, '#CE1126') + circle(22.5, 7.2, 0.55, '#FFD100') + rect(22.15, 8, 0.7, 6, '#CE1126') + rect(19.8, 9.6, 5.4, 0.7, '#CE1126')],
  bg: ['Bulgaria', hb(['#FFFFFF', '#00966E', '#D62612'])],
  pw: ['Palau', rect(0, 0, FW, FH, '#4AADD6') + circle(13, 10, 5.3, '#FFDE00')],
  la: ['Laos', hb(['#CE1126', '#002868', '#CE1126'], [1, 2, 1]) + circle(15, 10, 4, '#FFFFFF')],
  lu: ['Luxembourg', hb(['#EA141D', '#FFFFFF', '#51ADDA'])],
  py: ['Paraguay', hb(['#D52B1E', '#FFFFFF', '#0038A8']) + '<circle cx="15" cy="10" r="2.3" fill="#FFFFFF" stroke="#1B7C3A" stroke-width="0.55"/>' + star(15, 10, 1, '#FCD116')],
  jo: ['Jordan', hb(['#000000', '#FFFFFF', '#007A3D']) + poly('0,0 15,10 0,20', '#CE1126') + star(4.8, 10, 1.7, '#FFFFFF', -90, 7, 0.5)],
};
// Rounds 1–2 use well-known flags. After that, all 4 answers come from one of these groups of look-alikes.
const EASY_FLAGS = ['us', 'gb', 'fr', 'de', 'it', 'jp', 'ca', 'br', 'cn', 'mx', 'es', 'in', 'kr', 'ch', 'au', 'gr', 'tr', 'se', 'ar', 'za', 'jm', 'il'];
const HARD_GROUPS = [
  ['se', 'dk', 'no', 'fi', 'is'], ['ie', 'ci', 'it', 'mx'], ['pl', 'id', 'at', 'lv', 'sg', 'pe'], ['ye', 'eg', 'sy', 'sd'],
  ['ml', 'gn', 'sn', 'cm'], ['gh', 'bo', 'lt', 'et'], ['co', 'ec', 've', 'ro'], ['ar', 'hn', 'ni', 'gt'], ['tr', 'tn', 'dz', 'pk'],
  ['au', 'nz', 'fj', 'gb'], ['hu', 'bg', 'it', 'ci'], ['jp', 'bd', 'pw', 'la'], ['nl', 'lu', 'ru', 'py'], ['cz', 'ph', 'cu', 'jo'],
];
const flagSVG = id => '<svg class="flag" viewBox="0 0 30 20" role="img" aria-label="A flag">' + FLAGS[id][1] + '</svg>';

/* ================= FLAG QUIZ ================= */

CA.games.add('flags', {
  name: 'Flag Quiz', icon: '🏳️', blurb: 'Which country is this flag from? The fastest right answer wins the round. First to 4! After 2 flags it gets hard: all the answers look alike.',
  start(ctx) {
    const EASY_MS = 6000, HARD_MS = 7500;
    const skill = skillOf(ctx);
    const sameGroup = (a, b) => HARD_GROUPS.some(g => g.includes(a) && g.includes(b));
    const rounds = shuffle(EASY_FLAGS, ctx.rng).slice(0, 2).map(id => {
      const others = shuffle(EASY_FLAGS.filter(k => k !== id && !sameGroup(k, id)), ctx.rng).slice(0, 3);
      return { id, options: shuffle([id].concat(others), ctx.rng), hard: false };
    });
    const used = new Set(rounds.map(rd => rd.id));
    shuffle(HARD_GROUPS, ctx.rng).slice(0, 5).forEach(group => {
      const fresh = group.filter(k => !used.has(k));
      const from = fresh.length ? fresh : group;
      const id = from[Math.floor(ctx.rng() * from.length)];
      used.add(id);
      rounds.push({ id, options: shuffle([id].concat(shuffle(group.filter(k => k !== id), ctx.rng).slice(0, 3)), ctx.rng), hard: true });
    });
    ctx.stage.innerHTML =
      '<div class="g-flags" id="fqBox"><div class="fq-flag" id="fqFlag"></div><div class="fq-opts" id="fqOpts"></div>' +
      '<div class="timer"><i id="fqTimer"></i></div><p class="g-msg" id="fqMsg"></p><p class="muted small center" id="fqThem"></p></div>';
    let onPick = null;
    ctx.listen($('fqOpts'), 'click', e => {
      const b = e.target.closest && e.target.closest('.fq-opt');
      if (b && onPick) onPick(+b.dataset.i);
    });
    ctx.listen(document, 'keydown', e => {
      const k = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
      if (k !== undefined && onPick) onPick(k);
    });
    const answer = r => rounds[r - 1].options.indexOf(rounds[r - 1].id);
    const pickOf = v => (v && Number.isInteger(v.pick) ? v.pick : -1);

    roundMatch(ctx, {
      target: 4,
      maxRounds: 7,
      revealMs: 2000,
      points(a, b, r) {
        const ok = answer(r);
        const ca = pickOf(a) === ok, cb = pickOf(b) === ok;
        if (ca && cb) { const ma = msOf(a), mb = msOf(b); return ma === mb ? [0, 0] : ma < mb ? [1, 0] : [0, 1]; }
        return [ca ? 1 : 0, cb ? 1 : 0];
      },
      play(r, submit) {
        const rd = rounds[r - 1];
        const ROUND = rd.hard ? HARD_MS : EASY_MS;
        if (window.__testHooks) window.__peek = { answer: answer(r) };
        ctx.note('Flag ' + r + ' · first to 4' + (rd.hard ? ' · 🔥 hard' : ''));
        $('fqBox').classList.toggle('hard', rd.hard);
        $('fqFlag').innerHTML = flagSVG(rd.id);
        $('fqOpts').innerHTML = rd.options.map((id, i) => '<button class="fq-opt" data-i="' + i + '"><kbd>' + (i + 1) + '</kbd>' + esc(FLAGS[id][0]) + '</button>').join('');
        setMsg('fqMsg', rd.hard ? '🔥 Hard flag! Look closely. Which country is this?' : 'Which country is this?');
        setMsg('fqThem', '');
        startTimer('fqTimer', ROUND);
        const t0 = performance.now();
        let picked = false;
        onPick = i => {
          if (picked) return;
          picked = true;
          onPick = null;
          const ms = Math.round(performance.now() - t0);
          ctx.stage.querySelectorAll('.fq-opt').forEach((b, k) => { b.disabled = true; b.classList.toggle('picked', k === i); });
          stopTimer('fqTimer');
          setMsg('fqMsg', i < 0 ? "Time's up!" : 'Locked in! Waiting for ' + ctx.oppName + '…');
          sound('tick');
          submit({ pick: i, ms });
        };
        ctx.later(() => { if (!picked) onPick(-1); }, ROUND);
      },
      onTheirs() { setMsg('fqThem', ctx.oppName + ' has answered'); },
      reveal(r, a, b, w) {
        const ok = answer(r);
        ctx.stage.querySelectorAll('.fq-opt').forEach((btn, k) => {
          btn.classList.toggle('right', k === ok);
          btn.classList.toggle('wrong', k === pickOf(a) && k !== ok);
        });
        const res = v => (pickOf(v) === ok ? '✅ ' + secs(msOf(v)) : '❌');
        setMsg('fqMsg', "It's " + FLAGS[rounds[r - 1].id][0] + '! ' + (w > 0 ? 'Point for you.' : w < 0 ? 'Point for ' + ctx.oppName + '.' : 'No point this time.'));
        setMsg('fqThem', 'You ' + res(a) + ' · ' + ctx.oppName + ' ' + res(b));
      },
      botValue(r) {
        const ok = answer(r);
        const hard = rounds[r - 1].hard;
        const wrongs = [0, 1, 2, 3].filter(k => k !== ok);
        const pick = Math.random() < (hard ? 0.3 + skill * 0.45 : 0.5 + skill * 0.42) ? ok : wrongs[Math.floor(Math.random() * wrongs.length)];
        const ms = gauss((hard ? 5000 : 4200) - skill * 2000, 900);
        return { pick, ms: Math.round(Math.min((hard ? HARD_MS : EASY_MS) - 300, Math.max(900, ms))) };
      },
      botDelay(r, v) { return v.ms; },
    });
  },
});

/* ================= GEOGUESSR ================= */

// [emoji, place, clue, where it really is, latitude, longitude]
const PLACES = [
  ['🗼', 'Eiffel Tower', 'Paris', 'Paris, France', 48.858, 2.294],
  ['🗽', 'Statue of Liberty', 'New York City', 'New York, USA', 40.689, -74.045],
  ['🕌', 'Taj Mahal', 'Agra', 'Agra, India', 27.175, 78.042],
  ['🐪', 'Pyramids of Giza', 'Cairo', 'Cairo, Egypt', 29.979, 31.134],
  ['🎶', 'Sydney Opera House', 'Sydney', 'Sydney, Australia', -33.857, 151.215],
  ['🗻', 'Mount Fuji', 'near Tokyo', 'Japan', 35.361, 138.727],
  ['🏛️', 'Colosseum', 'Rome', 'Rome, Italy', 41.890, 12.492],
  ['🧱', 'Great Wall', 'near Beijing', 'China', 40.432, 116.570],
  ['⛰️', 'Machu Picchu', 'in the Andes mountains', 'Peru', -13.163, -72.545],
  ['✝️', 'Christ the Redeemer', 'Rio de Janeiro', 'Rio de Janeiro, Brazil', -22.952, -43.211],
  ['🕰️', 'Big Ben', 'London', 'London, UK', 51.501, -0.125],
  ['🌉', 'Golden Gate Bridge', 'San Francisco', 'San Francisco, USA', 37.820, -122.478],
  ['🏔️', 'Mount Everest', 'the Himalayas', 'Nepal and China', 27.988, 86.925],
  ['🌋', 'Mount Kilimanjaro', 'East Africa', 'Tanzania', -3.067, 37.356],
  ['💦', 'Niagara Falls', 'between two countries', 'the USA and Canada', 43.080, -79.074],
  ['🗿', 'Moai statues', 'Easter Island', 'Easter Island, Chile', -27.113, -109.350],
  ['🏜️', 'Grand Canyon', 'Arizona', 'Arizona, USA', 36.107, -112.113],
  ['🏙️', 'Burj Khalifa', 'Dubai', 'Dubai, United Arab Emirates', 25.197, 55.274],
  ['🛕', 'Angkor Wat', 'Siem Reap', 'Cambodia', 13.412, 103.867],
  ['⛪', 'Sagrada Família', 'Barcelona', 'Barcelona, Spain', 41.404, 2.174],
  ['🏰', 'Neuschwanstein Castle', 'Bavaria', 'Germany', 47.558, 10.750],
  ['🪨', 'Uluru', 'the Outback', 'Australia', -25.344, 131.037],
  ['🌺', 'Waikiki Beach', 'Hawaii', 'Honolulu, Hawaii, USA', 21.277, -157.827],
  ['🌆', 'Marina Bay Sands', 'Singapore', 'Singapore', 1.283, 103.861],
  ['⛰️', 'Table Mountain', 'Cape Town', 'Cape Town, South Africa', -33.963, 18.410],
  ['🎅', 'Santa Claus Village', 'Lapland', 'Rovaniemi, Finland', 66.544, 25.847],
  ['🎬', 'Hollywood Sign', 'Los Angeles', 'Los Angeles, USA', 34.134, -118.322],
  ['🕌', 'Hagia Sophia', 'Istanbul', 'Istanbul, Turkey', 41.009, 28.980],
  ['🏺', 'Petra', 'the desert', 'Jordan', 30.329, 35.444],
  ['🏰', "St. Basil's Cathedral", 'Moscow', 'Moscow, Russia', 55.753, 37.623],
  ['🔺', 'Chichén Itzá', 'the Yucatán', 'Mexico', 20.684, -88.568],
  ['🌈', 'Victoria Falls', 'southern Africa', 'Zambia and Zimbabwe', -17.924, 25.857],
  ['🏛️', 'Acropolis', 'Athens', 'Athens, Greece', 37.972, 23.726],
  ['🐠', 'Great Barrier Reef', 'Queensland', 'Australia', -18.287, 147.699],
  ['🐒', 'Amazon Rainforest', 'Manaus', 'Brazil', -3.119, -60.022],
  ['🗿', 'Mount Rushmore', 'South Dakota', 'South Dakota, USA', 43.879, -103.459],
  ['🌌', 'Northern Lights', 'Tromsø', 'Norway', 69.649, 18.955],
  ['🏰', 'Edinburgh Castle', 'Edinburgh', 'Scotland, UK', 55.949, -3.200],
  ['🍕', 'Leaning Tower of Pisa', 'Pisa', 'Italy', 43.723, 10.397],
  ['🐼', 'Giant Panda Base', 'Chengdu', 'China', 30.733, 104.147],
  ['🗼', 'N Seoul Tower', 'Seoul', 'Seoul, South Korea', 37.551, 126.988],
  ['🐢', 'Galápagos Islands', 'the Pacific Ocean', 'Ecuador', -0.954, -90.966],
  ['🏞️', 'Banff National Park', 'the Rocky Mountains', 'Canada', 51.178, -115.571],
  ['♨️', 'Old Faithful', 'Yellowstone', 'Wyoming, USA', 44.460, -110.828],
  ['🌷', 'Tulip fields', 'near Amsterdam', 'the Netherlands', 52.270, 4.546],
  ['🏝️', 'Maldives islands', 'the Indian Ocean', 'the Maldives', 3.203, 73.221],
  ['🧊', 'Blue Lagoon', 'near Reykjavík', 'Iceland', 63.880, -22.449],
  ['💃', 'La Boca', 'Buenos Aires', 'Buenos Aires, Argentina', -34.635, -58.363],
  ['🕌', 'Marrakech markets', 'Marrakech', 'Morocco', 31.626, -7.989],
  ['🐧', 'Penguin beaches', 'Ushuaia, the end of the world', 'Argentina', -54.801, -68.303],
  ['🏔️', 'Matterhorn', 'the Alps', 'Switzerland', 45.976, 7.659],
  ['🛶', 'Venice canals', 'Venice', 'Venice, Italy', 45.440, 12.316],
  ['🍁', 'Old Quebec', 'Quebec City', 'Quebec, Canada', 46.813, -71.208],
  ['🏔️', 'Denali', 'Alaska', 'Alaska, USA', 63.069, -151.007],
  ['🌮', 'Zócalo square', 'Mexico City', 'Mexico City, Mexico', 19.433, -99.133],
  ['🏝️', 'Bora Bora', 'French Polynesia', 'the South Pacific', -16.500, -151.741],
  ['🦜', 'Iguazu Falls', 'South America', 'Brazil and Argentina', -25.695, -54.437],
];

function distKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const validGuess = v => !!v && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180;

CA.games.add('geo', {
  name: 'GeoGuessr', icon: '🌍', blurb: 'Where in the world is it? Click the spot on the map and lock it in. The closest guess wins the round. First to 2!',
  start(ctx) {
    const ROUND = 12000;
    const M = window.WORLD_MAP;
    if (!M) { ctx.stage.innerHTML = '<div class="stage-wait">The world map could not load.</div>'; ctx.later(() => ctx.finish('draw'), 1500); return; }
    const skill = skillOf(ctx);
    const places = shuffle(PLACES, ctx.rng).slice(0, 3);
    const px = lon => n2((lon + 180) / 360 * M.w);
    const py = lat => n2((M.top - lat) / (M.top - M.bottom) * M.h);
    let grid = '';
    for (let lon = -150; lon <= 150; lon += 30) grid += '<line class="geo-grid" x1="' + px(lon) + '" y1="0" x2="' + px(lon) + '" y2="' + M.h + '"/>';
    for (let lat = -30; lat <= 60; lat += 30) grid += '<line class="geo-grid" x1="0" y1="' + py(lat) + '" x2="' + M.w + '" y2="' + py(lat) + '"/>';
    ctx.stage.innerHTML =
      '<div class="g-geo"><div class="geo-clue" id="geoClue"></div>' +
      '<svg class="geo-map" id="geoMap" viewBox="0 0 ' + M.w + ' ' + M.h + '">' + grid + '<path class="geo-land" d="' + M.path + '"/><g id="geoPins"></g></svg>' +
      '<div class="row center geo-actions"><button class="btn go" id="geoLock" disabled>📍 Lock in my guess</button></div>' +
      '<div class="timer"><i id="geoTimer"></i></div><p class="g-msg" id="geoMsg"></p></div>';
    const map = $('geoMap');
    const lockBtn = $('geoLock');
    let guess = null;
    let onLock = null;

    const pinSVG = (v, cls, label) => '<g class="geo-pin ' + cls + '" transform="translate(' + px(v.lon) + ' ' + py(v.lat) + ')"><circle r="9"/>' +
      (label ? '<text y="-15">' + esc(label) + '</text>' : '') + '</g>';

    ctx.listen(map, 'click', e => {
      if (!onLock) return;
      const pt = map.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(map.getScreenCTM().inverse());
      const lon = Math.max(-180, Math.min(180, p.x / M.w * 360 - 180));
      const lat = Math.max(M.bottom, Math.min(M.top, M.top - p.y / M.h * (M.top - M.bottom)));
      guess = { lat: +lat.toFixed(3), lon: +lon.toFixed(3) };
      $('geoPins').innerHTML = pinSVG(guess, 'me', 'You');
      lockBtn.disabled = false;
      sound('tick');
    });
    ctx.listen(lockBtn, 'click', () => { if (onLock && guess) onLock(); });

    const where = r => ({ lat: places[r - 1][4], lon: places[r - 1][5] });
    const kmOf = (v, place) => (validGuess(v) ? distKm(v, place) : Infinity);
    const fmtKm = d => (d === Infinity ? 'no guess' : Math.round(d).toLocaleString('en-US') + ' km');

    roundMatch(ctx, {
      target: 2,
      maxRounds: 3,
      revealMs: 3000,
      points(a, b, r) {
        const da = kmOf(a, where(r)), db = kmOf(b, where(r));
        return da === db ? [0, 0] : da < db ? [1, 0] : [0, 1];
      },
      play(r, submit) {
        const p = places[r - 1];
        if (window.__testHooks) window.__peek = { place: where(r) };
        ctx.note('Round ' + r + ' · first to 2');
        $('geoClue').innerHTML = '<span class="geo-emoji">' + p[0] + '</span><span><b>' + esc(p[1]) + '</b><small>' + esc(p[2]) + '</small></span>';
        guess = null;
        $('geoPins').innerHTML = '';
        lockBtn.disabled = true;
        map.classList.add('live');
        setMsg('geoMsg', 'Click where you think it is, then lock it in.');
        startTimer('geoTimer', ROUND);
        let locked = false;
        onLock = () => {
          if (locked) return;
          locked = true;
          onLock = null;
          lockBtn.disabled = true;
          map.classList.remove('live');
          stopTimer('geoTimer');
          setMsg('geoMsg', guess ? 'Locked in! Waiting for ' + ctx.oppName + '…' : "Time's up! You didn't guess.");
          submit(guess ? { lat: guess.lat, lon: guess.lon } : { none: true });
        };
        ctx.later(() => { if (!locked) onLock(); }, ROUND);
      },
      onTheirs() { if (onLock) setMsg('geoMsg', ctx.oppName + ' has locked in a guess!'); },
      reveal(r, a, b, w) {
        const place = where(r);
        let s = '';
        for (const [v, cls, label] of [[b, 'them', ctx.oppName], [a, 'me', 'You']]) {
          if (!validGuess(v)) continue;
          s += '<line class="geo-line ' + cls + '" x1="' + px(v.lon) + '" y1="' + py(v.lat) + '" x2="' + px(place.lon) + '" y2="' + py(place.lat) + '"/>';
          s += pinSVG(v, cls, label);
        }
        s += '<g class="geo-pin real" transform="translate(' + px(place.lon) + ' ' + py(place.lat) + ')"><circle r="11"/><text y="7">★</text></g>';
        $('geoPins').innerHTML = s;
        const p = places[r - 1];
        setMsg('geoMsg', p[1] + ' is in ' + p[3] + '. You: ' + fmtKm(kmOf(a, place)) + ' · ' + ctx.oppName + ': ' + fmtKm(kmOf(b, place)) +
          (w > 0 ? ' · Point for you!' : w < 0 ? ' · Point for ' + ctx.oppName + '.' : ''));
      },
      botValue(r) {
        const place = where(r);
        const err = Math.abs(gauss(2600 - skill * 2200, 500)); // how many km off the bot is
        const ang = Math.random() * Math.PI * 2;
        const lat = Math.max(M.bottom + 1, Math.min(M.top - 1, place.lat + err / 111 * Math.sin(ang)));
        const lon = ((place.lon + err / (111 * Math.max(0.2, Math.cos(place.lat * Math.PI / 180))) * Math.cos(ang) + 540) % 360) - 180;
        return { lat: +lat.toFixed(3), lon: +lon.toFixed(3) };
      },
      botDelay() { return 3000 + Math.random() * 7000; },
    });
  },
});

// For checking the flag drawings (not used by the game itself).
CA.games.flagGallery = () => Object.keys(FLAGS).map(id => '<figure>' + flagSVG(id) + '<figcaption>' + FLAGS[id][0] + '</figcaption></figure>').join('');

})();
