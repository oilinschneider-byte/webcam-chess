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

const ACCOUNTS_KEY = 'camarcade-accounts-v1';
const SESSION_KEY = 'camarcade-session';
const REMEMBER_KEY = 'camarcade-remember';
const LAST_USER_KEY = 'camarcade-last-user';
const MEDIA_KEY = 'camarcade-media';
const CAMERA_KEY = 'camarcade-camera';
const PROFILE_PREFIX = 'camarcade-profile-v2:';
const OLD_PROFILE_KEY = 'camarcade-profile-v1';
const DEVICE_KEY = 'camarcade-device';
const PBKDF2_ROUNDS = 150000;

/* ================= DRAWING HELPERS ================= */

const INK = '#1c1714';
const EDGE = 'stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const HEAD = 'M100 28 C140 28 165 55 165 92 C165 126 138 143 100 143 C62 143 35 126 35 92 C35 55 60 28 100 28 Z';
const BODY = 'M75 140 C68 152 64 168 66 180 C68 191 79 196 100 196 C121 196 132 191 134 180 C136 168 132 152 125 140 Z';
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
  { id: 'skin-gold', slot: 'skin', name: 'Solid Gold', tier: 10, c: ['#fff1a8', '#ffd23f', '#d9a300'], ear: '#fff3b8' },
  { id: 'skin-galaxy', slot: 'skin', name: 'Galaxy', tier: 18, c: ['#8b5cff', '#3b2394', '#140c45'], ear: '#b89cff', sparkle: true, dark: true },

  { id: 'hat-bow', slot: 'hat', name: 'Pink Bow', price: 35, art: () =>
    '<path d="M128 34 C116 22 108 38 116 46 C120 50 126 42 128 34 Z" fill="#ff6fae" ' + EDGE + '/>' +
    '<path d="M128 34 C140 22 148 38 140 46 C136 50 130 42 128 34 Z" fill="#ff6fae" ' + EDGE + '/>' +
    '<circle cx="128" cy="36" r="5" fill="#e04a8c" ' + EDGE + '/>' },
  { id: 'hat-party', slot: 'hat', name: 'Party Hat', tier: 2, art: () =>
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
  { id: 'hat-halo', slot: 'hat', name: 'Halo', tier: 15, art: () =>
    '<ellipse cx="100" cy="12" rx="34" ry="8" fill="none" stroke="#ffe066" stroke-width="8" opacity=".45"/>' +
    '<ellipse cx="100" cy="12" rx="34" ry="8" fill="none" stroke="#ffe066" stroke-width="5"/>' +
    '<ellipse cx="100" cy="11" rx="34" ry="8" fill="none" stroke="#fffbe0" stroke-width="1.5"/>' },
  { id: 'hat-crown', slot: 'hat', name: 'Royal Crown', tier: 20, art: () =>
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
  { id: 'eyes-heart', slot: 'eyes', name: 'Heart Glasses', tier: 4, art: () =>
    '<path d="' + heart(71, 94, 13.5) + '" fill="#ff4f9a" opacity=".92" ' + EDGE + '/>' +
    '<path d="' + heart(129, 94, 13.5) + '" fill="#ff4f9a" opacity=".92" ' + EDGE + '/>' +
    '<path d="M88 88 Q100 83 112 88" fill="none" stroke="#c2185b" stroke-width="3.5" stroke-linecap="round"/>' },
  { id: 'eyes-visor', slot: 'eyes', name: 'Cyber Visor', tier: 12, art: () =>
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
  { id: 'shirt-astro', slot: 'shirt', name: 'Space Suit', tier: 8, sleeve: '#f3f5fb', art: () =>
    shirtBase('#f3f5fb') +
    '<path d="M72 146 Q100 156 128 146" fill="none" stroke="#c9cfdc" stroke-width="8"/>' +
    '<rect x="86" y="156" width="28" height="16" rx="4" fill="#5b6bff"/>' +
    dots([[93, 164, 2.3], [100, 164, 2.3], [107, 164, 2.3]], '#fff') +
    '<rect x="50" y="182" width="100" height="7" fill="#9aa3b5"/>' },
  { id: 'shirt-hero', slot: 'shirt', name: 'Superhero Suit', tier: 14, sleeve: '#2f6bff', art: () =>
    shirtBase('#2f6bff') +
    '<path d="' + star(100, 167, 14) + '" fill="#ffd23f" ' + EDGE + '/>' +
    '<rect x="50" y="185" width="100" height="6" fill="#ffd23f"/>',
    back: () => '<path d="M76 146 Q64 186 50 222 Q100 232 150 222 Q136 186 124 146 Z" fill="#ff3b5c" ' + EDGE + '/>' },

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
  { id: 'neck-medal', slot: 'neck', name: 'Champion Medal', tier: 11, art: () =>
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
  { id: 'hand-laser', slot: 'hand', name: 'Laser Sword', tier: 16, art: () =>
    '<g transform="rotate(24 144 187)">' +
    '<rect x="136" y="84" width="16" height="94" rx="8" fill="#34f5ff" opacity=".35"/>' +
    '<rect x="140" y="88" width="8" height="88" rx="4" fill="#bafcff"/>' +
    '<rect x="137" y="174" width="14" height="28" rx="4" fill="#55556a" ' + EDGE + '/></g>' },
  { id: 'hand-trophy', slot: 'hand', name: 'Trophy', tier: 19, art: () =>
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
  { id: 'bg-neon', slot: 'bg', name: 'Neon City', tier: 6, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#1b0b3d', '#4a1170'], 0, 1));
    c.defs.push(grad(c.uid + '-sun', ['#ffd36e', '#ff4fa3'], 0, 1));
    const verticals = [-140, -60, 20, 100, 180, 260, 340].map(x => '<path d="M100 170 L' + x + ' 240" stroke="#37f0ff" stroke-width="1.5" opacity=".6"/>').join('');
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' +
      '<circle cx="100" cy="150" r="54" fill="url(#' + c.uid + '-sun)" opacity=".9"/>' +
      '<rect y="170" width="200" height="70" fill="#12052b"/>' +
      [178, 190, 206, 228].map(y => '<path d="M0 ' + y + ' L200 ' + y + '" stroke="#ff4fd8" stroke-width="1.5" opacity=".75"/>').join('') + verticals;
  } },
  { id: 'bg-gold', slot: 'bg', name: 'Golden Glory', tier: 17, art: c => {
    c.defs.push(grad(c.uid + '-bg', ['#fff3b0', '#ffc93c', '#d98f00'], 0, 0, true));
    let rays = '';
    for (let i = 0; i < 12; i++) rays += '<path d="M100 110 L88 -70 L112 -70 Z" fill="#fff" opacity=".22" transform="rotate(' + i * 30 + ' 100 110)"/>';
    return '<rect width="200" height="240" fill="url(#' + c.uid + '-bg)"/>' + rays;
  } },
];

const ITEM = {};
for (const it of ITEMS) ITEM[it.id] = it;

const PASS = [
  { fish: 25 }, { item: 'hat-party' }, { fish: 40 }, { item: 'eyes-heart' }, { fish: 60 },
  { item: 'bg-neon' }, { fish: 80 }, { item: 'shirt-astro' }, { fish: 100 }, { item: 'skin-gold' },
  { item: 'neck-medal' }, { item: 'eyes-visor' }, { fish: 150 }, { item: 'shirt-hero' }, { item: 'hat-halo' },
  { item: 'hand-laser' }, { item: 'bg-gold' }, { item: 'skin-galaxy' }, { item: 'hand-trophy' }, { item: 'hat-crown' },
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
  const neck = pick('neck');
  const hand = pick('hand');
  const [light, mid, shadow] = fur.c;
  const defs = [
    '<radialGradient id="' + uid + '-fur" cx=".42" cy=".3" r=".85"><stop offset="0" stop-color="' + light + '"/>' +
      '<stop offset=".55" stop-color="' + mid + '"/><stop offset="1" stop-color="' + shadow + '"/></radialGradient>',
    '<clipPath id="' + uid + '-body"><path d="' + BODY + '"/></clipPath>',
    '<clipPath id="' + uid + '-head"><path d="' + HEAD + '"/></clipPath>',
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
  if (o.bg !== false) {
    p.push(bg.art(c));
    p.push('<ellipse cx="100" cy="233" rx="42" ry="5" fill="#000" opacity=".25"/>');
  }
  if (shirt && shirt.back) p.push(shirt.back(c));
  p.push('<g class="cat-tail"><path d="M132 188 C150 190 166 178 162 156" fill="none" stroke="' + shadow + '" stroke-width="12" stroke-linecap="round"/></g>');
  p.push('<rect x="74" y="186" width="16" height="34" rx="8" fill="' + mid + '"/><rect x="110" y="186" width="16" height="34" rx="8" fill="' + mid + '"/>');
  p.push('<ellipse cx="82" cy="225" rx="11" ry="7.5" fill="' + fill + '"/><ellipse cx="118" cy="225" rx="11" ry="7.5" fill="' + fill + '"/>');
  p.push('<path d="' + BODY + '" fill="' + fill + '"/>');
  if (shirt) p.push('<g clip-path="url(#' + uid + '-body)">' + shirt.art(c) + '</g>');
  if (arms) {
    p.push('<path d="' + ARMS + '" fill="none" stroke="' + mid + '" stroke-width="15" stroke-linecap="round"/>');
    if (shirt && shirt.sleeve) p.push('<path d="' + SLEEVES + '" fill="none" stroke="' + shirt.sleeve + '" stroke-width="17" stroke-linecap="round"/>');
    p.push('<circle cx="56" cy="188" r="11" fill="' + fill + '"/><circle cx="144" cy="188" r="11" fill="' + fill + '"/>');
  }

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
  if (fur.sparkle) p.push(dots([[58, 58, 1.8], [146, 62, 2], [118, 40, 1.5], [82, 42, 1.3], [154, 110, 1.5], [46, 112, 1.4]], '#fff', 0.9));
  p.push('<ellipse cx="96" cy="56" rx="44" ry="24" fill="url(#' + uid + '-sheen)"/>');
  const rim = fur.dark ? ' stroke="#fff" stroke-opacity=".5" stroke-width="1.6"' : ''; // so dark cats' eyes still show
  if (o.look) p.push('<g transform="translate(' + o.look + ' 0)">');
  p.push('<g class="cat-eye"><ellipse cx="71" cy="91" rx="7.8" ry="12" fill="' + INK + '"' + rim + '/><circle cx="73.5" cy="85" r="2.8" fill="#fff"/></g>');
  p.push('<g class="cat-eye"><ellipse cx="129" cy="91" rx="7.8" ry="12" fill="' + INK + '"' + rim + '/><circle cx="131.5" cy="85" r="2.8" fill="#fff"/></g>');
  if (o.look) p.push('</g>');
  p.push('<path d="M41 103 Q49 103 56.5 105 M43.5 116 Q50 113 56.5 111 M159 103 Q151 103 143.5 105 M156.5 116 Q150 113 143.5 111" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>');
  if (o.mouth !== 'closed') {
    p.push('<g class="cat-mouth-open"><ellipse cx="100" cy="117" rx="8.5" ry="8" fill="#3d1810"/>' +
      '<ellipse cx="100" cy="122" rx="5.5" ry="3.4" fill="#ff8a9a" clip-path="url(#' + uid + '-mouth)"/></g>');
  }
  if (o.mouth !== 'open') p.push('<path class="cat-mouth-closed" d="M100 108.3 L100 111.5 M86 110.5 Q93 118.5 100 111.5 Q107 118.5 114 110.5" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
  p.push('<path d="M94.5 101.5 Q100 99.3 105.5 101.5 Q103 107 100 108.3 Q97 107 94.5 101.5 Z" fill="#4a2418"/>');
  if (eyes) p.push(eyes.art(c));
  if (hat) p.push(hat.art(c));
  p.push('</g>');
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

const enc = new TextEncoder();
function toB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function fromB64(s) { return Uint8Array.from(atob(s), ch => ch.charCodeAt(0)); }

async function hashPassword(password, saltB64, rounds) {
  if (!window.crypto || !crypto.subtle) throw new Error('This browser can only make accounts on secure pages. Start CamArcade with start.bat.');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: rounds }, key, 256);
  return toB64(bits);
}

function accounts() { const a = readJSON(ACCOUNTS_KEY); return a && typeof a === 'object' ? a : {}; }
function hasAccounts() { return Object.keys(accounts()).length > 0; }
function keyOf(name) { return String(name || '').trim().toLowerCase(); }
function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16); }

function checkUsername(name) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return 'Usernames are 3 to 16 letters, numbers or _ (no spaces).';
  return '';
}

async function signUp(name, password) {
  name = String(name || '').trim();
  const bad = checkUsername(name);
  if (bad) throw new Error(bad);
  if (String(password).length < 4) throw new Error('Pick a password with at least 4 characters.');
  const all = accounts();
  const key = keyOf(name);
  if (all[key]) throw new Error('The username "' + name + '" is already taken on this computer. Log in, or pick another name.');
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await hashPassword(password, salt, PBKDF2_ROUNDS);
  all[key] = { name, salt, hash, rounds: PBKDF2_ROUNDS, created: Date.now() };
  if (!lsSet(ACCOUNTS_KEY, JSON.stringify(all))) throw new Error("Your browser won't let this page save anything. Turn off private browsing and try again.");
  let p = fresh(name);
  const old = readJSON(OLD_PROFILE_KEY);
  if (old && Object.keys(all).length === 1) { // progress from before accounts existed goes to the first account
    p = normalize(Object.assign({}, old, { name, fish: old.coins }), name);
    if (p.equip.skin === 'skin-lime') p.equip.skin = 'skin-orange';
    lsDel(OLD_PROFILE_KEY);
  }
  lsSet(PROFILE_PREFIX + key, JSON.stringify(p));
  startSession(key, false);
}

async function logIn(name, password, remember) {
  const key = keyOf(name);
  const acc = accounts()[key];
  if (!acc) throw new Error('There is no account called "' + String(name).trim() + '" on this computer. Check the spelling, or sign up.');
  const hash = await hashPassword(password, acc.salt, acc.rounds || PBKDF2_ROUNDS);
  if (hash !== acc.hash) throw new Error('That password is not right. Try again.');
  startSession(key, remember);
}

function startSession(key, remember) {
  ssSet(SESSION_KEY, key);
  if (remember) lsSet(REMEMBER_KEY, key); else lsDel(REMEMBER_KEY);
  lsSet(LAST_USER_KEY, accounts()[key].name);
  loadProfile(key);
}

function logOut() {
  ssDel(SESSION_KEY);
  ssDel(MEDIA_KEY);
  ssDel(CAMERA_KEY);
  lsDel(REMEMBER_KEY);
  voice.stop();
  user = null;
  profile = null;
  emitChange();
}

/* ================= YOUR PROFILE ================= */

let user = null;     // account key of whoever is logged in
let profile = null;

function fresh(name) {
  return {
    v: 2, name, fish: 30, xp: 0, streak: 0, best: 0, wins: 0, losses: 0, draws: 0,
    owned: ['skin-orange', 'bg-space'], equip: { skin: 'skin-orange', bg: 'bg-space' }, claimed: [], mathBest: 0,
  };
}

function normalize(p, name) {
  const out = fresh(name);
  if (!p || typeof p !== 'object') return out;
  for (const k of ['fish', 'xp', 'streak', 'best', 'wins', 'losses', 'draws', 'mathBest']) out[k] = Math.max(0, Math.floor(Number(p[k]) || 0));
  if (Array.isArray(p.owned)) for (const id of p.owned) if (ITEM[id] && !out.owned.includes(id)) out.owned.push(id);
  if (p.equip && typeof p.equip === 'object') {
    for (const s of SLOTS) {
      const id = p.equip[s.id];
      if (id && ITEM[id] && ITEM[id].slot === s.id && out.owned.includes(id)) out.equip[s.id] = id;
    }
  }
  if (Array.isArray(p.claimed)) out.claimed = p.claimed.filter(n => Number.isInteger(n) && n >= 1 && n <= PASS.length);
  return out;
}

function loadProfile(key) {
  const acc = accounts()[key];
  if (!acc) { user = null; profile = null; return; }
  user = key;
  profile = normalize(readJSON(PROFILE_PREFIX + key), acc.name);
  save();
}

function save() {
  if (user && profile) lsSet(PROFILE_PREFIX + user, JSON.stringify(profile));
  emitChange();
}

function emitChange() { window.dispatchEvent(new CustomEvent('ca:change')); }

function restoreSession() {
  const key = ssGet(SESSION_KEY) || lsGet(REMEMBER_KEY);
  if (key && accounts()[key]) {
    ssSet(SESSION_KEY, key);
    loadProfile(key);
  }
}

window.addEventListener('storage', e => {
  if (user && e.key === PROFILE_PREFIX + user) {
    profile = normalize(readJSON(e.key), profile ? profile.name : '');
    emitChange();
  }
});

function deviceId() {
  let id = lsGet(DEVICE_KEY);
  if (!id) { id = Math.random().toString(36).slice(2, 12); lsSet(DEVICE_KEY, id); }
  return id;
}

function tierOf(xp) { return Math.min(PASS.length, Math.floor(xp / TIER_XP)); }

// Fish come from winning, and the longer your streak, the more fish each win is worth.
function rewardFor(outcome, streakAfter) {
  const s = Math.min(streakAfter, 10);
  if (outcome === 'win') return { fish: 5 + 5 * s, xp: 100 + 20 * s };
  if (outcome === 'draw') return { fish: 3, xp: 50 };
  return { fish: 0, xp: 25 };
}

function applyResult(outcome) {
  const p = profile;
  const before = { streak: p.streak, best: p.best, xp: p.xp, tier: tierOf(p.xp), fish: p.fish };
  if (outcome === 'win') { p.streak++; p.wins++; p.best = Math.max(p.best, p.streak); }
  else if (outcome === 'lose') { p.streak = 0; p.losses++; }
  else p.draws++;
  const r = rewardFor(outcome, p.streak);
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

function buy(id) {
  const it = ITEM[id];
  if (!it || it.price == null || profile.owned.includes(id) || profile.fish < it.price) return false;
  profile.fish -= it.price;
  profile.owned.push(id);
  save();
  return true;
}

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

  choice() { return ssGet(MEDIA_KEY); },           // 'on' | 'off' | null (not asked yet this visit)
  setChoice(v) { ssSet(MEDIA_KEY, v); },
  micOn() { return !!this.stream && this.stream.getAudioTracks().some(t => t.enabled && t.readyState === 'live'); },
  hasMic() { return !!this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live'); },
  cameraOn() { return !!this.camera && this.camera.getVideoTracks().some(t => t.readyState === 'live'); },

  // Did you allow the camera (and not switch to your cat since)? Then it turns on whenever you're in a game.
  camWanted() { return ssGet(CAMERA_KEY) === 'on'; },
  setCamWanted(on) {
    ssSet(CAMERA_KEY, on ? 'on' : 'off');
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
        ssSet(CAMERA_KEY, 'off');
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
    ssSet(CAMERA_KEY, cam.length ? 'on' : 'off');
    if (cam.length) this.useCamera(new MediaStream(cam));
    emitMedia();
  },

  async startMic() {
    if (this.hasMic()) return true;
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

  // The stream to send to another player: your microphone, plus your camera if it's on.
  outgoing() {
    const tracks = [];
    if (this.stream) tracks.push(...this.stream.getAudioTracks().filter(t => t.readyState === 'live'));
    if (this.camera) tracks.push(...this.camera.getVideoTracks().filter(t => t.readyState === 'live'));
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
  const box = $('caModalBtns');
  box.innerHTML = '';
  for (const b of o.buttons || [{ label: 'OK', primary: true }]) {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => { closeModal(); if (b.fn) b.fn(); });
    box.appendChild(el);
  }
  $('caModal').classList.remove('hidden');
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

function render() {
  let { name, params } = parseHash();
  if (!routes[name]) name = 'menu';
  if (!user && !routes[name].public) {
    pending = location.hash;
    name = 'auth';
  } else if (user && !voice.choice() && !routes[name].public && name !== 'perm') {
    pending = location.hash;
    name = 'perm';
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

restoreSession();

window.CA = {
  get user() { return user; },
  get profile() { return profile; },
  get soundOn() { return soundOn; },
  ITEMS, ITEM, SLOTS, PASS, TIER_XP,
  catSVG, previewSVG, setMouths, tierOf, rewardFor, applyResult, claimTier, buy, equip, unequip, setMathBest,
  hasAccounts, signUp, logIn, logOut, checkUsername, cleanName, lastUser: () => lsGet(LAST_USER_KEY) || '',
  deviceId, voice, sound, setSound, modal, closeModal, modalLocked, confirmBox, toast, esc,
  register, go, render, resume, showScreen, requestLeave,
  get route() { return current ? current.name : null; },
};

})();
