/* Classic Games: Mini Golf Duel. Both cats play the same three holes at the same time (the balls go through each
   other). Aim with the mouse, hold the button to charge, let go to hit: your cat swings its putter and the ball leaves
   when they meet. Walls bounce the ball, moving bars block the way, sand slows it, slopes push it, bumpers fling it and
   water costs a stroke. The cup is small: a ball that arrives too fast, or off to one side, rolls over the edge and can
   lip out. Fewest strokes over the three holes wins; a tie goes to a timed playoff hole.
   (The host's app rolls the balls: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, M = 36;                  // the course, inside a wooden border M wide
const BR = 8, CUP = 11;
const V_MIN = 90, V_MAX = 900;
const METER_T = 1.4, SWEET = 0.74, SWEET_HALF = 0.06; // the power bar swings up and down; let go in the gold part for a perfect, straight putt
const MAX_STROKES = 8, HOLE_TIME = 60, PLAYOFF_TIME = 40;
const SWING = 0.16;                              // seconds from letting go to the putter meeting the ball
const CAT_DIST = 58;                             // how far behind the ball the cat stands
const CAP_MAX = 300, CAP_EDGE = 90;              // the fastest a ball can go in: dead centre, and right at the rim

const rect = (x, y, w, h) => [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]];
// walls: [x1, y1, x2, y2] · sand and water: [x, y, w, h] · slope: [x, y, w, h, pushX, pushY] · bump: [x, y, radius]
// mov: bars that slide to and fro: { x, y (where it starts from), w, h, ax, ay (how far it slides), sp (speed), ph (offset) }
const HOLES = [
  { name: 'The Gates', tee: [115, 270], cup: [855, 290], par: 3,
    walls: [[360, M, 360, 215], [360, 325, 360, H - M], [610, M, 610, 195], [610, 315, 610, H - M]],
    sand: [[700, 345, 100, 110]], water: [], slope: [[805, 235, 100, 110, 0, -95]], bump: [[760, 215, 20]],
    mov: [{ x: 372, y: 230, w: 12, h: 80, ax: 0, ay: 82, sp: 1.7, ph: 0 }, { x: 622, y: 215, w: 12, h: 80, ax: 0, ay: 85, sp: 2.1, ph: 1.7 }] },
  { name: 'River Crossing', tee: [110, 285], cup: [860, 440], par: 4,
    walls: [[600, M, 600, 240]],
    sand: [[690, 365, 100, 135]], water: [[380, M, 90, 216], [380, 318, 90, H - M - 318], [600, 450, 120, 54]], slope: [[520, 290, 70, 100, 0, 130]],
    bump: [[530, 262, 20], [760, 250, 24], [655, 410, 20]],
    mov: [{ x: 690, y: 230, w: 12, h: 100, ax: 0, ay: 120, sp: 1.5, ph: 0.6 }] },
  { name: 'Zigzag', tee: [110, 235], cup: [845, 440], par: 4,
    walls: [[330, M, 330, 380], [630, 160, 630, H - M]],
    sand: [[400, 405, 160, 99]], water: [[705, 275, 80, 95]], slope: [[660, M, 264, 170, 0, 180]],
    bump: [[480, 255, 30], [805, 360, 22], [420, 330, 18]],
    mov: [{ x: 380, y: 100, w: 90, h: 14, ax: 85, ay: 0, sp: 1.5, ph: 0 }] },
  { name: 'The Wormhole', tee: [110, 300], cup: [855, 300], par: 3,
    walls: [[480, M, 480, H - M]],
    sand: [[560, 240, 70, 120]], water: [], slope: [], bump: [[700, 300, 24], [790, 185, 18], [790, 415, 18]],
    tele: [[340, 150, 620, 410], [340, 440, 620, 160]],
    mov: [{ x: 755, y: 230, w: 12, h: 140, ax: 0, ay: 100, sp: 1.6, ph: 0.4 }] },
  { name: 'Jump Ramp', tee: [110, 450], cup: [855, 235], par: 4,
    walls: [[300, M, 300, 380]],
    sand: [[610, 340, 110, 164]], water: [[380, M, 200, H - 2 * M]], slope: [], bump: [[760, 160, 20], [700, 285, 22]],
    ramp: [[310, 410, 60, 90]],
    mov: [{ x: 770, y: 300, w: 12, h: 110, ax: 0, ay: 90, sp: 1.9, ph: 1.2 }] },
  { name: 'Bumpers', tee: [150, 270], cup: [810, 270], par: 3,
    walls: [],
    sand: [[560, 385, 120, 119]], water: [[560, M, 120, 110], [715, 430, 130, 74]], slope: [],
    bump: [[470, 180, 32], [470, 360, 32], [650, 270, 32], [745, 205, 22], [745, 335, 22]],
    mov: [{ x: 322, y: 200, w: 12, h: 140, ax: 0, ay: 110, sp: 1.8, ph: 0 }] },
];
// (every hole: the border, and the two camera walls in the top corners: see cam-walls.js)
const { CAM_W, CAM_H } = CA.camWalls;
const CAMS = [[CAM_W, M, CAM_W, CAM_H], [M, CAM_H, CAM_W, CAM_H], [W - CAM_W, M, W - CAM_W, CAM_H], [W - CAM_W, CAM_H, W - M, CAM_H]];
HOLES.forEach(h => { h.walls = h.walls.concat(rect(M, M, W - 2 * M, H - 2 * M), CAMS); h.tele = h.tele || []; h.ramp = h.ramp || []; });
const PLAYOFF = HOLES.length - 1;                // (the last one is the playoff hole; each match plays 3 of the others, picked and ordered at random)
const inRect = (x, y, r) => x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3];
const slide = (m, t) => Math.sin(t * m.sp + m.ph);

CA.games.add('golf', {
  name: 'Mini Golf Duel', icon: '⛳',
  blurb: 'Same holes, same time! Aim with the mouse, hold the button to charge, let go to hit. Dodge the moving bars, stay out of the water and sand, and go slowly near the cup or the ball will lip out. Fewest strokes over 3 holes wins.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'golf', mouse: true, angles: ['a'], jump: 140, lerp,
      pad: { buttons: [{ k: 'fire', label: '⛳ Hold to charge', main: true }] },
      help: 'Aim with the mouse · hold the button to charge · let go to putt · gently near the cup! · fewest strokes wins',
      helpTouch: 'Touch where to aim, hold to charge, let go to putt',
      note: 'Fewest strokes over 3 holes',
      init, step, snap, bot, draw, event,
    });
  },
});

// The guest's smoothing between two snaps. Whole numbers (which hole, strokes, who is in the cup) must stay whole: halfway
// between hole 0 and hole 1 there is no hole, and drawing it used to crash and freeze the game.
function lerp(a, b, f) {
  const o = CA.duel.deepLerp(a, b, f, ['a'], 140);
  o.h = b.h; o.o = b.o; o.po = b.po; o.wt = b.wt; o.st = b.st;
  o.b.forEach((x, i) => { const y = b.b[i]; x.n = y.n; x.s = y.s; x.m = y.m; x.c = y.c; x.ar = y.ar; x.lx = y.lx; x.ly = y.ly; });
  return o;
}

function init(api) {
  const pool = HOLES.slice(0, PLAYOFF).map((x, k) => k);
  for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(api.rng() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
  const s = { hole: -1, order: pool.slice(0, 3).concat(PLAYOFF), strokes: [[], []], balls: [], t: 0, wait: 0, playoff: false, sunkAt: [0, 0] };
  nextHole(s, api);
  return s;
}

function nextHole(s, api) {
  s.hole++;
  s.t = 0;
  const h = HOLES[s.order[s.hole]];
  s.balls = [0, 1].map(() => ({ x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, lx: h.tee[0], ly: h.tee[1], n: 0, sunk: false, a: -0.0, p: 0, ch: false, sw: 0, rp: 0, lv: 0, ct: 0, air: 0, perf: 0 }));
  s.sunkAt = [0, 0];
  api.ev('hole', { h: s.hole });
}

// A ball against one wall.
function bounceSeg(b, x1, y1, x2, y2) {
  const n = CA.duel.nearest(b.x, b.y, x1, y1, x2, y2);
  if (n.d >= BR + 3) return;
  let nx = (b.x - n.x) / (n.d || 1), ny = (b.y - n.y) / (n.d || 1);
  if (!n.d) { const l = Math.hypot(x2 - x1, y2 - y1) || 1; nx = -(y2 - y1) / l; ny = (x2 - x1) / l; }
  b.x = n.x + nx * (BR + 3.1);
  b.y = n.y + ny * (BR + 3.1);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= 1.75 * vn * nx; b.vy -= 1.75 * vn * ny; b.hitWall = true; }
}

// Moves a ball one step, at time t of the hole (also used by the bot to try shots in its head).
// Gives 'sunk', 'water' or nothing.
function roll(h, b, dt, t) {
  const sp0 = Math.hypot(b.vx, b.vy);
  if (sp0 === 0) return null;
  const air = b.air > 0; // (in the air after a ramp: over sand, slopes, walls, bumpers and water)
  if (air) b.air -= dt;
  b.rampT = Math.max(0, (b.rampT || 0) - dt);
  b.tpc = Math.max(0, (b.tpc || 0) - dt);
  if (!air) for (const sl of h.slope) if (inRect(b.x, b.y, sl)) { b.vx += sl[4] * dt; b.vy += sl[5] * dt; }
  const sand = !air && h.sand.some(r => inRect(b.x, b.y, r));
  const sp = Math.hypot(b.vx, b.vy);
  const slow = (sand ? 700 : air ? 30 : 85) + sp * (sand ? 2.2 : air ? 0.2 : 0.85);
  const ns = Math.max(0, sp - slow * dt);
  b.slow = ns < 15 ? (b.slow || 0) + dt : 0; // (a ball crawling against a wall on a slope counts as stopped)
  if ((ns < 6 && !air && !h.slope.some(sl => inRect(b.x, b.y, sl))) || b.slow > 0.6) { b.vx = 0; b.vy = 0; b.slow = 0; return Math.hypot(b.x - h.cup[0], b.y - h.cup[1]) < CUP ? 'sunk' : null; }
  else if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (air) { // (only the edge of the course keeps it in)
    if (b.x < M + BR) { b.x = M + BR; b.vx = Math.abs(b.vx); }
    if (b.x > W - M - BR) { b.x = W - M - BR; b.vx = -Math.abs(b.vx); }
    if (b.y < M + BR) { b.y = M + BR; b.vy = Math.abs(b.vy); }
    if (b.y > H - M - BR) { b.y = H - M - BR; b.vy = -Math.abs(b.vy); }
    return null;
  }
  for (const w of h.walls) bounceSeg(b, w[0], w[1], w[2], w[3]);
  for (const m of h.mov) {
    const s = slide(m, t), x = m.x + m.ax * s, y = m.y + m.ay * s;
    bounceSeg(b, x, y, x + m.w, y);
    bounceSeg(b, x + m.w, y, x + m.w, y + m.h);
    bounceSeg(b, x + m.w, y + m.h, x, y + m.h);
    bounceSeg(b, x, y + m.h, x, y);
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
  // a ramp: roll onto it fast enough and the ball takes off for a moment
  if (b.rampT <= 0 && Math.hypot(b.vx, b.vy) > 130) {
    for (const r of h.ramp) if (inRect(b.x, b.y, r)) { b.air = 0.62; b.rampT = 1.2; b.vx *= 1.18; b.vy *= 1.18; b.jumped = true; return null; }
  }
  // a teleporter: in at one end, out at the other (and it can't go straight back at once)
  if (b.tpc <= 0) {
    for (const tl of h.tele) {
      if (Math.hypot(b.x - tl[0], b.y - tl[1]) < 17) { b.x = tl[2]; b.y = tl[3]; b.tpc = 0.6; b.tped = true; break; }
      if (Math.hypot(b.x - tl[2], b.y - tl[3]) < 17) { b.x = tl[0]; b.y = tl[1]; b.tpc = 0.6; b.tped = true; break; }
    }
  }
  if (h.water.some(r => inRect(b.x, b.y, r))) return 'water';
  // The cup: a ball that's slow enough, or near enough to the middle, drops in. A faster one rolls over the edge,
  // curves round the rim and can lip out.
  const dc = Math.hypot(b.x - h.cup[0], b.y - h.cup[1]), v = Math.hypot(b.vx, b.vy);
  if (dc < CUP) {
    if (v < CAP_MAX - (CAP_MAX - CAP_EDGE) * (dc / CUP)) return 'sunk';
    b.vx += (h.cup[0] - b.x) * 180 * dt;
    b.vy += (h.cup[1] - b.y) * 180 * dt;
    b.vx *= 1 - 0.9 * dt;
    b.vy *= 1 - 0.9 * dt;
    if (!b.lip) { b.lip = true; b.lipped = true; }
  } else if (dc > CUP + 7) b.lip = false;
  if (dc >= CUP && dc < CUP + 4 && v < 120) { b.vx += (h.cup[0] - b.x) * 6 * dt; b.vy += (h.cup[1] - b.y) * 6 * dt; } // (the cup's lip pulls it in)
  return null;
}

function step(s, inp, dt, api) {
  const h = HOLES[s.order[s.hole]];
  if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) endHole(s, api); return; }
  s.t += dt;
  s.balls.forEach((b, i) => {
    if (b.sunk) return;
    const n = inp[i];
    if (b.sw > 0) { // the cat's putter is swinging: the ball goes when it reaches it
      b.sw -= dt;
      if (b.sw <= 0) {
        b.sw = 0;
        b.vx = Math.cos(b.a) * b.lv;
        b.vy = Math.sin(b.a) * b.lv;
        b.lx = b.x;
        b.ly = b.y;
        api.ev('putt', { x: b.x, y: b.y, i, p: b.rp, pf: b.perf });
      }
      return;
    }
    const moving = b.vx || b.vy;
    if (!moving && b.n < MAX_STROKES) {
      b.a = Math.atan2(n.ay - b.y, n.ax - b.x);
      if (n.hit.fire) { if (!b.ch) b.ct = 0; b.ch = true; }
      if (b.ch && n.held.fire) { b.ct += dt; const ph = (b.ct / METER_T) % 2; b.p = ph < 1 ? ph : 2 - ph; }
      if (b.ch && !n.held.fire) { // a putt: the swing starts now
        const off = Math.abs(b.p - SWEET), perfect = off <= SWEET_HALF, miss = Math.max(0, off - SWEET_HALF);
        b.lv = (V_MIN + (V_MAX - V_MIN) * b.p) * (perfect ? 1.06 : 1);
        b.perf = perfect ? 1 : 0;
        if (!perfect) b.a += (Math.random() - 0.5) * 2 * miss * 0.3; // (off the gold part: the putt wanders a little)
        b.rp = b.p;
        b.sw = SWING;
        b.n++;
        b.ch = false;
        b.p = 0;
      }
      return;
    }
    for (let k = 0; k < 3; k++) {
      const r = roll(h, b, dt / 3, s.t + k * dt / 3);
      if (b.hitWall || b.hitBump) { api.ev('bonk', { x: b.x, y: b.y, bump: b.hitBump ? 1 : 0 }); b.hitWall = b.hitBump = false; }
      if (b.lipped) { api.ev('lip', { x: h.cup[0], y: h.cup[1], i }); b.lipped = false; }
      if (b.tped) { api.ev('tele', { x: b.x, y: b.y }); b.tped = false; }
      if (b.jumped) { api.ev('jump', { x: b.x, y: b.y }); b.jumped = false; }
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
  const done = s.balls.every(b => b.sunk || (b.n >= MAX_STROKES && !b.vx && !b.vy && !b.sw));
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
    h: s.hole, o: s.order, t: Math.round(s.t * 100) / 100, wt: s.wait > 0 ? 1 : 0, po: s.playoff ? 1 : 0, st: s.strokes,
    b: s.balls.map(b => ({ x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, n: b.n, s: b.sunk ? 1 : 0, a: Math.round(b.a * 100) / 100, p: Math.round(b.p * 100) / 100, m: b.vx || b.vy || b.sw > 0 ? 1 : 0, c: b.ch ? 1 : 0,
      ar: b.air > 0 ? 1 : 0, sw: Math.round(Math.max(0, b.sw) / SWING * 100) / 100, rp: Math.round(b.rp * 100) / 100, lx: Math.round(b.lx != null ? b.lx : b.x), ly: Math.round(b.ly != null ? b.ly : b.y) })),
  };
}

// The bot tries angles and powers in its head and picks the putt that ends up nearest the cup (or in it). (It can't
// know exactly when the moving bars will be where, so it guesses.)
function bot(s, i, dt, api) {
  const b = s.balls[i];
  const st = s.bs || (s.bs = {});
  if (b.sunk || b.vx || b.vy || b.sw > 0 || s.wait > 0) { st[i] = null; return {}; }
  const h = HOLES[s.order[s.hole]];
  if (!st[i]) {
    let best = null, bestD = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 45) {
      for (let p = 0.04; p <= 1.0001; p += 0.08) {
        const t = { x: b.x, y: b.y, vx: Math.cos(a) * (V_MIN + (V_MAX - V_MIN) * p), vy: Math.sin(a) * (V_MIN + (V_MAX - V_MIN) * p) };
        let d = Infinity, r = null;
        for (let k = 0; k < 500 && (t.vx || t.vy); k++) { r = roll(h, t, 1 / 60, s.t + 1.4 + k / 60); if (r) break; }
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
  if (e.type === 'putt') {
    v.sound([[700, 0, 0.03], [500, 0.02, 0.04]]);
    v.burst(e.x, e.y, '#ffffff', 4 + Math.round(6 * (e.p || 0)), 90 + 140 * (e.p || 0));
    if (e.i === v.me && (e.p || 0) > 0.7) v.shake(2);
    if (e.pf) v.pop(e.x, e.y - 24, 'PERFECT!', '#ffd23f');
  }
  if (e.type === 'bonk') v.sound(e.bump ? [[900, 0, 0.04], [1200, 0.03, 0.05]] : [[260, 0, 0.03]]);
  if (e.type === 'splash') { v.burst(e.x, e.y, '#7fd0ff', 16, 200); v.pop(e.x, e.y - 20, 'SPLASH! +1', '#7fd0ff'); v.sound([[180, 0, 0.12], [120, 0.08, 0.15]]); }
  if (e.type === 'lip') { v.pop(e.x, e.y - 26, 'Lipped out!', '#ffd23f'); v.sound([[420, 0, 0.05], [330, 0.05, 0.06], [440, 0.1, 0.05]]); v.ring(e.x, e.y, '#ffffff', 10); }
  if (e.type === 'sunk') {
    v.ring(e.x, e.y, v.team[e.i].main, 12);
    v.burst(e.x, e.y, v.team[e.i].light, 14, 180);
    const word = e.n === 1 ? 'HOLE IN ONE!' : e.n + ' strokes';
    v.pop(e.x, e.y - 30, (e.i === v.me ? 'You: ' : v.names[e.i] + ': ') + word, v.team[e.i].light);
    v.sound(e.n === 1 ? 'win' : 'point');
  }
  if (e.type === 'tele') { v.ring(e.x, e.y, '#c58bff', 12); v.burst(e.x, e.y, '#c58bff', 10, 160); v.sound([[300, 0, 0.05], [900, 0.05, 0.08]]); }
  if (e.type === 'jump') { v.pop(e.x, e.y - 20, 'WHEE!', '#ffffff'); v.sound([[500, 0, 0.05], [800, 0.05, 0.08]]); }
  if (e.type === 'hole') v.sound('notify');
}

/* ---------- the course's picture (drawn once per hole) ---------- */

const art = {};
function rng(seed) { let x = seed * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

function holeArt(k) {
  if (art[k]) return art[k];
  const h = HOLES[k], c = document.createElement('canvas'), rnd = rng(k + 3);
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  // the wooden border, with its grain and bolts
  const wood = b.createLinearGradient(0, 0, 0, H);
  wood.addColorStop(0, '#6b4424'); wood.addColorStop(0.5, '#5a3819'); wood.addColorStop(1, '#4a2e14');
  b.fillStyle = wood;
  b.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 5) { b.fillStyle = 'rgba(0,0,0,' + (0.03 + rnd() * 0.07) + ')'; b.fillRect(0, y, W, 1 + rnd() * 1.5); }
  // the grass: a deep green with mowing stripes and little speckles
  b.save();
  b.beginPath(); b.rect(M, M, W - 2 * M, H - 2 * M); b.clip();
  const grass = b.createLinearGradient(0, M, 0, H - M);
  grass.addColorStop(0, '#4cb85f'); grass.addColorStop(1, '#3a9a4b');
  b.fillStyle = grass;
  b.fillRect(M, M, W - 2 * M, H - 2 * M);
  for (let x = -H; x < W; x += 48) {
    b.fillStyle = (x / 48) % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,40,0,.06)';
    b.beginPath(); b.moveTo(x, H); b.lineTo(x + 24, H); b.lineTo(x + 24 + H, 0); b.lineTo(x + H, 0); b.fill();
  }
  for (let n = 0; n < 900; n++) { b.fillStyle = rnd() < 0.5 ? 'rgba(255,255,200,.10)' : 'rgba(0,60,0,.12)'; b.fillRect(M + rnd() * (W - 2 * M), M + rnd() * (H - 2 * M), 2, 3); }
  const vg = b.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 620);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,30,0,.35)');
  b.fillStyle = vg;
  b.fillRect(M, M, W - 2 * M, H - 2 * M);
  // sand
  h.sand.forEach(([x, y, w, hh]) => {
    const cx = x + w / 2, cy = y + hh / 2;
    b.fillStyle = 'rgba(0,0,0,.18)';
    b.beginPath(); b.ellipse(cx + 2, cy + 3, w / 2 + 8, hh / 2 + 8, 0, 0, Math.PI * 2); b.fill();
    const sg = b.createRadialGradient(cx, cy, 6, cx, cy, Math.max(w, hh) / 2 + 8);
    sg.addColorStop(0, '#f6e6b4'); sg.addColorStop(0.75, '#e6cf92'); sg.addColorStop(1, '#cfb06c');
    b.fillStyle = sg;
    b.beginPath(); b.ellipse(cx, cy, w / 2 + 6, hh / 2 + 6, 0, 0, Math.PI * 2); b.fill();
    b.save(); b.clip();
    for (let n = 0; n < 90; n++) { b.fillStyle = rnd() < 0.5 ? 'rgba(120,90,30,.25)' : 'rgba(255,255,255,.35)'; b.fillRect(x - 6 + rnd() * (w + 12), y - 6 + rnd() * (hh + 12), 2, 2); }
    b.restore();
  });
  // water: deep blue, light shore, ripples
  h.water.forEach(([x, y, w, hh]) => {
    b.fillStyle = 'rgba(0,0,0,.22)';
    b.beginPath(); b.roundRect(x - 3, y - 3, w + 8, hh + 9, 12); b.fill();
    const wg = b.createLinearGradient(x, y, x + w * 0.4, y + hh);
    wg.addColorStop(0, '#58b6f0'); wg.addColorStop(1, '#2468b8');
    b.fillStyle = wg;
    b.beginPath(); b.roundRect(x, y, w, hh, 8); b.fill();
    b.save(); b.clip();
    b.strokeStyle = 'rgba(255,255,255,.28)';
    b.lineWidth = 2;
    for (let n = 0; n < Math.max(5, w * hh / 2600); n++) {
      const rx = x + 12 + rnd() * (w - 24), ry = y + 10 + rnd() * (hh - 20);
      b.beginPath(); b.moveTo(rx - 12, ry); b.quadraticCurveTo(rx - 6, ry - 4, rx, ry); b.quadraticCurveTo(rx + 6, ry + 4, rx + 12, ry); b.stroke();
    }
    b.restore();
    b.strokeStyle = 'rgba(200,235,255,.9)';
    b.lineWidth = 3;
    b.beginPath(); b.roundRect(x, y, w, hh, 8); b.stroke();
  });
  // slopes: a tint and arrows along the push
  h.slope.forEach(([x, y, w, hh, fx, fy]) => {
    const l = Math.hypot(fx, fy) || 1, ux = fx / l, uy = fy / l;
    const sg = b.createLinearGradient(x + w / 2 - ux * w / 2, y + hh / 2 - uy * hh / 2, x + w / 2 + ux * w / 2, y + hh / 2 + uy * hh / 2);
    sg.addColorStop(0, 'rgba(255,255,255,.02)'); sg.addColorStop(1, 'rgba(255,255,255,.2)');
    b.fillStyle = sg;
    b.fillRect(x, y, w, hh);
    b.strokeStyle = 'rgba(255,255,255,.5)';
    b.lineWidth = 2.5;
    b.lineCap = 'round';
    for (let ax = x + 26; ax < x + w; ax += 52) for (let ay = y + 26; ay < y + hh; ay += 50) {
      b.beginPath(); b.moveTo(ax - ux * 11, ay - uy * 11); b.lineTo(ax + ux * 11, ay + uy * 11);
      b.moveTo(ax + ux * 11 - ux * 7 - uy * 6, ay + uy * 11 - uy * 7 + ux * 6); b.lineTo(ax + ux * 11, ay + uy * 11); b.lineTo(ax + ux * 11 - ux * 7 + uy * 6, ay + uy * 11 - uy * 7 - ux * 6); b.stroke();
    }
  });
  b.restore();
  // the tee
  b.fillStyle = 'rgba(0,0,0,.2)';
  b.beginPath(); b.arc(h.tee[0] + 2, h.tee[1] + 3, 20, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#2c7a3a';
  b.beginPath(); b.arc(h.tee[0], h.tee[1], 19, 0, Math.PI * 2); b.fill();
  b.strokeStyle = 'rgba(255,255,255,.55)';
  b.lineWidth = 2;
  b.beginPath(); b.arc(h.tee[0], h.tee[1], 19, 0, Math.PI * 2); b.stroke();
  // the walls: wooden rails with a shadow and a lit top
  b.lineCap = 'round';
  h.walls.forEach(([x1, y1, x2, y2]) => { b.strokeStyle = 'rgba(0,0,0,.3)'; b.lineWidth = 11; b.beginPath(); b.moveTo(x1 + 3, y1 + 4); b.lineTo(x2 + 3, y2 + 4); b.stroke(); });
  h.walls.forEach(([x1, y1, x2, y2]) => {
    b.strokeStyle = '#6e421c'; b.lineWidth = 10; b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y2); b.stroke();
    b.strokeStyle = '#b8814a'; b.lineWidth = 6; b.stroke();
    b.strokeStyle = '#e2b783'; b.lineWidth = 1.5; b.stroke();
  });
  // bumpers
  h.bump.forEach(([x, y, r]) => {
    b.fillStyle = 'rgba(0,0,0,.3)';
    b.beginPath(); b.arc(x + 3, y + 5, r + 2, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#ffffff';
    b.beginPath(); b.arc(x, y, r + 2, 0, Math.PI * 2); b.fill();
    const bg = b.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    bg.addColorStop(0, '#ff9fc0'); bg.addColorStop(1, '#d6275f');
    b.fillStyle = bg;
    b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill();
    b.strokeStyle = 'rgba(255,255,255,.75)';
    b.lineWidth = 2;
    b.beginPath(); b.arc(x, y, r * 0.55, 0, Math.PI * 2); b.stroke();
  });
  // ramps: a striped wedge pointing along the way
  h.ramp.forEach(([x, y, w, hh]) => {
    b.fillStyle = 'rgba(0, 0, 0, .25)';
    b.fillRect(x + 3, y + 4, w, hh);
    const rg = b.createLinearGradient(x, 0, x + w, 0);
    rg.addColorStop(0, '#8a8f9c'); rg.addColorStop(1, '#e8ecf4');
    b.fillStyle = rg;
    b.fillRect(x, y, w, hh);
    b.fillStyle = 'rgba(255, 210, 63, .9)';
    for (let xx = x + 8; xx < x + w - 6; xx += 14) { b.beginPath(); b.moveTo(xx, y + hh / 2 - 10); b.lineTo(xx + 8, y + hh / 2); b.lineTo(xx, y + hh / 2 + 10); b.fill(); }
    b.strokeStyle = '#5a5f6c'; b.lineWidth = 2; b.strokeRect(x, y, w, hh);
  });
  // the cup and its flag
  const [cx, cy] = h.cup;
  b.fillStyle = 'rgba(0,0,0,.25)';
  b.beginPath(); b.arc(cx + 1, cy + 2, CUP + 4, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#cdd6cf';
  b.beginPath(); b.arc(cx, cy, CUP + 2, 0, Math.PI * 2); b.fill();
  const cg = b.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, CUP);
  cg.addColorStop(0, '#2b3d2e'); cg.addColorStop(1, '#030805');
  b.fillStyle = cg;
  b.beginPath(); b.arc(cx, cy, CUP, 0, Math.PI * 2); b.fill();
  art[k] = c;
  return c;
}

// The flag stands in front of the cup, drawn every frame so it waves.
function drawFlag(v, h) {
  const g = v.g, [cx, cy] = h.cup, w = Math.sin(v.now / 260) * 3;
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx + 3, cy + 2); g.lineTo(cx + 3, cy - 44); g.stroke();
  g.strokeStyle = '#f2f2f2';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 48); g.stroke();
  g.fillStyle = '#ff3b3b';
  g.beginPath(); g.moveTo(cx, cy - 48); g.quadraticCurveTo(cx + 12, cy - 47 + w, cx + 26 + w, cy - 41); g.quadraticCurveTo(cx + 12, cy - 36 - w, cx, cy - 33); g.fill();
}

// A bar that slides to and fro: yellow and black stripes.
function drawMover(g, m, t) {
  const s = slide(m, t), x = m.x + m.ax * s, y = m.y + m.ay * s;
  g.fillStyle = 'rgba(0,0,0,.3)';
  g.fillRect(x + 3, y + 4, m.w, m.h);
  g.save();
  g.beginPath(); g.rect(x, y, m.w, m.h); g.clip();
  g.fillStyle = '#ffd23f';
  g.fillRect(x, y, m.w, m.h);
  g.fillStyle = '#2a2420';
  const span = Math.max(m.w, m.h);
  for (let k = -span; k < m.w + m.h + span; k += 18) {
    g.beginPath(); g.moveTo(x + k, y + m.h); g.lineTo(x + k + 9, y + m.h); g.lineTo(x + k + 9 + m.h, y); g.lineTo(x + k + m.h, y); g.fill();
  }
  g.restore();
  g.strokeStyle = '#7a5a00';
  g.lineWidth = 2;
  g.strokeRect(x, y, m.w, m.h);
}

/* ---------- the cats and their putters (only drawn: the game itself doesn't need them) ---------- */
// Each cat stands behind its ball, on the far side from where it's aiming, and walks round it when you aim somewhere
// else. It holds the putter back while you charge, swings it through when you let go (the ball leaves at the moment
// they meet: see SWING), and follows through. When its ball goes in, the cat hops.
const cats = [null, null];
const trails = [[], []];
const sinks = [null, null];
let seenHole = -1;
const BACK = 1.15, FOLLOW = 0.85, FOLLOW_MS = 420;
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));

function walk(v, b, i, aim) {
  const ax = b.m ? b.lx : b.x, ay = b.m ? b.ly : b.y;
  const tx = clampN(ax - Math.cos(aim) * CAT_DIST, M + 22, W - M - 22), ty = clampN(ay - Math.sin(aim) * CAT_DIST, M + 22, H - M - 22);
  let c = cats[i];
  if (!c) c = cats[i] = { x: tx, y: ty, hit: -1e9, fl: false, face: 1 };
  if (!b.m && !b.s) { // (while the ball is on its way, the cat stays where it hit it)
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), st = Math.min(d, 380 * Math.min(0.1, v.dt || 0.016));
    if (d > 0.01) { c.x += dx / d * st; c.y += dy / d * st; }
  }
  if (b.m && b.sw < 0.02 && !c.fl) { c.fl = true; c.hit = v.now; }
  if (!b.m) c.fl = false;
  c.face = Math.cos(Math.atan2(ay - c.y, ax - c.x)) >= 0 ? 1 : -1;
}

function drawCat(v, b, i) {
  const c = cats[i];
  if (!c) return;
  const hop = b.s ? Math.abs(Math.sin(v.now / 140)) * 10 : 0;
  v.catTop(i, c.x, c.y - hop, 0.62, { ring: false, label: false, lookRight: c.face > 0, alpha: i === v.me ? 1 : 0.6 });
}

function drawPutter(v, b, i) {
  const c = cats[i];
  if (!c || b.s) return;
  const g = v.g;
  const ax = b.m ? b.lx : b.x, ay = b.m ? b.ly : b.y;
  const phi = Math.atan2(ay - c.y, ax - c.x);
  let th;
  if (b.sw >= 0.02) th = -BACK * b.rp * b.sw;                          // swinging through
  else if (b.c) th = -BACK * b.p;                                      // held back while charging
  else if (b.m) th = FOLLOW * (0.4 + 0.6 * b.rp) * Math.sin(Math.min(1, (v.now - c.hit) / FOLLOW_MS) * Math.PI); // following through
  else th = 0.05 * Math.sin(v.now / 380 + i);
  const px = c.x + Math.cos(phi) * 15, py = c.y + 4 + Math.sin(phi) * 15;
  const len = Math.max(20, Math.hypot(ax - px, ay - py) - 11);
  const hx = px + Math.cos(phi + th) * len, hy = py + Math.sin(phi + th) * len;
  g.save();
  g.globalAlpha = i === v.me ? 1 : 0.6;
  g.lineCap = 'round';
  g.strokeStyle = '#d8dde6';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(px, py); g.lineTo(hx, hy); g.stroke();
  const nx = -Math.sin(phi + th), ny = Math.cos(phi + th); // the head: a short block across the end
  g.strokeStyle = v.team[i].main;
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(hx - nx * 8, hy - ny * 8); g.lineTo(hx + nx * 8, hy + ny * 8); g.stroke();
  g.fillStyle = v.team[i].light; // the paws
  v.dot(px, py, 4);
  v.dot(px + (hx - px) * 0.3, py + (hy - py) * 0.3, 3.5);
  g.restore();
}

/* ---------- the balls ---------- */

// A golf ball: shadow, a shaded white sphere, and a stripe in its player's color that turns as it rolls.
function drawBall(v, x, y, i, scale, alpha) {
  const g = v.g, r = 9.5 * scale;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(0, 0, 0, .3)';
  g.beginPath(); g.ellipse(x + 2.5, y + r * 0.55 + 2, r * 0.95, r * 0.55, 0, 0, Math.PI * 2); g.fill();
  const sg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.65, '#e6ebf2'); sg.addColorStop(1, '#a9b3c4');
  g.fillStyle = sg;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
  g.translate(x, y);
  g.rotate((x + y) / 9);
  g.fillStyle = v.team[i].main;
  g.fillRect(-r, -r * 0.2, r * 2, r * 0.4);
  g.restore();
  g.fillStyle = 'rgba(255, 255, 255, .85)';
  g.beginPath(); g.arc(x - r * 0.35, y - r * 0.4, r * 0.22, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, .35)';
  g.lineWidth = 1;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.restore();
}

function draw(v, s) {
  const g = v.g, hole = HOLES[s.o[s.h]];
  g.drawImage(holeArt(s.o[s.h]), 0, 0, W, H);
  if (seenHole !== s.h) { seenHole = s.h; cats[0] = cats[1] = null; trails[0].length = trails[1].length = 0; sinks[0] = sinks[1] = null; }
  hole.mov.forEach(m => drawMover(g, m, s.t));
  hole.tele.forEach(([x1, y1, x2, y2], k) => [[x1, y1], [x2, y2]].forEach(([x, y], e) => { // teleporters: swirling pairs
    const hue = k ? '#5ad1ff' : '#c58bff';
    g.fillStyle = 'rgba(0, 0, 0, .35)';
    v.dot(x, y, 19);
    g.strokeStyle = hue;
    g.lineWidth = 3;
    for (let r = 0; r < 3; r++) { g.globalAlpha = 0.9 - r * 0.25; g.beginPath(); g.arc(x, y, 6 + r * 5 + Math.sin(v.now / 160 + r + e) * 1.5, v.now / 300 + r, v.now / 300 + r + 4.4); g.stroke(); }
    g.globalAlpha = 1;
  }));
  drawFlag(v, hole);
  const aimOf = (b, i) => (i === v.me && !v.host && !b.m ? Math.atan2(v.aim.y - b.y, v.aim.x - b.x) : b.a);
  const order = [v.them, v.me]; // (you on top)
  order.forEach(i => walk(v, s.b[i], i, aimOf(s.b[i], i)));
  order.forEach(i => drawCat(v, s.b[i], i));
  s.b.forEach((b, i) => {
    // a trail behind a rolling ball
    const tr = trails[i];
    if (b.m && b.sw < 0.02 && !b.s) { tr.push({ x: b.x, y: b.y, at: v.now }); if (tr.length > 18) tr.shift(); }
    while (tr.length && v.now - tr[0].at > 380) tr.shift();
    tr.forEach(p => {
      const a = 1 - (v.now - p.at) / 380;
      g.globalAlpha = a * 0.4;
      g.fillStyle = v.team[i].light;
      v.dot(p.x, p.y, 2 + 5 * a);
    });
    g.globalAlpha = 1;
    if (b.s) { // it rolls into the cup and shrinks away
      const sk = sinks[i] || (sinks[i] = { at: v.now, x: b.x, y: b.y });
      const e = Math.min(1, (v.now - sk.at) / 420);
      if (e < 1) drawBall(v, sk.x + (hole.cup[0] - sk.x) * e, sk.y + (hole.cup[1] - sk.y) * e, i, 1 - 0.65 * e, 1 - 0.7 * e);
      return;
    }
    sinks[i] = null;
    if (!b.m && i === v.me) { // your aim, and how hard
      const a = aimOf(b, i), len = 44 + 150 * b.p;
      g.setLineDash([7, 7]);
      g.lineDashOffset = -v.now / 60;
      g.strokeStyle = 'rgba(255, 255, 255, .85)';
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(b.x + Math.cos(a) * 14, b.y + Math.sin(a) * 14); g.lineTo(b.x + Math.cos(a) * len, b.y + Math.sin(a) * len); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255, 255, 255, .9)'; // an arrowhead
      g.beginPath();
      g.moveTo(b.x + Math.cos(a) * (len + 10), b.y + Math.sin(a) * (len + 10));
      g.lineTo(b.x + Math.cos(a) * len + Math.cos(a + 2.5) * 8, b.y + Math.sin(a) * len + Math.sin(a + 2.5) * 8);
      g.lineTo(b.x + Math.cos(a) * len + Math.cos(a - 2.5) * 8, b.y + Math.sin(a) * len + Math.sin(a - 2.5) * 8);
      g.fill();
      g.strokeStyle = v.team[i].main; // a pulsing ring so your ball is easy to find
      g.globalAlpha = 0.55 + 0.35 * Math.sin(v.now / 180);
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(b.x, b.y, 15 + Math.sin(v.now / 180) * 1.5, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    if (!b.m && b.c) {
      g.fillStyle = 'rgba(0, 0, 0, .6)';
      v.roundRect(b.x - 27, b.y + 18, 54, 9, 4.5); g.fill();
      g.fillStyle = b.p < 0.5 ? '#7dff8a' : b.p < 0.85 ? '#ffd23f' : '#ff5a5a';
      v.roundRect(b.x - 25, b.y + 20, Math.max(4, 50 * b.p), 5, 2.5); g.fill();
      g.fillStyle = 'rgba(255, 210, 63, .55)'; // the gold part: let go here for a perfect putt
      g.fillRect(b.x - 25 + 50 * (SWEET - SWEET_HALF), b.y + 19, 50 * 2 * SWEET_HALF, 7);
      g.fillStyle = '#ffd23f';
      g.fillRect(b.x - 25 + 50 * (SWEET - SWEET_HALF) - 1, b.y + 18, 2, 9);
      g.fillRect(b.x - 25 + 50 * (SWEET + SWEET_HALF) - 1, b.y + 18, 2, 9);
    }
    if (b.ar) { g.fillStyle = 'rgba(0, 0, 0, .3)'; g.beginPath(); g.ellipse(b.x + 3, b.y + 6, 9, 4, 0, 0, Math.PI * 2); g.fill(); }
    drawBall(v, b.x, b.y - (b.ar ? 14 : 0), i, b.ar ? 1.25 : 1, 1);
  });
  order.forEach(i => drawPutter(v, s.b[i], i));
  // scoreboard
  g.fillStyle = 'rgba(20, 30, 20, .8)';
  v.roundRect(W / 2 - 230, 4, 460, 28, 14); g.fill();
  const tot = s.st.map(a => a.reduce((x, y) => x + y, 0));
  v.label((s.po ? 'Playoff · ' : 'Hole ' + (s.h + 1) + ' · ') + hole.name + (s.po ? '' : ' · par ' + hole.par) + '  ·  ⏱ ' + Math.max(0, Math.ceil((s.po ? PLAYOFF_TIME : HOLE_TIME) - s.t)), W / 2, 18, 14, '#ffffff');
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
