/* Classic Games: Cheese Grab. A side-on kitchen with the floppy-armed cats from Floppy Sword Cats (see games-swords.js
   and games-floppy.js). Now and then a piece of cheese drops from a hole in the ceiling into the middle (only a couple
   at a time). A and D walk (not fast), W or Space jumps. Hold the mouse button and your front paw reaches for the mouse
   pointer: it grabs any cheese it touches and holds it while you keep holding. Let go and the paw opens: the cheese
   drops, or flies off if you were swinging, so you can toss it. Get it into your pot (on your side) to score: 1 point,
   golden cheese 3. E shoots your arm out a long way (then 5 seconds to cool down): catch the other cat and they drop
   their cheese, and you can swing them about and throw them (let go of E). Most points after 60 seconds wins.
   The host's app runs it all (see games-duel.js). */
(() => {
'use strict';

const F = CA.floppy;
const W = 960, H = 540, GROUND = 468;
const G = 2100, AG = 1600;
const SUB = 2;
const WALK = 175, ACCEL = 1700, AIR_ACCEL = 1000, JUMP = 850;
const EDGE = 130, TOP = 95;                        // cats stay out of the corners where the pots are
const SH_X = 12.4, SH_Y = 33;
const ARM_N = 7, ARM_SEG = 11;
const REACH = 78, HAND_MAX = 12;
const HEAD_Y = -56;
const GRAB_RANGE = 430, GRAB_SPEED = 1900, GRAB_WAIT = 5;
const GRIP_MAX = 2, CARRY = 900, THROW_MAX = 1300, SPLAT = 700;
const CR = 13, TOSS_MAX = 950, GOLD_P = 0.15;
const SPAWN_EVERY = 5, MAX_CHEESE = 2;             // very little cheese: one every 5 seconds, never more than 2 about
const POTS = [{ x: 62, rim: 392 }, { x: W - 62, rim: 392 }], POT_W = 46; // (half the pot's width at the rim)
const LEN = 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
let looks = null;

CA.games.add('cheese', {
  name: 'Cheese Grab', icon: '🧀',
  blurb: 'Cheese drops from the ceiling now and then. Walk with A/D (W jumps), hold the mouse button to grab a piece with your floppy arm, and carry or toss it into your pot. E shoots your arm out to grab the other cat: they drop their cheese and you can throw them! Most cheese in 60 seconds wins.',
  start(ctx) {
    looks = [];
    looks[ctx.isHost ? 0 : 1] = { pics: F.pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
    looks[ctx.isHost ? 1 : 0] = { pics: F.pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };
    CA.duel.run(ctx, {
      id: 'cheese', mouse: true, keys: { KeyE: 'e' }, letters: { e: 'e' },
      jump: 120, angles: ['tilt'],
      pad: { stick: true, buttons: [{ k: 'e', label: '✋ Grab cat' }, { k: 'a', label: '⤒ Jump', main: true }] },
      help: 'A/D walk · W or Space jump · hold the mouse to grab cheese, let go to drop or toss it into your pot · E grabs the other cat',
      helpTouch: 'Stick walks · drag on the arena to reach and grab cheese, lift to let go · Grab cat · Jump',
      note: LEN + ' seconds · most cheese in your pot wins',
      init, step, snap, bot, draw, event,
    });
  },
});

function at(c, dx, dy) {
  const cs = Math.cos(c.tilt), sn = Math.sin(c.tilt);
  dx *= c.face;
  return [c.x + dx * cs - dy * sn, c.y + dx * sn + dy * cs];
}
const shoulder = (c, k) => at(c, k ? SH_X : -SH_X, -SH_Y);
const headAt = c => at(c, 2, HEAD_Y);

function newCat(x, face) {
  const c = {
    x, y: GROUND, vx: 0, vy: 0, face, tilt: 0, spin: 0, ground: true, phase: 0,
    up: false, hold: -1, hx: 0, hy: 0, hvx: 0, hvy: 0, jumpBuf: 0, grabWait: 0, dizzy: 0, pickWait: 0,
    reach: null, caught: -1, fly: false, flyT: 0,
  };
  c.arms = [0, 1].map(k => {
    const [sx, sy] = shoulder(c, k);
    return Array.from({ length: ARM_N + 1 }, (_, n) => {
      const px = sx + (k ? 1 : -1) * face * n * 2, py = Math.min(GROUND - 5, sy + n * ARM_SEG);
      return { x: px, y: py, px, py };
    });
  });
  return c;
}

function init() {
  return { t: 0, sc: [0, 0], spawn: 1.5, id: 0, cheese: [], cats: [newCat(260, 1), newCat(W - 260, -1)] };
}

const busy = c => !!c.reach || c.caught >= 0 || c.fly || c.dizzy > 0;

function verlet(p, h) {
  const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;
  p.px = p.x; p.py = p.y;
  p.x += vx; p.y += vy + AG * h * h;
}
function bound(p, r) {
  if (p.x < 6 + r) p.x = 6 + r;
  if (p.x > W - 6 - r) p.x = W - 6 - r;
  if (p.y < r) p.y = r;
  const q = CA.camWalls.push(p.x, p.y, r);
  if (q) { p.x = q.x; p.y = q.y; }
  if (p.y >= GROUND - r) { p.y = GROUND - r; return true; }
  return false;
}

/* ---------- moving ---------- */

function stepBody(s, c, i, n, h, api) {
  if (c.caught >= 0) return;
  if (!c.fly) {
    const want = !busy(c) ? n.mx * WALK * (c.hold >= 0 ? 0.85 : 1) : 0;
    c.vx = approach(c.vx, want, (c.ground ? ACCEL : AIR_ACCEL) * h);
  }
  c.vy += G * h;
  const speed = Math.hypot(c.vx, c.vy);
  c.x += c.vx * h;
  c.y += c.vy * h;
  let bump = false;
  if (c.y >= GROUND) { c.y = GROUND; if (c.vy > 0) c.vy = 0; c.ground = true; } else c.ground = false;
  if (c.x < EDGE || c.x > W - EDGE) { c.x = clamp(c.x, EDGE, W - EDGE); c.vx = 0; bump = true; }
  if (c.y < TOP) { c.y = TOP; if (c.vy < 0) c.vy = 0; }
  for (const [dy, r] of [[HEAD_Y, 28], [-14, 16]]) {
    const p = CA.camWalls.push(c.x, c.y + dy, r);
    if (!p) continue;
    c.x = p.x;
    c.y = p.y - dy;
    const vn = c.vx * p.nx + c.vy * p.ny;
    if (vn < 0) { c.vx -= vn * p.nx; c.vy -= vn * p.ny; }
    bump = true;
  }
  c.phase += Math.abs(c.vx) * h * 0.07;
  if (c.fly) {
    c.flyT += h;
    c.tilt += c.spin * h;
    if ((c.ground || bump) && c.flyT > 0.05) {
      c.fly = false;
      c.tilt = Math.atan2(Math.sin(c.tilt), Math.cos(c.tilt));
      if (speed >= SPLAT) { c.dizzy = 0.9; api.ev('splat', { x: c.x, y: c.y - 30 }); } else api.ev('land', {});
    }
  } else c.tilt = approach(c.tilt, c.dizzy > 0 ? Math.sin(s.t * 9) * 0.15 : 0, 7 * h);
}

function moveArm(pts, sh, target, h, max) {
  for (let i = 1; i <= ARM_N; i++) verlet(pts[i], h);
  pts[0].x = pts[0].px = sh[0];
  pts[0].y = pts[0].py = sh[1];
  if (target) {
    const e = pts[ARM_N], dx = target[0] - e.x, dy = target[1] - e.y, d = Math.hypot(dx, dy), mv = Math.min(d * 0.5, max);
    if (d > 0.01) { e.x += dx / d * mv; e.y += dy / d * mv; }
    for (let i = 1; i < ARM_N; i++) {
      const f = i / ARM_N;
      pts[i].x += (sh[0] + (e.x - sh[0]) * f - pts[i].x) * 0.3;
      pts[i].y += (sh[1] + (e.y - sh[1]) * f - pts[i].y) * 0.3;
    }
  }
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < ARM_N; i++) {
      const a = pts[i], q = pts[i + 1], dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - ARM_SEG) / d;
      if (i === 0) { q.x -= dx * f; q.y -= dy * f; } else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; q.x -= dx * f * 0.5; q.y -= dy * f * 0.5; }
    }
    for (let i = 1; i <= ARM_N; i++) bound(pts[i], 5);
  }
  for (let i = 1; i <= ARM_N; i++) if (pts[i].y >= GROUND - 5.5) pts[i].px += (pts[i].x - pts[i].px) * 0.2;
}

// Holding the mouse button lifts the arms and the front paw reaches for the mouse pointer; otherwise they flop about.
function stepArms(s, c, n, h) {
  c.up = false;
  const sh0 = shoulder(c, 0), sh1 = shoulder(c, 1);
  let t0 = null, t1 = null;
  if (!busy(c) && n.held.fire) {
    c.up = true;
    let tx = n.ax - sh1[0], ty = n.ay - sh1[1];
    const tl = Math.hypot(tx, ty) || 1;
    if (tl > REACH) { tx *= REACH / tl; ty *= REACH / tl; }
    t1 = [sh1[0] + tx, sh1[1] + ty];
    t0 = [sh0[0] + tx * 0.7, sh0[1] + ty * 0.7 + 8];
  }
  moveArm(c.arms[0], sh0, t0, h, HAND_MAX * 0.6);
  if (c.reach) {
    c.arms[1].forEach((p, k) => {
      const f = k / ARM_N;
      p.x = p.px = sh1[0] + (c.reach.x - sh1[0]) * f;
      p.y = p.py = sh1[1] + (c.reach.y - sh1[1]) * f;
    });
  } else moveArm(c.arms[1], sh1, t1, h, HAND_MAX);
}

/* ---------- the cheese ---------- */

function stepCheese(s, dt, api) {
  for (let k = s.cheese.length - 1; k >= 0; k--) {
    const q = s.cheese[k];
    if (q.holder >= 0) {
      const c = s.cats[q.holder], hand = c.arms[1][ARM_N];
      q.vx = (hand.x - q.x) / dt;
      q.vy = (hand.y + 4 - q.y) / dt;
      q.x = hand.x;
      q.y = hand.y + 4;
      continue;
    }
    const py = q.y;
    q.vy += G * 0.8 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.a += q.vx * dt * 0.02;
    // into a pot (from above): a point for that pot's cat
    const pot = POTS.findIndex(p => Math.abs(q.x - p.x) < POT_W - 6);
    if (pot >= 0 && py < POTS[pot].rim && q.y >= POTS[pot].rim) {
      s.sc[pot] += q.g ? 3 : 1;
      api.score(s.sc[0], s.sc[1]);
      api.ev('score', { i: pot, g: q.g, by: q.last });
      s.cheese.splice(k, 1);
      continue;
    }
    // the pots' sides are solid
    POTS.forEach(p => {
      if (Math.abs(q.x - p.x) < POT_W - 6) return; // (over the opening: it falls in)
      if (q.y > p.rim - CR && Math.abs(q.x - p.x) < POT_W + CR) {
        if (py <= p.rim - CR) { q.y = p.rim - CR; q.vy = -Math.abs(q.vy) * 0.4; q.vx *= 0.8; }
        else { q.x = p.x + Math.sign(q.x - p.x || 1) * (POT_W + CR); q.vx = -q.vx * 0.5; }
      }
    });
    if (q.x < CR + 6) { q.x = CR + 6; q.vx = Math.abs(q.vx) * 0.5; }
    if (q.x > W - CR - 6) { q.x = W - CR - 6; q.vx = -Math.abs(q.vx) * 0.5; }
    if (CA.camWalls.bounce(q, CR, 0.5)) q.vx *= 0.9;
    if (q.y >= GROUND - CR) {
      q.y = GROUND - CR;
      if (q.vy > 200) api.ev('bump', { x: q.x, y: q.y });
      q.vy = q.vy > 120 ? -q.vy * 0.35 : 0;
      q.vx *= 0.9;
    }
  }
}

function dropCheese(s, c, toss) {
  if (c.hold < 0) return;
  const q = s.cheese.find(z => z.id === c.hold);
  c.hold = -1;
  c.pickWait = 0.25;
  if (!q) return;
  q.holder = -1;
  if (toss) {
    const sp = Math.hypot(q.vx, q.vy);
    if (sp > TOSS_MAX) { q.vx *= TOSS_MAX / sp; q.vy *= TOSS_MAX / sp; }
  } else { q.vx = (Math.random() - 0.5) * 120; q.vy = -120; }
}

/* ---------- each step ---------- */

function step(s, inp, dt, api) {
  s.t += dt;
  // now and then a piece of cheese drops from the hole in the ceiling
  s.spawn -= dt;
  if (s.spawn <= 0 && s.t < LEN - 3) {
    s.spawn = SPAWN_EVERY;
    if (s.cheese.length < MAX_CHEESE) {
      s.cheese.push({ id: s.id++, x: W / 2 + (api.rng() - 0.5) * 40, y: 60, vx: (api.rng() - 0.5) * 160, vy: 0, a: 0, g: api.rng() < GOLD_P ? 1 : 0, holder: -1, last: -1 });
      api.ev('drop', { g: s.cheese[s.cheese.length - 1].g });
    }
  }
  s.cats.forEach((c, i) => {
    const n = inp[i];
    for (const k of ['grabWait', 'dizzy', 'pickWait']) c[k] = Math.max(0, c[k] - dt);
    if (c.reach) { stepReach(s, c, i, n, dt, api); return; }
    if (busy(c)) { dropCheese(s, c, false); return; }
    c.face = n.ax >= c.x ? 1 : -1;
    c.jumpBuf = n.hit.a || n.hit.u ? 0.12 : Math.max(0, c.jumpBuf - dt);
    if (c.jumpBuf > 0 && c.ground) { c.jumpBuf = 0; c.vy = -JUMP; c.ground = false; api.ev('jump', {}); }
    if (n.hit.e && c.grabWait <= 0) launchGrab(s, c, i, n, api);
    // the paw opens when you let go of the mouse button: the cheese drops (or flies, if you were swinging)
    if (c.hold >= 0 && !n.held.fire) { dropCheese(s, c, true); api.ev('toss', { i }); }
  });
  const h = dt / SUB;
  for (let k = 0; k < SUB; k++) {
    s.cats.forEach((c, i) => stepBody(s, c, i, inp[i], h, api));
    const [a, b] = s.cats;
    if (a.caught < 0 && b.caught < 0 && Math.abs(a.y - b.y) < 70) {
      const dx = b.x - a.x, need = 40 - Math.abs(dx);
      if (need > 0) { const d = dx >= 0 ? 1 : -1; a.x = clamp(a.x - d * need / 2, EDGE, W - EDGE); b.x = clamp(b.x + d * need / 2, EDGE, W - EDGE); }
    }
    s.cats.forEach((c, i) => stepArms(s, c, inp[i], h));
  }
  // a reaching paw grabs any free cheese it touches (or one the cat walks right into, while reaching)
  s.cats.forEach((c, i) => {
    if (c.hold >= 0 || !c.up || c.pickWait > 0 || busy(c)) return;
    const hand = c.arms[1][ARM_N];
    const q = s.cheese.find(z => z.holder < 0 && Math.hypot(z.x - hand.x, z.y - hand.y) < CR + 14);
    if (!q) return;
    q.holder = i;
    q.last = i;
    c.hold = q.id;
    api.ev('pick', { i, x: q.x, y: q.y });
  });
  stepCheese(s, dt, api);
  if (s.t >= LEN) api.end(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, "Time's up!");
}

/* ---------- E: the long grab ---------- */

function launchGrab(s, c, i, n, api) {
  dropCheese(s, c, false);
  const sh = shoulder(c, 1), hand = c.arms[1][ARM_N];
  let dx = n.ax - sh[0], dy = n.ay - sh[1];
  const l = Math.hypot(dx, dy);
  if (l < 1) { dx = c.face; dy = 0; } else { dx /= l; dy /= l; }
  c.face = dx >= 0 ? 1 : -1;
  c.reach = { ph: 'out', d: Math.min(Math.hypot(hand.x - sh[0], hand.y - sh[1]), ARM_N * ARM_SEG), dx, dy, x: hand.x, y: hand.y, t: 0, vx: 0, vy: 0 };
  api.ev('reach', {});
}

function stepReach(s, c, i, n, dt, api) {
  const r = c.reach, o = s.cats[1 - i], sh = shoulder(c, 1);
  if (r.ph === 'out') {
    r.d += GRAB_SPEED * dt;
    r.x = sh[0] + r.dx * r.d;
    r.y = sh[1] + r.dy * r.d;
    const hd = headAt(o), body = at(o, 0, -24);
    const got = o.caught < 0 && (Math.hypot(r.x - hd[0], r.y - hd[1]) < 40 || Math.hypot(r.x - body[0], r.y - body[1]) < 34);
    if (got) {
      if (o.reach) { o.reach = null; o.grabWait = GRAB_WAIT; }
      const had = o.hold >= 0;
      dropCheese(s, o, false);
      Object.assign(o, { caught: i, fly: false, dizzy: 0, vx: 0, vy: 0, tilt: 0 });
      r.ph = 'hold';
      r.x = o.x;
      r.y = o.y - 40;
      api.ev('catch', { x: r.x, y: r.y, had: had ? 1 : 0 });
    } else if (r.d >= GRAB_RANGE || r.y > GROUND - 4 || r.y < 6 || r.x < 8 || r.x > W - 8 || CA.camWalls.inWall(r.x, r.y, 4)) r.ph = 'back';
    return;
  }
  if (r.ph === 'hold') {
    r.t += dt;
    let tx = n.ax - sh[0], ty = n.ay - sh[1];
    const tl = Math.hypot(tx, ty) || 1;
    if (tl > GRAB_RANGE) { tx *= GRAB_RANGE / tl; ty *= GRAB_RANGE / tl; }
    tx = clamp(sh[0] + tx, EDGE, W - EDGE);
    ty = clamp(sh[1] + ty, TOP - 40, GROUND - 40);
    const dx = tx - r.x, dy = ty - r.y, dl = Math.hypot(dx, dy), mv = Math.min(dl * 0.4, CARRY * dt);
    let nx = dl > 0.01 ? r.x + dx / dl * mv : r.x, ny = dl > 0.01 ? r.y + dy / dl * mv : r.y;
    const q = CA.camWalls.push(nx, ny, 50);
    if (q) { nx = q.x; ny = q.y; }
    r.vx += ((nx - r.x) / dt - r.vx) * 0.4;
    r.vy += ((ny - r.y) / dt - r.vy) * 0.4;
    r.x = nx;
    r.y = ny;
    o.x = r.x;
    o.y = r.y + 40;
    if ((!n.held.e && r.t > 0.3) || r.t > GRIP_MAX) throwCat(s, c, i, api);
    return;
  }
  r.d -= GRAB_SPEED * 1.2 * dt;
  if (r.d <= ARM_N * ARM_SEG - 8) { c.reach = null; c.grabWait = GRAB_WAIT; return; }
  r.x = sh[0] + r.dx * r.d;
  r.y = sh[1] + r.dy * r.d;
}

function throwSpeed(r) {
  let vx = r.vx * 1.25, vy = r.vy * 1.25 - 160;
  const sp = Math.hypot(vx, vy);
  if (sp > THROW_MAX) { vx *= THROW_MAX / sp; vy *= THROW_MAX / sp; }
  return [vx, vy];
}

function throwCat(s, c, i, api) {
  const r = c.reach, o = s.cats[1 - i], sh = shoulder(c, 1);
  [o.vx, o.vy] = throwSpeed(r);
  Object.assign(o, { caught: -1, fly: true, flyT: 0, ground: false, spin: clamp(o.vx * 0.012, -9, 9) });
  const l = Math.hypot(r.x - sh[0], r.y - sh[1]) || 1;
  r.ph = 'back';
  r.dx = (r.x - sh[0]) / l;
  r.dy = (r.y - sh[1]) / l;
  r.d = l;
  api.ev('throw', { x: r.x, y: r.y });
}

/* ---------- online ---------- */

function snap(s) {
  const r = v => Math.round(v * 10) / 10;
  return {
    sc: s.sc, t: Math.max(0, Math.ceil(LEN - s.t)),
    c: s.cats.map(c => ({
      x: r(c.x), y: r(c.y), face: c.face, tilt: Math.round(Math.atan2(Math.sin(c.tilt), Math.cos(c.tilt)) * 100) / 100,
      sq: c.ground && Math.abs(c.vx) > 40 ? Math.round(Math.abs(Math.sin(c.phase)) * 35) / 100 : 0,
      ar: c.arms.map(a => a.flatMap(p => [r(p.x), r(p.y)])),
      gw: Math.round(c.grabWait * 10) / 10, z: c.dizzy > 0 ? 1 : 0, sh: c.caught >= 0 ? 1 : 0, h: c.hold >= 0 ? 1 : 0,
      rp: c.reach ? (c.reach.ph === 'hold' ? 2 : 1) : 0, tv: c.reach && c.reach.ph === 'hold' ? throwSpeed(c.reach).map(Math.round) : [0, 0],
    })),
    q: s.cheese.map(q => [r(q.x), r(q.y), q.g, Math.round(q.a * 10) / 10]),
  };
}

/* ---------- the bot ---------- */

// The bot walks to the nearest free cheese and grabs it, walks it home and drops it over its pot. When the other cat
// is carrying cheese, it sometimes grabs them with E (a better bot more often) and throws them away.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = {});
  const me = st[i] || (st[i] = { think: 0, mx: 0, hold: false, ax: c.x, ay: c.y - 40, wait: 0 });
  const out = { hit: {}, held: {}, ax: me.ax, ay: me.ay, mx: 0 };
  if (c.reach) {
    if (c.reach.ph === 'hold') { const dir = c.reach.x < W / 2 ? 1 : -1; out.ax = c.reach.x + dir * 200; out.ay = c.reach.y - 240; out.held.e = c.reach.t < 0.5; }
    return out;
  }
  if (busy(c)) return out;
  me.think -= dt;
  if (me.think <= 0) {
    me.think = 0.1 + (1 - api.skill) * 0.25;
    const pot = POTS[i];
    if (c.hold >= 0) {
      const edge = i ? W - EDGE : EDGE;
      me.mx = Math.abs(c.x - edge) > 8 ? Math.sign(edge - c.x) : 0;
      me.ax = pot.x;
      me.ay = pot.rim - 30;
      const hand = c.arms[1][ARM_N];
      me.hold = !(Math.abs(hand.x - pot.x) < POT_W - 12 && hand.y < pot.rim - 6);
    } else {
      const free = s.cheese.filter(q => q.holder < 0);
      if (o.hold >= 0 && c.grabWait <= 0 && Math.abs(o.x - c.x) < GRAB_RANGE - 80 && Math.random() < 0.15 + 0.3 * api.skill) {
        const t = at(o, 0, -30);
        out.ax = t[0]; out.ay = t[1]; out.hit.e = true;
        return out;
      }
      let best = null, bd = Infinity;
      free.forEach(q => { const d = Math.abs(q.x - c.x) - (q.g ? 120 : 0); if (q.y > GROUND - 160 && d < bd) { bd = d; best = q; } });
      if (best) {
        me.mx = Math.abs(best.x - c.x) > 40 ? Math.sign(best.x - c.x) : 0;
        me.ax = best.x;
        me.ay = best.y;
        me.hold = Math.abs(best.x - c.x) < 110;
      } else { me.mx = Math.abs(W / 2 + (i ? 90 : -90) - c.x) > 20 ? Math.sign(W / 2 + (i ? 90 : -90) - c.x) : 0; me.hold = false; me.ax = W / 2; me.ay = 200; }
    }
  }
  out.mx = me.mx;
  out.ax = me.ax;
  out.ay = me.ay;
  if (me.hold) out.held.fire = true;
  return out;
}

/* ---------- effects and drawing ---------- */

function event(v, e) {
  if (e.type === 'drop') { v.pop(W / 2, 110, e.g ? 'GOLDEN CHEESE!' : 'Cheese!', e.g ? '#fff3a0' : '#ffd23f'); v.sound(e.g ? [[880, 0, 0.06], [1320, 0.06, 0.1]] : [[700, 0, 0.04], [500, 0.05, 0.05]]); }
  if (e.type === 'pick') v.sound(e.i === v.me ? [[520, 0, 0.04], [780, 0.04, 0.05]] : [[300, 0, 0.03]]);
  if (e.type === 'toss') v.sound([[380, 0, 0.03]]);
  if (e.type === 'bump') v.sound([[200, 0, 0.03]]);
  if (e.type === 'reach') v.sound([[260, 0, 0.05], [520, 0.04, 0.08]]);
  if (e.type === 'catch') { v.ring(e.x, e.y, '#3ddc84', 26); v.pop(e.x, e.y - 40, e.had ? 'DROP IT!' : 'GOTCHA!', '#3ddc84'); v.sound([[600, 0, 0.05], [900, 0.05, 0.08]]); }
  if (e.type === 'throw') { v.pop(e.x, e.y - 30, 'THROW!', '#3ddc84'); v.sound([[400, 0, 0.04], [800, 0.04, 0.08], [1200, 0.1, 0.06]]); }
  if (e.type === 'splat') { v.burst(e.x, e.y + 20, '#c9a77a', 16, 240); v.pop(e.x, e.y - 30, 'SPLAT!', '#ff9f43'); v.shake(10); v.sound('boom'); }
  if (e.type === 'land') v.sound([[220, 0, 0.06]]);
  if (e.type === 'jump') v.sound([[500, 0, 0.04]]);
  if (e.type === 'score') {
    const p = POTS[e.i];
    v.burst(p.x, p.rim, e.g ? '#fff3a0' : '#ffcf3d', e.g ? 30 : 16, e.g ? 320 : 220);
    v.pop(p.x + (e.i ? -30 : 30), p.rim - 50, e.g ? '+3!' : '+1', e.g ? '#fff3a0' : v.team[e.i].light);
    v.shake(e.g ? 8 : 4);
    v.sound(e.i === v.me ? (e.g ? [[880, 0, 0.06], [1175, 0.06, 0.06], [1568, 0.12, 0.14]] : [[784, 0, 0.05], [1046, 0.05, 0.1]]) : [[330, 0, 0.06], [260, 0.06, 0.08]]);
  }
}

let bg = null;
function makeBg() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const wall = b.createLinearGradient(0, 0, 0, GROUND);
  wall.addColorStop(0, '#3a2c4f');
  wall.addColorStop(1, '#5b4372');
  b.fillStyle = wall;
  b.fillRect(0, 0, W, GROUND);
  b.fillStyle = 'rgba(255, 255, 255, .04)'; // wallpaper stripes
  for (let x = 0; x < W; x += 48) b.fillRect(x, 0, 18, GROUND);
  // cupboards and a window
  b.fillStyle = '#2c2140';
  b.fillRect(200, 150, 160, 110);
  b.fillRect(600, 150, 160, 110);
  b.fillStyle = '#ffcf7a';
  b.globalAlpha = 0.25;
  b.fillRect(210, 160, 140, 90);
  b.fillRect(610, 160, 140, 90);
  b.globalAlpha = 1;
  // the hole in the ceiling, and a beam of light under it
  const beam = b.createLinearGradient(0, 40, 0, GROUND);
  beam.addColorStop(0, 'rgba(255, 230, 140, .35)');
  beam.addColorStop(1, 'rgba(255, 230, 140, 0)');
  b.fillStyle = beam;
  b.beginPath(); b.moveTo(W / 2 - 36, 44); b.lineTo(W / 2 + 36, 44); b.lineTo(W / 2 + 120, GROUND); b.lineTo(W / 2 - 120, GROUND); b.closePath(); b.fill();
  b.fillStyle = '#120c1a';
  b.beginPath(); b.ellipse(W / 2, 44, 44, 13, 0, 0, Math.PI * 2); b.fill();
  // the floor
  b.fillStyle = '#7a5a3c';
  b.fillRect(0, GROUND, W, H - GROUND);
  b.fillStyle = '#946d48';
  for (let x = 0; x < W; x += 64) b.fillRect(x, GROUND, 62, 10);
  b.fillStyle = '#5a3d24';
  b.fillRect(0, GROUND - 2, W, 3);
  return c;
}

function drawArm(g, a, fur) {
  const n = a.length / 2 - 1, long = Math.hypot(a[2 * n] - a[0], a[2 * n + 1] - a[1]) > ARM_N * ARM_SEG * 1.15;
  const path = () => {
    g.beginPath();
    g.moveTo(a[0], a[1]);
    for (let i = 1; i < n; i++) g.quadraticCurveTo(a[2 * i], a[2 * i + 1], (a[2 * i] + a[2 * i + 2]) / 2, (a[2 * i + 1] + a[2 * i + 3]) / 2);
    g.lineTo(a[2 * n], a[2 * n + 1]);
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  path(); g.strokeStyle = fur.dark; g.lineWidth = long ? 8 : 11; g.stroke();
  path(); g.strokeStyle = fur.mid; g.lineWidth = long ? 5 : 7.5; g.stroke();
  if (fur.sleeve) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.strokeStyle = fur.sleeve; g.lineWidth = 12; g.stroke(); }
  g.beginPath();
  g.arc(a[2 * n], a[2 * n + 1], long ? 8 : 6.5, 0, Math.PI * 2);
  g.fillStyle = fur.light;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = fur.dark;
  g.stroke();
}

function drawCheese(v, x, y, gold, rot) {
  const g = v.g;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (gold) { g.globalAlpha = 0.35 + Math.sin(v.now / 150) * 0.1; g.fillStyle = '#fff3a0'; v.dot(0, 0, 26); g.globalAlpha = 1; }
  g.fillStyle = gold ? '#ffe066' : '#ffcf3d';
  g.strokeStyle = gold ? '#fff8d0' : '#c98f00';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-16, 11); g.lineTo(16, 11); g.lineTo(-12, -14); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = gold ? '#f2b500' : '#d99a00';
  v.dot(-4, 4, 3);
  v.dot(-9, -4, 2);
  g.restore();
}

function drawPot(v, i, n) {
  const g = v.g, p = POTS[i], col = v.team[i];
  g.fillStyle = 'rgba(0, 0, 0, .3)';
  g.beginPath(); g.ellipse(p.x, GROUND + 2, POT_W + 10, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = col.dark;
  g.beginPath(); g.moveTo(p.x - POT_W, p.rim); g.lineTo(p.x + POT_W, p.rim); g.lineTo(p.x + POT_W - 8, GROUND); g.lineTo(p.x - POT_W + 8, GROUND); g.closePath(); g.fill();
  g.fillStyle = col.main;
  g.fillRect(p.x - POT_W - 4, p.rim - 6, POT_W * 2 + 8, 12);
  v.label(String(n), p.x, p.rim + 38, 30, '#ffffff');
  v.label(i === v.me ? 'Your pot' : v.names[i], p.x, p.rim - 22, 12, i === v.me ? '#ffd23f' : col.light);
}

function drawCat(v, c, i) {
  const g = v.g, look = (looks && looks[i]) || v.looks[i];
  drawArm(g, c.ar[0], look.fur);
  F.drawBody(g, look, c.x, c.y, { tilt: c.tilt, lookRight: c.face > 0, squash: c.sq });
  drawArm(g, c.ar[1], look.fur);
  const hd = at(c, 0, -92);
  if (c.z) {
    g.fillStyle = '#ffe14d';
    for (let k = 0; k < 3; k++) { const a = v.now / 200 + k * 2.1; v.star(hd[0] + Math.cos(a) * 24, hd[1] + Math.sin(a) * 7, 6); }
  }
  v.label(i === v.me ? 'You' : v.names[i], c.x, Math.min(c.y - 110, hd[1] - 10), 12, i === v.me ? '#ffd23f' : '#ffffff');
}

function drawThrowPath(v, c, tv) {
  const g = v.g, h = 1 / 120;
  let [x, y] = at(c, 0, -40), vx = tv[0], vy = tv[1];
  g.fillStyle = '#3ddc84';
  for (let k = 1; k <= 200; k++) {
    vy += G * h;
    x += vx * h;
    y += vy * h;
    if (y < TOP - 40) { y = TOP - 40; vy = 0; }
    if (y > GROUND - 40 || x < EDGE || x > W - EDGE || CA.camWalls.inWall(x, y, 40)) break;
    if (k % 6 === 0) v.dot(x, y, 3);
  }
}

function draw(v, s) {
  const g = v.g;
  if (!bg) bg = makeBg();
  g.drawImage(bg, 0, 0, W, H);
  s.c.forEach((c, i) => { if (c.rp === 2 && s.c[1 - i]) drawThrowPath(v, s.c[1 - i], c.tv); });
  s.c.forEach((c, i) => drawCat(v, c, i));
  s.q.forEach(([x, y, gold, a]) => drawCheese(v, x, y, gold, a));
  drawPot(v, 0, s.sc[0]);
  drawPot(v, 1, s.sc[1]);
  v.label(String(s.sc[0]), W / 2 - 90, 40, 40, v.team[0].main);
  v.label(String(s.sc[1]), W / 2 + 90, 40, 40, v.team[1].main);
  v.label('⏱ ' + s.t, W / 2, 40, 20, s.t <= 10 ? '#ff6b6b' : '#ffffff');
  const mine = s.c[v.me];
  if (!mine) return;
  // under your cat: is the grab (E) ready? It fills up while it cools down.
  const ex = mine.x, ey = GROUND + 30, ready = mine.gw <= 0 && !mine.rp;
  g.fillStyle = 'rgba(20, 10, 30, .55)'; v.dot(ex, ey, 13);
  g.fillStyle = ready ? '#3ddc84' : '#8a8aa0';
  g.beginPath(); g.moveTo(ex, ey); g.arc(ex, ey, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (ready ? 1 : 1 - Math.min(1, mine.gw / GRAB_WAIT))); g.closePath(); g.fill();
  v.label('E', ex, ey + 1, 12, '#ffffff');
  if (mine.sh) v.msg("You've been grabbed! Hang on…", true);
  else if (mine.rp === 2) v.msg('Move the mouse to swing them · let go of E to throw!');
  else if (mine.h) v.msg('Keep holding the mouse button · let go over your pot (or toss it in)!');
}

})();
