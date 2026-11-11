/* CamArcade core: accounts, your saved cat and fish, the shop items, the Streak Pass,
   your microphone (so your cat talks), shared popups, and switching between screens. */
(() => {
'use strict';

const $ = id => document.getElementById(id);

/* ================= STORAGE ================= */

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
function readJSON(k) { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } }

const ACCOUNTS_KEY = 'camarcade-accounts-v1';      // (accounts from before they moved online: only read, to bring a cat along)
const PROFILE_PREFIX = 'camarcade-profile-v2:';
const TOKEN_KEY = 'camarcade-token';
const REMEMBER_KEY = 'camarcade-token-remember';
const CACHE_KEY = 'camarcade-me';
const LAST_USER_KEY = 'camarcade-last-user';
const MEDIA_KEY = 'camarcade-media';
const CAMERA_KEY = 'camarcade-camera';
const FACE_KEY = 'camarcade-face';           // 'on': other players see your camera from the start of each match
const DEVICE_KEY = 'camarcade-device';
const PBKDF2_ROUNDS = 150000;

/* ================= DRAWING HELPERS ================= */

const INK = '#1c1714';
const EDGE = 'stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const HEAD = 'M100 28 C140 28 165 55 165 92 C165 126 138 143 100 143 C62 143 35 126 35 92 C35 55 60 28 100 28 Z';
const BODY = 'M75 140 C68 152 64 168 66 180 C68 191 79 196 100 196 C121 196 132 191 134 180 C136 168 132 152 125 140 Z';
const JBODY = 'M72 138 C50 139 38 156 40 176 C42 194 66 204 100 204 C134 204 158 194 160 176 C162 156 150 139 128 138 Z'; // (the jacked cat's chest and shoulders: see the DAME tee)
const ARMS = 'M69 150 C61 160 57 172 56 183 M131 150 C139 160 143 172 144 183';
const SLEEVES = 'M69 150 C65 155 62 160 60.5 166 M131 150 C135 155 138 160 139.5 166';

function star(cx, cy, r, inner) {
  const ri = inner || r * 0.45;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? ri : r;
    const a = Math.PI / 5 * i - Math.PI / 2;
    d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1) + ' ';
  }
  return d + 'Z';
}

function heart(cx, cy, s) {
  return 'M' + cx + ' ' + (cy + s * 0.85) +
    ' C' + (cx - s * 1.5) + ' ' + (cy - s * 0.1) + ' ' + (cx - s * 0.85) + ' ' + (cy - s * 1.25) + ' ' + cx + ' ' + (cy - s * 0.4) +
    ' C' + (cx + s * 0.85) + ' ' + (cy - s * 1.25) + ' ' + (cx + s * 1.5) + ' ' + (cy - s * 0.1) + ' ' + cx + ' ' + (cy + s * 0.85) + ' Z';
}

function grad(id, colors, x2, y2, radial) {
  const stops = colors.map((c, i) => '<stop offset="' + (i / Math.max(1, colors.length - 1)).toFixed(2) + '" stop-color="' + c + '"/>').join('');
  return radial
    ? '<radialGradient id="' + id + '" cx=".5" cy=".42" r=".75">' + stops + '</radialGradient>'
    : '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + x2 + '" y2="' + y2 + '">' + stops + '</linearGradient>';
}

function dots(list, color, opacity) {
  return list.map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + color + '" opacity="' + (opacity || 1) + '"/>').join('');
}

function shirtBase(color) { return '<rect x="50" y="132" width="100" height="70" fill="' + color + '"/>'; }

/* ================= SHOP ITEMS ================= */

const SLOTS = [
  { id: 'skin', name: 'Fur', icon: '🎨', required: true },
  { id: 'hat', name: 'Hats', icon: '🎩' },
  { id: 'eyes', name: 'Glasses', icon: '🕶️' },
  { id: 'shirt', name: 'Shirts', icon: '👕' },
  { id: 'neck', name: 'Neck', icon: '🎀' },
  { id: 'hand', name: 'Paws', icon: '🎈' },
  { id: 'bg', name: 'Backgrounds', icon: '🌌', required: true },
];

// Fur colors: [light, middle, shadow] plus the inside of the ears.
const ITEMS = [
  { id: 'skin-orange', slot: 'skin', name: 'Orange', price: 0, c: ['#ffc27a', '#f7a14a', '#e3822c'], ear: '#ffb77e' },
  { id: 'skin-gray', slot: 'skin', name: 'Smoky Gray', price: 60, c: ['#e2e6ee', '#aeb6c4', '#8a93a3'], ear: '#f2c7cf' },
  { id: 'skin-snow', slot: 'skin', name: 'Snow White', price: 60, c: ['#ffffff', '#f1f3f8', '#cfd5e1'], ear: '#ffc9d3' },
  { id: 'skin-cream', slot: 'skin', name: 'Cream', price: 60, c: ['#fff4dc', '#f6deb0', '#dcbd85'], ear: '#ffcbb4' },
  { id: 'skin-tangerine', slot: 'skin', name: 'Tangerine', price: 60, c: ['#ffa36e', '#ff7b3a', '#df5a1c'], ear: '#ffb28c' },
  { id: 'skin-lime', slot: 'skin', name: 'Lime', price: 80, c: ['#c4f59e', '#8be36c', '#5fbd45'], ear: '#d8ffc0' },
  { id: 'skin-sky', slot: 'skin', name: 'Sky Blue', price: 80, c: ['#a9e2ff', '#6cc8ff', '#3fa3e0'], ear: '#cdeeff' },
  { id: 'skin-bubblegum', slot: 'skin', name: 'Bubblegum', price: 80, c: ['#ffc4e6', '#ff96d2', '#e866b0'], ear: '#ffd9ee' },
  { id: 'skin-grape', slot: 'skin', name: 'Grape', price: 80, c: ['#d7c6ff', '#b394ff', '#8a68e0'], ear: '#e6dbff' },
  { id: 'skin-midnight', slot: 'skin', name: 'Midnight', price: 100, c: ['#6b6f86', '#44475a', '#2a2c38'], ear: '#8a7c8f', dark: true },
  { id: 'skin-ghost', slot: 'skin', name: 'Ghost', price: 120, c: ['#ffffff', '#e8efff', '#b9c8ec'], ear: '#dfe8ff', ghost: true },
  { id: 'skin-tiger', slot: 'skin', name: 'Tiger Stripes', price: 150, c: ['#ffc27a', '#f7a14a', '#e3822c'], ear: '#ffb77e', stripes: '#b8561a' },
  { id: 'skin-rainbow', slot: 'skin', name: 'Rainbow', price: 300, grad: ['#ff6b6b', '#ffb84d', '#ffe66b', '#7ee07a', '#5cc8ff', '#b28cff'], c: ['#fff', '#ffb84d', '#b28cff'], ear: '#ffffff' },
  { id: 'skin-gold', slot: 'skin', name: 'Solid Gold', price: 200, c: ['#fff1a8', '#ffd23f', '#d9a300'], ear: '#fff3b8' },
  { id: 'skin-galaxy', slot: 'skin', name: 'Galaxy', price: 250, c: ['#8b5cff', '#3b2394', '#140c45'], ear: '#b89cff', sparkle: true, dark: true },

  { id: 'hat-bow', slot: 'hat', name: 'Pink Bow', price: 35, art: () =>
    '<path d="M128 34 C116 22 108 38 116 46 C120 50 126 42 128 34 Z" fill="#ff6fae" ' + EDGE + '/>' +
    '<path d="M128 34 C140 22 148 38 140 46 C136 50 130 42 128 34 Z" fill="#ff6fae" ' + EDGE + '/>' +
    '<circle cx="128" cy="36" r="5" fill="#e04a8c" ' + EDGE + '/>' },
  { id: 'hat-party', slot: 'hat', name: 'Party Hat', price: 60, art: () =>
    '<path d="M80 40 L100 2 L120 40 Q100 46 80 40 Z" fill="#ff5fa2" ' + EDGE + '/>' +
    dots([[93, 27, 3], [106, 17, 3], [108, 33, 3]], '#ffe14d') +
    '<circle cx="100" cy="5" r="6" fill="#ffe14d" ' + EDGE + '/>' },
  { id: 'hat-cap', slot: 'hat', name: 'Red Cap', price: 50, art: () =>
    '<path d="M48 58 Q50 18 100 16 Q150 18 152 58 Z" fill="#ff4757" ' + EDGE + '/>' +
    '<path d="' + star(100, 36, 8) + '" fill="#fff"/>' +
    '<path d="M44 58 Q100 46 156 58 Q160 68 100 66 Q40 68 44 58 Z" fill="#d63447" ' + EDGE + '/>' +
    '<circle cx="100" cy="16" r="4.5" fill="#d63447"/>' },
  { id: 'hat-beanie', slot: 'hat', name: 'Beanie', price: 45, art: () =>
    '<path d="M46 60 Q44 14 100 14 Q156 14 154 60 Z" fill="#37b4ff" ' + EDGE + '/>' +
    '<rect x="42" y="50" width="116" height="16" rx="8" fill="#1e88d6" ' + EDGE + '/>' +
    '<circle cx="100" cy="14" r="10" fill="#fff" ' + EDGE + '/>' },
  { id: 'hat-headphones', slot: 'hat', name: 'Headphones', price: 70, art: () =>
    '<path d="M30 100 Q28 32 100 30 Q172 32 170 100" fill="none" stroke="#2d2d3a" stroke-width="12" stroke-linecap="round"/>' +
    '<path d="M30 100 Q28 32 100 30 Q172 32 170 100" fill="none" stroke="#50506a" stroke-width="5" stroke-linecap="round"/>' +
    '<rect x="16" y="82" width="22" height="36" rx="10" fill="#ff4d6d" ' + EDGE + '/>' +
    '<rect x="162" y="82" width="22" height="36" rx="10" fill="#ff4d6d" ' + EDGE + '/>' },
  { id: 'hat-cowboy', slot: 'hat', name: 'Cowboy Hat', price: 80, art: () =>
    '<path d="M66 50 Q64 14 86 16 Q100 24 114 16 Q136 14 134 50 Z" fill="#c07a38" ' + EDGE + '/>' +
    '<path d="M68 42 Q100 48 132 42 L133 49 Q100 55 67 49 Z" fill="#5b3413"/>' +
    '<path d="M22 54 Q100 34 178 54 Q180 66 100 62 Q20 66 22 54 Z" fill="#a8672f" ' + EDGE + '/>' },
  { id: 'hat-tophat', slot: 'hat', name: 'Top Hat', price: 90, art: () =>
    '<rect x="76" y="4" width="48" height="36" rx="5" fill="#26263a" ' + EDGE + '/>' +
    '<rect x="76" y="29" width="48" height="7" fill="#ff4d6d"/>' +
    '<ellipse cx="100" cy="40" rx="40" ry="8" fill="#26263a" ' + EDGE + '/>' },
  { id: 'hat-wizard', slot: 'hat', name: 'Wizard Hat', price: 120, art: () =>
    '<path d="M62 52 Q94 30 102 0 Q112 30 138 52 Z" fill="#6c4de0" ' + EDGE + '/>' +
    '<path d="' + star(96, 26, 5.5) + '" fill="#ffe14d"/><path d="' + star(114, 40, 4) + '" fill="#ffe14d"/>' +
    '<ellipse cx="100" cy="52" rx="52" ry="9.5" fill="#5638c4" ' + EDGE + '/>' },
  { id: 'hat-viking', slot: 'hat', name: 'Viking Helmet', price: 150, art: () =>
    '<path d="M52 46 Q20 34 24 4 Q36 26 62 34 Z" fill="#f4ead0" ' + EDGE + '/>' +
    '<path d="M148 46 Q180 34 176 4 Q164 26 138 34 Z" fill="#f4ead0" ' + EDGE + '/>' +
    '<path d="M46 60 Q48 16 100 16 Q152 16 154 60 Z" fill="#a7b0c2" ' + EDGE + '/>' +
    '<rect x="44" y="52" width="112" height="13" rx="6.5" fill="#7d879c" ' + EDGE + '/>' +
    dots([[62, 58.5, 2.5], [100, 58.5, 2.5], [138, 58.5, 2.5]], '#e8ecf5') },
  { id: 'hat-halo', slot: 'hat', name: 'Halo', price: 150, art: () =>
    '<ellipse cx="100" cy="12" rx="34" ry="8" fill="none" stroke="#ffe066" stroke-width="8" opacity=".45"/>' +
    '<ellipse cx="100" cy="12" rx="34" ry="8" fill="none" stroke="#ffe066" stroke-width="5"/>' +
    '<ellipse cx="100" cy="11" rx="34" ry="8" fill="none" stroke="#fffbe0" stroke-width="1.5"/>' },
  { id: 'hat-crown', slot: 'hat', name: 'Royal Crown', price: 250, art: () =>
    '<path d="M68 44 L66 10 L84 26 L100 2 L116 26 L134 10 L132 44 Z" fill="#ffd23f" ' + EDGE + '/>' +
    '<circle cx="100" cy="30" r="5.5" fill="#ff3b5c" ' + EDGE + '/>' +
    '<circle cx="80" cy="36" r="3.5" fill="#37b4ff"/><circle cx="120" cy="36" r="3.5" fill="#1ed49b"/>' },

  { id: 'eyes-nerd', slot: 'eyes', name: 'Nerd Glasses', price: 40, art: () =>
    '<circle cx="71" cy="92" r="15.5" fill="rgba(200,230,255,.28)" stroke="#2b2b2b" stroke-width="4.5"/>' +
    '<circle cx="129" cy="92" r="15.5" fill="rgba(200,230,255,.28)" stroke="#2b2b2b" stroke-width="4.5"/>' +
    '<path d="M86.5 90 Q100 84 113.5 90 M55.5 89 L40 85 M144.5 89 L160 85" fill="none" stroke="#2b2b2b" stroke-width="4.5" stroke-linecap="round"/>' },
  { id: 'eyes-shades', slot: 'eyes', name: 'Sunglasses', price: 60, art: () =>
    '<path d="M50 84 Q71 77 92 84 Q94 102 71 106 Q52 104 50 84 Z" fill="#15151f" ' + EDGE + '/>' +
    '<path d="M150 84 Q129 77 108 84 Q106 102 129 106 Q148 104 150 84 Z" fill="#15151f" ' + EDGE + '/>' +
    '<path d="M92 87 Q100 82 108 87 M50 86 L36 82 M150 86 L164 82" fill="none" stroke="#15151f" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M58 90 L66 86 M116 90 L124 86" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>' },
  { id: 'eyes-3d', slot: 'eyes', name: '3D Glasses', price: 55, art: () =>
    '<rect x="46" y="78" width="108" height="28" rx="8" fill="#fff" ' + EDGE + '/>' +
    '<rect x="53" y="82" width="38" height="20" rx="5" fill="#ff3b5c" opacity=".85"/>' +
    '<rect x="109" y="82" width="38" height="20" rx="5" fill="#2fa8ff" opacity=".85"/>' },
  { id: 'eyes-monocle', slot: 'eyes', name: 'Fancy Monocle', price: 50, art: () =>
    '<circle cx="129" cy="92" r="17" fill="rgba(255,255,255,.18)" stroke="#d4a017" stroke-width="4.5"/>' +
    '<path d="M146 98 Q154 124 140 142" fill="none" stroke="#d4a017" stroke-width="2.5"/>' },
  { id: 'eyes-star', slot: 'eyes', name: 'Star Glasses', price: 70, art: () =>
    '<path d="' + star(71, 92, 21, 10) + '" fill="#ffd23f" opacity=".94" ' + EDGE + '/>' +
    '<path d="' + star(129, 92, 21, 10) + '" fill="#ffd23f" opacity=".94" ' + EDGE + '/>' },
  { id: 'eyes-heart', slot: 'eyes', name: 'Heart Glasses', price: 60, art: () =>
    '<path d="' + heart(71, 94, 13.5) + '" fill="#ff4f9a" opacity=".92" ' + EDGE + '/>' +
    '<path d="' + heart(129, 94, 13.5) + '" fill="#ff4f9a" opacity=".92" ' + EDGE + '/>' +
    '<path d="M88 88 Q100 83 112 88" fill="none" stroke="#c2185b" stroke-width="3.5" stroke-linecap="round"/>' },
  { id: 'eyes-visor', slot: 'eyes', name: 'Cyber Visor', price: 100, art: () =>
    '<rect x="36" y="76" width="128" height="32" rx="16" fill="#34f5ff" opacity=".55" ' + EDGE + '/>' +
    '<path d="M50 85 L150 85" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".75"/>' },

  { id: 'shirt-red', slot: 'shirt', name: 'Red Tee', price: 30, sleeve: '#ff5a5a', art: () =>
    shirtBase('#ff5a5a') + '<path d="M86 145 Q100 154 114 145" fill="none" stroke="#c93c3c" stroke-width="3.5"/>' },
  { id: 'shirt-blue', slot: 'shirt', name: 'Blue Tee', price: 30, sleeve: '#4d8dff', art: () =>
    shirtBase('#4d8dff') + '<path d="M86 145 Q100 154 114 145" fill="none" stroke="#2f64c9" stroke-width="3.5"/>' },
  { id: 'shirt-stripes', slot: 'shirt', name: 'Striped Shirt', price: 45, sleeve: '#2a3f8f', art: () =>
    shirtBase('#f7f7fb') + [152, 166, 180].map(y => '<rect x="50" y="' + y + '" width="100" height="7" fill="#2a3f8f"/>').join('') },
  { id: 'shirt-jersey', slot: 'shirt', name: 'Sports Jersey', price: 70, sleeve: '#16c172', art: () =>
    shirtBase('#16c172') +
    '<path d="M88 144 L100 154 L112 144" fill="none" stroke="#fff" stroke-width="3.5"/>' +
    '<text x="100" y="184" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="28" fill="#fff" stroke="#0b7a46" stroke-width="1.5">7</text>' },
  { id: 'shirt-hoodie', slot: 'shirt', name: 'Comfy Hoodie', price: 80, sleeve: '#7a5cff', art: () =>
    shirtBase('#7a5cff') +
    '<path d="M72 146 Q100 160 128 146" fill="none" stroke="#5b3fd6" stroke-width="8"/>' +
    '<path d="M92 150 L90 164 M108 150 L110 164" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M78 172 L122 172 L127 190 L73 190 Z" fill="#6a4be8" stroke="#4d33c2" stroke-width="2.5"/>' },
  { id: 'shirt-tux', slot: 'shirt', name: 'Tuxedo', price: 150, sleeve: '#23232e', art: () =>
    shirtBase('#23232e') +
    '<path d="M86 138 L100 176 L114 138 Z" fill="#fff"/>' +
    '<path d="M100 150 L90 145 L90 156 Z M100 150 L110 145 L110 156 Z" fill="#ff3b5c"/>' +
    dots([[100, 181, 2.2], [100, 188, 2.2]], '#ddd') },
  { id: 'shirt-astro', slot: 'shirt', name: 'Space Suit', price: 100, sleeve: '#f3f5fb', art: () =>
    shirtBase('#f3f5fb') +
    '<path d="M72 146 Q100 156 128 146" fill="none" stroke="#c9cfdc" stroke-width="8"/>' +
    '<rect x="86" y="156" width="28" height="16" rx="4" fill="#5b6bff"/>' +
    dots([[93, 164, 2.3], [100, 164, 2.3], [107, 164, 2.3]], '#fff') +
    '<rect x="50" y="182" width="100" height="7" fill="#9aa3b5"/>' },
  { id: 'shirt-hero', slot: 'shirt', name: 'Superhero Suit', price: 120, sleeve: '#2f6bff', art: () =>
    shirtBase('#2f6bff') +
    '<path d="' + star(100, 167, 14) + '" fill="#ffd23f" ' + EDGE + '/>' +
    '<rect x="50" y="185" width="100" height="6" fill="#ffd23f"/>',
    back: () => '<path d="M76 146 Q64 186 50 222 Q100 232 150 222 Q136 186 124 146 Z" fill="#ff3b5c" ' + EDGE + '/>' },

  // The DAME tee: only for the accounts named in `only` (dame and habernoto). It makes the cat jacked, with very skinny legs (see catSVG: `jacked`).
  { id: 'shirt-dame', slot: 'shirt', name: 'DAME Jacked Tee', only: ['dame', 'habernoto'], jacked: true, sleeve: '#f4f5fa', art: () =>
    '<rect x="30" y="134" width="140" height="75" fill="#f4f5fa"/>' +
    '<path d="M72 138 Q100 152 128 138" fill="none" stroke="#d5d9e6" stroke-width="3"/>' +
    '<text x="100" y="162" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-weight="900" font-size="23" letter-spacing="1" fill="#1b2a7a" stroke="#1b2a7a" stroke-width="0.8">DAME</text>' +
    '<path d="M80 168 L80 198 L122 198" fill="none" stroke="#111" stroke-width="1.6"/>' +
    '<path d="M83 196 L118 171" fill="none" stroke="#d11d1d" stroke-width="2"/><path d="M83 171 L118 196" fill="none" stroke="#1a3fd0" stroke-width="2"/>' +
    '<path d="M80 183.5 L100 183.5 M100.5 183.5 L100.5 198" fill="none" stroke="#111" stroke-width="1" stroke-dasharray="2 2"/>' +
    '<circle cx="100.5" cy="183.5" r="2.6" fill="#ffc83d" stroke="#111" stroke-width="1"/>' +
    '<text x="72" y="171" font-size="7" font-weight="700" font-family="Arial, sans-serif" fill="#111">P</text><text x="124" y="201" font-size="7" font-weight="700" font-family="Arial, sans-serif" fill="#111">Q</text>' +
    '<text x="112" y="169" font-size="6" font-weight="700" font-family="Arial, sans-serif" fill="#d11d1d">Supply</text><text x="104" y="196" font-size="6" font-weight="700" font-family="Arial, sans-serif" fill="#1a3fd0">Demand</text>' },

  // The OLIVER skin, only for habernoto: a jacked cat (like the DAME tee) with abs, a gold OLIVER chain, red high-tops, a tabby forehead and angry brows.
  // (`face` is drawn on the head, `over` on top of the head and neck, and `shoes` instead of the feet: see catSVG.)
  { id: 'shirt-oliver', slot: 'shirt', name: 'OLIVER Jacked Cat', only: ['habernoto'], jacked: true,
    art: () => '<g fill="none" stroke="#b8661a" stroke-width="2.2" stroke-linecap="round">' +
      '<path d="M62 156 Q80 176 99 165 M138 156 Q120 176 101 165"/>' +
      '<path d="M80 178 Q90 185 99 178 M101 178 Q110 185 120 178 M84 190 Q92 196 99 190 M101 190 Q108 196 116 190 M92 200 Q96 203 100 200 Q104 203 108 200"/></g>',
    face: () => '<path d="M100 28 L100 46 M88 31 Q91 40 93 47 M112 31 Q109 40 107 47" fill="none" stroke="#d9741f" stroke-width="5" stroke-linecap="round" opacity=".8"/>' +
      '<path d="M54 74 L87 84 M146 74 L113 84" fill="none" stroke="' + INK + '" stroke-width="4.5" stroke-linecap="round"/>',
    over: () => '<g fill="none" stroke="#b8661a" stroke-width="2.2" stroke-linecap="round"><path d="M44 158 Q52 172 62 168 M156 158 Q148 172 138 168 M46 188 Q54 194 62 190 M154 188 Q146 194 138 190"/></g>' +
      '<path d="M66 139 Q70 165 100 167 Q130 165 134 139" fill="none" stroke="#7a4a0a" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M66 139 Q70 165 100 167 Q130 165 134 139" fill="none" stroke="#f6c93a" stroke-width="6.5" stroke-linecap="round"/>' +
      '<path d="M66 139 Q70 165 100 167 Q130 165 134 139" fill="none" stroke="#b8861a" stroke-width="6.5" stroke-dasharray="1.4 4.6"/>' +
      '<text x="100" y="180" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-style="italic" font-size="19" fill="#f6c93a" stroke="#7a4a0a" stroke-width="4" paint-order="stroke" stroke-linejoin="round">OLIVER</text>' +
      '<path d="M76 163 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 z M127 176 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 z" fill="#fff"/>',
    shoes: () => [0, 1].map(i => '<g' + (i ? ' transform="translate(200 0) scale(-1 1)"' : '') + '>' +
      '<path d="M80 212 L92 212 L93 229 L66 229 Q66 222 72 221 L80 219 Z" fill="#e0262f" stroke="#7d1118" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M79 216 L93 216 L93 222 L79 222 Z" fill="#ff5a5a" stroke="#7d1118" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M64 229 L94 229 L94 233 Q94 235.5 91.5 235.5 L66.5 235.5 Q64 235.5 64 233 Z" fill="#8f1d24"/></g>').join('') },

  { id: 'neck-bowtie', slot: 'neck', name: 'Bow Tie', price: 25, art: () =>
    '<path d="M100 150 L84 141 L84 159 Z" fill="#ff3b5c" ' + EDGE + '/>' +
    '<path d="M100 150 L116 141 L116 159 Z" fill="#ff3b5c" ' + EDGE + '/>' +
    '<circle cx="100" cy="150" r="5" fill="#d61f45" ' + EDGE + '/>' },
  { id: 'neck-bell', slot: 'neck', name: 'Bell Collar', price: 30, art: () =>
    '<path d="M68 140 Q100 156 132 140 L133 148 Q100 165 67 148 Z" fill="#ff3b5c" ' + EDGE + '/>' +
    '<circle cx="100" cy="161" r="7.5" fill="#ffd23f" ' + EDGE + '/>' +
    '<path d="M96 163 L104 163" stroke="#b8860b" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'neck-scarf', slot: 'neck', name: 'Cozy Scarf', price: 40, art: () =>
    '<path d="M116 154 L128 192 L113 195 L106 158 Z" fill="#ff9f1c" ' + EDGE + '/>' +
    '<path d="M64 138 Q100 160 136 138 L138 150 Q100 174 62 150 Z" fill="#ff9f1c" ' + EDGE + '/>' +
    '<path d="M80 150 L84 144 M96 155 L99 148 M112 154 L114 147" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' },
  { id: 'neck-chain', slot: 'neck', name: 'Gold Chain', price: 90, art: () =>
    '<path d="M74 142 Q100 178 126 142" fill="none" stroke="#ffd23f" stroke-width="5" stroke-dasharray="2 5" stroke-linecap="round"/>' +
    '<path d="' + star(100, 164, 9) + '" fill="#ffd23f" ' + EDGE + '/>' },
  { id: 'neck-medal', slot: 'neck', name: 'Champion Medal', price: 80, art: () =>
    '<path d="M86 140 L100 164 L114 140" fill="none" stroke="#2f6bff" stroke-width="7" stroke-linejoin="round"/>' +
    '<circle cx="100" cy="171" r="10.5" fill="#ffd23f" ' + EDGE + '/>' +
    '<path d="' + star(100, 171, 6) + '" fill="#e6a800"/>' },

  { id: 'hand-fish', slot: 'hand', name: 'Fish Snack', price: 25, art: () =>
    '<path d="M146 180 L135 171 L135 189 Z" fill="#4fb3ff" ' + EDGE + '/>' +
    '<ellipse cx="159" cy="180" rx="14" ry="8" fill="#6cc8ff" ' + EDGE + '/>' +
    '<circle cx="165" cy="178" r="1.8" fill="#1c1714"/>' },
  { id: 'hand-icecream', slot: 'hand', name: 'Ice Cream', price: 30, art: () =>
    '<path d="M135 189 L153 189 L144 216 Z" fill="#e8b36b" ' + EDGE + '/>' +
    '<circle cx="144" cy="179" r="10" fill="#ff9ccf" ' + EDGE + '/>' +
    '<circle cx="144" cy="165" r="9" fill="#8fe3c0" ' + EDGE + '/>' },
  { id: 'hand-balloon', slot: 'hand', name: 'Balloon', price: 35, art: () =>
    '<path d="M144 180 Q158 142 164 116" fill="none" stroke="#e8e8f0" stroke-width="2"/>' +
    '<ellipse cx="168" cy="92" rx="18" ry="22" fill="#ff4d6d" ' + EDGE + '/>' +
    '<path d="M163 114 L173 114 L168 120 Z" fill="#ff4d6d"/>' +
    '<ellipse cx="161" cy="83" rx="4.5" ry="7" fill="#fff" opacity=".45"/>' },
  { id: 'hand-flag', slot: 'hand', name: 'Cat Flag', price: 40, art: () =>
    '<path d="M146 200 L158 104" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M158 106 L190 118 L155 132 Z" fill="#1ed49b" ' + EDGE + '/>' },
  { id: 'hand-laser', slot: 'hand', name: 'Laser Sword', price: 120, art: () =>
    '<g transform="rotate(24 144 187)">' +
    '<rect x="136" y="84" width="16" height="94" rx="8" fill="#34f5ff" opacity=".35"/>' +
    '<rect x="140" y="88" width="8" height="88" rx="4" fill="#bafcff"/>' +
    '<rect x="137" y="174" width="14" height="28" rx="4" fill="#55556a" ' + EDGE + '/></g>' },
  { id: 'hand-trophy', slot: 'hand', name: 'Trophy', price: 150, art: () =>
    '<path d="M133 164 Q122 164 125 173 Q128 180 136 178 M155 164 Q166 164 163 173 Q160 180 152 178" fill="none" stroke="#e6a800" stroke-width="3.5"/>' +
    '<path d="M132 160 L156 160 Q156 184 144 186 Q132 184 132 160 Z" fill="#ffd23f" ' + EDGE + '/>' +
    '<rect x="140" y="185" width="8" height="9" fill="#e6a800"/>' +
    '<rect x="132" y="193" width="24" height="8" rx="2" fill="#ffd23f" ' + EDGE + '/>' },

  { id: 'bg-space', slot: 'bg', name: 'Deep Space', price: 0, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#3b2f8f', '#0d0b24'], 0, 0, true));
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      dots([[22, 30, 1.6], [180, 26, 1.2], [168, 128, 1.4], [20, 150, 1.1], [186, 206, 1.6], [14, 222, 1.2], [118, 8, 1], [16, 96, 1]], '#fff') +
      '<circle cx="182" cy="58" r="10" fill="#ffb86b" opacity=".9"/><ellipse cx="182" cy="58" rx="17" ry="4.5" fill="none" stroke="#ffd9a8" stroke-width="2" opacity=".8"/>';
  } },
  { id: 'bg-sunset', slot: 'bg', name: 'Sunset', price: 50, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#ffd36e', '#ff7b7b', '#7d4bd8'], 0, 1));
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      '<circle cx="160" cy="66" r="28" fill="#fff3b0" opacity=".55"/>' +
      '<path d="M0 206 Q60 182 112 206 T200 198 L200 240 L0 240 Z" fill="#5a2f9e" opacity=".55"/>';
  } },
  { id: 'bg-ocean', slot: 'bg', name: 'Ocean', price: 50, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#5fe0ff', '#1f67d6'], 0, 1));
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      [[22, 196, 8], [16, 162, 5], [180, 156, 7], [186, 124, 4], [20, 60, 6], [182, 40, 5]]
        .map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="#fff" stroke-width="2" opacity=".6"/>').join('');
  } },
  { id: 'bg-jungle', slot: 'bg', name: 'Jungle', price: 50, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#b6f06a', '#2f9a52'], 0, 1));
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      [[4, 30, 30], [196, 22, -30], [0, 206, -20], [200, 214, 25]]
        .map(([x, y, a]) => '<ellipse cx="' + x + '" cy="' + y + '" rx="40" ry="14" fill="#1f7a3f" opacity=".8" transform="rotate(' + a + ' ' + x + ' ' + y + ')"/>').join('');
  } },
  { id: 'bg-candy', slot: 'bg', name: 'Candy Stripes', price: 80, art: c => {
    c.defs.push('<pattern id="' + c.uid + '-bg" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="11" height="22" fill="#ffb3da"/></pattern>');
    return '<rect width="200" height="240" fill="#ffe0f0"/><rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>';
  } },
  { id: 'bg-neon', slot: 'bg', name: 'Neon City', price: 100, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#1b0b3d', '#4a1170'], 0, 1));
    c.defs.push(grad(c.uid + '-sun', ['#ffd36e', '#ff4fa3'], 0, 1));
    const verticals = [-140, -60, 20, 100, 180, 260, 340].map(x => '<path d="M100 170 L' + x + ' 240" stroke="#37f0ff" stroke-width="1.5" opacity=".6"/>').join('');
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      '<circle cx="100" cy="150" r="54" fill="url(#' + c.uid + '-sun)" opacity=".9"/>' +
      '<rect y="170" width="200" height="70" fill="#12052b"/>' +
      [178, 190, 206, 228].map(y => '<path d="M0 ' + y + ' L200 ' + y + '" stroke="#ff4fd8" stroke-width="1.5" opacity=".75"/>').join('') + verticals;
  } },
  { id: 'bg-gold', slot: 'bg', name: 'Golden Glory', price: 200, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#fff3b0', '#ffc93c', '#d98f00'], 0, 0, true));
    let rays = '';
    for (let i = 0; i < 12; i++) rays += '<path d="M100 110 L88 -70 L112 -70 Z" fill="#fff" opacity=".22" transform="rotate(' + i * 30 + ' 100 110)"/>';
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' + rays;
  } },

  // ===== Season 1: Fear of Rats (the Streak Pass rewards) =====
  { id: 'hat-ratears', slot: 'hat', name: 'Rat Ears', tier: 2, art: () =>
    '<path d="M50 54 Q100 20 150 54" fill="none" stroke="#3a3f4b" stroke-width="7" stroke-linecap="round"/>' +
    '<circle cx="56" cy="30" r="23" fill="#9aa1ae" ' + EDGE + '/><circle cx="56" cy="31" r="14" fill="#ffb3c4"/>' +
    '<circle cx="144" cy="30" r="23" fill="#9aa1ae" ' + EDGE + '/><circle cx="144" cy="31" r="14" fill="#ffb3c4"/>' },
  { id: 'eyes-ratglow', slot: 'eyes', name: 'Glowing Rat Eyes', tier: 4, art: () =>
    [71, 129].map(x => '<circle cx="' + x + '" cy="92" r="19" fill="#ff2a2a" opacity=".28"/>' +
      '<ellipse cx="' + x + '" cy="92" rx="13" ry="10" fill="#ff3b30" ' + EDGE + '/>' +
      '<path d="M' + x + ' 84 Q' + (x - 3) + ' 92 ' + x + ' 100" fill="none" stroke="#2a0000" stroke-width="3.5" stroke-linecap="round"/>' +
      '<circle cx="' + (x + 4) + '" cy="88" r="2.2" fill="#fff" opacity=".8"/>').join('') },
  { id: 'bg-temple', slot: 'bg', name: 'Rat Temple', tier: 6, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#0f2238', '#0a1524'], 0, 1));
    c.defs.push(grad(c.uid + '-door', ['#3f78bd', '#11264a'], 0, 0, true));
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      [0, 32, 64, 96, 128, 160].map(y => '<path d="M0 ' + y + ' H200" stroke="#1c3354" stroke-width="1.5"/>').join('') +
      '<path d="M48 200 V92 A52 52 0 0 1 152 92 V200 Z" fill="url(#' + c.uid + '-door)"/>' +
      '<rect x="6" y="20" width="26" height="190" fill="#1d3a60"/><rect x="168" y="20" width="26" height="190" fill="#1d3a60"/>' +
      '<path d="M200 60 Q176 70 164 98 L140 108 L164 116 L172 140 L200 150 Z" fill="#05070b"/>' +
      '<path d="M146 108 l4 6 l4 -6 l4 6 l4 -6" fill="none" stroke="#05070b" stroke-width="3"/>' +
      '<circle cx="176" cy="96" r="6" fill="#ff2a2a" opacity=".35"/><ellipse cx="176" cy="96" rx="3.5" ry="2.2" fill="#ff3b30"/>' +
      '<rect y="200" width="200" height="40" fill="#2a2418"/>' +
      [[19, 120], [181, 120]].map(([x, y]) => '<circle cx="' + x + '" cy="' + (y - 10) + '" r="22" fill="#ffae3c" opacity=".22"/>' +
        '<path d="M' + (x - 5) + ' ' + y + ' h10 l-3 12 h-4z" fill="#2b2f38"/>' +
        '<path d="M' + x + ' ' + (y - 18) + ' C' + (x + 7) + ' ' + (y - 9) + ' ' + (x + 7) + ' ' + (y - 1) + ' ' + x + ' ' + y + ' C' + (x - 7) + ' ' + (y - 1) + ' ' + (x - 7) + ' ' + (y - 9) + ' ' + x + ' ' + (y - 18) + 'z" fill="#ffb02e"/>').join('');
  } },
  { id: 'skin-rat', slot: 'skin', name: 'Sewer Rat', tier: 10, c: ['#c9c0b6', '#958b80', '#6b6259'], ear: '#f2a5b5',
    marks: '<path d="M66 40 Q76 34 86 40 Q76 46 66 40 Z M128 60 Q140 54 150 62" fill="#6b6259" stroke="#6b6259" stroke-width="3" stroke-linecap="round" opacity=".5"/>' },
  { id: 'skin-labrat', slot: 'skin', name: 'Lab Rat', tier: 8, c: ['#ffffff', '#f3eef0', '#d8c9cf'], ear: '#ff9fb6' },
  { id: 'skin-stone', slot: 'skin', name: 'Temple Stone', tier: 12, c: ['#b9c6d6', '#8396ad', '#5a6b82'], ear: '#9fb0c4',
    marks: '<path d="M58 40 L70 56 L64 70 M140 34 L130 52 L138 64 L132 76 M96 22 L102 36 M150 96 L160 104" fill="none" stroke="#3e4c60" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>' +
      '<path d="M44 100 Q50 96 56 100 M120 30 Q126 26 132 30" fill="none" stroke="#5f8a4a" stroke-width="4" stroke-linecap="round" opacity=".8"/>' },
  { id: 'skin-torchlight', slot: 'skin', name: 'Torchlight', tier: 15, c: ['#ffe27a', '#ff9a2e', '#d4461a'], ear: '#ffd06b',
    marks: '<path d="M78 30 Q84 18 90 30 Q92 22 98 14 Q104 24 108 30 Q114 18 122 30" fill="#ffe9a0" opacity=".55"/>' },
  { id: 'skin-cheese', slot: 'skin', name: 'Cheese Cat', tier: 17, c: ['#fff1a0', '#ffd23f', '#e0a800'], ear: '#ffe680',
    marks: [[64, 46, 8], [132, 40, 6], [104, 30, 4.5], [150, 92, 6], [48, 92, 5], [82, 30, 3.5]].map(([x, y, r]) =>
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#d99a00"/><circle cx="' + (x - r * .2) + '" cy="' + (y - r * .2) + '" r="' + r * .75 + '" fill="#c88a00"/>').join('') },
  { id: 'skin-shadow', slot: 'skin', name: 'Shadow Rat', tier: 18, c: ['#3a3f4b', '#1c1f27', '#07080b'], ear: '#4a1218', dark: true,
    marks: '<circle cx="100" cy="60" r="60" fill="#ff2a2a" opacity=".06"/>' },
  { id: 'skin-toxic', slot: 'skin', name: 'Toxic Sewer', tier: 19, c: ['#c8ff7a', '#7be03c', '#3c9a1c'], ear: '#e2ffb0', sparkle: true,
    marks: '<path d="M54 44 Q60 52 56 62 Q50 70 58 76 M142 42 Q136 52 144 60" fill="none" stroke="#2f7a12" stroke-width="5" stroke-linecap="round" opacity=".55"/>' +
      '<circle cx="128" cy="62" r="5" fill="#2f7a12" opacity=".45"/><circle cx="74" cy="34" r="4" fill="#2f7a12" opacity=".45"/>' },
  // The season's final reward: your cat in a rat costume (a dark suit with a pink tail, and a mask with rat ears, angry red eyes and buck teeth).
  { id: 'skin-ratcostume', slot: 'skin', name: 'Rat Costume', tier: 20, c: ['#ffb066', '#f0913c', '#d9762a'], ear: '#f2a07a', noWhiskers: true,
    tail: () => '<path d="M128 196 C156 204 172 184 168 160 C166 148 170 138 180 134" fill="none" stroke="#c9707a" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M128 196 C156 204 172 184 168 160 C166 148 170 138 180 134" fill="none" stroke="#e79aa0" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M150 197 l1 -6 M162 186 l-5 -3 M167 172 l-6 0 M167 158 l-6 1" stroke="#c9707a" stroke-width="1.5" stroke-linecap="round"/>',
    suit: (fill, arms) =>
      '<rect x="73" y="184" width="18" height="36" rx="9" fill="#3a2a30"/><rect x="109" y="184" width="18" height="36" rx="9" fill="#3a2a30"/>' +
      '<ellipse cx="82" cy="225" rx="11" ry="7.5" fill="' + fill + '"/><ellipse cx="118" cy="225" rx="11" ry="7.5" fill="' + fill + '"/>' +
      '<path d="' + BODY + '" fill="#3a2a30"/>' +
      '<ellipse cx="100" cy="178" rx="20" ry="25" fill="#6e4b55"/>' +
      (arms ? '<path d="' + ARMS + '" fill="none" stroke="#3a2a30" stroke-width="15" stroke-linecap="round"/>' +
        '<circle cx="56" cy="188" r="11" fill="' + fill + '"/><circle cx="144" cy="188" r="11" fill="' + fill + '"/>' : ''),
    face: () =>
      // big round rat ears
      '<circle cx="50" cy="52" r="25" fill="#3a2a30"/><circle cx="52" cy="54" r="16" fill="#b25866"/>' +
      '<circle cx="150" cy="52" r="25" fill="#3a2a30"/><circle cx="148" cy="54" r="16" fill="#b25866"/>' +
      // the hood over the top of the head and the mask over the eyes
      '<path d="M38 88 Q36 52 70 40 Q100 30 130 40 Q164 52 162 88 Q162 108 140 112 Q120 114 108 106 Q100 102 92 106 Q80 114 60 112 Q38 108 38 88 Z" fill="#3a2a30"/>' +
      '<path d="M50 60 Q100 34 150 60" fill="none" stroke="#4d3a42" stroke-width="5" stroke-linecap="round" opacity=".7"/>' +
      // straps with rivets
      '<rect x="28" y="84" width="14" height="11" rx="2" fill="#1c1418"/><circle cx="35" cy="89.5" r="2.6" fill="#b9b2b6"/>' +
      '<rect x="158" y="84" width="14" height="11" rx="2" fill="#1c1418"/><circle cx="165" cy="89.5" r="2.6" fill="#b9b2b6"/>' +
      // angry glowing red eyes
      '<ellipse cx="72" cy="91" rx="15" ry="11" fill="#1a0f13"/><ellipse cx="128" cy="91" rx="15" ry="11" fill="#1a0f13"/>' +
      '<circle cx="73" cy="93" r="9" fill="#ff2a2a" opacity=".3"/><circle cx="127" cy="93" r="9" fill="#ff2a2a" opacity=".3"/>' +
      '<ellipse cx="73" cy="93" rx="6" ry="5.5" fill="#e00000"/><ellipse cx="127" cy="93" rx="6" ry="5.5" fill="#e00000"/>' +
      '<path d="M54 80 L90 92 L90 78 Z M146 80 L110 92 L110 78 Z" fill="#3a2a30"/>' +
      // pink nose and buck teeth
      '<ellipse cx="100" cy="104" rx="7.5" ry="5.5" fill="#d9707a"/><ellipse cx="98" cy="102.5" rx="2.5" ry="1.6" fill="#fff" opacity=".45"/>' +
      '<path d="M92.5 109 h7 v14 q0 2 -2 2 h-3 q-2 0 -2 -2 Z M100.5 109 h7 v14 q0 2 -2 2 h-3 q-2 0 -2 -2 Z" fill="#f4e6d2" stroke="#6b4a3a" stroke-width="1.2"/>' },
  { id: 'neck-cheese', slot: 'neck', name: 'Cheese Charm', tier: 11, art: () =>
    '<path d="M80 140 Q100 162 120 140" fill="none" stroke="#6b4a1f" stroke-width="3"/>' +
    '<path d="M86 160 L118 152 L114 178 Z" fill="#ffcf3d" ' + EDGE + '/>' +
    dots([[104, 162, 2.6], [110, 170, 2], [98, 166, 1.8]], '#e0a800') },
  { id: 'shirt-rathunter', slot: 'shirt', name: 'Rat Hunter Suit', tier: 14, sleeve: '#3f4a2c', art: () =>
    shirtBase('#4b5735') +
    '<path d="M64 140 L100 196 M136 140 L118 168" stroke="#2c331f" stroke-width="7" stroke-linecap="round"/>' +
    '<circle cx="114" cy="170" r="11" fill="#f1e8cf" ' + EDGE + '/>' +
    '<path d="M106 172 Q110 164 118 166 Q120 170 118 174 Z" fill="#3a3f4b"/>' +
    '<path d="M107 163 L121 177 M121 163 L107 177" stroke="#ff3b30" stroke-width="2.5" stroke-linecap="round"/>' +
    '<rect x="50" y="186" width="100" height="7" fill="#2c331f"/><rect x="94" y="185" width="12" height="9" rx="2" fill="#c9a24a"/>' },
  { id: 'hand-torch', slot: 'hand', name: 'Torch', tier: 16, art: () =>
    '<circle cx="152" cy="140" r="26" fill="#ffae3c" opacity=".25"/>' +
    '<g transform="rotate(14 146 190)"><rect x="141" y="152" width="10" height="52" rx="3" fill="#7a4f25" ' + EDGE + '/>' +
    '<path d="M137 152 h18 l-3 8 h-12 z" fill="#3b3f48" ' + EDGE + '/>' +
    '<path d="M146 112 C160 128 158 146 146 152 C134 146 132 128 146 112 Z" fill="#ff8a2a"/>' +
    '<path d="M146 128 C153 138 152 147 146 150 C140 147 139 138 146 128 Z" fill="#ffd84a"/></g>' },
  { id: 'hat-ratking', slot: 'hat', name: 'Rat King Crown', tier: 13, art: () =>
    '<circle cx="62" cy="26" r="16" fill="#9aa1ae" ' + EDGE + '/><circle cx="62" cy="27" r="9" fill="#ffb3c4"/>' +
    '<circle cx="138" cy="26" r="16" fill="#9aa1ae" ' + EDGE + '/><circle cx="138" cy="27" r="9" fill="#ffb3c4"/>' +
    '<path d="M70 46 L68 14 L84 28 L100 4 L116 28 L132 14 L130 46 Z" fill="#3b3f48" ' + EDGE + '/>' +
    '<path d="M70 40 L130 40" stroke="#ffd23f" stroke-width="3"/>' +
    '<circle cx="100" cy="30" r="5.5" fill="#ff2a2a" ' + EDGE + '/><circle cx="83" cy="35" r="3" fill="#ff2a2a"/><circle cx="117" cy="35" r="3" fill="#ff2a2a"/>' },
];

const ITEM = {};
for (const it of ITEMS) ITEM[it.id] = it;

const PASS = [
  { fish: 25 }, { item: 'hat-ratears' }, { fish: 40 }, { item: 'eyes-ratglow' }, { fish: 60 },
  { item: 'bg-temple' }, { fish: 80 }, { item: 'skin-labrat' }, { fish: 100 }, { item: 'skin-rat' },
  { item: 'neck-cheese' }, { item: 'skin-stone' }, { item: 'hat-ratking' }, { item: 'shirt-rathunter' }, { item: 'skin-torchlight' },
  { item: 'hand-torch' }, { item: 'skin-cheese' }, { item: 'skin-shadow' }, { item: 'skin-toxic' }, { item: 'skin-ratcostume' },
].map((r, i) => Object.assign({ tier: i + 1 }, r));
const TIER_XP = 300;

/* ================= THE CAT ================= */

let uidCounter = 0;

// talker: 'me' (mouth follows your microphone) or 'opp' (mouth follows your opponent's voice).
// For pictures drawn on a canvas (where the page's CSS doesn't apply): arms: false leaves out the arms, paws and
// held item, mouth: 'open' or 'closed' draws only that mouth, and look moves the eyes sideways (in viewBox units).
function catSVG(equip, opts) {
  const o = opts || {};
  const eq = equip || {};
  const arms = o.arms !== false;
  const uid = 'k' + (++uidCounter);
  const pick = slot => (eq[slot] && ITEM[eq[slot]] && ITEM[eq[slot]].slot === slot ? ITEM[eq[slot]] : null);
  const fur = pick('skin') || ITEM['skin-orange'];
  const bg = pick('bg') || ITEM['bg-space'];
  const hat = pick('hat');
  const eyes = pick('eyes');
  const shirt = pick('shirt');
  const jacked = !!(shirt && shirt.jacked);
  const neck = pick('neck');
  const hand = pick('hand');
  const [light, mid, shadow] = fur.c;
  const defs = [
    '<radialGradient id="' + uid + '-fur" cx=".42" cy=".3" r=".85"><stop offset="0" stop-color="' + light + '"/>' +
      '<stop offset=".55" stop-color="' + mid + '"/><stop offset="1" stop-color="' + shadow + '"/></radialGradient>',
    '<clipPath id="' + uid + '-body"><path d="' + BODY + '"/></clipPath>',
    '<clipPath id="' + uid + '-head"><path d="' + HEAD + '"/></clipPath>',
    '<clipPath id="' + uid + '-jb"><path d="' + JBODY + '"/></clipPath>',
    '<clipPath id="' + uid + '-mouth"><ellipse cx="100" cy="117" rx="8.5" ry="8"/></clipPath>',
    '<radialGradient id="' + uid + '-sheen"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>',
  ];
  let fill = 'url(#' + uid + '-fur)';
  if (fur.grad) {
    defs.push(grad(uid + '-rain', fur.grad, 1, 0));
    fill = 'url(#' + uid + '-rain)';
  }
  const c = { uid, defs };
  const p = [];
  if (o.bgOnly) { // just the background, stretched to fill a box of any shape (behind a cat drawn with bg: false)
    const art = bg.art(c);
    return '<svg class="cat-bg" viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' + defs.join('') + '</defs>' + art + '</svg>';
  }
  if (o.bg !== false) {
    p.push(bg.art(c));
    p.push('<ellipse cx="100" cy="233" rx="42" ry="5" fill="#000" opacity=".25"/>');
  }
  if (shirt && shirt.back) p.push(shirt.back(c));
  p.push('<g class="cat-tail">' + (fur.tail ? fur.tail() : '<path d="M132 188 C150 190 166 178 162 156" fill="none" stroke="' + shadow + '" stroke-width="12" stroke-linecap="round"/>') + '</g>');
  if (jacked) { // very skinny legs, tiny feet
    p.push('<rect x="81.5" y="196" width="5" height="30" rx="2.5" fill="' + mid + '"/><rect x="113.5" y="196" width="5" height="30" rx="2.5" fill="' + mid + '"/>');
    if (shirt.shoes) p.push(shirt.shoes(c));
    else p.push('<ellipse cx="84" cy="228" rx="9" ry="5" fill="' + fill + '"/><ellipse cx="116" cy="228" rx="9" ry="5" fill="' + fill + '"/>');
  } else {
    p.push('<rect x="74" y="186" width="16" height="34" rx="8" fill="' + mid + '"/><rect x="110" y="186" width="16" height="34" rx="8" fill="' + mid + '"/>');
    p.push('<ellipse cx="82" cy="225" rx="11" ry="7.5" fill="' + fill + '"/><ellipse cx="118" cy="225" rx="11" ry="7.5" fill="' + fill + '"/>');
  }
  p.push('<path d="' + (jacked ? JBODY : BODY) + '" fill="' + fill + '"/>');
  if (shirt) p.push('<g clip-path="url(#' + uid + (jacked ? '-jb' : '-body') + ')">' + shirt.art(c) + '</g>');
  if (arms && jacked) { // huge arms: shoulders, biceps, forearms and fists
    for (const sx of [-1, 1]) {
      p.push('<ellipse cx="' + (100 + sx * 61) + '" cy="168" rx="17" ry="22" fill="' + fill + '"/>');
      p.push('<ellipse cx="' + (100 + sx * 63) + '" cy="191" rx="12.5" ry="15" fill="' + fill + '"/>');
      p.push('<circle cx="' + (100 + sx * 60) + '" cy="206" r="12" fill="' + fill + '"/>');
      p.push('<ellipse cx="' + (100 + sx * 58) + '" cy="162" rx="5" ry="9" fill="#fff" opacity=".16"/>');
      if (shirt.sleeve) p.push('<ellipse cx="' + (100 + sx * 61) + '" cy="153" rx="14" ry="11" fill="' + shirt.sleeve + '"/>');
    }
  } else if (arms) {
    p.push('<path d="' + ARMS + '" fill="none" stroke="' + mid + '" stroke-width="15" stroke-linecap="round"/>');
    if (shirt && shirt.sleeve) p.push('<path d="' + SLEEVES + '" fill="none" stroke="' + shirt.sleeve + '" stroke-width="17" stroke-linecap="round"/>');
    p.push('<circle cx="56" cy="188" r="11" fill="' + fill + '"/><circle cx="144" cy="188" r="11" fill="' + fill + '"/>');
  }

  if (fur.suit && !jacked) p.push(fur.suit(fill, arms)); // (a costume over the body: see the Rat Costume skin)
  p.push('<g class="cat-head">');
  p.push('<path d="M36 70 C30 45 30 22 38 12 C50 14 68 24 80 36 Z" fill="' + fill + '"/>');
  p.push('<path d="M42 58 C38 42 38 28 42 20 C52 24 62 31 70 40 Z" fill="' + fur.ear + '"/>');
  p.push('<path d="M164 70 C170 45 170 22 162 12 C150 14 132 24 120 36 Z" fill="' + fill + '"/>');
  p.push('<path d="M158 58 C162 42 162 28 158 20 C148 24 138 31 130 40 Z" fill="' + fur.ear + '"/>');
  p.push('<path d="' + HEAD + '" fill="' + fill + '"/>');
  if (fur.ghost) p.push('<path d="' + HEAD + '" fill="#9fb4ff" opacity=".12"/>');
  if (fur.stripes) {
    p.push('<g clip-path="url(#' + uid + '-head)" stroke="' + fur.stripes + '" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75">' +
      '<path d="M100 28 L100 48 M86 30 Q90 40 92 48 M114 30 Q110 40 108 48 M35 84 L50 86 M35 96 L48 96 M165 84 L150 86 M165 96 L152 96"/></g>');
  }
  if (fur.marks) p.push('<g clip-path="url(#' + uid + '-head)">' + fur.marks + '</g>'); // (spots, cracks and so on, on the head)
  if (fur.sparkle) p.push(dots([[58, 58, 1.8], [146, 62, 2], [118, 40, 1.5], [82, 42, 1.3], [154, 110, 1.5], [46, 112, 1.4]], '#fff', 0.9));
  p.push('<ellipse cx="96" cy="56" rx="44" ry="24" fill="url(#' + uid + '-sheen)"/>');
  const rim = fur.dark ? ' stroke="#fff" stroke-opacity=".5" stroke-width="1.6"' : ''; // so dark cats' eyes still show
  if (o.look) p.push('<g transform="translate(' + o.look + ' 0)">');
  p.push('<g class="cat-eye"><ellipse cx="71" cy="91" rx="7.8" ry="12" fill="' + INK + '"' + rim + '/><circle cx="73.5" cy="85" r="2.8" fill="#fff"/></g>');
  p.push('<g class="cat-eye"><ellipse cx="129" cy="91" rx="7.8" ry="12" fill="' + INK + '"' + rim + '/><circle cx="131.5" cy="85" r="2.8" fill="#fff"/></g>');
  if (o.look) p.push('</g>');
  if (!fur.noWhiskers) p.push('<path d="M41 103 Q49 103 56.5 105 M43.5 116 Q50 113 56.5 111 M159 103 Q151 103 143.5 105 M156.5 116 Q150 113 143.5 111" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>');
  if (o.mouth !== 'closed') {
    p.push('<g class="cat-mouth-open"><ellipse cx="100" cy="117" rx="8.5" ry="8" fill="#3d1810"/>' +
      '<ellipse cx="100" cy="122" rx="5.5" ry="3.4" fill="#ff8a9a" clip-path="url(#' + uid + '-mouth)"/></g>');
  }
  if (o.mouth !== 'open') p.push('<path class="cat-mouth-closed" d="M100 108.3 L100 111.5 M86 110.5 Q93 118.5 100 111.5 Q107 118.5 114 110.5" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
  p.push('<path d="M94.5 101.5 Q100 99.3 105.5 101.5 Q103 107 100 108.3 Q97 107 94.5 101.5 Z" fill="#4a2418"/>');
  if (fur.face) p.push(fur.face()); // (the costume's mask, over the eyes and nose)
  if (shirt && shirt.face) p.push(shirt.face(c));
  if (eyes) p.push(eyes.art(c));
  if (hat) p.push(hat.art(c));
  p.push('</g>');
  if (shirt && shirt.over) p.push(shirt.over(c));
  if (neck) p.push(neck.art(c));
  if (hand && arms) p.push(hand.art(c));

  const cls = 'cat' + (o.anim === false ? '' : ' anim') + (o.talker ? ' talk-' + o.talker : '');
  return '<svg class="' + cls + '" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" role="img" style="--mouth:0" aria-label="' +
    esc(o.label || 'Cat') + '"><defs>' + defs.join('') + '</defs>' + p.join('') + '</svg>';
}

// A cat showing off one item (for shop tiles and pass rewards).
function previewSVG(id, skin) {
  const it = ITEM[id];
  if (!it) return '';
  const eq = { skin: skin && ITEM[skin] ? skin : 'skin-orange', bg: 'bg-space' };
  eq[it.slot] = id;
  return catSVG(eq, { label: it.name, anim: false });
}

/* ================= ACCOUNTS ================= */
// Accounts live on CamArcade's server (server.js), so you can log in on any device and nobody can edit a streak.
// This browser keeps your login token, plus a copy of your account so pages show up right away.

const enc = new TextEncoder();
function toB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function fromB64(s) { return Uint8Array.from(atob(s), ch => ch.charCodeAt(0)); }

async function hashPassword(password, saltB64, rounds) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: rounds }, key, 256);
  return toB64(bits);
}

function oldAccounts() { const a = readJSON(ACCOUNTS_KEY); return a && typeof a === 'object' ? a : {}; }
function keyOf(name) { return String(name || '').trim().toLowerCase(); }
function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16); }

function checkUsername(name) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return 'Usernames are 3 to 16 letters, numbers or _ (no spaces).';
  return '';
}

// Before accounts moved online, they were saved in this browser. Signing up with the same name and password
// brings that cat, its fish and items along (but not the streak: streaks only count when the server saw the games).
async function oldProfile(name, password) {
  const acc = oldAccounts()[keyOf(name)];
  if (!acc || !window.crypto || !crypto.subtle) return null;
  try {
    if (await hashPassword(password, acc.salt, acc.rounds || PBKDF2_ROUNDS) !== acc.hash) return null;
  } catch (e) {
    return null;
  }
  return looks(normalize(readJSON(PROFILE_PREFIX + keyOf(name)), name));
}

// birth: { year, month } (month 1–12). Under 13 can't sign up; 13–17 play as their cat only.
async function signUp(name, password, birth) {
  name = String(name || '').trim();
  const bad = checkUsername(name);
  if (bad) throw new Error(bad);
  if (String(password).length < 6) throw new Error('Pick a password with at least 6 characters.');
  const old = await oldProfile(name, password);
  const r = await CAServer.call('ca_sign_up', {
    p_name: name, p_pass: password, p_year: birth.year, p_month: birth.month, p_profile: old || looks(fresh(name)),
  });
  startSession(r.token, r.me, false);
  return { imported: !!old };
}

// Play without an account: the server makes up a funny name. It's kept for this tab only, so closing the tab ends it.
async function playAsGuest() {
  const r = await CAServer.call('ca_guest', {});
  startSession(r.token, r.me, false);
}

async function logIn(name, password, remember) {
  const r = await CAServer.call('ca_log_in', { p_name: String(name || '').trim(), p_pass: password });
  startSession(r.token, r.me, remember);
}

function startSession(t, me, remember) {
  token = t;
  remembered = !!remember;
  ssSet(TOKEN_KEY, t);
  if (remember) lsSet(REMEMBER_KEY, t); else { lsDel(REMEMBER_KEY); lsDel(CACHE_KEY); }
  if (!me.guest) lsSet(LAST_USER_KEY, me.name);
  useAccount(me);
  startPing();
}

function logOut() {
  flushProfile();
  if (token) CAServer.call('ca_log_out', { p_token: token }).catch(() => {});
  ssDel(TOKEN_KEY);
  ssDel(CACHE_KEY);
  lsDel(MEDIA_KEY);
  lsDel(CAMERA_KEY);
  lsDel(FACE_KEY);
  lsDel(REMEMBER_KEY);
  lsDel(CACHE_KEY);
  clearInterval(pingTimer);
  document.body.classList.remove('guest');
  voice.stop();
  token = null;
  user = null;
  profile = null;
  emitChange();
}

// The server says the login token doesn't work any more (it ran out, or the account was deleted).
function sessionLost() {
  if (!token) return;
  logOut();
  toast('You were logged out. Please log in again.');
  if (location.hash !== '#/auth') location.hash = '#/auth';
}

async function deleteAccount(password) {
  await CAServer.call('ca_delete_account', { p_token: token, p_pass: password });
  token = null; // (already gone on the server)
  logOut();
}

/* ================= YOUR PROFILE ================= */

let user = null;     // your username in lower case, while you're logged in
let profile = null;
let token = null;    // proves to the server who you are
let remembered = false;
let pingTimer = null;
let pushTimer = null;

const STATS = ['streak', 'best', 'wins', 'losses', 'draws', 'friendly'];

function fresh(name) {
  return {
    v: 3, name, fish: 30, xp: 0, streak: 0, best: 0, wins: 0, losses: 0, draws: 0, friendly: 0,
    owned: ['skin-orange', 'bg-space'], equip: { skin: 'skin-orange', bg: 'bg-space' }, claimed: [], mathBest: 0, records: {}, savedAt: 0,
    run: { pot: 0, wins: 0 }, // (fish bets: the pot you're playing for, and the bets you've won in a row: see BETS)
    id: 0, adult: false, bannedUntil: null, banReason: null,
  };
}

function normalize(p, name) {
  const out = fresh(name);
  if (!p || typeof p !== 'object') return out;
  for (const k of ['fish', 'xp', 'streak', 'best', 'wins', 'losses', 'draws', 'friendly', 'mathBest', 'savedAt']) out[k] = Math.max(0, Math.floor(Number(p[k]) || 0));
  if (Array.isArray(p.owned)) for (const id of p.owned) if (ITEM[id] && (!ITEM[id].only || ITEM[id].only.includes(String(name || '').toLowerCase())) && !out.owned.includes(id)) out.owned.push(id);
  for (const it of ITEMS) if (it.only && it.only.includes(String(name || '').toLowerCase()) && !out.owned.includes(it.id)) out.owned.push(it.id); // (those accounts always have the DAME tee)
  if (p.equip && typeof p.equip === 'object') {
    for (const s of SLOTS) {
      const id = p.equip[s.id];
      if (id && ITEM[id] && ITEM[id].slot === s.id && out.owned.includes(id)) out.equip[s.id] = id;
    }
  }
  if (Array.isArray(p.claimed)) out.claimed = p.claimed.filter(n => Number.isInteger(n) && n >= 1 && n <= PASS.length);
  // (Season 1, Fear of Rats, changed some rewards: a tier you already claimed gives you its new reward too)
  for (const n of out.claimed) { const r = PASS[n - 1]; if (r && r.item && !out.owned.includes(r.item)) out.owned.push(r.item); }
  if (p.run && typeof p.run === 'object') {
    out.run = { pot: Math.min(1e7, Math.max(0, Math.floor(Number(p.run.pot) || 0))), wins: Math.min(1000, Math.max(0, Math.floor(Number(p.run.wins) || 0))) };
    if (!out.run.pot) out.run.wins = 0;
  }
  if (p.records && typeof p.records === 'object') { // ({ game id: { record name: the best so far } })
    for (const game of Object.keys(p.records).slice(0, 80)) {
      const r = p.records[game];
      if (!r || typeof r !== 'object') continue;
      out.records[game] = {};
      for (const k of Object.keys(r).slice(0, 8)) { const n = Math.floor(Number(r[k])); if (n > 0 && n < 1e7) out.records[game][k] = n; }
    }
  }
  return out;
}

// The part of your profile your own browser saves to the server: only looks (cat, fish, items), never streaks.
function looks(p) {
  return { fish: p.fish, xp: p.xp, owned: p.owned, equip: p.equip, claimed: p.claimed, mathBest: p.mathBest, records: p.records, run: p.run, savedAt: p.savedAt || 0 };
}

// me: your account as the server sends it ({ id, name, adult, streak, best, …, profile }).
function useAccount(me) {
  user = keyOf(me.name);
  profile = normalize(me.profile, me.name);
  applyStats(me);
  writeCache();
  emitChange();
}

function applyStats(me) {
  for (const k of STATS) profile[k] = Math.max(0, Math.floor(Number(me[k]) || 0));
  profile.id = Number(me.id) || 0;
  profile.adult = !!me.adult;
  profile.bannedUntil = me.banned_until || null;
  profile.banReason = me.ban_reason || null;
  profile.test = !!me.test;              // a test account (testplayer.js plays it by itself)
  profile.testWith = me.test_with || null;
  profile.guest = !!me.guest;            // a guest: nothing is saved, and no shop or Streak Pass
  profile.google = !!me.google;          // logs in with Google (no password: deleting the account asks for the username)
  document.body.classList.toggle('guest', profile.guest);
}

// Fresh numbers from the server (after a game, or every minute). Streaks always come from the server.
function setStats(me) {
  if (!profile || !me || Number(me.id) !== profile.id) return;
  applyStats(me);
  if (me.profile && Number(me.profile.savedAt) > profile.savedAt) { // (you changed your cat on another device since)
    const theirs = normalize(me.profile, profile.name);
    for (const k of ['fish', 'xp', 'owned', 'equip', 'claimed', 'mathBest', 'records', 'run', 'savedAt']) profile[k] = theirs[k];
  }
  writeCache();
  emitChange();
}

function cacheOf() {
  return {
    id: profile.id, name: profile.name, adult: profile.adult, banned_until: profile.bannedUntil, ban_reason: profile.banReason,
    test: profile.test, test_with: profile.testWith, guest: profile.guest,
    streak: profile.streak, best: profile.best, wins: profile.wins, losses: profile.losses, draws: profile.draws,
    friendly: profile.friendly, profile: looks(profile),
  };
}

function writeCache() {
  if (!profile) return;
  const s = JSON.stringify(cacheOf());
  ssSet(CACHE_KEY, s);
  if (remembered) lsSet(CACHE_KEY, s);
}

function save() {
  if (!user || !profile) return;
  profile.savedAt = Date.now();
  writeCache();
  emitChange();
  if (profile.guest) return; // (guests save nothing)
  // (One save to the server at most every 2 seconds, with the newest profile. Lots of changes close together, like
  // fish coming in during a game, still get saved as they come, without going over the server's limit.)
  if (!pushTimer) pushTimer = setTimeout(pushProfile, Math.max(800, 2000 - (Date.now() - lastPush)));
}

let lastPush = 0;
function pushProfile(keepalive) {
  clearTimeout(pushTimer);
  pushTimer = null;
  if (!token || !profile) return;
  lastPush = Date.now();
  CAServer.call('ca_save_profile', { p_token: token, p_profile: looks(profile) }, { keepalive }).catch(err => {
    if (err.code === 'not_logged_in') sessionLost();
    else if (err.code === 'slow_down' || err.code === 'offline') { if (!pushTimer) pushTimer = setTimeout(pushProfile, 15000); } // (try again soon)
    else console.warn('Could not save your cat:', err.message);
  });
}

function flushProfile() { if (pushTimer) pushProfile(true); }
window.addEventListener('pagehide', flushProfile);

function emitChange() { window.dispatchEvent(new CustomEvent('ca:change')); }

async function refresh() {
  if (!token) return;
  const asked = token;
  try {
    const me = await CAServer.call('ca_me', { p_token: token });
    if (token !== asked) return; // (logged out while waiting for the answer)
    if (!profile || Number(me.id) !== profile.id) useAccount(me);
    else setStats(me);
  } catch (err) {
    if (err.code === 'not_logged_in') sessionLost();
  }
}

// Every minute: keeps you counted as "online" and your streak in step with the server.
function startPing() {
  clearInterval(pingTimer);
  pingTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
}

// Logged in earlier (this tab, or "Keep me logged in")? Show your account from the copy right away, then check it.
// Resolves once you're known to be logged in or out.
function restoreSession() {
  const t = ssGet(TOKEN_KEY) || lsGet(REMEMBER_KEY);
  if (!t) return Promise.resolve();
  token = t;
  remembered = lsGet(REMEMBER_KEY) === t;
  ssSet(TOKEN_KEY, t);
  let cached = null;
  try { cached = JSON.parse(ssGet(CACHE_KEY) || (remembered ? lsGet(CACHE_KEY) : null)); } catch (e) { /* no copy */ }
  if (cached && cached.name) {
    user = keyOf(cached.name);
    profile = normalize(cached.profile, cached.name);
    applyStats(cached);
  }
  startPing();
  const check = refresh();
  return profile ? Promise.resolve() : check;
}

function deviceId() {
  let id = lsGet(DEVICE_KEY);
  if (!id) { id = Math.random().toString(36).slice(2, 12); lsSet(DEVICE_KEY, id); }
  return id;
}

// Under 18, other players never see or hear you: they see your cat. (Your camera still works for pose games.)
function canVideoChat() { return !!(profile && profile.adult); }

function tierOf(xp) { return Math.min(PASS.length, Math.floor(xp / TIER_XP)); }

// Fish come from winning, and the longer your streak, the more fish each win is worth.
function rewardFor(outcome, streakAfter) {
  const s = Math.min(streakAfter, 10);
  if (outcome === 'win') return { fish: 5 + 5 * s, xp: 100 + 20 * s };
  if (outcome === 'draw') return { fish: 3, xp: 50 };
  return { fish: 0, xp: 25 };
}

// Shows a game's result straight away. The server settles the real streak a moment later (setStats).
function applyResult(outcome) {
  const p = profile;
  const before = { streak: p.streak, best: p.best, xp: p.xp, tier: tierOf(p.xp), fish: p.fish };
  if (outcome === 'win') { p.streak++; p.wins++; p.best = Math.max(p.best, p.streak); }
  else if (outcome === 'lose') { p.streak = 0; p.losses++; }
  else p.draws++;
  const r = p.guest ? { fish: 0, xp: 0 } : rewardFor(outcome, p.streak);
  p.fish += r.fish;
  p.xp += r.xp;
  save();
  return {
    before, fish: r.fish, xp: r.xp, newBest: p.best > before.best,
    after: { streak: p.streak, best: p.best, xp: p.xp, tier: tierOf(p.xp), fish: p.fish },
  };
}

function claimTier(n) {
  const t = PASS[n - 1];
  if (!t || tierOf(profile.xp) < n || profile.claimed.includes(n)) return null;
  profile.claimed.push(n);
  if (t.fish) profile.fish += t.fish;
  if (t.item && !profile.owned.includes(t.item)) profile.owned.push(t.item);
  save();
  return t;
}

// A secret code: type it while logged in (not in a text box), then press Enter, for 1,000,000 XP.
const SECRET_CODE = 'jim';
let typedCode = '';
window.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { typedCode = ''; return; }
  if (e.key === 'Enter') {
    if (typedCode === SECRET_CODE && user && profile && !profile.guest) {
      profile.xp += 1000000;
      save();
      toast('⭐ +1,000,000 XP!');
      sound('win');
    }
    typedCode = '';
  } else if (e.key && e.key.length === 1) {
    typedCode = (typedCode + e.key.toLowerCase()).slice(-SECRET_CODE.length);
  }
}, true);

function buy(id) {
  const it = ITEM[id];
  if (!it || it.price == null || profile.owned.includes(id) || profile.fish < it.price) return false;
  profile.fish -= it.price;
  profile.owned.push(id);
  save();
  return true;
}

/* ---------- BETS: fish bets on Classic Games ----------
   Before a game against a real player, each of you can offer fish. The bet is the smaller offer (no bet if either of
   you offers nothing). Your first bet comes out of your fish and starts your pot. Win, and the other player's bet goes
   into your pot, minus a 10% cut (bet 10, win 9). Keep betting your pot to make it grow, or cash it out: from the
   second win in a row, cashing out adds a bonus (10% more for each win after the first, up to 50%). Lose a bet, and the
   whole pot is gone. A draw (or a game that doesn't count) changes nothing. */
const BET_CUT = 0.1;
const betBonus = wins => Math.min(0.5, 0.1 * Math.max(0, wins - 1));
const cashValue = run => Math.floor(run.pot * (1 + betBonus(run.wins)));
const bets = {
  CUT: BET_CUT, bonus: betBonus,
  run: () => Object.assign({}, profile.run),
  canBet: () => !!profile && !profile.guest,
  // The most you can offer: your pot while you have one, or your fish to start one.
  most: () => (!profile || profile.guest ? 0 : profile.run.pot > 0 ? profile.run.pot : profile.fish),
  cashValue: () => cashValue(profile.run),
  // The bet is on: the first one of a pot comes out of your fish. Returns how things stood just after, to undo a result.
  lock(stake) {
    stake = Math.max(0, Math.floor(stake));
    if (!stake || !bets.canBet()) return null;
    if (profile.run.pot <= 0) {
      stake = Math.min(stake, profile.fish);
      if (!stake) return null;
      profile.fish -= stake;
      profile.run = { pot: stake, wins: 0 };
    } else stake = Math.min(stake, profile.run.pot);
    save();
    return { stake, run: Object.assign({}, profile.run) };
  },
  // The game ended: returns what happened to your pot ({ won, lost, pot }).
  settle(bet, outcome) {
    if (!bet || !bets.canBet()) return null;
    const before = profile.run.pot;
    if (outcome === 'win') {
      const won = Math.floor(bet.stake * (1 - BET_CUT));
      profile.run = { pot: profile.run.pot + won, wins: profile.run.wins + 1 };
      save();
      return { won, pot: profile.run.pot, wins: profile.run.wins, cash: cashValue(profile.run) };
    }
    if (outcome === 'lose') {
      profile.run = { pot: 0, wins: 0 };
      save();
      return { lost: before, pot: 0 };
    }
    return { pot: profile.run.pot, cash: cashValue(profile.run) };
  },
  // The server settled it differently (like a disputed game): back to how it was when the bet went on, then that result.
  redo(bet, outcome) {
    if (!bet || !bets.canBet()) return null;
    profile.run = Object.assign({}, bet.run);
    return bets.settle(bet, outcome);
  },
  // Your pot, plus the bonus, into your fish.
  cashOut() {
    if (!bets.canBet() || profile.run.pot <= 0) return 0;
    const n = cashValue(profile.run);
    profile.fish += n;
    profile.run = { pot: 0, wins: 0 };
    save();
    return n;
  },
};

function equip(id) {
  const it = ITEM[id];
  if (!it || !profile.owned.includes(id)) return false;
  profile.equip[it.slot] = id;
  save();
  return true;
}

function unequip(slot) {
  if (SLOTS.some(s => s.id === slot && s.required)) return false;
  delete profile.equip[slot];
  save();
  return true;
}

// A personal record in a game (guests have no records: nothing of theirs is saved). True if it's a new best.
function setRecord(game, key, value) {
  value = Math.floor(Number(value) || 0);
  if (!profile || profile.guest || value <= 0) return false;
  const r = profile.records[game] || (profile.records[game] = {});
  if (value <= (r[key] || 0)) return false;
  r[key] = value;
  save();
  return true;
}

function setMathBest(score) {
  if (score <= profile.mathBest) return false;
  profile.mathBest = score;
  save();
  return true;
}

/* ================= MICROPHONE + TALKING CAT ================= */

const VIDEO = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' };

const voice = {
  stream: null,       // your microphone
  camera: null,       // your camera, while you're in a game (or previewing it on the start screen)
  camPending: null,
  inGame: false,
  ctx: null,
  analyser: null,
  buf: null,
  level: 0,
  raf: 0,
  listeners: new Set(),

  choice() { return lsGet(MEDIA_KEY); },           // 'on' | 'off' | null (not asked yet; remembered between visits)
  setChoice(v) { lsSet(MEDIA_KEY, v); },
  micOn() { return !!this.stream && this.stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live'); },
  hasMic() { return !!this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live'); },
  cameraOn() { return !!this.camera && this.camera.getVideoTracks().some(t => t.readyState === 'live'); },

  // Did you allow the camera (and not switch to your cat since)? Then it turns on whenever you're in a game.
  camWanted() { return lsGet(CAMERA_KEY) === 'on'; },
  // Did you pick "Show my face"? Then every match where cameras are allowed starts with your face showing.
  faceWanted() { return lsGet(FACE_KEY) === 'on'; },
  setFaceWanted(on) { lsSet(FACE_KEY, on ? 'on' : 'off'); },
  setCamWanted(on) {
    if (on && guestGate()) { emitMedia(); return Promise.resolve(); }
    lsSet(CAMERA_KEY, on ? 'on' : 'off');
    emitMedia();
    return this.syncCamera();
  },
  setInGame(v) {
    this.inGame = v;
    return this.syncCamera();
  },
  async syncCamera() {
    if (this.inGame && this.camWanted()) {
      if (this.cameraOn()) return;
      try {
        await this.startCamera();
      } catch (err) {
        console.warn('Camera error:', err);
        lsSet(CAMERA_KEY, 'off');
        emitMedia();
        toast(cameraErrorText(err));
      }
    } else if (this.camera) {
      this.stopCamera();
    }
  },

  // Asks for both at once; the camera keeps running as a preview until you leave the start screen.
  async askBoth() {
    const md = navigator.mediaDevices;
    if (!window.isSecureContext || !md || !md.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureError' });
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    let s;
    try {
      s = await md.getUserMedia({ audio, video: VIDEO });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') throw err;
      try {
        s = await md.getUserMedia({ audio }); // no camera plugged in
      } catch (err2) {
        if (err2.name === 'NotAllowedError') throw err2;
        s = await md.getUserMedia({ video: VIDEO }); // no microphone plugged in
      }
    }
    if (s.getAudioTracks().length) this.useMic(new MediaStream(s.getAudioTracks()));
    const cam = s.getVideoTracks();
    lsSet(CAMERA_KEY, cam.length ? 'on' : 'off');
    if (cam.length) this.useCamera(new MediaStream(cam));
    emitMedia();
  },

  async startMic() {
    if (this.hasMic()) return true;
    if (guestGate()) return false;
    const md = navigator.mediaDevices;
    if (!window.isSecureContext || !md || !md.getUserMedia) return false;
    try {
      const s = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.useMic(s);
      return true;
    } catch (err) {
      console.warn('Microphone error:', err);
      return false;
    }
  },

  useMic(stream) {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = stream;
    stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { if (this.stream === stream) { this.stream = null; emitMedia(); } }));
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const src = this.ctx.createMediaStreamSource(stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.buf = new Uint8Array(this.analyser.fftSize);
      src.connect(this.analyser);
    } catch (e) { console.warn('Could not listen to the microphone:', e); }
    this.loop();
    emitMedia();
  },

  setMic(on) {
    if (!this.stream) return;
    this.stream.getAudioTracks().forEach(t => { t.enabled = on; });
    emitMedia();
  },

  startCamera() {
    if (this.cameraOn()) return Promise.resolve(this.camera);
    if (this.camPending) return this.camPending;
    this.camPending = navigator.mediaDevices.getUserMedia({ video: VIDEO }).then(s => {
      this.camPending = null;
      if (!(this.inGame && this.camWanted())) { s.getTracks().forEach(t => t.stop()); return null; } // left the game meanwhile
      this.useCamera(s);
      return s;
    }, err => {
      this.camPending = null;
      throw err;
    });
    return this.camPending;
  },

  useCamera(s) {
    if (this.camera && this.camera !== s) this.camera.getTracks().forEach(t => t.stop());
    this.camera = s;
    s.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (this.camera === s) { this.camera = null; emitMedia(); } }));
    emitMedia();
  },

  stopCamera() {
    if (!this.camera) return;
    this.camera.getTracks().forEach(t => t.stop());
    this.camera = null;
    emitMedia();
  },

  // The stream to send to another player: your microphone, plus your camera if it's on (and opts.video isn't false).
  // Under 18: nothing at all, so other players only ever see and hear your cat.
  outgoing(opts) {
    if (!canVideoChat()) return null;
    const tracks = [];
    if (this.stream) tracks.push(...this.stream.getAudioTracks().filter(t => t.readyState === 'live'));
    if (this.camera && !(opts && opts.video === false)) tracks.push(...this.camera.getVideoTracks().filter(t => t.readyState === 'live'));
    return tracks.length ? new MediaStream(tracks) : null;
  },

  stop() {
    this.stopCamera();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.analyser = null;
    cancelAnimationFrame(this.raf);
    this.level = 0;
    setMouths('talk-me', 0);
    emitMedia();
  },

  onLevel(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      let target = 0;
      if (this.analyser && this.micOn()) {
        this.analyser.getByteTimeDomainData(this.buf);
        let sum = 0;
        for (let i = 0; i < this.buf.length; i++) { const x = (this.buf[i] - 128) / 128; sum += x * x; }
        const rms = Math.sqrt(sum / this.buf.length);
        target = Math.min(1, Math.max(0, (rms - 0.012) / 0.09));
      }
      this.level = target > this.level ? this.level * 0.35 + target * 0.65 : this.level * 0.78 + target * 0.22;
      const m = this.level < 0.05 ? 0 : Math.min(1, this.level);
      setMouths('talk-me', m);
      this.listeners.forEach(fn => fn(m));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  },
};

function cameraErrorText(err) {
  const name = (err && err.name) || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Your camera is blocked, so you are playing as your cat. Allow it with the lock icon in the address bar.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found, so you are playing as your cat.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Your camera is busy in another app, so you are playing as your cat.';
  return 'Your camera could not start, so you are playing as your cat.';
}

function setMouths(cls, v) {
  const list = document.getElementsByClassName(cls);
  const val = v.toFixed(2);
  for (let i = 0; i < list.length; i++) if (list[i].style.getPropertyValue('--mouth') !== val) list[i].style.setProperty('--mouth', val);
}

function emitMedia() { window.dispatchEvent(new CustomEvent('ca:media')); }

// Browsers keep audio paused until you click something.
['pointerdown', 'keydown'].forEach(type => window.addEventListener(type, () => {
  if (voice.ctx && voice.ctx.state === 'suspended') voice.ctx.resume();
}, { capture: true }));

/* ================= SOUND EFFECTS ================= */

let soundOn = lsGet('wc-sound') !== '0';
let sfx = null;
const SOUNDS = {
  move: [[330, 0, 0.07]], capture: [[260, 0, 0.08], [196, 0.05, 0.1]], castle: [[330, 0, 0.06], [392, 0.08, 0.07]],
  check: [[660, 0, 0.08], [880, 0.09, 0.12]], tick: [[520, 0, 0.05]], go: [[880, 0, 0.12]],
  point: [[660, 0, 0.08], [880, 0.08, 0.12]], miss: [[300, 0, 0.14]], notify: [[587, 0, 0.1], [784, 0.1, 0.14]],
  found: [[523, 0, 0.08], [659, 0.08, 0.08], [784, 0.16, 0.14]], match: [[392, 0, 0.1], [523, 0.12, 0.16]],
  start: [[392, 0, 0.1], [523, 0.1, 0.16]], correct: [[784, 0, 0.06]],
  win: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.3]],
  lose: [[392, 0, 0.16], [330, 0.16, 0.16], [262, 0.32, 0.3]], draw: [[440, 0, 0.14], [440, 0.2, 0.14]],
  boom: [[110, 0, 0.35], [82, 0.08, 0.45], [55, 0.2, 0.6]], flip: [[620, 0, 0.04]],
};

function sound(kind) { // a name from SOUNDS, or your own notes: [[frequency, start (s), length (s)], …]
  if (!soundOn) return;
  try {
    sfx = sfx || new (window.AudioContext || window.webkitAudioContext)();
    if (sfx.state === 'suspended') sfx.resume();
    const now = sfx.currentTime;
    for (const [freq, at, len] of Array.isArray(kind) ? kind : SOUNDS[kind] || SOUNDS.tick) {
      const osc = sfx.createOscillator();
      const g = sfx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(0.16, now + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(g);
      g.connect(sfx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    }
  } catch (e) { /* sound is optional */ }
}

function setSound(on) { soundOn = on; lsSet('wc-sound', on ? '1' : '0'); }

/* ================= POPUPS ================= */

let modalState = null;

function modal(o) {
  modalState = o;
  $('caModalIcon').textContent = o.icon || '';
  $('caModalIcon').classList.toggle('hidden', !o.icon);
  $('caModalTitle').textContent = o.title || '';
  $('caModalText').textContent = o.text || '';
  $('caModalText').classList.toggle('hidden', !o.text);
  const input = $('caModalInput'); // o.input: { type, placeholder } adds a text box; each button's fn gets what was typed
  input.classList.toggle('hidden', !o.input);
  input.value = '';
  if (o.input) {
    input.type = o.input.type || 'text';
    input.placeholder = o.input.placeholder || '';
    input.autocomplete = o.input.type === 'password' ? 'current-password' : 'off';
  }
  const box = $('caModalBtns');
  box.innerHTML = '';
  box.classList.toggle('stack', !!o.stack); // o.stack: one button per line (for a list of choices)
  for (const b of o.buttons || [{ label: 'OK', primary: true }]) {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => { const v = input.value; closeModal(); if (b.fn) b.fn(v); });
    box.appendChild(el);
  }
  $('caModal').classList.remove('hidden');
  if (o.input) setTimeout(() => input.focus(), 30);
}

function closeModal() { modalState = null; $('caModal').classList.add('hidden'); }
function modalLocked() { return !!(modalState && modalState.locked); } // must be answered with a button
function confirmBox(title, text, okLabel, fn) { modal({ title, text, buttons: [{ label: okLabel, primary: true, fn }, { label: 'Cancel' }] }); }

let toastTimer = null;
function toast(text) {
  const t = $('caToast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ================= SCREENS ================= */

const routes = {};
let current = null;
let pending = null;

function register(name, def) { routes[name] = def; }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const i = h.indexOf('?');
  const name = (i < 0 ? h : h.slice(0, i)) || 'menu';
  return { name, params: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
}

// Runs fn now if the current screen is happy to be left, or after it asks you (e.g. "leave this match?").
function requestLeave(fn) {
  if (current && current.def.canLeave && !current.def.canLeave(fn)) return;
  fn();
}

function go(name, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const target = '#/' + name + qs;
  requestLeave(() => { if (location.hash === target) render(); else location.hash = target; });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
  window.scrollTo(0, 0);
}

// Opening the site goes straight to the lobby: if you're not logged in, the server makes you a guest (a funny name, for
// this tab only), the same as pressing "Play as guest". Not for search engines' robots, or a browser where someone said
// they're under 13; and if it doesn't work, you get the log-in screen instead.
let guestTry = null; // (null: not tried yet · a promise: making one now · 'failed')
function autoGuest() {
  if (guestTry === 'failed') return false;
  if (guestTry) return true;
  if (lsGet('camarcade-age-block') === '1') return false;
  if (/bot|crawl|spider|slurp|preview|lighthouse/i.test(navigator.userAgent || '')) return false;
  guestTry = playAsGuest().then(() => {
    guestTry = null;
    toast('You are ' + profile.name + '! 🐱');
    resume();
  }).catch(err => {
    console.warn('Could not start a guest:', err);
    guestTry = 'failed';
    render();
  });
  return true;
}

// Guests can't use the camera or the microphone: those need an account. This asks them to make one (true if it did).
let gateAt = 0;
function guestGate() {
  if (!profile || !profile.guest) return false;
  if (Date.now() - gateAt > 800) {
    gateAt = Date.now();
    modal({
      title: '📷🎤 Make a free account to use your camera and mic',
      text: 'Guests play as their cat. Sign up (it takes a few seconds) to talk with your microphone, show your face to other players, and play the camera games. You also keep your streak, fish and Streak Pass.',
      buttons: [
        { label: 'Sign up', primary: true, fn: () => { logOut(); go('auth', { mode: 'signup' }); } },
        { label: 'Log in', fn: () => { logOut(); go('auth', { mode: 'login' }); } },
        ...(CAServer.google ? [{ label: "Continue with Google", fn: () => { logOut(); googleStart(); } }] : []),
        { label: 'Not now' },
      ],
    });
  }
  return true;
}

function render() {
  let { name, params } = parseHash();
  if (!routes[name]) name = 'menu';
  if (!user && !routes[name].public) {
    pending = location.hash;
    if (autoGuest()) return; // (makes a guest, then carries on to where you were going)
    name = 'auth';
  } else if (user && !voice.choice() && !routes[name].public && name !== 'perm' && !(profile && profile.guest)) {
    pending = location.hash;
    name = 'perm';
  } else if (user && profile && profile.guest && (name === 'pass' || name === 'cat')) {
    toast('Sign up to get the Streak Pass, the shop and your own cat.');
    name = 'menu';
  }
  if (current && current.def.leave) current.def.leave();
  closeModal();
  current = { name, def: routes[name] };
  document.body.dataset.route = name;
  window.dispatchEvent(new CustomEvent('ca:route', { detail: name }));
  routes[name].enter(params);
}

// After logging in (or choosing about the microphone), carry on to where you were going.
function resume() {
  const target = pending && !/^#\/?(auth|perm)\b/.test(pending) ? pending : '#/menu';
  pending = null;
  if (location.hash === target) render(); else location.hash = target;
}

window.addEventListener('hashchange', render);

// In-app links ask the current screen first (for example, leaving in the middle of a game).
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a || !current || !current.def.canLeave) return;
  const href = a.getAttribute('href');
  if (!current.def.canLeave(() => { location.hash = href; })) e.preventDefault();
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* ================= GOOGLE ================= */
// "Continue with Google": Supabase's sign-in page sends you to Google and back here, with its proof that you signed in
// in the address (after the #). It's picked up here, before anything else reads the address, and the log-in screen
// hands it to the server (ca_google in server/schema.sql), which logs you in or asks for a username first.
let googleToken = null, googleError = '';
if (/[#&](access_token|error_description)=/.test(location.hash)) {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  googleToken = q.get('access_token');
  if (!googleToken) googleError = (q.get('error_description') || 'Signing in with Google did not work.');
  history.replaceState(null, '', location.pathname + location.search + '#/auth?google=1');
}

function googleStart() {
  location.href = CAServer.url + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
}

// Logs in with Google. If that Google account has no CamArcade account yet, resolves with {need: 'signup'}: then
// call it again with { name, birth } to make one. (Google players stay logged in on this computer.)
async function googleLogIn(signup) {
  if (!googleToken) throw new Error('That took too long. Press Continue with Google again.');
  const args = signup ? { p_name: signup.name, p_year: signup.birth.year, p_month: signup.birth.month, p_profile: looks(fresh(signup.name)) } : {};
  const r = await CAServer.call('ca_google', args, { auth: googleToken });
  if (r && r.need) return r;
  googleToken = null;
  startSession(r.token, r.me, true);
  return r;
}

const restoring = googleToken ? Promise.resolve() : restoreSession(); // (just back from Google: that's who you are now)

// Count this visit (once a day per browser), so you can show how many people play. (Not the automated tests.)
if (CAServer.configured && !/[?&]autotest=/.test(location.search)) CAServer.call('ca_visit', { p_visitor: deviceId() }).catch(() => {});

window.CA = {
  get user() { return user; },
  get profile() { return profile; },
  get token() { return token; },
  get soundOn() { return soundOn; },
  restoring,
  ITEMS, ITEM, SLOTS, PASS, TIER_XP, bets,
  catSVG, previewSVG, setMouths, tierOf, rewardFor, applyResult, setStats, refresh, claimTier, buy, equip, unequip, setMathBest, setRecord,
  guestGate,
  googleStart, googleLogIn, get googleOn() { return CAServer.google; }, get googleError() { return googleError; },
  signUp, playAsGuest, logIn, logOut, sessionLost, deleteAccount, checkUsername, cleanName, canVideoChat, lastUser: () => lsGet(LAST_USER_KEY) || '',
  server: CAServer, deviceId, voice, sound, setSound, modal, closeModal, modalLocked, confirmBox, toast, esc,
  register, go, render, resume, showScreen, requestLeave,
  get route() { return current ? current.name : null; },
};

})();
