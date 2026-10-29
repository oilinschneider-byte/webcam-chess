/* Classic Games: Mini Golf Duel. Both cats play the same three holes at the same time (the balls go through each
   other). Aim with the mouse, hold the button to charge, let go to hit. Walls bounce the ball, sand slows it,
   slopes push it, and water costs a stroke. Fewest strokes over the three holes wins; a tie goes to a timed playoff
   hole. (The host's app rolls the balls: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, M = 36;                  // the course, inside a wooden border M wide
const BR = 8, CUP = 12;
const V_MIN = 90, V_MAX = 900, CHARGE = 1.3;
const MAX_STROKES = 8, HOLE_TIME = 60, PLAYOFF_TIME = 40;

const rect = (x, y, w, h) => [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
const HOLES = [
  { name: 'Hole 1 · Warm-up', tee: [150, 270], cup: [815, 270], par: 2,
    walls: rect(440, 150, 80, 240), sand: [[690, 330, 90, 110]], water: [], slope: [], bump: [] },
  { name: 'Hole 2 · The Pond', tee: [130, 450], cup: [850, 225], par: 3,
    walls: [[250, 300, 340, 170]], sand: [[690, 300, 120, 80]], water: [[390, 270, 230, 230]], slope: [[180, 60, 200, 150, 160, 0]], bump: [] },
  { name: 'Hole 3 · Zigzag', tee: [110, 235], cup: [845, 440], par: 3,
    walls: [[330, M, 330, 380], [630, 160, 630, H - M]], sand: [[400, 400, 160, 104]], water: [], slope: [[660, M, 264, 170, 0, 180]], bump: [[480, 250, 30]] },
  { name: 'Playoff · Bumpers', tee: [150, 270], cup: [810, 270], par: 2,
    walls: [], sand: [[560, 380, 120, 124]], water: [[560, M, 120, 110]], slope: [], bump: [[470, 180, 32], [470, 360, 32], [650, 270, 32]] },
];
// (every hole: the border, and the two camera walls in the top corners: see cam-walls.js)
const { CAM_W, CAM_H } = CA.camWalls;
const CAMS = [[CAM_W, M, CAM_W, CAM_H], [M, CAM_H, CAM_W, CAM_H], [W - CAM_W, M, W - CAM_W, CAM_H], [W - CAM_W, CAM_H, W - M, CAM_H]];
HOLES.forEach(h => { h.walls = h.walls.concat(rect(M, M, W - 2 * M, H - 2 * M), CAMS); });
const inRect = (x, y, r) => x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3];

CA.games.add('golf', {
  name: 'Mini Golf Duel', icon: '⛳',
  blurb: 'Same holes, same time! Aim with the mouse, hold the button to charge, let go to hit. Sand slows you down, water costs a stroke. Fewest strokes over 3 holes wins.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'golf', mouse: true, angles: ['a'], jump: 140,
      pad: { buttons: [{ k: 'fire', label: '⛳ Hold to charge', main: true }] },
      help: 'Aim with the mouse · hold the button to charge · let go to putt · fewest strokes wins',
      helpTouch: 'Touch where to aim, hold to charge, let go to putt',
      note: 'Fewest strokes over 3 holes',
      init, step, snap, bot, draw, event,
    });
  },
});

function init(api) {
  const s = { hole: -1, strokes: [[], []], balls: [], t: 0, wait: 0, playoff: false, sunkAt: [0, 0] };
  nextHole(s, api);
  return s;
}

function nextHole(s, api) {
  s.hole++;
  s.t = 0;
  const h = HOLES[s.hole];
  s.balls = [0, 1].map(() => ({ x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, lx: h.tee[0], ly: h.tee[1], n: 0, sunk: false, a: -0.0, p: 0, ch: false }));
  s.sunkAt = [0, 0];
  api.ev('hole', { h: s.hole });
}

// Moves a ball one step (also used by the bot to try shots in its head). Gives 'sunk', 'water' or nothing.
function roll(h, b, dt) {
  const sp0 = Math.hypot(b.vx, b.vy);
  if (sp0 === 0) return null;
  for (const sl of h.slope) if (inRect(b.x, b.y, sl)) { b.vx += sl[4] * dt; b.vy += sl[5] * dt; }
  const sand = h.sand.some(r => inRect(b.x, b.y, r));
  const sp = Math.hypot(b.vx, b.vy);
  const slow = (sand ? 700 : 85) + sp * (sand ? 2.2 : 0.85);
  const ns = Math.max(0, sp - slow * dt);
  b.slow = ns < 15 ? (b.slow || 0) + dt : 0; // (a ball crawling against a wall on a slope counts as stopped)
  if ((ns < 6 && !h.slope.some(sl => inRect(b.x, b.y, sl))) || b.slow > 0.6) { b.vx = 0; b.vy = 0; b.slow = 0; return Math.hypot(b.x - h.cup[0], b.y - h.cup[1]) < CUP ? 'sunk' : null; }
  else if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  for (const [x1, y1, x2, y2] of h.walls) {
    const n = CA.duel.nearest(b.x, b.y, x1, y1, x2, y2);
    if (n.d >= BR + 3) continue;
    let nx = (b.x - n.x) / (n.d || 1), ny = (b.y - n.y) / (n.d || 1);
    if (!n.d) { const l = Math.hypot(x2 - x1, y2 - y1) || 1; nx = -(y2 - y1) / l; ny = (x2 - x1) / l; }
    b.x = n.x + nx * (BR + 3.1);
    b.y = n.y + ny * (BR + 3.1);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.75 * vn * nx; b.vy -= 1.75 * vn * ny; b.hitWall = true; }
  }
  for (const [x, y, r] of h.bump) {
    const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
    if (d >= r + BR || !d) continue;
    const nx = dx / d, ny = dy / d;
    b.x = x + nx * (r + BR + 0.1);
    b.y = y + ny * (r + BR + 0.1);
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 2.15 * vn * nx; b.vy -= 2.15 * vn * ny; b.hitBump = true; }
  }
  if (h.water.some(r => inRect(b.x, b.y, r))) return 'water';
  const dc = Math.hypot(b.x - h.cup[0], b.y - h.cup[1]);
  if (dc < CUP && Math.hypot(b.vx, b.vy) < 420) return 'sunk';
  if (dc < CUP + 4 && Math.hypot(b.vx, b.vy) < 120) { b.vx += (h.cup[0] - b.x) * 6 * dt; b.vy += (h.cup[1] - b.y) * 6 * dt; } // (the cup's lip pulls it in)
  return null;
}

function step(s, inp, dt, api) {
  const h = HOLES[s.hole];
  if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) endHole(s, api); return; }
  s.t += dt;
  s.balls.forEach((b, i) => {
    if (b.sunk) return;
    const n = inp[i];
    const moving = b.vx || b.vy;
    if (!moving && b.n < MAX_STROKES) {
      b.a = Math.atan2(n.ay - b.y, n.ax - b.x);
      if (n.hit.fire) b.ch = true;
      if (b.ch && n.held.fire) b.p = Math.min(1, b.p + dt / CHARGE);
      if (b.ch && !n.held.fire) { // a putt
        const v = V_MIN + (V_MAX - V_MIN) * b.p;
        b.vx = Math.cos(b.a) * v;
        b.vy = Math.sin(b.a) * v;
        b.lx = b.x;
        b.ly = b.y;
        b.n++;
        b.ch = false;
        b.p = 0;
        api.ev('putt', { x: b.x, y: b.y, i });
      }
      return;
    }
    for (let k = 0; k < 3; k++) {
      const r = roll(h, b, dt / 3);
      if (b.hitWall || b.hitBump) { api.ev('bonk', { x: b.x, y: b.y, bump: b.hitBump ? 1 : 0 }); b.hitWall = b.hitBump = false; }
      if (r === 'water') {
        b.n++;
        api.ev('splash', { x: b.x, y: b.y, i });
        Object.assign(b, { x: b.lx, y: b.ly, vx: 0, vy: 0 });
        break;
      }
      if (r === 'sunk') {
        b.sunk = true;
        b.vx = b.vy = 0;
        s.sunkAt[i] = s.t;
        api.ev('sunk', { i, n: b.n, x: h.cup[0], y: h.cup[1] });
        break;
      }
    }
  });
  const limit = s.playoff ? PLAYOFF_TIME : HOLE_TIME;
  const done = s.balls.every(b => b.sunk || (b.n >= MAX_STROKES && !b.vx && !b.vy));
  if (done || s.t >= limit) {
    s.balls.forEach((b, i) => { if (!b.sunk) b.n = Math.min(MAX_STROKES, b.n + (s.t >= limit ? 2 : 1)); }); // (not in: a penalty)
    s.wait = 2.2;
    api.ev('holeDone', { n0: s.balls[0].n, n1: s.balls[1].n });
  }
}

function endHole(s, api) {
  s.balls.forEach((b, i) => s.strokes[i].push(b.n));
  const tot = s.strokes.map(a => a.reduce((x, y) => x + y, 0));
  api.score(tot[0], tot[1]);
  if (s.playoff) {
    const [a, b] = s.balls;
    let w = a.n < b.n ? 0 : b.n < a.n ? 1 : -1;
    if (w < 0 && a.sunk !== b.sunk) w = a.sunk ? 0 : 1;
    if (w < 0 && a.sunk && b.sunk) w = s.sunkAt[0] < s.sunkAt[1] ? 0 : s.sunkAt[1] < s.sunkAt[0] ? 1 : -1;
    api.end(w, 'PLAYOFF!');
    return;
  }
  if (s.hole === 2) {
    if (tot[0] !== tot[1]) { api.end(tot[0] < tot[1] ? 0 : 1, 'FORE!'); return; }
    s.playoff = true;
    api.note('Tied! Playoff hole: ' + PLAYOFF_TIME + ' seconds');
  }
  nextHole(s, api);
}

function snap(s) {
  return {
    h: s.hole, t: Math.round(s.t * 10) / 10, wt: s.wait > 0 ? 1 : 0, po: s.playoff ? 1 : 0, st: s.strokes,
    b: s.balls.map(b => ({ x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, n: b.n, s: b.sunk ? 1 : 0, a: Math.round(b.a * 100) / 100, p: Math.round(b.p * 100) / 100, m: b.vx || b.vy ? 1 : 0, c: b.ch ? 1 : 0 })),
  };
}

// The bot tries angles and powers in its head and picks the putt that ends up nearest the cup (or in it).
function bot(s, i, dt, api) {
  const b = s.balls[i];
  const st = s.bs || (s.bs = {});
  if (b.sunk || b.vx || b.vy || s.wait > 0) { st[i] = null; return {}; }
  const h = HOLES[s.hole];
  if (!st[i]) {
    let best = null, bestD = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 45) {
      for (let p = 0.04; p <= 1.0001; p += 0.08) {
        const t = { x: b.x, y: b.y, vx: Math.cos(a) * (V_MIN + (V_MAX - V_MIN) * p), vy: Math.sin(a) * (V_MIN + (V_MAX - V_MIN) * p) };
        let d = Infinity, r = null;
        for (let k = 0; k < 500 && (t.vx || t.vy); k++) { r = roll(h, t, 1 / 60); if (r) break; }
        if (r === 'sunk') d = -p; // (in! the softest putt that goes in is best)
        else if (r === 'water') d = 1e4;
        else d = Math.hypot(t.x - h.cup[0], t.y - h.cup[1]);
        if (d < bestD) { bestD = d; best = { a, p }; }
      }
    }
    const err = 1 - api.skill;
    st[i] = { a: best.a + CA.games.kit.gauss(0, 0.01 + 0.06 * err), p: Math.max(0.03, Math.min(1, best.p * (1 + CA.games.kit.gauss(0, 0.03 + 0.12 * err)))), wait: 0.8 + Math.random() * 1.2 };
  }
  const plan = st[i];
  const out = { ax: b.x + Math.cos(plan.a) * 100, ay: b.y + Math.sin(plan.a) * 100, held: {}, hit: {} };
  plan.wait -= dt;
  if (plan.wait > 0) return out;
  if (!b.ch) { out.hit.fire = true; out.held.fire = true; return out; }
  if (b.p < plan.p) out.held.fire = true;
  return out;
}

function event(v, e) {
  if (e.type === 'putt') v.sound([[700, 0, 0.03], [500, 0.02, 0.04]]);
  if (e.type === 'bonk') v.sound(e.bump ? [[900, 0, 0.04], [1200, 0.03, 0.05]] : [[260, 0, 0.03]]);
  if (e.type === 'splash') { v.burst(e.x, e.y, '#7fd0ff', 16, 200); v.pop(e.x, e.y - 20, 'SPLASH! +1', '#7fd0ff'); v.sound([[180, 0, 0.12], [120, 0.08, 0.15]]); }
  if (e.type === 'sunk') {
    v.ring(e.x, e.y, v.team[e.i].main, 12);
    v.burst(e.x, e.y, v.team[e.i].light, 14, 180);
    const word = e.n === 1 ? 'HOLE IN ONE!' : e.n + ' strokes';
    v.pop(e.x, e.y - 30, (e.i === v.me ? 'You: ' : v.names[e.i] + ': ') + word, v.team[e.i].light);
    v.sound(e.n === 1 ? 'win' : 'point');
  }
  if (e.type === 'hole') v.sound('notify');
}

const art = {};
function holeArt(k) {
  if (art[k]) return art[k];
  const h = HOLES[k], c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#5b3a1f';
  b.fillRect(0, 0, W, H);
  b.fillStyle = '#3f9e4d';
  b.fillRect(M, M, W - 2 * M, H - 2 * M);
  for (let x = M; x < W - M; x += 40) { b.fillStyle = (x / 40) % 2 ? 'rgba(255, 255, 255, .04)' : 'rgba(0, 0, 0, .03)'; b.fillRect(x, M, 40, H - 2 * M); }
  h.sand.forEach(([x, y, w, hh]) => { b.fillStyle = '#e8d29a'; b.beginPath(); b.ellipse(x + w / 2, y + hh / 2, w / 2 + 6, hh / 2 + 6, 0, 0, Math.PI * 2); b.fill(); });
  h.water.forEach(([x, y, w, hh]) => { b.fillStyle = '#3a8fd6'; b.fillRect(x, y, w, hh); b.fillStyle = 'rgba(255, 255, 255, .25)'; for (let k2 = 0; k2 < 8; k2++) b.fillRect(x + 15 + (k2 * 53) % (w - 30), y + 12 + (k2 * 37) % (hh - 20), 16, 2); });
  h.slope.forEach(([x, y, w, hh, fx, fy]) => {
    b.fillStyle = 'rgba(255, 255, 255, .08)';
    b.fillRect(x, y, w, hh);
    b.strokeStyle = 'rgba(255, 255, 255, .35)';
    b.lineWidth = 2;
    const l = Math.hypot(fx, fy) || 1, ux = fx / l, uy = fy / l;
    for (let ax = x + 30; ax < x + w; ax += 60) for (let ay = y + 30; ay < y + hh; ay += 55) {
      b.beginPath(); b.moveTo(ax - ux * 12, ay - uy * 12); b.lineTo(ax + ux * 12, ay + uy * 12);
      b.lineTo(ax + ux * 4 - uy * 6, ay + uy * 4 + ux * 6); b.moveTo(ax + ux * 12, ay + uy * 12); b.lineTo(ax + ux * 4 + uy * 6, ay + uy * 4 - ux * 6); b.stroke();
    }
  });
  b.lineCap = 'round';
  h.walls.forEach(([x1, y1, x2, y2]) => { b.strokeStyle = '#8a5a2b'; b.lineWidth = 8; b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y2); b.stroke(); b.strokeStyle = '#b07a42'; b.lineWidth = 3; b.stroke(); });
  h.bump.forEach(([x, y, r]) => { b.fillStyle = '#d6336c'; b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill(); b.fillStyle = '#ff8fb3'; b.beginPath(); b.arc(x, y, r * 0.55, 0, Math.PI * 2); b.fill(); });
  b.fillStyle = '#2f7d3a';
  b.beginPath(); b.arc(h.tee[0], h.tee[1], 18, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#163d1b';
  b.beginPath(); b.arc(h.cup[0], h.cup[1], CUP, 0, Math.PI * 2); b.fill();
  b.strokeStyle = '#eee';
  b.lineWidth = 2;
  b.beginPath(); b.moveTo(h.cup[0], h.cup[1]); b.lineTo(h.cup[0], h.cup[1] - 46); b.stroke();
  b.fillStyle = '#ff3b3b';
  b.beginPath(); b.moveTo(h.cup[0], h.cup[1] - 46); b.lineTo(h.cup[0] + 24, h.cup[1] - 39); b.lineTo(h.cup[0], h.cup[1] - 32); b.fill();
  art[k] = c;
  return c;
}

function draw(v, s) {
  const g = v.g;
  g.drawImage(holeArt(s.h), 0, 0, W, H);
  s.b.forEach((b, i) => {
    if (b.s) return;
    if (!b.m && i === v.me) { // your aim, and how hard
      const a = v.host ? b.a : Math.atan2(v.aim.y - b.y, v.aim.x - b.x);
      g.setLineDash([6, 6]);
      g.strokeStyle = 'rgba(255, 255, 255, .8)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + Math.cos(a) * (40 + 140 * b.p), b.y + Math.sin(a) * (40 + 140 * b.p)); g.stroke();
      g.setLineDash([]);
    }
    if (!b.m && b.c) {
      g.fillStyle = 'rgba(0, 0, 0, .55)';
      v.roundRect(b.x - 26, b.y + 16, 52, 8, 4); g.fill();
      g.fillStyle = b.p < 0.5 ? '#7dff8a' : b.p < 0.85 ? '#ffd23f' : '#ff5a5a';
      v.roundRect(b.x - 25, b.y + 17, Math.max(4, 50 * b.p), 6, 3); g.fill();
    }
    g.fillStyle = 'rgba(0, 0, 0, .25)';
    v.dot(b.x + 2, b.y + 3, BR);
    g.fillStyle = '#ffffff';
    v.dot(b.x, b.y, BR);
    g.fillStyle = v.team[i].main;
    v.dot(b.x, b.y, BR - 3);
  });
  // scoreboard
  g.fillStyle = 'rgba(20, 30, 20, .8)';
  v.roundRect(W / 2 - 230, 4, 460, 28, 14); g.fill();
  const tot = s.st.map(a => a.reduce((x, y) => x + y, 0));
  v.label(HOLES[s.h].name + (s.po ? '' : ' · par ' + HOLES[s.h].par) + '  ·  ⏱ ' + Math.max(0, Math.ceil((s.po ? PLAYOFF_TIME : HOLE_TIME) - s.t)), W / 2, 18, 14, '#ffffff');
  [0, 1].forEach(i => {
    const b = s.b[i];
    const n = tot[i] + (b.s ? 0 : b.n);
    v.label((i === v.me ? 'You' : v.names[i]) + ': ' + n + (n === 1 ? ' stroke' : ' strokes') + (b.s ? ' ✓' : ''), i ? W - 235 : 235, 18, 13, v.team[i].light); // (between the camera walls in the top corners)
  });
  const mine = s.b[v.me];
  if (mine && mine.s) v.msg('In the hole! Waiting for ' + v.names[v.them] + '…');
  else if (mine && mine.c) v.msg('Let go to putt!');
}

})();
