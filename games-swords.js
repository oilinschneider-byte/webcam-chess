/* Classic Games: Floppy Sword Cats. Two cats built like the Cat Hoops cats (see games-floppy.js): a solid body on
   normal legs, and very long, floppy arms. Each starts with a sword (a dropped one is picked up again by walking over
   it). The arms just flop about (the hands drag along the floor) until you hold the mouse button: then they lift up
   and the sword hand reaches for the mouse pointer (springy, and only so fast, so you really swing). Only a direct
   hit counts: the outer part of the blade moving fast, straight into them (a slow or sliding touch just glances off).
   How much a direct hit does depends on the hitter's power level (see below): in base form only a little (11 to the
   head, 6 to the body, and a hit on the sword arm rarely knocks the sword out), at level 2 a lot (36, 22, and always). Swords that meet clank and knock both cats back. Out of health is a K.O. First to 2 rounds. Now
   and then, a direct hit on a cat with very little health left is a critical hit: its head pops right off (cartoon
   style, no blood) and bounces away, and that's the round.

   Moving is quick: A and D run, W or Space jumps, and Shift (or A or D twice, fast) dashes, once in the air too.
   E blocks for a moment (then it needs a short rest): a blocked blade bounces back, flinging the arm holding it back
   (it goes floppy for a moment) and pushing that cat back. Keep holding E and the cat powers up, standing still, in
   flames: a few seconds to level 1 (gold flames), a few more to level 2 (blue and purple, crackling). A hit while
   powering up stops it. Each level hits much harder, and at level 2, Q (or right-click) fires a plasma cannon toward
   the mouse pointer (then 20 seconds to recharge): a hit takes 75 of their 100 health, and if that finishes them,
   they turn to dust. Levels last for the round.

   The arms (chains of points) and the swords swing with gravity and springs (Verlet physics). A hit is checked along
   the whole path a blade swept since the last step, so a fast swing can't pass through. The host's app runs all of
   it (see games-duel.js). */
(() => {
'use strict';

const F = CA.floppy;
const W = 960, H = 540, GROUND = 468;
const G = 2100, AG = 1600;                         // gravity for the cats, and for their arms and the swords
const SUB = 2;                                     // physics steps per game step
const WALK = 260, ACCEL = 2600, AIR_ACCEL = 1400, JUMP = 1000;
const DASH_SPEED = 820, DASH_TIME = 0.16, DASH_WAIT = 0.55;
const EDGE = 28, TOP = 95;                         // how near the walls a cat can go; how high its feet can go (head at the top of the screen)
const SH_X = 12.4, SH_Y = 33;                      // the shoulders, from the feet (as in games-floppy.js)
const ARM_N = 7, ARM_SEG = 11;                     // each arm: 7 floppy pieces (77 px: hanging down, the hands drag on the floor)
const SWORD = 66, REACH = 72, HAND_MAX = 14;        // sword length; how far the hand reaches; how far it can move a substep
const HIT_SPEED = 480, SWEET = 0.3, CLASH_SPEED = 150; // a direct hit: the blade (not its inner 30%) going this fast (px/s) straight into them; swords clank this fast
const HP = 100, HEAD_DMG = 34, BODY_DMG = 20, SPLAT_DMG = 15;
const CRIT_HP = 30, CRIT_HEAD = 0.4, CRIT_BODY = 0.2; // a critical hit: only on a cat this low on health, this often (head, body)
const NECK = -36, HEAD_Y = -56;                    // where the head meets the body, and the head's middle (from the feet)
const BLOCK_MIN = 0.35, BLOCK_WAIT = 1, CHARGE = 0.9; // a tap of E blocks this long; then a rest; hold E this long to start powering up
const RECOIL = 0.45;                               // how long a blocked (or clashed) cat's arms stay floppy after bouncing back
// Powering up (hold E): base form, level 1 and level 2. Each level hits harder and knocks swords out of hands more often.
const POWER_T = [2.6, 3.4];                        // how long you hold E (standing still) to reach level 1, then level 2
const LV_DMG = [[11, 6], [24, 14], [36, 22]];      // [head, body] damage in each form
const LV_DISARM = [0.15, 0.6, 1];                  // how often a direct hit on the sword arm knocks the sword out
const LV_SPEED = [1, 1.08, 1.16];                  // a powered-up cat moves a little faster
const PLASMA_SPEED = 820, PLASMA_R = 24, PLASMA_DMG = 75, PLASMA_WAIT = 20; // level 2's plasma cannon (Q or right-click)
const PICK_WAIT = 0.6, SPLAT = 650;                // a dropped sword can't be picked up at once; a landing this fast (px/s) is a splat
const WIN = 2, ROUND = 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
let looks = null;                                  // each player's cat picture without its arms (those are drawn separately)

CA.games.add('swords', {
  name: 'Floppy Sword Cats', icon: '🤺',
  blurb: 'Long floppy arms and a sword each! Hold the mouse button to lift your sword and swing at the mouse pointer. Only direct hits count. Tap E to block. HOLD E to power up: level 1, then level 2, each hitting much harder (flames and all). At level 2, Q (or right-click) fires a plasma cannon that takes 3/4 of their health! Shift dashes.',
  start(ctx) {
    looks = [];
    looks[ctx.isHost ? 0 : 1] = { pics: F.pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
    looks[ctx.isHost ? 1 : 0] = { pics: F.pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };
    CA.duel.run(ctx, {
      id: 'swords', mouse: true, doubleTap: true, keys: { KeyE: 'e', KeyQ: 'q', ShiftLeft: 'sh', ShiftRight: 'sh' }, letters: { e: 'e', q: 'q' },
      jump: 120, angles: ['tilt'],
      pad: { stick: true, buttons: [{ k: 'e', label: '🛡️ Block · hold: Power up' }, { k: 'q', label: '💥 Plasma' }, { k: 'sh', label: '💨 Dash' }, { k: 'a', label: '⤒ Jump', main: true }] },
      help: 'A/D run · W or Space jump · Shift dash · hold the mouse to swing · tap E block · HOLD E to power up · level 2: Q or right-click fires plasma',
      helpTouch: 'Stick runs · drag on the arena to swing · Block (hold: power up) · Plasma at level 2 · Dash · Jump',
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
    eOn: false, eT: 0, eWait: 0,                  // E: down (blocking) and for how long; its rest
    lv: 0, pow: false, powT: 0, plasmaWait: 0, dust: false, // power level (0 base, 1, 2); powering up now (holding E), for how long; the cannon's cooldown; turned to dust
    reach: null, caught: -1, fly: false, flyT: 0, dizzy: 0, // (the old long grab: no longer used); who's carrying this cat; flying; dizzy
    head: null,                                   // after a critical hit: the head, bouncing away on its own
    sta: 1, tired: false,                         // stamina: raising the sword, dashing and blocking use it up; resting fills it
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
  const s = { wins: [0, 0], round: 0, t: 0, phase: 'fight', pause: 0, rw: -1, cats: [], swords: [], clashAt: 0, shots: [] };
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
  s.shots = [];
  s.swords = s.cats.map((c, i) => { // each cat starts with a sword in its front hand, the blade on the floor
    const hand = c.arms[1][ARM_N], bx = hand.x + c.face * SWORD;
    c.hold = i;
    return { a: { x: hand.x, y: hand.y, px: hand.x, py: hand.y }, b: { x: bx, y: GROUND - 3, px: bx, py: GROUND - 3 }, holder: i, last: null };
  });
  if (api) api.note('Round ' + s.round + ' · first to ' + WIN);
}

// (a cat that's grabbing, being carried, flying through the air, dizzy or knocked out can't do anything else)
const busy = c => c.ko || c.pow || !!c.reach || c.caught >= 0 || c.fly || c.dizzy > 0;
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
  if (c.caught >= 0) return;
  const free = canAct(c);
  if (c.dashT > 0) {
    c.dashT -= h;
    c.vx = c.dashDir * DASH_SPEED;
    if (!c.ground) c.vy = Math.min(c.vy, 0);
    if (c.dashT <= 0) c.vx = c.dashDir * 300; // (it stops sharply)
  } else if (!c.fly) {
    const want = free && !c.reach ? n.mx * WALK * LV_SPEED[c.lv] * (c.eOn ? 0.5 : 1) : 0;
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
  if (v.pow) { v.pow = false; v.powT = 0; api.ev('fizzle', { x: v.x, y: v.y - 60 }); } // (a hit stops a power-up)
  if (hit.part === 'arm') {
    if (Math.random() < LV_DISARM[me.lv]) { dropSword(s, v, dir); v.cool = 0.3; api.ev('disarm', { x: hit.x, y: hit.y }); }
    else { v.cool = 0.25; v.vx += dir * 160; api.ev('glance', { x: hit.x, y: hit.y }); }
    return;
  }
  if (me.lv > 0 && v.hp <= CRIT_HP && Math.random() < (hit.part === 'head' ? CRIT_HEAD : CRIT_BODY)) { // a critical hit (powered up only): off comes the head
    const [hx, hy] = headAt(v);
    v.hp = 0;
    v.head = { x: hx, y: hy, vx: dir * (220 + Math.random() * 140), vy: -560, a: v.tilt, va: dir * 11 };
    api.ev('crit', { x: hx, y: hy });
    koCat(s, vi, api, dir);
    return;
  }
  const dmg = LV_DMG[me.lv][hit.part === 'head' ? 0 : 1];
  const kick = 0.6 + 0.3 * me.lv; // (a base-form hit barely moves them; a level 2 hit sends them flying)
  v.hp = Math.max(0, v.hp - dmg);
  v.cool = 0.45;
  v.stun = 0.15 + 0.12 * me.lv;
  v.eOn = false;
  v.dashT = 0;
  v.vx = dir * (hit.part === 'head' ? 380 : 300) * kick;
  v.vy = -280 * kick;
  v.ground = false;
  api.ev('hit', { x: hit.x, y: hit.y, part: hit.part, dmg, lv: me.lv });
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
  c.pow = false;
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
  dropSword(s, c, dir); // (a hard landing hurts and drops the sword, but doesn't leave the cat dizzy)
  c.hp = Math.max(0, c.hp - SPLAT_DMG);
  api.ev('splat', { x: c.x, y: c.y - 30, dmg: SPLAT_DMG });
  if (c.hp <= 0 && s.phase === 'fight') koCat(s, i, api, dir);
}

/* ---------- each step ---------- */

function step(s, inp, dt, api) {
  if (s.phase === 'pause') {
    s.pause -= dt;
    const still = inp.map(n => Object.assign({}, n, { mx: 0, held: {}, hit: {} }));
    s.cats.forEach(c => tick(c, dt));
    physics(s, still, dt, api);
    if (s.pause <= 0) {
      if (s.over != null) { api.end(s.over, 'K.O.!'); return; }
      if (s.round >= 6) { api.end(s.wins[0] === s.wins[1] ? -1 : s.wins[0] > s.wins[1] ? 0 : 1, 'TIME!'); return; } // (too many drawn rounds)
      newRound(s, api);
    }
    return;
  }
  s.t += dt;
  // Stamina: swinging (arms up), dashing and blocking tire a cat out. Out of stamina, it can't lift the sword, dash or block
  // until it has rested a little: no button mashing.
  s.cats.forEach((c, i) => {
    const n = inp[i];
    if (c.ko) return;
    if (c.tired) {
      if (c.sta >= 0.35) c.tired = false;
      else inp[i] = Object.assign({}, n, { held: Object.assign({}, n.held, { fire: false }), hit: Object.assign({}, n.hit, { dl: false, dr: false, sh: false, e: false }) });
    }
    const m = inp[i], up = !!m.held.fire && canAct(c);
    if (up) c.sta -= 0.2 * dt;
    if ((m.hit.dl || m.hit.dr || m.hit.sh) && c.dashWait <= 0) c.sta -= 0.16;
    if (m.hit.e && !c.eOn && c.eWait <= 0) c.sta -= 0.18;
    if (!up && !c.eOn && !c.tired) c.sta += 0.4 * dt; else if (c.tired) c.sta += 0.3 * dt;
    c.sta = Math.max(0, Math.min(1, c.sta));
    if (c.sta <= 0 && !c.tired) { c.tired = true; api.ev('tired', { x: c.x, y: c.y - 60 }); }
  });
  s.cats.forEach((c, i) => {
    const n = inp[i];
    tick(c, dt);
    c.swingT = n.held.fire && canAct(c) && !c.eOn && c.recoil <= 0 ? 0.3 : Math.max(0, c.swingT - dt);
    if (c.ko) return;
    // holding E (after a moment): powering up, standing still. Keep holding to reach level 1, then level 2. Let go to stop.
    if (c.pow) {
      if (!n.held.e) { c.pow = false; c.powT = 0; c.eWait = BLOCK_WAIT * 0.5; }
      else {
        c.powT += dt;
        if (c.powT >= POWER_T[c.lv]) {
          c.lv++;
          c.powT = 0;
          if (c.lv >= 2) c.pow = false;
          api.ev('super', { x: c.x, y: c.y - 50, lv: c.lv });
        }
      }
      return;
    }
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
    // E: a tap blocks for a moment (then it needs a rest); keep holding it and the cat starts powering up
    if (n.hit.e && !c.eOn && c.eWait <= 0) { c.eOn = true; c.eT = 0; }
    if (c.eOn) {
      c.eT += dt;
      if (n.held.e && c.eT >= CHARGE) { c.eOn = false; if (c.lv < 2) { c.pow = true; c.powT = 0; api.ev('charge', { x: c.x, y: c.y - 50 }); } else c.eWait = BLOCK_WAIT; } // (at level 2 already: just a block)
      else if (!n.held.e && c.eT >= BLOCK_MIN) { c.eOn = false; c.eWait = BLOCK_WAIT; }
    }
    // level 2: Q (or right-click) fires the plasma cannon
    if ((n.hit.q || n.hit.alt) && c.lv >= 2 && c.plasmaWait <= 0) firePlasma(s, c, i, n, api);
    if (c.hold < 0 && c.pickWait <= 0 && !c.reach) pickUp(s, c, i, api);
  });
  physics(s, inp, dt, api);
  checkHits(s, dt, api);
  stepShots(s, dt, api);
  if (s.t >= ROUND && s.phase === 'fight') { // time: whoever has more health left wins the round
    const [a, b] = s.cats;
    if (a.hp !== b.hp) koCat(s, a.hp < b.hp ? 0 : 1, api, a.hp < b.hp ? -1 : 1);
    else { s.phase = 'pause'; s.pause = 2; s.rw = -1; api.ev('draw', {}); }
  }
}

function tick(c, dt) {
  for (const k of ['cool', 'stun', 'dashWait', 'pickWait', 'eWait', 'plasmaWait', 'recoil', 'dizzy']) c[k] = Math.max(0, c[k] - dt);
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

/* ---------- level 2's plasma cannon ---------- */

// A big ball of plasma flies from the chest towards the mouse pointer (and kicks the cat back a little).
function firePlasma(s, c, i, n, api) {
  const [x, y] = at(c, 14, -46);
  let dx = n.ax - x, dy = n.ay - y;
  const l = Math.hypot(dx, dy);
  if (l < 1) { dx = c.face; dy = 0; } else { dx /= l; dy /= l; }
  c.face = dx >= 0 ? 1 : -1;
  s.shots.push({ x, y, vx: dx * PLASMA_SPEED, vy: dy * PLASMA_SPEED, o: i, t: 0 });
  c.plasmaWait = PLASMA_WAIT;
  c.vx -= dx * 260;
  api.ev('plasma', { x, y });
}

// The plasma balls: a hit takes 3/4 of their health (blocking doesn't help); one that finishes them off turns them to dust.
function stepShots(s, dt, api) {
  for (let k = s.shots.length - 1; k >= 0; k--) {
    const p = s.shots[k], vi = 1 - p.o, v = s.cats[vi];
    p.t += dt;
    const x0 = p.x, y0 = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    let hit = false;
    if (!v.ko && s.phase === 'fight') {
      for (const z of zones(v)) {
        if (z.part === 'arm') continue;
        if (segDist(x0, y0, p.x, p.y, z.a[0], z.a[1], z.b[0], z.b[1]) < z.r + PLASMA_R) { hit = true; break; }
      }
    }
    if (hit) {
      const dir = Math.sign(p.vx) || 1;
      s.shots.splice(k, 1);
      v.pow = false;
      v.hp = Math.max(0, v.hp - PLASMA_DMG);
      api.ev('blast', { x: p.x, y: p.y, dmg: PLASMA_DMG });
      if (v.hp <= 0) {
        v.dust = true;
        dropSword(s, v, dir);
        api.ev('dust', { x: v.x, y: v.y - 45 });
        koCat(s, vi, api, dir);
        v.vx = v.vy = 0;
      } else {
        v.stun = 0.6;
        v.cool = 0.6;
        v.vx = dir * 700;
        v.vy = -420;
        v.ground = false;
        dropSword(s, v, dir);
      }
      continue;
    }
    if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > GROUND - 6 || CA.camWalls.inWall(p.x, p.y, 10) || p.t > 3) {
      s.shots.splice(k, 1);
      api.ev('pop', { x: clamp(p.x, 0, W), y: Math.min(p.y, GROUND - 10) });
    }
  }
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
      ko: c.ko ? 1 : 0, cl: c.cool > 0 ? 1 : 0, b: c.eOn ? 1 : 0, g: c.eOn && c.lv < 2 ? Math.round(Math.min(1, c.eT / CHARGE) * 20) / 20 : 0,
      sa: Math.round(c.sta * 20) / 20, td: c.tired ? 1 : 0, w: Math.round(c.eWait * 10) / 10, pl: Math.round(c.plasmaWait * 10) / 10, lv: c.lv, pw: c.pow ? Math.round(c.powT / POWER_T[c.lv] * 20) / 20 : -1, du: c.dust ? 1 : 0, z: c.dizzy > 0 ? 1 : 0, sh: c.caught >= 0 ? 1 : 0, ds: c.dashT > 0 ? c.dashDir : 0,
      hd: c.head ? [r(c.head.x), r(c.head.y), Math.round(c.head.a * 100) / 100] : 0,
    })),
    s: s.swords.map(sw => [r(sw.a.x), r(sw.a.y), r(sw.b.x), r(sw.b.y), sw.holder]),
    p: s.shots.map(p => [r(p.x), r(p.y), Math.round(Math.atan2(p.vy, p.vx) * 100) / 100]),
  };
}

/* ---------- the bot ---------- */

// The bot keeps its sword (or runs for a dropped one), closes in with its arms up, swinging in fast arcs at the other
// cat's head, and dashes in and out. It blocks some fast swings coming its way. When the other cat is far away it
// sometimes powers up (holding E), and at level 2 it fires the plasma cannon now and then.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = { t: 0, think: 0, mx: 0, back: 0, block: 0, power: false });
  st.t += dt;
  if (s.phase !== 'fight' || c.ko) return { ax: c.x + c.face * 40, ay: c.y - 40 };
  const sh = shoulder(c, 1), om = at(o, 0, -40), oh = headAt(o);
  const out = { hit: {}, held: {}, swing: 0.75 + 0.35 * api.skill, ax: om[0], ay: om[1] };
  // powering up: keep holding E (until the level goes up, or the other cat comes close)
  if (c.pow) {
    if (Math.abs(o.x - c.x) > 170 && !busy(o) || o.ko) out.held.e = true;
    return out;
  }
  if (st.power) {
    if (c.eOn) { out.held.e = true; return out; }
    st.power = false;
  }
  if (!canAct(c)) return out;
  // level 2: fire the plasma cannon at them now and then (a better bot leads its shot)
  if (c.lv >= 2 && c.plasmaWait <= 0 && !o.ko && Math.random() < 0.02 + 0.03 * api.skill) {
    const t = at(o, 0, -40);
    out.ax = t[0] + o.vx * 0.25 * api.skill;
    out.ay = t[1];
    out.hit.q = true;
    return out;
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
    if (c.lv < 2 && c.eWait <= 0 && !c.eOn && dist > 300 && Math.random() < 0.08 + 0.12 * api.skill) { st.power = true; out.hit.e = true; out.held.e = true; }
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
  if (e.type === 'tired') { v.pop(e.x, e.y, 'Out of breath!', '#ff9a9a'); v.sound('miss'); }
  if (e.type === 'hit') { v.burst(e.x, e.y, '#fff3b0', 14, 260); v.pop(e.x, e.y - 20, (e.part === 'head' ? 'BONK! −' : 'WHACK! −') + e.dmg, '#ffd23f'); v.shake((e.part === 'head' ? 10 : 7) * (0.5 + 0.35 * (e.lv || 0))); v.sound([[1400, 0, 0.03], [800, 0.02, 0.06], [300, 0.06, 0.1]]); }
  if (e.type === 'glance') { v.burst(e.x, e.y, '#ffffff', 4, 120); v.pop(e.x, e.y - 16, 'glance', '#cfd6e6'); v.sound([[1800, 0, 0.02], [1200, 0.02, 0.04]]); }
  if (e.type === 'clash') { v.burst(e.x, e.y, '#fff7c2', 18, 320); v.ring(e.x, e.y, '#ffe14d', 16); v.pop(e.x, e.y - 24, 'CLANG!', '#ffe14d'); v.shake(6); v.sound([[2600, 0, 0.03], [1900, 0.02, 0.05], [1300, 0.06, 0.08]]); }
  if (e.type === 'block') { v.burst(e.x, e.y, '#bfe3ff', 14, 280); v.ring(e.x, e.y, '#bfe3ff', 18); v.pop(e.x, e.y - 24, 'BLOCKED!', '#bfe3ff'); v.shake(6); v.sound([[2200, 0, 0.03], [1600, 0.03, 0.05], [900, 0.07, 0.06]]); }
  if (e.type === 'disarm') { v.burst(e.x, e.y, '#ffffff', 10, 220); v.pop(e.x, e.y - 20, 'DISARMED!', '#ff9f43'); v.sound([[1500, 0, 0.03], [700, 0.03, 0.08]]); }
  if (e.type === 'pick') v.sound([[900, 0, 0.04], [1300, 0.04, 0.06]]);
  if (e.type === 'charge') v.sound([[180, 0, 0.12], [240, 0.1, 0.12]]);
  if (e.type === 'super') { // a level up: a burst of flames, a ring and a big word
    const col = e.lv === 2 ? '#5ad1ff' : '#ffd23f';
    v.burst(e.x, e.y, col, 40, 420); v.ring(e.x, e.y, col, 40); v.ring(e.x, e.y, '#ffffff', 24);
    v.pop(e.x, e.y - 70, e.lv === 2 ? '⚡ LEVEL 2! ⚡' : '🔥 LEVEL 1! 🔥', col);
    v.shake(e.lv === 2 ? 16 : 10);
    v.sound(e.lv === 2 ? [[220, 0, 0.1], [440, 0.08, 0.1], [880, 0.16, 0.12], [1320, 0.26, 0.2]] : [[260, 0, 0.1], [520, 0.08, 0.1], [780, 0.16, 0.18]]);
  }
  if (e.type === 'fizzle') { v.pop(e.x, e.y, 'Power-up stopped!', '#ff9a9a'); v.sound([[300, 0, 0.06], [180, 0.05, 0.1]]); }
  if (e.type === 'plasma') { v.burst(e.x, e.y, '#5ad1ff', 18, 300); v.shake(8); v.sound([[120, 0, 0.18], [900, 0.02, 0.1], [600, 0.1, 0.2]]); }
  if (e.type === 'blast') { v.burst(e.x, e.y, '#5ad1ff', 40, 460); v.burst(e.x, e.y, '#ffffff', 20, 300); v.ring(e.x, e.y, '#a35bff', 50); v.pop(e.x, e.y - 40, 'PLASMA! −' + e.dmg, '#5ad1ff'); v.shake(22); v.sound('boom'); }
  if (e.type === 'pop') { v.burst(e.x, e.y, '#5ad1ff', 16, 240); v.sound([[300, 0, 0.08]]); }
  if (e.type === 'dust') { // turned to dust: lots of grey bits drifting away
    v.burst(e.x, e.y, '#a8a29a', 60, 260); v.burst(e.x, e.y - 30, '#7d776f', 40, 180); v.burst(e.x, e.y + 20, '#d8d2c8', 30, 140);
    v.pop(e.x, e.y - 60, 'TURNED TO DUST!', '#d8d2c8');
    v.sound([[200, 0, 0.3], [140, 0.2, 0.4]]);
  }
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
  if (c.pw >= 0) { // powering up: a ring filling up toward the next level
    g.strokeStyle = c.lv ? '#5ad1ff' : '#ffd23f'; g.lineWidth = 5;
    g.beginPath(); g.arc(bx, by, 76, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.pw); g.stroke();
  }
  if (c.lv) v.label(c.lv === 2 ? '⚡ LEVEL 2' : '🔥 LEVEL 1', c.x, Math.min(c.y - 112, hd[1] - 14) - 30, 12, c.lv === 2 ? '#5ad1ff' : '#ffd23f');
  // the health bar and the name, above the head
  const hx = c.x, hy = Math.min(c.y - 112, hd[1] - 14);
  g.fillStyle = 'rgba(20, 10, 30, .7)'; v.roundRect(hx - 32, hy - 6, 64, 12, 6); g.fill();
  g.fillStyle = c.hp > 50 ? '#3ddc84' : c.hp > 25 ? '#ffd23f' : '#ff5a5a';
  if (c.hp > 0) { v.roundRect(hx - 30, hy - 4, 60 * c.hp / HP, 8, 4); g.fill(); }
  g.fillStyle = 'rgba(20, 10, 30, .7)'; v.roundRect(hx - 32, hy + 8, 64, 8, 4); g.fill(); // the stamina bar (red while the cat is worn out)
  g.fillStyle = c.td ? '#ff5a5a' : '#6ec3ff';
  v.roundRect(hx - 30, hy + 10, Math.max(2, 60 * c.sa), 4, 2); g.fill();
  v.label(i === v.me ? 'You' : v.names[i], hx, hy - 16, 12, i === v.me ? '#ffd23f' : '#ffffff');
}

// Where a head came off: a flat, cartoon cut (no blood).
function neckCap(g, x, y) {
  g.fillStyle = '#ffe9cf';
  g.strokeStyle = '#e8c39b';
  g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(x, y, 10, 4, 0, 0, Math.PI * 2); g.fill(); g.stroke();
}

// The flame aura around a powered-up cat: gold at level 1, blue and purple at level 2. While powering up, it flickers
// white and grows as the next level comes closer.
const AURA = [null, ['#fff3a0', '#ffd23f', '#ff8a1f'], ['#e6f6ff', '#5ad1ff', '#a35bff']];
function drawAura(v, c) {
  const g = v.g, charging = c.pw >= 0;
  if (!c.lv && !charging) return;
  const lvl = charging ? Math.min(2, c.lv + 1) : c.lv;
  const cols = AURA[lvl], k = charging ? 0.45 + 0.55 * c.pw : 1, t = v.now / 1000;
  const [cx, cy] = at(c, 0, -46);
  g.save();
  g.globalCompositeOperation = 'lighter';
  // a glow, then flames licking upward around the body
  g.globalAlpha = (charging ? 0.25 + 0.2 * Math.random() : 0.3) * k;
  g.fillStyle = cols[1];
  v.dot(cx, cy, 70 * k + (lvl === 2 ? 10 : 0));
  g.globalCompositeOperation = 'source-over'; // (the flames keep their colors, even on the bright sky)
  const n = lvl === 2 ? 14 : 10;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2, wob = Math.sin(t * 9 + f * 1.7), r = 46 + 10 * Math.sin(t * 5 + f);
    const bx = cx + Math.cos(a) * r, by = cy + Math.sin(a) * r * 0.8 + 30;
    const hgt = (70 + 40 * Math.abs(Math.sin(t * 7 + f * 2.3))) * k * (lvl === 2 ? 1.3 : 1);
    g.globalAlpha = 0.7 * k;
    g.fillStyle = cols[f % 3 === 0 ? 0 : f % 3 === 1 ? 1 : 2];
    g.beginPath();
    g.moveTo(bx - 14, by);
    g.quadraticCurveTo(bx - 16 + wob * 8, by - hgt * 0.5, bx + wob * 12, by - hgt);
    g.quadraticCurveTo(bx + 16 + wob * 8, by - hgt * 0.5, bx + 14, by);
    g.closePath();
    g.fill();
  }
  if (lvl === 2 && !charging) { // level 2: crackling sparks
    g.strokeStyle = '#d6f4ff';
    g.lineWidth = 2;
    g.globalAlpha = 0.9;
    for (let z = 0; z < 2; z++) {
      if (Math.random() < 0.5) continue;
      let x = cx + (Math.random() - 0.5) * 80, y = cy - 50 + Math.random() * 30;
      g.beginPath(); g.moveTo(x, y);
      for (let q = 0; q < 4; q++) { x += (Math.random() - 0.5) * 22; y += 12 + Math.random() * 10; g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.restore();
}

// A ball of plasma, with a tail behind it.
function drawPlasma(v, p) {
  const g = v.g, [x, y, a] = p;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let k = 5; k >= 1; k--) {
    g.globalAlpha = 0.12 * k;
    g.fillStyle = k > 3 ? '#a35bff' : '#5ad1ff';
    v.dot(x - Math.cos(a) * k * 14, y - Math.sin(a) * k * 14, PLASMA_R * (0.5 + k * 0.12));
  }
  g.globalAlpha = 0.5 + Math.random() * 0.3;
  g.fillStyle = '#5ad1ff';
  v.dot(x, y, PLASMA_R + 6);
  g.globalAlpha = 1;
  g.fillStyle = '#ffffff';
  v.dot(x, y, PLASMA_R * 0.55);
  g.restore();
}

// A cat that was turned to dust: a little grey pile where it stood.
function drawDust(v, c) {
  const g = v.g;
  g.fillStyle = '#9a948c';
  g.beginPath(); g.ellipse(c.x, GROUND - 3, 34, 9, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#7d776f';
  for (let k = 0; k < 7; k++) v.dot(c.x - 28 + k * 9, GROUND - 4 - (k % 3) * 2, 3);
}

function draw(v, s) {
  const g = v.g;
  if (!bg) bg = makeBg();
  g.drawImage(bg, 0, 0, W, H);
  s.s.forEach(sw => { if (sw[4] < 0) drawSword(v, sw); });
  s.c.forEach(c => { if (!c.du) drawAura(v, c); });
  s.c.forEach((c, i) => (c.du ? drawDust(v, c) : drawCat(v, s, c, i)));
  (s.p || []).forEach(p => drawPlasma(v, p));
  v.label('🤺 ' + v.names[0] + ' ' + s.w[0] + ' – ' + s.w[1] + ' ' + v.names[1] + '  ·  Round ' + s.rd + '  ·  ⏱ ' + Math.max(0, ROUND - s.t), W / 2, 22, 15, '#ffffff');
  if (s.ph === 'pause') v.bigText(s.rw < 0 ? 'Time! A draw' : s.rw === v.me ? 'You win the round!' : v.names[s.rw] + ' wins the round!', 110, 34, '#ffd23f', 1);
  const mine = s.c[v.me];
  if (!mine || s.ph !== 'fight') return;
  // under your cat: is the block ready (🛡️), and at level 2 the plasma cannon (💥)? Each fills up while it cools down.
  const icons = [[-16, '🛡️', mine.w, BLOCK_WAIT]];
  if (mine.lv >= 2) icons.push([16, '💥', mine.pl, PLASMA_WAIT]);
  icons.forEach(([dx, icon, wait, full]) => {
    const ex = mine.x + dx, ey = GROUND + 30, ready = wait <= 0;
    g.fillStyle = 'rgba(20, 10, 30, .55)'; v.dot(ex, ey, 13);
    g.fillStyle = ready ? '#3ddc84' : '#8a8aa0';
    g.beginPath(); g.moveTo(ex, ey); g.arc(ex, ey, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (ready ? 1 : 1 - Math.min(1, wait / full))); g.closePath(); g.fill();
    v.label(icon, ex, ey + 1, 12, '#ffffff');
  });
  if (mine.pw >= 0) v.msg('POWERING UP… keep holding E! (' + Math.round(mine.pw * 100) + '%)');
  else if (mine.z) v.msg('Dizzy!', true);
  else if (mine.h < 0) v.msg('Walk over your sword to pick it back up!');
  else if (mine.lv >= 2 && mine.pl <= 0) v.msg('LEVEL 2! Press Q (or right-click) to fire your plasma cannon!');
  else if (mine.lv < 2) v.msg('Hold E to power up (level ' + (mine.lv + 1) + ')');
}

})();
