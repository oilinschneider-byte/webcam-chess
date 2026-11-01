/* Classic Games: Parkour Race. Both cats run the same long course of floating platforms, jumping from one to the next:
   gaps, platforms that swing sideways or bob up and down, and spikes. You can jump through a platform from below.
   Fall off, or land on spikes, and you pop back at your last checkpoint 🚩. First cat to touch the golden flag at the end
   wins (after 2½ minutes, whoever got further wins). The cats don't bump into each other. W or Space jumps (hold it for
   a higher jump), Shift (or tapping left or right twice) dashes once in the air. (The course is the same every time; the
   host's app runs the race: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const G = 2100, RUN = 300, ACCEL = 2800, AIR_ACCEL = 1700, JUMP = 800;
const DASH_V = 660, DASH_TIME = 0.17, DASH_WAIT = 0.6;
const LIMIT = 150;
const CAT = 0.72;                                  // how big the cats are drawn
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;

/* ---------- the course (the same every time) ---------- */

// k: 's' still, 'h' swings sideways (rg: how far, sp: how fast), 'v' bobs up and down, 'sp' has spikes in the middle, 'f' the finish.
// Every gap and every step up is made small enough to jump (and the moving ones are allowed for). It is a hard one: small platforms, long gaps, lots of moving platforms and spikes, and few checkpoints.
const PL = [];
let END = 0;
(function build() {
  let seed = 20261101;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const LEN = 7600;
  PL.push({ x: 0, y: 450, w: 470, k: 's', cp: true });
  let x = 470, y = 450, prev = 's', n = 0, sinceCp = 0;
  while (x < LEN) {
    n++;
    const prog = x / LEN, roll = rnd();
    let k = n < 3 ? 's' : roll < 0.25 ? 'h' : roll < 0.38 ? 'v' : roll < 0.58 ? 'sp' : 's';
    if (prev === 'h' && k === 'h') k = 's';
    let gap = 85 + rnd() * (45 + prog * 85);                      // 85 to 215 (the longest ones need a dash, later on)
    if (k === 'h') gap = 90 + rnd() * 10;                         // (it swings 80 either way: 10 to 180)
    if (prev === 'h') gap = 90 + rnd() * 20;
    let ny = clamp(y + (rnd() - 0.5) * 170, 285, 475);
    ny = Math.max(ny, y - 90);                                    // (never a step up of more than 90)
    if (gap > 170) ny = Math.max(ny, y - 15);                     // (and hardly any step up after a very long gap)
    if (prev === 'v') ny = Math.max(ny, y - 30);
    const w = 90 + rnd() * (90 - prog * 30);                      // (small platforms)
    const p = { x: x + gap, y: ny, w, k };
    if (k === 'h') { p.w = 110; p.rg = 80; p.sp = 1.4 + rnd() * 1; p.ph = rnd() * 6.28; }
    if (k === 'v') { p.y = clamp(ny, 340, 440); p.w = 120; p.rg = 60; p.sp = 1.3 + rnd() * 0.9; p.ph = rnd() * 6.28; }
    if (k === 'sp') { p.w = 250 + rnd() * 40; p.sw = 66; p.sx = p.x + p.w / 2 - 33; }
    sinceCp++;
    if (k === 's' && sinceCp >= 9) { p.cp = true; sinceCp = 0; }
    PL.push(p);
    x = p.x + p.w;
    y = p.y;
    prev = k;
  }
  const f = { x: x + 100, y: Math.min(y, 440), w: 460, k: 'f' };
  PL.push(f);
  END = f.x + 230;
  if (window.__testHooks) window.__PL = PL;
})();

const posOf = (p, t) => {
  if (p.k === 'h') return { x: p.x + Math.sin(t * p.sp + p.ph) * p.rg, y: p.y };
  if (p.k === 'v') return { x: p.x, y: p.y + Math.sin(t * p.sp + p.ph) * p.rg };
  return p;
};

CA.games.add('parkour', {
  name: 'Parkour Race', icon: '🏃',
  blurb: 'Race across a long course of floating platforms to the golden flag! Jump the gaps, ride the swinging platforms, avoid the spikes (fall off and you restart at your last 🚩 checkpoint). W or Space jumps (hold for higher), Shift dashes in the air. First to the flag wins!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'parkour', doubleTap: true, keys: { ShiftLeft: 'sh', ShiftRight: 'sh' },
      pad: { stick: true, buttons: [{ k: 'sh', label: '💨 Dash' }, { k: 'a', label: '⤒ Jump', main: true }] },
      help: 'A/D run · W or Space jump (hold: higher) · Shift or tap A/D twice: dash · reach the golden flag first!',
      helpTouch: 'Stick runs · Jump (hold for higher) · Dash · reach the golden flag first!',
      note: 'Race to the golden flag',
      init, step, snap, bot, draw, event,
    });
  },
});

function newCat(x) {
  return { x, y: 450, vx: 0, vy: 0, ground: true, on: -1, face: 1, dash: 0, dw: 0, air: false, coy: 0.1, jb: 0, cp: 0, inv: 0, jmp: false };
}

function init() {
  return { t: 0, cats: [newCat(150), newCat(250)], over: false };
}

function respawn(s, c, i, api, why) {
  const p = PL[c.cp];
  c.x = p.x + p.w / 2 + (i ? 40 : -40);
  c.y = p.y;
  c.vx = c.vy = 0;
  c.ground = true;
  c.on = -1;
  c.dash = 0;
  c.inv = 0.9;
  api.ev('oops', { i, x: c.x, y: c.y, why });
}

function stepCat(s, c, i, n, dt, api) {
  c.inv = Math.max(0, c.inv - dt);
  c.dw = Math.max(0, c.dw - dt);
  c.jb = Math.max(0, c.jb - dt);
  if (c.on >= 0) { // riding a platform that moves
    const p = PL[c.on], a = posOf(p, s.t - dt), b = posOf(p, s.t);
    c.x += b.x - a.x;
    c.y = b.y;
  }
  if (n.mx) c.face = n.mx > 0 ? 1 : -1;
  if ((n.hit.sh || n.hit.dl || n.hit.dr) && c.dw <= 0 && !(c.air && !c.ground)) {
    const d = n.hit.dl ? -1 : n.hit.dr ? 1 : n.mx ? Math.sign(n.mx) : c.face;
    c.face = d;
    c.dash = DASH_TIME;
    c.dw = DASH_WAIT;
    if (!c.ground) c.air = true;
    api.ev('dash', { x: c.x, y: c.y });
  }
  if (c.dash > 0) { c.dash -= dt; c.vx = c.face * DASH_V; if (c.vy > 0) c.vy *= 0.5; }
  else c.vx = approach(c.vx, n.mx * RUN, (c.ground ? ACCEL : AIR_ACCEL) * dt);
  const hold = n.held.u || n.held.a || n.my < -0.4;
  if (n.hit.u || n.hit.a || n.my < -0.7) c.jb = 0.12;
  if (c.jb > 0 && (c.ground || c.coy > 0)) { c.vy = -JUMP; c.ground = false; c.on = -1; c.coy = 0; c.jb = 0; c.jmp = true; api.ev('jump', { x: c.x, y: c.y }); }
  c.vy += G * (c.vy < 0 && !hold ? 2.3 : 1) * dt;
  const py = c.y;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.x = Math.max(c.x, 24);
  const wasGround = c.ground;
  c.ground = false;
  c.on = -1;
  if (c.vy >= 0) {
    for (let j = 0; j < PL.length; j++) {
      const p = PL[j];
      if (p.x > c.x + 140 + (p.rg || 0)) break;
      if (p.x + p.w + (p.rg || 0) < c.x - 20) continue;
      const pb = posOf(p, s.t), pa = posOf(p, s.t - dt);
      if (c.x < pb.x - 10 || c.x > pb.x + p.w + 10) continue;
      if (py <= pa.y + 8 && c.y >= pb.y) {
        c.y = pb.y;
        c.vy = 0;
        c.ground = true;
        c.air = false;
        c.on = p.k === 'h' || p.k === 'v' ? j : -1;
        if (p.cp && j > c.cp) { c.cp = j; api.ev('cp', { x: pb.x + p.w / 2, y: pb.y - 90, i: s.cats.indexOf(c) }); }
        break;
      }
    }
  }
  if (c.ground) c.coy = 0.1; else c.coy = Math.max(0, c.coy - dt);
  if (!wasGround && c.ground) api.ev('land', { x: c.x, y: c.y });
  for (const p of PL) { // spikes
    if (p.k !== 'sp') continue;
    if (c.x > p.sx - 8 && c.x < p.sx + p.sw + 8 && c.y > p.y - 16 && c.y < p.y + 6 && c.inv <= 0) { respawn(s, c, i, api, 'spikes'); return; }
  }
  if (c.y > H + 140) respawn(s, c, i, api, 'fell');
}

function step(s, inp, dt, api) {
  if (s.over) return;
  s.t += dt;
  s.cats.forEach((c, i) => stepCat(s, c, i, inp[i], dt, api));
  const [a, b] = s.cats;
  const fa = a.x >= END - 10, fb = b.x >= END - 10; // (the golden flag stands at END)
  if (fa || fb || s.t >= LIMIT) {
    s.over = true;
    const w = a.x === b.x ? -1 : a.x > b.x ? 0 : 1; // (both on the same step, or out of time: whoever got further)
    api.score(fa ? 1 : 0, fb ? 1 : 0);
    api.ev('finish', { i: w });
    api.end(fa && !fb ? 0 : fb && !fa ? 1 : w, 'FINISH!');
  }
}

function snap(s) {
  return {
    t: r1(s.t),
    c: s.cats.map(c => ({ x: r1(c.x), y: r1(c.y), f: c.face, g: c.ground ? 1 : 0, ds: c.dash > 0 ? 1 : 0, cp: c.cp, iv: c.inv > 0 ? 1 : 0, vy: Math.round(c.vy / 10) * 10 })),
  };
}

/* ---------- the bot ---------- */

// The bot runs right and jumps when it reaches an edge, a step up or spikes; easier bots jump late and sometimes mess up.
function bot(s, i, dt, api) {
  const c = s.cats[i];
  const st = s.bs || (s.bs = { hold: 0, late: 0, cd: 0 });
  st.hold = Math.max(0, st.hold - dt);
  st.cd = Math.max(0, st.cd - dt);
  const out = { mx: 0.78 + 0.22 * api.skill, hit: {}, held: {} };
  if (s.over) return { hit: {}, held: {} };
  if (st.hold > 0) out.held.u = true;
  if (c.ground && st.cd <= 0) {
    let under = null;
    for (const p of PL) { const pb = posOf(p, s.t); if (c.x >= pb.x - 6 && c.x <= pb.x + p.w + 6 && Math.abs(c.y - pb.y) < 12) { under = { p, pb }; break; } }
    let jump = false;
    if (under) {
      const edge = under.pb.x + under.p.w - c.x;
      if (edge < 16 + (1 - api.skill) * 10 - st.late) jump = true;
      if (under.p.k === 'sp' && under.p.sx - c.x < 80 && under.p.sx - c.x > -30) jump = true; // (spikes ahead: jump early, they're 66 wide)
      for (const q of PL) { // a step up close ahead
        const qb = posOf(q, s.t);
        if (qb.x > c.x && qb.x - c.x < 70 && qb.y < c.y - 30 && qb.x > under.pb.x) { jump = true; break; }
      }
    }
    if (jump) { out.hit.u = true; out.held.u = true; st.hold = 0.38; st.cd = 0.3; st.late = Math.random() * (1 - api.skill) * 14; }
  }
  if (!c.ground && c.vy > 100 && !c.air && c.dw <= 0 && Math.random() < 0.03 + 0.04 * api.skill) { // a dash across a wide gap
    let ahead = Infinity;
    for (const q of PL) { const qb = posOf(q, s.t); if (qb.x > c.x) { ahead = Math.min(ahead, qb.x - c.x); break; } }
    if (ahead > 90) out.hit.sh = true;
  }
  return out;
}

/* ---------- drawing ---------- */

function event(v, e) {
  if (e.type === 'jump') v.sound([[520, 0, 0.04]]);
  if (e.type === 'dash') v.sound([[640, 0, 0.04], [460, 0.03, 0.05]]);
  if (e.type === 'oops') { v.burst(e.x, e.y - 30, e.why === 'spikes' ? '#ff5a5a' : '#ffffff', 14, 280); v.sound(e.i === v.me ? 'miss' : 'tick'); }
  if (e.type === 'cp' && e.i === v.me) { v.pop(e.x, e.y, '🚩 Checkpoint!', '#7dff8a'); v.sound('point'); }
  if (e.type === 'finish') { v.sound(e.i === v.me ? 'win' : 'miss'); }
}

let cam = 0;
let bg = null;
function makeBg() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const gr = b.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2a1a6e');
  gr.addColorStop(0.45, '#c2459b');
  gr.addColorStop(0.8, '#ff9a5c');
  gr.addColorStop(1, '#ffd36e');
  b.fillStyle = gr;
  b.fillRect(0, 0, W, H);
  b.fillStyle = 'rgba(255, 255, 255, .8)';
  for (let k = 0; k < 60; k++) b.fillRect((k * 197) % W, (k * 71) % 260, 2, 2);
  b.fillStyle = '#fff3b8';
  b.beginPath(); b.arc(730, 330, 70, 0, Math.PI * 2); b.fill();
  return c;
}

function drawHills(v, par, col, base, amp, f) {
  const g = v.g;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, H);
  const off = cam * par;
  for (let x = 0; x <= W; x += 24) g.lineTo(x, base + Math.sin((x + off) * f) * amp + Math.sin((x + off) * f * 2.3) * amp * 0.4);
  g.lineTo(W, H);
  g.fill();
}

function drawPlat(v, p, j, t) {
  const g = v.g, pb = posOf(p, t), x = pb.x - cam, y = pb.y;
  if (x > W + 60 || x + p.w < -60) return;
  const hue = (j * 47) % 360, moving = p.k === 'h' || p.k === 'v';
  g.fillStyle = moving ? '#3b2d7a' : 'hsl(' + hue + ', 45%, 32%)'; // the dirt hanging underneath
  g.beginPath(); g.moveTo(x + 6, y + 12); g.lineTo(x + p.w - 6, y + 12); g.lineTo(x + p.w * 0.62, y + 52); g.lineTo(x + p.w * 0.38, y + 52); g.closePath(); g.fill();
  g.fillStyle = moving ? '#7a63ff' : 'hsl(' + hue + ', 70%, 58%)';
  v.roundRect(x, y, p.w, 22, 8); g.fill();
  g.fillStyle = 'rgba(255, 255, 255, .35)';
  g.fillRect(x + 8, y + 3, p.w - 16, 4);
  if (moving) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.setLineDash([8, 6]); v.roundRect(x, y, p.w, 22, 8); g.stroke(); g.setLineDash([]); v.label(p.k === 'h' ? '↔' : '↕', x + p.w / 2, y + 11, 14, '#ffd23f'); }
  if (p.k === 'sp') { // spikes
    g.fillStyle = '#d9dde8'; g.strokeStyle = '#6b7080'; g.lineWidth = 1.5;
    for (let k = 0; k < p.sw / 11; k++) { const sx = p.sx - cam + k * 11; g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + 5.5, y - 16); g.lineTo(sx + 11, y); g.closePath(); g.fill(); g.stroke(); }
  }
}

function drawFlag(v, x, y, lit, gold) {
  const g = v.g;
  g.strokeStyle = '#e8e8f2'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - (gold ? 130 : 78)); g.stroke();
  g.fillStyle = gold ? '#ffd23f' : lit ? '#3ddc84' : '#ff5a8a';
  const top = y - (gold ? 130 : 78);
  g.beginPath(); g.moveTo(x, top); g.lineTo(x + (gold ? 66 : 38), top + (gold ? 20 : 13)); g.lineTo(x, top + (gold ? 40 : 26)); g.closePath(); g.fill();
  if (gold) { g.fillStyle = '#7a4a00'; g.font = '900 12px sans-serif'; g.textAlign = 'center'; g.fillText('GOAL', x + 24, top + 24); }
}

function draw(v, s) {
  const g = v.g;
  if (!bg) bg = makeBg();
  const me = s.c[v.me];
  const target = clamp((me ? me.x : 0) - 360, 0, END + 120 - W);
  if (s.t < 0.3 || Math.abs(target - cam) > 600) cam = target; else cam += (target - cam) * Math.min(1, v.dt * 7);
  g.drawImage(bg, 0, 0, W, H);
  drawHills(v, 0.15, '#7a2d8f', 360, 40, 0.006);
  drawHills(v, 0.3, '#53307f', 410, 34, 0.009);
  g.fillStyle = 'rgba(255, 255, 255, .5)'; // clouds
  [[300, 90], [900, 150], [1500, 70], [2100, 130]].forEach(([wx, y]) => { const x = ((wx - cam * 0.5) % 2400 + 2400) % 2400 - 200; [[0, 0, 28], [30, -10, 24], [58, 0, 26]].forEach(([a, b, r]) => v.dot(x + a, y + b, r)); });
  PL.forEach((p, j) => drawPlat(v, p, j, s.t));
  PL.forEach(p => { if (p.cp && p.x !== 0) drawFlag(v, p.x + p.w / 2 - cam, p.y, s.c.some(c => PL[c.cp] === p), false); });
  const last = PL[PL.length - 1];
  drawFlag(v, last.x + last.w / 2 - cam, last.y, true, true);
  g.fillStyle = 'rgba(255, 255, 255, .85)'; // a checkered finish line
  for (let k = 0; k < 8; k++) for (let m = 0; m < 2; m++) { g.fillStyle = (k + m) % 2 ? '#222' : '#fff'; g.fillRect(last.x + last.w / 2 - 80 - cam + k * 20, last.y - 2 - m * 10, 20, 10); }
  [1 - v.me, v.me].forEach(i => { // (you are drawn on top)
    const c = s.c[i];
    const x = c.x - cam;
    if (x < -40 || x > W + 40) {
      const ex = x < 0 ? 24 : W - 24;
      g.fillStyle = v.team[i].main;
      g.beginPath(); g.moveTo(ex, clamp(c.y - 30, 40, H - 40)); g.lineTo(ex + (x < 0 ? 18 : -18), clamp(c.y - 30, 40, H - 40) - 11); g.lineTo(ex + (x < 0 ? 18 : -18), clamp(c.y - 30, 40, H - 40) + 11); g.closePath(); g.fill();
      return;
    }
    if (c.ds) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); for (const [dy, len] of [[-50, 30], [-32, 42], [-14, 26]]) { g.moveTo(x - c.f * 24, c.y + dy); g.lineTo(x - c.f * (24 + len), c.y + dy); } g.stroke(); }
    g.fillStyle = v.team[i].main; g.globalAlpha = 0.3;
    g.beginPath(); g.ellipse(x, c.y + 3, 26, 6, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    v.catSide(i, x, c.y, CAT, { lookRight: c.f > 0, tilt: c.g ? 0 : clamp(c.vy / 6000, -0.1, 0.1) * c.f, alpha: c.iv ? (Math.floor(v.now / 80) % 2 ? 0.4 : 0.8) : 1 });
    v.label(i === v.me ? 'You' : v.names[i], x, c.y - 84, 12, i === v.me ? '#ffd23f' : '#ffffff');
  });
  // the progress bar along the top
  const bx0 = 230, bx1 = 730, by = 24;
  g.fillStyle = 'rgba(20, 10, 50, .65)';
  v.roundRect(bx0 - 14, by - 14, bx1 - bx0 + 28, 28, 14); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(bx0, by); g.lineTo(bx1, by); g.stroke();
  v.label('🏁', bx1 + 2, by, 16, '#fff');
  [1 - v.me, v.me].forEach(i => { g.fillStyle = v.team[i].main; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(bx0 + (bx1 - bx0) * clamp(s.c[i].x / END, 0, 1), by, 7, 0, Math.PI * 2); g.fill(); g.stroke(); });
  v.label('⏱ ' + Math.max(0, Math.ceil(LIMIT - s.t)), W / 2, 56, 13, '#ffffff');
  v.msg('Race to the golden flag! W or Space jump (hold: higher) · Shift dashes');
}

})();
