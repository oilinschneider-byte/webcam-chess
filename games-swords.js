/* Classic Games: Floppy Sword Cats. Two cats built like the Cat Hoops cats (see games-floppy.js): a solid body on
   normal legs, and very long, floppy arms. Each starts with a sword (a dropped one is picked up again by walking over
   it). The arms just flop about (the hands drag along the floor) until you hold the mouse button: then they lift up
   and the sword hand reaches for the mouse pointer (springy, and only so fast, so you really swing). Only a direct
   hit counts: the outer part of the blade moving fast, straight into them (a slow or sliding touch just glances off).
   A direct hit to the head takes 34 of your 100 health, one to the body 20, and one to the sword arm knocks the sword
   out of the hand. Swords that meet clank and knock both cats back. Out of health is a K.O. First to 2 rounds. Now
   and then, a direct hit on a cat with very little health left is a critical hit: its head pops right off (cartoon
   style, no blood) and bounces away, and that's the round.

   Moving is quick: A and D run, W or Space jumps, and Shift (or A or D twice, fast) dashes, once in the air too.
   E blocks for a moment (then it needs a short rest): a blocked blade bounces back, flinging the arm holding it back
   (it goes floppy for a moment) and pushing that cat back. Keep holding E and it charges up a grab (then 6 seconds
   to cool down): you drop your sword and your arm shoots out a long way towards the mouse pointer. If it catches the
   other cat, they're stuck (and so are you), and you carry them through the air with the mouse; let go of E and they
   fly off the way you were moving them. A hard landing hurts, leaves them dizzy, and knocks their sword out of their hand.

   The arms (chains of points) and the swords swing with gravity and springs (Verlet physics). A hit is checked along
   the whole path a blade swept since the last step, so a fast swing can't pass through. The host's app runs all of
   it (see games-duel.js). */
(() => {
'use strict';

const F = CA.floppy;
const W = 960, H = 540, GROUND = 468;
const G = 2100, AG = 1600;                         // gravity for the cats, and for their arms and the swords
const SUB = 2;                                     // physics steps per game step
const WALK = 260, ACCEL = 2600, AIR_ACCEL = 1400, JUMP = 760;
const DASH_SPEED = 820, DASH_TIME = 0.16, DASH_WAIT = 0.55;
const EDGE = 28, TOP = 95;                         // how near the walls a cat can go; how high its feet can go (head at the top of the screen)
const SH_X = 12.4, SH_Y = 33;                      // the shoulders, from the feet (as in games-floppy.js)
const ARM_N = 7, ARM_SEG = 11;                     // each arm: 7 floppy pieces (77 px: hanging down, the hands drag on the floor)
const SWORD = 66, REACH = 72, HAND_MAX = 14;        // sword length; how far the hand reaches; how far it can move a substep
const HIT_SPEED = 480, SWEET = 0.3, CLASH_SPEED = 150; // a direct hit: the blade (not its inner 30%) going this fast (px/s) straight into them; swords clank this fast
const HP = 100, HEAD_DMG = 34, BODY_DMG = 20, SPLAT_DMG = 15;
const CRIT_HP = 30, CRIT_HEAD = 0.4, CRIT_BODY = 0.2; // a critical hit: only on a cat this low on health, this often (head, body)
const NECK = -36, HEAD_Y = -56;                    // where the head meets the body, and the head's middle (from the feet)
const BLOCK_MIN = 0.35, BLOCK_WAIT = 1, CHARGE = 0.9; // a tap of E blocks this long; then a rest; hold E this long to grab
const RECOIL = 0.45;                               // how long a blocked (or clashed) cat's arms stay floppy after bouncing back
const GRAB_RANGE = 470, GRAB_SPEED = 2100, GRAB_WAIT = 6; // how far the grabbing arm stretches, how fast; its cooldown after
const GRIP_MAX = 2.2, CARRY = 1000, THROW_MAX = 1500; // the longest you can hold them; how fast you can carry and throw them
const PICK_WAIT = 0.6, SPLAT = 650, DIZZY = 1.3;   // a dropped sword can't be picked up at once; a landing this fast (px/s) is a splat
const WIN = 2, ROUND = 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
let looks = null;                                  // each player's cat picture without its arms (those are drawn separately)

CA.games.add('swords', {
  name: 'Floppy Sword Cats', icon: '🤺',
  blurb: 'Long floppy arms and a sword each! Hold the mouse button to lift your sword and swing at the mouse pointer. Only direct hits count: fast, with the outer part of the blade. Swords clash, E blocks (and bounces their sword back), and holding E grabs the other cat from far away so you can throw them! Shift dashes.',
  start(ctx) {
    looks = [];
    looks[ctx.isHost ? 0 : 1] = { pics: F.pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
    looks[ctx.isHost ? 1 : 0] = { pics: F.pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };
    CA.duel.run(ctx, {
      id: 'swords', mouse: true, doubleTap: true, keys: { KeyE: 'e', ShiftLeft: 'sh', ShiftRight: 'sh' }, letters: { e: 'e' },
      jump: 120, angles: ['tilt'],
      pad: { stick: true, buttons: [{ k: 'e', label: '🛡️ Block · hold: Grab' }, { k: 'sh', label: '💨 Dash' }, { k: 'a', label: '⤒ Jump', main: true }] },
      help: 'A/D run · W or Space jump · Shift dash · hold the mouse to lift your sword and swing · E block (hold: grab and throw)',
      helpTouch: 'Stick runs · drag on the arena to swing · Block (hold: grab and throw) · Dash · Jump',
      note: 'First to ' + WIN + ' rounds',
      init, step, snap, bot, draw, event,
    });
  },
});

// A point on a cat's body: (dx, dy) from its feet (dx forwards), turned with the cat. (Works on a snap's cats too.)
function at(c, dx, dy) {
  const cs = Math.cos(c.tilt), sn = Math.sin(c.tilt);
  dx *= c.face;
  return [c.x + dx * cs - dy * sn, c.y + dx * sn + dy * cs];
}
const shoulder = (c, k) => at(c, k ? SH_X : -SH_X, -SH_Y); // (arm 1 is the front one: the sword arm)
const headAt = c => at(c, 2, HEAD_Y);

function newCat(x, face) {
  const c = {
    x, y: GROUND, vx: 0, vy: 0, face, tilt: 0, spin: 0, ground: true, phase: 0,
    hp: HP, ko: false, koDir: 1, stun: 0, cool: 0, knockT: -9, // health; knocked silly for a moment after a hit; can't be hit again yet
    hold: -1, up: false, swingT: 0, pickWait: 0, recoil: 0,     // the sword; arms up (mouse button down), a swing still counts a moment after
    dashT: 0, dashDir: 1, dashWait: 0, airDash: false, jumpBuf: 0,
    eOn: false, eT: 0, eWait: 0, grabWait: 0,     // E: down (blocking, charging a grab) and for how long; its rest; the grab's cooldown
    reach: null, caught: -1, fly: false, flyT: 0, dizzy: 0, // the grab this cat is doing; who's carrying this cat; thrown; dizzy
    head: null,                                   // after a critical hit: the head, bouncing away on its own
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

function init(api) {
  const s = { wins: [0, 0], round: 0, t: 0, phase: 'fight', pause: 0, rw: -1, cats: [], swords: [], clashAt: 0 };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.t = 0;
  s.clashAt = 0;
  s.phase = 'fight';
  s.rw = -1;
  s.cats = [newCat(200, 1), newCat(W - 200, -1)];
  s.swords = s.cats.map((c, i) => { // each cat starts with a sword in its front hand, the blade on the floor
    const hand = c.arms[1][ARM_N], bx = hand.x + c.face * SWORD;
    c.hold = i;
    return { a: { x: hand.x, y: hand.y, px: hand.x, py: hand.y }, b: { x: bx, y: GROUND - 3, px: bx, py: GROUND - 3 }, holder: i, last: null };
  });
  if (api) api.note('Round ' + s.round + ' · first to ' + WIN);
}

// (a cat that's grabbing, being carried, flying through the air, dizzy or knocked out can't do anything else)
const busy = c => c.ko || !!c.reach || c.caught >= 0 || c.fly || c.dizzy > 0;
const canAct = c => !busy(c) && c.stun <= 0;

function verlet(p, h) {
  const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;
  p.px = p.x; p.py = p.y;
  p.x += vx; p.y += vy + AG * h * h;
}
// Keeps a point inside the arena; true if it's on the floor.
function bound(p, r) {
  if (p.x < 6 + r) p.x = 6 + r;
  if (p.x > W - 6 - r) p.x = W - 6 - r;
  if (p.y < r) p.y = r;
  const q = CA.camWalls.push(p.x, p.y, r); // (the camera walls in the top corners)
  if (q) { p.x = q.x; p.y = q.y; }
  if (p.y >= GROUND - r) { p.y = GROUND - r; return true; }
  return false;
}

/* ---------- moving ---------- */

// The body: running, jumping and dashing like the Cat Hoops cats. A thrown cat spins through the air until it lands.
function stepBody(s, c, i, n, h, api) {
  if (c.caught >= 0) return; // (being carried: see stepReach)
  const free = canAct(c);
  if (c.dashT > 0) {
    c.dashT -= h;
    c.vx = c.dashDir * DASH_SPEED;
    if (!c.ground) c.vy = Math.min(c.vy, 0);
    if (c.dashT <= 0) c.vx = c.dashDir * 300; // (it stops sharply)
  } else if (!c.fly) {
    const want = free && !c.reach ? n.mx * WALK * (c.eOn ? 0.5 : 1) : 0;
    c.vx = approach(c.vx, want, (c.ground ? (free ? ACCEL : 1300) : AIR_ACCEL) * h);
  }
  if (!(c.dashT > 0 && !c.ground)) c.vy += G * h;
  const speed = Math.hypot(c.vx, c.vy);
  c.x += c.vx * h;
  c.y += c.vy * h;
  let bump = false;
  if (c.y >= GROUND) { c.y = GROUND; if (c.vy > 0) c.vy = 0; c.ground = true; c.airDash = false; } else c.ground = false;
  if (c.x < EDGE || c.x > W - EDGE) { c.x = clamp(c.x, EDGE, W - EDGE); c.vx = 0; c.dashT = 0; bump = true; }
  if (c.y < TOP) { c.y = TOP; if (c.vy < 0) c.vy = 0; } // (the top of the screen: a thrown cat bonks into it and falls)
  for (const [dy, r] of [[HEAD_Y, 28], [-14, 16]]) { // the camera walls in the top corners: the head and the feet bump into them
    const p = CA.camWalls.push(c.x, c.y + dy, r);
    if (!p) continue;
    c.x = p.x;
    c.y = p.y - dy;
    const vn = c.vx * p.nx + c.vy * p.ny;
    if (vn < 0) { c.vx -= vn * p.nx; c.vy -= vn * p.ny; }
    c.dashT = 0;
    bump = true;
  }
  c.phase += Math.abs(c.vx) * h * 0.07;
  if (c.fly) {
    c.flyT += h;
    c.tilt += c.spin * h;
    if ((c.ground || bump) && c.flyT > 0.05) {
      c.fly = false;
      c.tilt = Math.atan2(Math.sin(c.tilt), Math.cos(c.tilt));
      if (speed >= SPLAT) splat(s, c, i, api);
      else api.ev('land', { x: c.x, y: c.y });
    }
  } else if (c.ko) c.tilt = approach(c.tilt, c.koDir * 1.5, 6 * h);
  else c.tilt = approach(c.tilt, c.dizzy > 0 ? Math.sin(s.t * 9) * 0.15 : 0, 7 * h);
}

// Moves an arm: its points swing and drag on the floor; with a target, the hand reaches for it (springy, and only so
// fast) and the rest of the arm straightens out towards the hand.
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
  for (let i = 1; i <= ARM_N; i++) if (pts[i].y >= GROUND - 5.5) pts[i].px += (pts[i].x - pts[i].px) * 0.2; // (the floor is rough: the hands drag)
}

// The arms flop about unless the mouse button is down: then they lift up and the sword hand reaches for the mouse
// pointer. Blocking holds them up in front, the sword pointing up.
function stepArms(s, c, n, h) {
  c.up = false;
  const sh0 = shoulder(c, 0), sh1 = shoulder(c, 1), free = canAct(c);
  let t0 = null, t1 = null, max = HAND_MAX;
  if (free && c.eOn) {
    t1 = [sh1[0] + c.face * 26, sh1[1] - 36];
    t0 = [sh0[0] + c.face * 34, sh0[1] - 6];
  } else if (free && n.held.fire && c.recoil <= 0) {
    c.up = true;
    let tx = n.ax - sh1[0], ty = n.ay - sh1[1];
    const tl = Math.hypot(tx, ty) || 1;
    if (tl > REACH) { tx *= REACH / tl; ty *= REACH / tl; }
    t1 = [sh1[0] + tx, sh1[1] + ty];
    t0 = [sh0[0] + tx * 0.75, sh0[1] + ty * 0.75 + 8];
    max = HAND_MAX * (n.swing || 1);
  }
  moveArm(c.arms[0], sh0, t0, h, HAND_MAX * 0.6);
  if (c.reach) { // the grabbing arm: stretched out straight from the shoulder to the hand
    c.arms[1].forEach((p, k) => {
      const f = k / ARM_N;
      p.x = p.px = sh1[0] + (c.reach.x - sh1[0]) * f;
      p.y = p.py = sh1[1] + (c.reach.y - sh1[1]) * f;
    });
  } else moveArm(c.arms[1], sh1, t1, h, max);
}

// The swords: a held one's hilt is in the front hand and its blade points out from the shoulder while the arm is up
// (straight up while blocking); otherwise it just flops on the hand and drags along the floor. A free one falls.
function stepSwords(s, h) {
  s.swords.forEach(sw => {
    if (sw.holder < 0) {
      verlet(sw.a, h);
      verlet(sw.b, h);
      for (let it = 0; it < 3; it++) {
        const dx = sw.b.x - sw.a.x, dy = sw.b.y - sw.a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - SWORD) / d * 0.5;
        sw.a.x += dx * f; sw.a.y += dy * f; sw.b.x -= dx * f; sw.b.y -= dy * f;
        [sw.a, sw.b].forEach(p => { if (bound(p, 3)) p.px += (p.x - p.px) * 0.35; });
      }
      return;
    }
    const c = s.cats[sw.holder], hand = c.arms[1][ARM_N], sh = shoulder(c, 1);
    sw.a.px = sw.a.x; sw.a.py = sw.a.y;
    sw.a.x = hand.x; sw.a.y = hand.y;
    verlet(sw.b, h);
    if (c.up || (c.eOn && canAct(c))) {
      let dx = c.eOn ? c.face * 0.25 : hand.x - sh[0], dy = c.eOn ? -1 : hand.y - sh[1];
      const l = Math.hypot(dx, dy);
      if (l < 0.5) { dx = c.face; dy = 0; } else { dx /= l; dy /= l; }
      sw.b.x += (hand.x + dx * SWORD - sw.b.x) * 0.5;
      sw.b.y += (hand.y + dy * SWORD - sw.b.y) * 0.5;
    }
    const dx = sw.b.x - sw.a.x, dy = sw.b.y - sw.a.y, d = Math.hypot(dx, dy) || 0.01;
    sw.b.x = sw.a.x + dx / d * SWORD;
    sw.b.y = sw.a.y + dy / d * SWORD;
    if (bound(sw.b, 3)) sw.b.px += (sw.b.x - sw.b.px) * 0.2;
  });
}

function physics(s, inp, dt, api) {
  const h = dt / SUB;
  for (let k = 0; k < SUB; k++) {
    s.cats.forEach((c, i) => stepBody(s, c, i, inp[i], h, api));
    const [a, b] = s.cats; // (the two bodies push each other apart)
    if (a.caught < 0 && b.caught < 0 && !a.ko && !b.ko && Math.abs(a.y - b.y) < 70) {
      const dx = b.x - a.x, need = 40 - Math.abs(dx);
      if (need > 0) { const d = dx >= 0 ? 1 : -1; a.x = clamp(a.x - d * need / 2, EDGE, W - EDGE); b.x = clamp(b.x + d * need / 2, EDGE, W - EDGE); }
    }
    s.cats.forEach((c, i) => { stepArms(s, c, inp[i], h); if (c.head) stepHead(c.head, h); });
    stepSwords(s, h);
  }
}

// A head that's come off (a critical hit): it flies, bounces and rolls to a stop.
function stepHead(hd, h) {
  hd.vy += G * h;
  hd.x += hd.vx * h;
  hd.y += hd.vy * h;
  hd.a += hd.va * h;
  if (hd.y > GROUND - 24) { hd.y = GROUND - 24; hd.vy = hd.vy > 150 ? -hd.vy * 0.45 : 0; hd.vx *= 0.97; hd.va = hd.vx / 24; }
  if (hd.x < 30 || hd.x > W - 30) { hd.x = clamp(hd.x, 30, W - 30); hd.vx = -hd.vx * 0.5; }
  CA.camWalls.bounce(hd, 24, 0.5);
}

/* ---------- hits ---------- */

// The shortest distance between two line segments.
function segDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const n = CA.duel.nearest;
  const cross = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = cross(ax, ay, bx, by, cx, cy), d2 = cross(ax, ay, bx, by, dx, dy), d3 = cross(cx, cy, dx, dy, ax, ay), d4 = cross(cx, cy, dx, dy, bx, by);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
  return Math.min(n(ax, ay, cx, cy, dx, dy).d, n(bx, by, cx, cy, dx, dy).d, n(cx, cy, ax, ay, bx, by).d, n(dx, dy, ax, ay, bx, by).d);
}

// Where a cat can be hit: its head (while it has one), its body (and legs), and the arm holding a sword.
function zones(c) {
  const hd = headAt(c), z = [{ part: 'body', a: at(c, 0, -34), b: at(c, 0, -8), r: 16 }];
  if (!c.head) z.unshift({ part: 'head', a: hd, b: hd, r: 26 });
  if (c.hold >= 0) { const arm = c.arms[1]; z.push({ part: 'arm', a: [arm[ARM_N - 3].x, arm[ARM_N - 3].y], b: [arm[ARM_N].x, arm[ARM_N].y], r: 6 }); }
  return z;
}

const remember = sw => { sw.last = { ax: sw.a.x, ay: sw.a.y, bx: sw.b.x, by: sw.b.y }; };
// Where a blade was a fraction f of the way through this step: [x1, y1, x2, y2] from just past the hilt to the tip.
function bladeAt(sw, f) {
  const L = sw.last, ax = L.ax + (sw.a.x - L.ax) * f, ay = L.ay + (sw.a.y - L.ay) * f, bx = L.bx + (sw.b.x - L.bx) * f, by = L.by + (sw.b.y - L.by) * f;
  return [ax + (bx - ax) * 0.12, ay + (by - ay) * 0.12, bx, by];
}

function checkHits(s, dt, api) {
  if (s.phase === 'fight' && !clash(s, dt, api)) s.swords.forEach(sw => cutWith(s, sw, dt, api));
  s.swords.forEach(remember);
}

// A blade knocked back (blocked, or in a clash): it and the arm holding it fly back that way (dir), the arm goes
// floppy for a moment, and the cat is pushed back.
function bounce(c, sw, dir, k) {
  const arm = c.arms[1];
  for (let n = 2; n <= ARM_N; n++) { const f = n / ARM_N; arm[n].px = arm[n].x - dir * 16 * k * f; arm[n].py = arm[n].y + 8 * k * f; }
  sw.b.px = sw.b.x - dir * 26 * k;
  sw.b.py = sw.b.y + 12 * k;
  c.vx += dir * 420 * k; // (knocked back a good step, with a little hop)
  if (c.ground) { c.vy = -170 * k; c.ground = false; }
  c.recoil = RECOIL;
  c.swingT = 0;
}

// Two swords that meet (one of them swinging) clank: sparks, and both cats are knocked back. (A sword lying flat on
// the floor doesn't count, so letting it drag isn't a shield.)
function clash(s, dt, api) {
  const [p, q] = s.swords;
  if (p.holder < 0 || q.holder < 0 || p.holder === q.holder || !p.last || !q.last || s.t < s.clashAt) return false;
  const cp = s.cats[p.holder], cq = s.cats[q.holder];
  const lying = sw => sw.b.y > GROUND - 14 && sw.a.y > GROUND - 14;
  if (busy(cp) || busy(cq) || !(cp.swingT > 0 || cq.swingT > 0) || lying(p) || lying(q)) return false;
  const speed = sw => Math.hypot(sw.b.x - sw.last.bx, sw.b.y - sw.last.by) / dt;
  if (Math.max(speed(p), speed(q)) < CLASH_SPEED) return false;
  for (let k = 0; k <= 6; k++) {
    const A = bladeAt(p, k / 6), B = bladeAt(q, k / 6);
    if (segDist(A[0], A[1], A[2], A[3], B[0], B[1], B[2], B[3]) < 5) {
      const m = CA.duel.nearest((B[0] + B[2]) / 2, (B[1] + B[3]) / 2, A[0], A[1], A[2], A[3]);
      bounce(cp, p, Math.sign(cp.x - cq.x) || cp.face, 1);
      bounce(cq, q, Math.sign(cq.x - cp.x) || cq.face, 1);
      s.clashAt = s.t + 0.2;
      api.ev('clash', { x: m.x, y: m.y });
      return true;
    }
  }
  return false;
}

// Checks a swinging sword's blade along the path it swept this step, against the other cat. Only a direct hit counts:
// the outer part of the blade, moving fast across the blade (straight into them, not sliding along them).
function cutWith(s, sw, dt, api) {
  if (sw.holder < 0 || !sw.last) return;
  const me = s.cats[sw.holder], vi = 1 - sw.holder, v = s.cats[vi];
  if (v.ko || me.swingT <= 0 || busy(me) || me.stun > 0 || v.caught >= 0) return;
  let hit = null;
  for (let k = 0; k <= 6 && !hit; k++) {
    const B = bladeAt(sw, k / 6);
    for (const z of zones(v)) {
      if (segDist(B[0], B[1], B[2], B[3], z.a[0], z.a[1], z.b[0], z.b[1]) >= z.r) continue;
      const n = CA.duel.nearest((z.a[0] + z.b[0]) / 2, (z.a[1] + z.b[1]) / 2, B[0], B[1], B[2], B[3]);
      hit = { part: z.part, x: n.x, y: n.y, k: n.k };
      break;
    }
  }
  if (!hit) return;
  const dir = Math.sign(v.x - me.x) || me.face;
  if (v.eOn) { bounce(me, sw, -dir, 1); api.ev('block', { x: hit.x, y: hit.y }); return; }
  const L = sw.last, f = 0.12 + 0.88 * hit.k;
  const vx = ((sw.a.x - L.ax) + ((sw.b.x - L.bx) - (sw.a.x - L.ax)) * f) / dt, vy = ((sw.a.y - L.ay) + ((sw.b.y - L.by) - (sw.a.y - L.ay)) * f) / dt;
  const bl = Math.hypot(sw.b.x - sw.a.x, sw.b.y - sw.a.y) || 1, ux = (sw.b.x - sw.a.x) / bl, uy = (sw.b.y - sw.a.y) / bl;
  const direct = Math.abs(vx * uy - vy * ux) >= HIT_SPEED && hit.k >= SWEET;
  if (!direct || v.cool > 0) {
    if (s.t - v.knockT > 0.3) { v.knockT = s.t; v.vx += dir * 200; api.ev('glance', { x: hit.x, y: hit.y }); } // (even a glance pushes them back)
    return;
  }
  if (hit.part === 'arm') { dropSword(s, v, dir); v.cool = 0.3; api.ev('disarm', { x: hit.x, y: hit.y }); return; }
  if (v.hp <= CRIT_HP && Math.random() < (hit.part === 'head' ? CRIT_HEAD : CRIT_BODY)) { // a critical hit: off comes the head
    const [hx, hy] = headAt(v);
    v.hp = 0;
    v.head = { x: hx, y: hy, vx: dir * (220 + Math.random() * 140), vy: -560, a: v.tilt, va: dir * 11 };
    api.ev('crit', { x: hx, y: hy });
    koCat(s, vi, api, dir);
    return;
  }
  const dmg = hit.part === 'head' ? HEAD_DMG : BODY_DMG;
  v.hp = Math.max(0, v.hp - dmg);
  v.cool = 0.45;
  v.stun = 0.3;
  v.eOn = false;
  v.dashT = 0;
  v.vx = dir * (hit.part === 'head' ? 380 : 300);
  v.vy = -280;
  v.ground = false;
  api.ev('hit', { x: hit.x, y: hit.y, part: hit.part, dmg });
  if (v.hp <= 0) koCat(s, vi, api, dir);
}

// Lets go of the sword (fling: flicks it up and that way).
function dropSword(s, c, fling) {
  if (c.hold < 0) return;
  const sw = s.swords[c.hold];
  sw.holder = -1;
  sw.last = null;
  if (fling) { sw.a.px = sw.a.x - fling * 3; sw.a.py = sw.a.y + 6; sw.b.px = sw.b.x - fling * 5; sw.b.py = sw.b.y + 10; }
  c.hold = -1;
  c.pickWait = PICK_WAIT;
}

function koCat(s, i, api, dir) {
  const c = s.cats[i];
  if (c.ko) return;
  c.ko = true;
  c.koDir = dir || 1;
  c.eOn = false;
  dropSword(s, c, dir);
  if (c.caught < 0) { c.vx = c.koDir * 220; c.vy = -320; c.ground = false; }
  const w = 1 - i;
  s.wins[w]++;
  s.rw = w;
  api.score(s.wins[0], s.wins[1]);
  api.ev('ko', { i, x: c.x, y: c.y - 45, head: c.head ? 1 : 0 });
  if (s.wins[w] >= WIN) s.over = w;
  s.phase = 'pause';
  s.pause = 2.4;
}

function splat(s, c, i, api) {
  const dir = Math.sign(c.spin) || 1;
  c.dizzy = DIZZY;
  dropSword(s, c, dir);
  c.hp = Math.max(0, c.hp - SPLAT_DMG);
  api.ev('splat', { x: c.x, y: c.y - 30, dmg: SPLAT_DMG });
  if (c.hp <= 0 && s.phase === 'fight') koCat(s, i, api, dir);
}

/* ---------- each step ---------- */

function step(s, inp, dt, api) {
  if (s.phase === 'pause') {
    s.pause -= dt;
    const still = inp.map(n => Object.assign({}, n, { mx: 0, held: {}, hit: {} }));
    s.cats.forEach((c, i) => { tick(c, dt); if (c.reach) stepReach(s, c, i, still[i], dt, api); });
    physics(s, still, dt, api);
    if (s.pause <= 0) {
      if (s.over != null) { api.end(s.over, 'K.O.!'); return; }
      if (s.round >= 6) { api.end(s.wins[0] === s.wins[1] ? -1 : s.wins[0] > s.wins[1] ? 0 : 1, 'TIME!'); return; } // (too many drawn rounds)
      newRound(s, api);
    }
    return;
  }
  s.t += dt;
  s.cats.forEach((c, i) => {
    const n = inp[i];
    tick(c, dt);
    c.swingT = n.held.fire && canAct(c) && !c.eOn && c.recoil <= 0 ? 0.3 : Math.max(0, c.swingT - dt);
    if (c.ko) return;
    if (c.reach) { stepReach(s, c, i, n, dt, api); return; }
    if (!canAct(c)) { c.eOn = false; return; }
    c.face = n.ax >= c.x ? 1 : -1;
    // W or Space jumps (a press just before landing still counts)
    c.jumpBuf = n.hit.a || n.hit.u ? 0.12 : Math.max(0, c.jumpBuf - dt);
    if (c.jumpBuf > 0 && c.ground) { c.jumpBuf = 0; c.vy = -JUMP; c.ground = false; c.dashT = 0; api.ev('jump', {}); }
    // Shift (the way you're running, or facing), or A or D twice: a dash (once in the air)
    const dash = n.hit.dl ? -1 : n.hit.dr ? 1 : n.hit.sh ? (Math.sign(n.mx) || c.face) : 0;
    if (dash && c.dashWait <= 0 && (c.ground || !c.airDash)) {
      c.dashT = DASH_TIME;
      c.dashDir = dash;
      c.dashWait = DASH_WAIT;
      c.airDash = !c.ground;
      api.ev('dash', { x: c.x, y: c.y - 30 });
    }
    // E: a tap blocks for a moment (then it needs a rest); keep holding it and it charges up the long grab
    if (n.hit.e && !c.eOn && c.eWait <= 0) { c.eOn = true; c.eT = 0; }
    if (c.eOn) {
      c.eT += dt;
      if (n.held.e && c.eT >= CHARGE) { c.eOn = false; if (c.grabWait <= 0) launchGrab(s, c, i, n, api); else c.eWait = BLOCK_WAIT; } // (grab still cooling down: just a block)
      else if (!n.held.e && c.eT >= BLOCK_MIN) { c.eOn = false; c.eWait = BLOCK_WAIT; }
    }
    if (c.hold < 0 && c.pickWait <= 0 && !c.reach) pickUp(s, c, i, api);
  });
  physics(s, inp, dt, api);
  checkHits(s, dt, api);
  if (s.t >= ROUND && s.phase === 'fight') { // time: whoever has more health left wins the round
    const [a, b] = s.cats;
    if (a.hp !== b.hp) koCat(s, a.hp < b.hp ? 0 : 1, api, a.hp < b.hp ? -1 : 1);
    else { s.phase = 'pause'; s.pause = 2; s.rw = -1; api.ev('draw', {}); }
  }
}

function tick(c, dt) {
  for (const k of ['cool', 'stun', 'dashWait', 'pickWait', 'eWait', 'grabWait', 'recoil', 'dizzy']) c[k] = Math.max(0, c[k] - dt);
}

// Walking over a free sword (or touching it with the front paw) picks it up.
function pickUp(s, c, i, api) {
  const hand = c.arms[1][ARM_N], body = at(c, 0, -14);
  let best = -1, bd = Infinity;
  s.swords.forEach((sw, k) => {
    if (sw.holder >= 0) return;
    const near = (x, y) => CA.duel.nearest(x, y, sw.a.x, sw.a.y, sw.b.x, sw.b.y).d;
    const d = Math.min(near(hand.x, hand.y) - 30, near(body[0], body[1]) - 24);
    if (d < 0 && d < bd) { bd = d; best = k; }
  });
  if (best < 0) return;
  s.swords[best].holder = i;
  s.swords[best].last = null;
  c.hold = best;
  api.ev('pick', { x: hand.x, y: hand.y });
}

/* ---------- the long grab ---------- */

// The cat lets go of its sword and the front arm shoots out towards the mouse pointer.
function launchGrab(s, c, i, n, api) {
  dropSword(s, c);
  const sh = shoulder(c, 1), hand = c.arms[1][ARM_N];
  let dx = n.ax - sh[0], dy = n.ay - sh[1];
  const l = Math.hypot(dx, dy);
  if (l < 1) { dx = c.face; dy = 0; } else { dx /= l; dy /= l; }
  c.face = dx >= 0 ? 1 : -1;
  c.dashT = 0;
  c.reach = { ph: 'out', d: Math.min(Math.hypot(hand.x - sh[0], hand.y - sh[1]), ARM_N * ARM_SEG), dx, dy, x: hand.x, y: hand.y, t: 0, vx: 0, vy: 0 };
  api.ev('reach', { x: sh[0], y: sh[1] });
}

// The grab, each step: the hand flies out until it catches the other cat (or goes as far as it can and comes back).
// Caught, they're carried towards the mouse pointer until E is let go (or GRIP_MAX), then they fly off the way they
// were going (a throw).
function stepReach(s, c, i, n, dt, api) {
  const r = c.reach, o = s.cats[1 - i], sh = shoulder(c, 1);
  if (c.ko) { if (r.ph === 'hold') throwCat(s, c, i, api, true); c.reach = null; c.grabWait = GRAB_WAIT; return; }
  if (r.ph === 'out') {
    const x0 = r.x, y0 = r.y;
    r.d += GRAB_SPEED * dt;
    r.x = sh[0] + r.dx * r.d;
    r.y = sh[1] + r.dy * r.d;
    const got = s.phase === 'fight' && !o.ko && o.caught < 0 &&
      zones(o).some(z => z.part !== 'arm' && segDist(x0, y0, r.x, r.y, z.a[0], z.a[1], z.b[0], z.b[1]) < z.r + 14);
    if (got) {
      if (o.reach) { o.reach = null; o.grabWait = GRAB_WAIT; } // (their own grab is cut short)
      Object.assign(o, { caught: i, eOn: false, fly: false, dizzy: 0, dashT: 0, vx: 0, vy: 0, tilt: 0 });
      r.ph = 'hold';
      r.x = o.x;
      r.y = o.y - 40;
      api.ev('catch', { x: r.x, y: r.y });
    } else if (r.d >= GRAB_RANGE || r.y > GROUND - 4 || r.y < 6 || r.x < 8 || r.x > W - 8 || CA.camWalls.inWall(r.x, r.y, 4)) r.ph = 'back';
    return;
  }
  if (r.ph === 'hold') {
    r.t += dt;
    // towards the mouse pointer: no further than the arm stretches, and with the carried cat inside the arena
    let tx = n.ax - sh[0], ty = n.ay - sh[1];
    const tl = Math.hypot(tx, ty) || 1;
    if (tl > GRAB_RANGE) { tx *= GRAB_RANGE / tl; ty *= GRAB_RANGE / tl; }
    tx = clamp(sh[0] + tx, EDGE, W - EDGE);
    ty = clamp(sh[1] + ty, TOP - 40, GROUND - 40);
    const dx = tx - r.x, dy = ty - r.y, dl = Math.hypot(dx, dy), mv = Math.min(dl * 0.4, CARRY * dt);
    let nx = dl > 0.01 ? r.x + dx / dl * mv : r.x, ny = dl > 0.01 ? r.y + dy / dl * mv : r.y;
    const q = CA.camWalls.push(nx, ny, 50); // (a carried cat can't go into a camera wall either)
    if (q) { nx = q.x; ny = q.y; }
    r.vx += ((nx - r.x) / dt - r.vx) * 0.4;
    r.vy += ((ny - r.y) / dt - r.vy) * 0.4;
    r.x = nx;
    r.y = ny;
    o.x = r.x;
    o.y = r.y + 40;
    if ((!n.held.e && r.t > 0.35) || r.t > GRIP_MAX) throwCat(s, c, i, api);
    return;
  }
  r.d -= GRAB_SPEED * 1.2 * dt; // coming back
  if (r.d <= ARM_N * ARM_SEG - 8) { c.reach = null; c.grabWait = GRAB_WAIT; return; }
  r.x = sh[0] + r.dx * r.d;
  r.y = sh[1] + r.dy * r.d;
}

// How fast a carried cat flies off if they're let go now (a throw always pops them up a bit).
function throwSpeed(r) {
  let vx = r.vx * 1.25, vy = r.vy * 1.25 - 160;
  const sp = Math.hypot(vx, vy);
  if (sp > THROW_MAX) { vx *= THROW_MAX / sp; vy *= THROW_MAX / sp; }
  return [vx, vy];
}

function throwCat(s, c, i, api, drop) {
  const r = c.reach, o = s.cats[1 - i], sh = shoulder(c, 1);
  [o.vx, o.vy] = drop ? [0, 0] : throwSpeed(r);
  Object.assign(o, { caught: -1, fly: true, flyT: 0, ground: false, spin: clamp(o.vx * 0.012, -9, 9) });
  const l = Math.hypot(r.x - sh[0], r.y - sh[1]) || 1;
  r.ph = 'back';
  r.dx = (r.x - sh[0]) / l;
  r.dy = (r.y - sh[1]) / l;
  r.d = l;
  if (!drop) api.ev('throw', { x: r.x, y: r.y });
}

/* ---------- online ---------- */

function snap(s) {
  const r = v => Math.round(v * 10) / 10;
  return {
    w: s.wins, rd: s.round, ph: s.phase, rw: s.rw, t: Math.round(s.t),
    c: s.cats.map(c => ({
      x: r(c.x), y: r(c.y), face: c.face, tilt: Math.round(Math.atan2(Math.sin(c.tilt), Math.cos(c.tilt)) * 100) / 100,
      sq: c.ground && Math.abs(c.vx) > 40 && !c.ko ? Math.round(Math.abs(Math.sin(c.phase)) * 35) / 100 : 0,
      ar: c.arms.map(a => a.flatMap(p => [r(p.x), r(p.y)])), hp: Math.round(c.hp), h: c.hold,
      ko: c.ko ? 1 : 0, cl: c.cool > 0 ? 1 : 0, b: c.eOn ? 1 : 0, g: c.eOn && c.grabWait <= 0 ? Math.round(Math.min(1, c.eT / CHARGE) * 20) / 20 : 0,
      w: Math.round(c.eWait * 10) / 10, gw: Math.round(c.grabWait * 10) / 10, z: c.dizzy > 0 ? 1 : 0, sh: c.caught >= 0 ? 1 : 0, ds: c.dashT > 0 ? c.dashDir : 0,
      hd: c.head ? [r(c.head.x), r(c.head.y), Math.round(c.head.a * 100) / 100] : 0,
      rp: c.reach ? (c.reach.ph === 'hold' ? 2 : 1) : 0, tv: c.reach && c.reach.ph === 'hold' ? throwSpeed(c.reach).map(Math.round) : [0, 0],
    })),
    s: s.swords.map(sw => [r(sw.a.x), r(sw.a.y), r(sw.b.x), r(sw.b.y), sw.holder]),
  };
}

/* ---------- the bot ---------- */

// The bot keeps its sword (or runs for a dropped one), closes in with its arms up, swinging in fast arcs at the other
// cat's head, and dashes in and out. It blocks some fast swings coming its way, and now and then grabs the other cat
// from afar and throws them high.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = { t: 0, think: 0, mx: 0, back: 0, block: 0, grab: false });
  st.t += dt;
  if (s.phase !== 'fight' || c.ko) return { ax: c.x + c.face * 40, ay: c.y - 40 };
  const sh = shoulder(c, 1), om = at(o, 0, -40), oh = headAt(o);
  const out = { hit: {}, held: {}, swing: 0.75 + 0.35 * api.skill, ax: om[0], ay: om[1] };
  if (c.reach) { // carrying them: up and over towards the far side, then let go
    const r = c.reach;
    if (r.ph === 'hold') {
      const dir = r.x < W / 2 ? 1 : -1;
      out.ax = r.x + dir * 160;
      out.ay = r.y - 260;
      out.held.e = r.t < 0.5;
    }
    return out;
  }
  if (!canAct(c)) { st.grab = false; return out; }
  if (st.grab) { // charging a grab: keep E down, aim a little ahead of the other cat
    if (c.eOn) {
      out.held.e = true;
      out.ax = om[0] + o.vx * 0.15 * api.skill;
      out.ay = om[1] + o.vy * 0.15 * api.skill;
      return out;
    }
    st.grab = false;
  }
  if (st.block > 0) { st.block -= dt; out.held.e = true; }
  else if (!c.eOn && c.eWait <= 0 && o.hold >= 0 && o.swingT > 0 && !busy(o)) { // a fast swing coming: block it
    const sw = s.swords[o.hold], me = at(c, 0, -40);
    const near = Math.hypot(sw.b.x - me[0], sw.b.y - me[1]), fast = Math.hypot(sw.b.x - sw.b.px, sw.b.y - sw.b.py) * SUB / dt;
    if (near < 130 && fast > HIT_SPEED && Math.random() < 0.04 + 0.1 * api.skill) { out.hit.e = true; out.held.e = true; st.block = BLOCK_MIN; }
  }
  if (c.hold < 0) { // no sword: run for the nearest one (walking over it picks it up), dashing if it's far
    let best = null, bd = Infinity;
    s.swords.forEach(sw => { if (sw.holder < 0) { const d = Math.abs((sw.a.x + sw.b.x) / 2 - c.x); if (d < bd) { bd = d; best = sw; } } });
    if (best) {
      const sx = (best.a.x + best.b.x) / 2;
      out.mx = Math.abs(sx - c.x) > 10 ? Math.sign(sx - c.x) : 0;
      if (bd > 200 && c.dashWait <= 0 && Math.random() < 0.05 * api.skill) out.hit.sh = true;
      return out;
    }
  }
  const dx = o.x - c.x, dist = Math.abs(dx);
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.15 + (1 - api.skill) * 0.3;
    const want = c.hold >= 0 ? 105 : 200;
    st.mx = dist > want + 15 ? Math.sign(dx) : dist < want - 25 ? -Math.sign(dx) : 0;
    if (st.back > 0) st.mx = -Math.sign(dx);
    if (c.dashWait <= 0 && Math.random() < 0.12 * api.skill) {
      if (dist > 160 && dist < 330 && c.hold >= 0) out.hit[dx > 0 ? 'dr' : 'dl'] = true; // (dash in)
      else if (dist < 90) out.hit[dx > 0 ? 'dl' : 'dr'] = true;                            // (dash out)
    }
    if (Math.random() < 0.05) out.hit.a = true;
    const ready = c.eWait <= 0 && c.grabWait <= 0 && !c.eOn && !busy(o);
    if (ready && dist > 180 && dist < GRAB_RANGE - 60 && Math.random() < 0.06 + 0.1 * api.skill) { st.grab = true; out.hit.e = true; out.held.e = true; }
  }
  st.back = Math.max(0, st.back - dt);
  if (o.cool > 0.4) st.back = 0.35 * api.skill; // (after a hit: step back a moment)
  out.mx = st.mx;
  // the swing: arms up when it's close, the hand going round in fast arcs aimed at the other cat's head
  if (c.hold >= 0 && dist < 240) {
    out.held.fire = true;
    const base = Math.atan2(oh[1] - sh[1], oh[0] - sh[0]), w = 7 + 9 * api.skill;
    const ang = base + Math.sin(st.t * w) * 1.3;
    out.ax = sh[0] + Math.cos(ang) * 70;
    out.ay = sh[1] + Math.sin(ang) * 70;
  }
  return out;
}

/* ---------- effects and drawing ---------- */

function event(v, e) {
  if (e.type === 'hit') { v.burst(e.x, e.y, '#fff3b0', 14, 260); v.pop(e.x, e.y - 20, (e.part === 'head' ? 'BONK! −' : 'WHACK! −') + e.dmg, '#ffd23f'); v.shake(e.part === 'head' ? 10 : 7); v.sound([[1400, 0, 0.03], [800, 0.02, 0.06], [300, 0.06, 0.1]]); }
  if (e.type === 'glance') { v.burst(e.x, e.y, '#ffffff', 4, 120); v.pop(e.x, e.y - 16, 'glance', '#cfd6e6'); v.sound([[1800, 0, 0.02], [1200, 0.02, 0.04]]); }
  if (e.type === 'clash') { v.burst(e.x, e.y, '#fff7c2', 18, 320); v.ring(e.x, e.y, '#ffe14d', 16); v.pop(e.x, e.y - 24, 'CLANG!', '#ffe14d'); v.shake(6); v.sound([[2600, 0, 0.03], [1900, 0.02, 0.05], [1300, 0.06, 0.08]]); }
  if (e.type === 'block') { v.burst(e.x, e.y, '#bfe3ff', 14, 280); v.ring(e.x, e.y, '#bfe3ff', 18); v.pop(e.x, e.y - 24, 'BLOCKED!', '#bfe3ff'); v.shake(6); v.sound([[2200, 0, 0.03], [1600, 0.03, 0.05], [900, 0.07, 0.06]]); }
  if (e.type === 'disarm') { v.burst(e.x, e.y, '#ffffff', 10, 220); v.pop(e.x, e.y - 20, 'DISARMED!', '#ff9f43'); v.sound([[1500, 0, 0.03], [700, 0.03, 0.08]]); }
  if (e.type === 'pick') v.sound([[900, 0, 0.04], [1300, 0.04, 0.06]]);
  if (e.type === 'reach') v.sound([[260, 0, 0.05], [520, 0.04, 0.08]]);
  if (e.type === 'catch') { v.ring(e.x, e.y, '#3ddc84', 26); v.pop(e.x, e.y - 40, 'GOTCHA!', '#3ddc84'); v.sound([[600, 0, 0.05], [900, 0.05, 0.08]]); }
  if (e.type === 'throw') { v.pop(e.x, e.y - 30, 'THROW!', '#3ddc84'); v.sound([[400, 0, 0.04], [800, 0.04, 0.08], [1200, 0.1, 0.06]]); }
  if (e.type === 'splat') { v.burst(e.x, e.y + 20, '#c9a77a', 16, 240); v.pop(e.x, e.y - 30, 'SPLAT! −' + e.dmg, '#ff9f43'); v.shake(12); v.sound('boom'); }
  if (e.type === 'land') v.sound([[220, 0, 0.06]]);
  if (e.type === 'jump') v.sound([[500, 0, 0.04]]);
  if (e.type === 'dash') { v.burst(e.x, e.y, '#ffffff', 6, 160); v.sound([[700, 0, 0.04], [480, 0.03, 0.06]]); }
  if (e.type === 'crit') { v.burst(e.x, e.y, '#fff3b0', 26, 360); v.ring(e.x, e.y, '#ff5a5a', 30); v.pop(e.x, e.y - 50, 'CRITICAL HIT!', '#ff5a5a'); v.pop(e.x, e.y - 20, 'Head off!', '#ffd23f'); v.shake(18); v.sound([[300, 0, 0.05], [1600, 0.04, 0.05], [900, 0.08, 0.12]]); }
  if (e.type === 'ko') { v.ring(e.x, e.y, '#ff5a5a', 20); if (!e.head) v.pop(e.x, e.y - 30, 'K.O.!', '#ff5a5a'); v.sound('boom'); v.shake(14); }
  if (e.type === 'draw') v.sound('draw');
}

let bg = null;
function makeBg() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const sky = b.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#ffb36b');
  sky.addColorStop(0.6, '#ff7e8a');
  sky.addColorStop(1, '#7b5cc4');
  b.fillStyle = sky;
  b.fillRect(0, 0, W, GROUND);
  b.fillStyle = 'rgba(255, 240, 200, .8)';
  b.beginPath(); b.arc(720, 150, 48, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#4b3a78'; // far-off castle and hills
  b.beginPath(); b.moveTo(0, GROUND); for (let x = 0; x <= W; x += 30) b.lineTo(x, 380 + Math.sin(x * 0.012) * 26); b.lineTo(W, GROUND); b.fill();
  b.fillStyle = '#3a2c60';
  [[130, 300, 50, 90], [170, 270, 22, 30], [700, 310, 70, 80], [740, 280, 24, 34]].forEach(([x, y, w, h]) => b.fillRect(x, y, w, h));
  b.fillStyle = '#6b4a2f'; // the wooden stage
  b.fillRect(0, GROUND, W, H - GROUND);
  b.fillStyle = '#8a5f3c';
  for (let x = 0; x < W; x += 64) b.fillRect(x, GROUND, 62, 10);
  b.fillStyle = '#5a3d24';
  b.fillRect(0, GROUND - 2, W, 3);
  return c;
}

// A long, floppy arm (a: its points, flat), like the Cat Hoops arms; thinner while stretched out in a grab.
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

function drawSword(v, sw) {
  const g = v.g, [ax, ay, bx, by] = sw;
  const l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
  const hx = ax + ux * 10, hy = ay + uy * 10;
  g.lineCap = 'round';
  g.strokeStyle = '#5a6070'; g.lineWidth = 6; g.beginPath(); g.moveTo(hx, hy); g.lineTo(bx, by); g.stroke();
  g.strokeStyle = '#e8eef8'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(hx, hy); g.lineTo(bx, by); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + uy, hy - ux); g.lineTo(bx + uy, by - ux); g.stroke();
  g.strokeStyle = '#c99a2e'; g.lineWidth = 4; g.beginPath(); g.moveTo(hx - uy * 9, hy + ux * 9); g.lineTo(hx + uy * 9, hy - ux * 9); g.stroke();
  g.strokeStyle = '#6b3d1c'; g.lineWidth = 4; g.beginPath(); g.moveTo(ax, ay); g.lineTo(hx, hy); g.stroke();
}

function drawCat(v, s, c, i) {
  const g = v.g, look = (looks && looks[i]) || v.looks[i], col = v.team[i];
  if (c.ds) { // dashing: speed lines behind
    g.strokeStyle = 'rgba(255, 255, 255, .8)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath();
    for (const [dy, len] of [[-70, 34], [-46, 48], [-22, 30]]) { g.moveTo(c.x - c.ds * 30, c.y + dy); g.lineTo(c.x - c.ds * (30 + len), c.y + dy); }
    g.stroke();
  }
  const [bx, by] = at(c, 8, -45);
  if (c.b) { // blocking: a shield of light in front
    const a0 = c.face > 0 ? 0 : Math.PI;
    g.fillStyle = col.light; g.globalAlpha = 0.18; g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, 62, a0 - 1.1, a0 + 1.1); g.closePath(); g.fill();
    g.strokeStyle = col.light; g.globalAlpha = 0.85; g.lineWidth = 5; g.beginPath(); g.arc(bx, by, 62, a0 - 1.1, a0 + 1.1); g.stroke();
    g.globalAlpha = 1;
  }
  drawArm(g, c.ar[0], look.fur);
  if (c.hd) { // its head came off: the body without it (a clean, flat cut), and the head on its own
    g.save();
    g.translate(c.x, c.y);
    g.rotate(c.tilt);
    g.save();
    g.beginPath(); g.rect(-70, NECK, 140, 90); g.clip();
    g.rotate(-c.tilt);
    g.translate(-c.x, -c.y);
    F.drawBody(g, look, c.x, c.y, { tilt: c.tilt, lookRight: c.face > 0 });
    g.restore();
    neckCap(g, 0, NECK);
    g.restore();
  } else F.drawBody(g, look, c.x, c.y, { tilt: c.tilt, lookRight: c.face > 0, squash: c.sq, alpha: c.cl && !c.ko ? 0.75 : 1 });
  if (c.h >= 0 && s.s[c.h]) drawSword(v, s.s[c.h]);
  drawArm(g, c.ar[1], look.fur);
  if (c.hd) {
    g.save();
    g.translate(c.hd[0], c.hd[1]);
    g.rotate(c.hd[2]);
    g.save();
    g.beginPath(); g.rect(-70, -70, 140, 70 + NECK - HEAD_Y); g.clip();
    F.drawBody(g, look, 0, -HEAD_Y, { lookRight: c.face > 0 });
    g.restore();
    neckCap(g, 0, NECK - HEAD_Y);
    g.restore();
    return; // (no health bar or name over a headless cat)
  }
  const hd = at(c, 0, -92);
  if (c.z || c.ko) { // dizzy (or knocked out): stars going round the head
    g.fillStyle = '#ffe14d';
    for (let k = 0; k < 3; k++) { const a = v.now / 200 + k * 2.1; v.star(hd[0] + Math.cos(a) * 24, hd[1] + Math.sin(a) * 7, 6); }
  }
  if (c.g > 0.38) { // charging a grab: a ring filling up
    g.strokeStyle = '#3ddc84'; g.lineWidth = 4;
    g.beginPath(); g.arc(bx, by, 74, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.g); g.stroke();
    v.label('✋', bx, by - 90, 16, '#3ddc84');
  }
  // the health bar and the name, above the head
  const hx = c.x, hy = Math.min(c.y - 112, hd[1] - 14);
  g.fillStyle = 'rgba(20, 10, 30, .7)'; v.roundRect(hx - 32, hy - 6, 64, 12, 6); g.fill();
  g.fillStyle = c.hp > 50 ? '#3ddc84' : c.hp > 25 ? '#ffd23f' : '#ff5a5a';
  if (c.hp > 0) { v.roundRect(hx - 30, hy - 4, 60 * c.hp / HP, 8, 4); g.fill(); }
  v.label(i === v.me ? 'You' : v.names[i], hx, hy - 16, 12, i === v.me ? '#ffd23f' : '#ffffff');
}

// Where a head came off: a flat, cartoon cut (no blood).
function neckCap(g, x, y) {
  g.fillStyle = '#ffe9cf';
  g.strokeStyle = '#e8c39b';
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); g.fill(); g.stroke();
}

// The dotted path a carried cat would fly along if they were let go now.
function drawThrowPath(v, c, tv) {
  const g = v.g, h = 1 / 120;
  let [x, y] = at(c, 0, -40), vx = tv[0], vy = tv[1];
  g.fillStyle = '#3ddc84';
  for (let k = 1; k <= 200; k++) {
    vy += G * h;
    x += vx * h;
    y += vy * h;
    if (y < TOP - 40) { y = TOP - 40; vy = 0; } // (the top of the screen)
    if (y > GROUND - 40 || x < EDGE || x > W - EDGE || CA.camWalls.inWall(x, y, 40)) break;
    if (k % 6 === 0) v.dot(x, y, 3);
  }
}

function draw(v, s) {
  const g = v.g;
  if (!bg) bg = makeBg();
  g.drawImage(bg, 0, 0, W, H);
  s.s.forEach(sw => { if (sw[4] < 0) drawSword(v, sw); });
  s.c.forEach((c, i) => { if (c.rp === 2 && s.c[1 - i]) drawThrowPath(v, s.c[1 - i], c.tv); });
  s.c.forEach((c, i) => drawCat(v, s, c, i));
  v.label('🤺 ' + v.names[0] + ' ' + s.w[0] + ' – ' + s.w[1] + ' ' + v.names[1] + '  ·  Round ' + s.rd + '  ·  ⏱ ' + Math.max(0, ROUND - s.t), W / 2, 22, 15, '#ffffff');
  if (s.ph === 'pause') v.bigText(s.rw < 0 ? 'Time! A draw' : s.rw === v.me ? 'You win the round!' : v.names[s.rw] + ' wins the round!', 110, 34, '#ffd23f', 1);
  const mine = s.c[v.me];
  if (!mine || s.ph !== 'fight') return;
  // under your cat: is the block ready (🛡️), and the grab (✋)? Each fills up while it cools down.
  [[-16, '🛡️', mine.w, BLOCK_WAIT], [16, '✋', mine.gw, GRAB_WAIT]].forEach(([dx, icon, wait, full]) => {
    const ex = mine.x + dx, ey = GROUND + 30, ready = wait <= 0 && !mine.rp;
    g.fillStyle = 'rgba(20, 10, 30, .55)'; v.dot(ex, ey, 13);
    g.fillStyle = ready ? '#3ddc84' : '#8a8aa0';
    g.beginPath(); g.moveTo(ex, ey); g.arc(ex, ey, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (ready ? 1 : 1 - Math.min(1, wait / full))); g.closePath(); g.fill();
    v.label(icon, ex, ey + 1, 12, '#ffffff');
  });
  if (mine.sh) v.msg("You've been grabbed! Hang on…", true);
  else if (mine.rp === 2) v.msg('Move the mouse to swing them through the air · let go of E to throw!');
  else if (mine.z) v.msg('Dizzy!', true);
  else if (mine.h < 0 && !mine.rp) v.msg('Walk over your sword to pick it back up!');
}

})();
