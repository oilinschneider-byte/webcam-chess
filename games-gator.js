/* Classic Games: Gator Bars. Cat vs Gator. One player (picked at random each game) is the CAT, the other is the GATOR.
   The cat starts on a little island and has to swing across the jungle vines to the golden one: A and D walk, W or
   Space jumps, and a click grabs a vine its super long arm can reach. Hanging, A and D pump the swing higher; click (or
   Space) lets go, and a click grabs the next vine (each new vine with the other paw, like monkey bars).
   The gator swims in the water below (A and D) and leaps up out of it (W, Space or a click) to eat the cat. A cat that
   falls in doesn't die: it has to swim (A and D) and get out, by hopping up (W or Space) and grabbing a vine, or
   climbing back onto the island, before the gator gets there. The cat wins on the golden vine; the gator wins if it
   eats the cat, or if time runs out. Each screen follows its own player. (The host's app runs it: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const G = 1300;               // gravity (and the swing's)
const RMAX = 250, RMIN = 80, REST = 205; // the super long arms: how far they reach (and how short you can climb up them), and how long they hang
const CLIMB = 420;            // how fast you climb up (W) or slide down (S) the arm, hanging
const ROUNDS = 2, PAUSE = 3;  // first to win 2 rounds wins (the cat and the gator swap every round); the break between rounds
const GRAB = 330, GRAB_HOLD = 0.4; // how far a paw can snatch a vine from (the arm stretches), and how long a click keeps trying
const PUMP = 7, DAMP = 0.06;
const WATER = 470;            // the water's surface
const N_BARS = 16, LIMIT = 100, GATOR_X = 1150; // (where the gator starts: a few vines in)
const LEDGE_X = 150, LEDGE_Y = 400, WALK = 190, JUMP = 760; // the start island (its right edge and top); walking and jumping on it
const SWIM = 150, HOP = 640;  // the cat in the water: how fast it swims, and how hard it hops up
const GSWIM = 420, GJUMP = 680, GWAIT = 0.55, GSTART = 2; // the gator: swim speed, leap, rest between leaps, the cat's head start
const EAT_R = 58;             // how close the gator's jaws have to get to the cat
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const F = CA.floppy;  // (the cats' pictures without arms: see games-floppy.js)
let looks = null;

CA.games.add('gator', {
  name: 'Gator Bars', icon: '🐊',
  blurb: 'Cat vs Gator! One of you is the cat, swinging across the jungle vines to the golden one (A/D walk and swing, W or Space jump, click to grab a vine and to let go). The other is the gator in the water below: swim with A/D and leap up with W, Space or a click to eat the cat! Fall in as the cat and you have to swim out before you get eaten.',
  start(ctx) {
    looks = [];
    looks[ctx.isHost ? 0 : 1] = { pics: F.pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
    looks[ctx.isHost ? 1 : 0] = { pics: F.pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };
    CA.duel.run(ctx, {
      id: 'gator', mouse: true,
      help: 'Cat: A/D walk and swing · W or Space jump · click to grab a vine, click again to let go · W/S climb up and down the vine. Gator: A/D swim · W, Space or click to leap!',
      helpTouch: 'Stick moves and swings · Jump · Grab / Let go (gator: leap)',
      pad: { stick: true, buttons: [{ k: 'u', label: '⤒ Jump' }, { k: 'fire', label: '🙌 Grab · Leap', main: true }] },
      note: 'Cat vs Gator · first to 2 rounds',
      init, step, snap, bot, draw, event,
      lerp: (a, b, f) => ({ bars: b.bars, t: b.t, gi: b.gi, wins: b.wins, rd: b.rd, p: b.p, lw: b.lw, c: b.c.map((q, i) => {
        const o = a.c[i];
        if (!o || o.e !== q.e || o.sw !== q.sw || (o.f !== q.f && Math.hypot(o.x - q.x, o.y - q.y) > 80)) return q;
        const m = k => (o[k] === undefined ? q[k] : o[k] + (q[k] - o[k]) * f);
        return Object.assign({}, q, { x: m('x'), y: m('y'), hx: m('hx'), hy: m('hy') });
      }) }),
    });
  },
});

function init(api) {
  const bars = [{ x: 260, y: 110 }];
  for (let k = 1; k < N_BARS; k++) {
    const p = bars[k - 1];
    bars.push({ x: p.x + 250 + api.rng() * 130 + k * 3, y: clamp(p.y + (api.rng() - 0.5) * 70, 80, 170) });
  }
  const s = { t: 0, bars, wins: [0, 0], rd: 0, pause: 0, last: -1 };
  newRound(s, api.rng() < 0.5 ? 0 : 1);
  return s;
}

// A new round: gi is the gator this time (the other one is the cat, back on the island).
function newRound(s, gi) {
  s.gi = gi;
  s.t = 0;
  s.rd++;
  s.cats = [];
  s.cats[1 - gi] = onLedge();
  s.cats[gi] = { gator: true, x: GATOR_X, y: WATER, vx: 0, vy: 0, face: -1, water: true, wait: 0, eat: 0 };
}

// The cat standing on the start island (c.y is where its body is: its feet are 40 below).
function onLedge() {
  return { bar: 0, last: -1, R: REST, th: 0, w: 0, fly: false, ground: true, swim: false, x: 80, y: LEDGE_Y - 40, vx: 0, vy: 0, done: false, eaten: false, from: -1, fromT: 0, hand: 0, want: 0 };
}

function place(c, bars) {
  const b = bars[c.bar];
  c.x = b.x + c.R * Math.sin(c.th);
  c.y = b.y + c.R * Math.cos(c.th);
}

// how fast the cat is moving (hanging: along its swing)
const vel = c => (c.fly || c.ground || c.swim ? [c.vx, c.vy] : [c.R * c.w * Math.cos(c.th), -c.R * c.w * Math.sin(c.th)]);

function letGo(c, api, i) {
  [c.vx, c.vy] = vel(c);
  c.fly = true;
  c.ground = false;
  c.from = c.bar;
  c.fromT = 0.35;
  api.ev('let', { i });
}

// The vine the cat's paw can reach (the nearest one above it, a vine ahead preferred a little), or -1.
function reachable(s, c) {
  let best = -1, bd = 1e9;
  s.bars.forEach((b, k) => {
    if (k === c.from && c.fromT > 0) return;
    const d = Math.hypot(c.x - b.x, c.y - b.y);
    const sc = d - (b.x > c.x ? 40 : 0);
    if (d <= GRAB && b.y < c.y + 30 && sc < bd) { bd = sc; best = k; }
  });
  return best;
}

function grab(s, c, k, i, api) {
  const b = s.bars[k], d = Math.hypot(c.x - b.x, c.y - b.y);
  c.fly = c.ground = c.swim = false;
  c.bar = k;
  c.hand = 1 - (c.hand || 0); // (each swing, the other arm grabs)
  c.want = 0;
  c.R = clamp(d, RMIN, RMAX);
  c.th = Math.atan2(c.x - b.x, c.y - b.y);
  c.w = (c.vx * Math.cos(c.th) - c.vy * Math.sin(c.th)) / c.R;
  if (k > c.last) c.last = k;
  place(c, s.bars);
  api.ev('grab', { i, k });
  if (k === N_BARS - 1) { c.done = true; roundOver(s, api, i, 'The cat made it across!'); return true; }
  return false;
}

// Where the gator's jaws are: at the front of its head (in the water), or up top while it leaps.
function jaws(q) {
  if (q.water) return [q.x + q.face * 70, q.y - 6];
  const sp = Math.hypot(q.vx, q.vy) || 1;
  return [q.x + (q.vx / sp) * 70, q.y + (q.vy / sp) * 70];
}

// Someone won the round: a point for them, and either the next round (the cat and the gator swap) or the end.
function roundOver(s, api, w, text) {
  s.wins[w]++;
  s.last = w;
  api.score(s.wins[0], s.wins[1]);
  api.ev('round', { w, text });
  if (s.wins[w] >= ROUNDS) { s.pause = 1e9; api.end(w, text); }
  else s.pause = PAUSE;
}

function step(s, inp, dt, api) {
  if (s.pause > 0) { s.pause -= dt; if (s.pause <= 0) newRound(s, 1 - s.gi); return; }
  s.t += dt;
  const gi = s.gi, ci = 1 - gi, c = s.cats[ci], q = s.cats[gi];
  if (c.done || c.eaten) return;
  // ---- the cat ----
  {
    const ip = inp[ci], hit = ip.hit || {};
    const mx = clamp(ip.mx || 0, -1, 1); // A / D
    const click = hit.fire;              // the mouse button
    const jump = hit.u || hit.a;         // W or Space
    if (click) c.want = GRAB_HOLD;
    c.want = Math.max(0, c.want - dt);
    const tryGrab = () => { if (c.want > 0) { const k = reachable(s, c); if (k >= 0) return grab(s, c, k, ci, api) ? 2 : 1; } return 0; };
    if (c.ground) {
      // on the island: A and D walk, W or Space jumps, a click grabs a vine if one is in reach
      c.vx = mx * WALK;
      c.x = Math.max(-110, c.x + c.vx * dt);
      if (jump) { c.ground = false; c.fly = true; c.vy = -JUMP; c.from = -1; api.ev('jump', { i: ci }); }
      else if (c.x > LEDGE_X) { c.ground = false; c.fly = true; c.vy = 0; } // (walked off the edge)
      if (tryGrab() === 2) return;
    } else if (c.swim) {
      // in the water: swim with A and D, hop up with W or Space (and grab a vine, or land back on the island)
      c.vx = mx * SWIM;
      c.x = Math.max(LEDGE_X + 14, c.x + c.vx * dt);
      c.y = WATER - 15;
      if (jump) { c.swim = false; c.fly = true; c.vy = -HOP; c.vx = mx * 230; c.from = -1; api.ev('jump', { i: ci }); }
      if (tryGrab() === 2) return;
    } else if (!c.fly) {
      // hanging: a pendulum. Gravity pulls it back down, and A / D (pushing the way it swings) pump it higher.
      c.w += (-(G / c.R) * Math.sin(c.th) + mx * PUMP - DAMP * c.w) * dt;
      c.th += c.w * dt;
      if (c.th > 2.3) { c.th = 2.3; c.w = Math.min(0, c.w); }
      if (c.th < -2.3) { c.th = -2.3; c.w = Math.max(0, c.w); }
      // W climbs up the arm (shorter), S slides down (longer). The swing keeps its momentum, so climbing up speeds it up.
      const held = ip.held || {}, climb = (held.d ? 1 : 0) - (held.u ? 1 : 0);
      if (climb) {
        const R0 = c.R;
        c.R = clamp(c.R + climb * CLIMB * dt, RMIN, RMAX);
        c.w = clamp(c.w * (R0 / c.R) * (R0 / c.R), -9, 9);
      }
      place(c, s.bars);
      if (click || hit.a) { letGo(c, api, ci); c.want = 0; } // a click (or Space) lets go
    } else {
      // flying: a click grabs the nearest vine in reach (not the one it just let go of, for a moment)
      c.fromT -= dt;
      c.vy += G * dt;
      c.vx += mx * 160 * dt; // (A / D steer a little in the air)
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const g = tryGrab();
      if (g === 2) return;
      if (!g && click) api.ev('miss', { i: ci });
      if (!g) {
        if (c.vy > 0 && c.x <= LEDGE_X && c.y + 40 >= LEDGE_Y) { c.y = LEDGE_Y - 40; c.vy = 0; c.vx = 0; c.fly = false; c.ground = true; } // (back on the island)
        else if (c.x < LEDGE_X + 14 && c.y + 40 > LEDGE_Y) { c.x = LEDGE_X + 14; c.vx = Math.max(0, c.vx); } // (bumps the island's side)
        if (c.fly && c.vy > 0 && c.y > WATER - 15) { // splash! now it has to swim
          c.fly = false; c.swim = true; c.vy = 0; c.y = WATER - 15;
          api.ev('splash', { i: ci, x: Math.round(c.x) });
        }
      }
    }
  }
  // ---- the gator ----
  {
    const ip = inp[gi], hit = ip.hit || {};
    const mx = s.t < GSTART ? 0 : clamp(ip.mx || 0, -1, 1);
    const leap = s.t >= GSTART && (hit.u || hit.a || hit.fire);
    q.wait = Math.max(0, q.wait - dt);
    q.eat = Math.max(0, q.eat - dt);
    if (q.water) {
      q.vx += (mx * GSWIM - q.vx) * Math.min(1, dt * 7);
      if (mx) q.face = mx > 0 ? 1 : -1;
      q.x += q.vx * dt;
      q.y = WATER;
      if (leap && q.wait <= 0) { q.water = false; q.vy = -GJUMP; q.eat = 0.5; api.ev('leap', { i: gi, x: Math.round(q.x) }); }
    } else {
      q.vy += G * dt;
      q.vx += (mx * GSWIM * 0.6 - q.vx) * Math.min(1, dt * 1.5);
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.vy > 0 && q.y >= WATER) { q.y = WATER; q.vy = 0; q.water = true; q.wait = GWAIT; api.ev('splash', { i: gi, x: Math.round(q.x) }); }
    }
    q.x = clamp(q.x, LEDGE_X + 60, s.bars[N_BARS - 1].x + 260); // (it can't climb onto the island)
    // chomp: the jaws reach the cat (not while it's safe on the island)
    if (!c.ground) {
      const [jx, jy] = jaws(q);
      if (Math.hypot(c.x - jx, c.y + 10 - jy) < EAT_R) {
        c.eaten = true;
        q.eat = 1;
        api.ev('chomp', { i: gi, x: Math.round(c.x), y: Math.round(c.y) });
        roundOver(s, api, gi, 'CHOMP! The gator ate the cat!');
        return;
      }
    }
  }
  if (s.t >= LIMIT) roundOver(s, api, gi, "Time's up! The cat didn't make it across.");
}

function snap(s) {
  return {
    bars: s.bars.map(b => [Math.round(b.x), Math.round(b.y)]),
    t: Math.max(0, Math.ceil(LIMIT - s.t)),
    gi: s.gi,
    wins: s.wins,
    rd: s.rd,
    p: s.pause > 0 ? 1 : 0,
    lw: s.last,
    c: s.cats.map(c => {
      if (c.gator) return { g: 1, x: Math.round(c.x), y: Math.round(c.y), vx: Math.round(c.vx), vy: Math.round(c.vy), f: c.water ? 0 : 1, fc: c.face, o: c.eat > 0 ? 1 : 0, e: 0 };
      const b = s.bars[c.bar];
      const hand = c.ground ? { x: c.x + 24, y: c.y + 70 }
        : c.swim ? { x: c.x + Math.sin(s.t * 8) * 40, y: c.y + 30 }
        : c.fly ? { x: c.x + c.vx * 0.05, y: c.y - REST * 0.8 } : b;
      return { x: Math.round(c.x), y: Math.round(c.y), hx: Math.round(hand.x), hy: Math.round(hand.y), f: c.fly ? 1 : c.ground ? 2 : c.swim ? 3 : 0, sw: c.swim ? 1 : 0, e: c.eaten ? 1 : 0, l: c.last, w: Math.round(c.w * 10) / 10, a: c.hand || 0 };
    }),
  };
}

// The bot plays with the same controls.
// As the cat: on the island it walks to the edge and jumps, and clicks a vine once it's in reach. Hanging, it pumps
// the way it swings and lets go on the forward swing once it's going fast enough (a worse bot judges it worse). Flying,
// it grabs the next vine in reach. In the water it swims to the next vine and hops up to grab it.
// As the gator: it swims under the cat (leading it a little) and leaps when the cat is low enough to catch.
function bot(s, i, dt, api) {
  const st = s.bs || (s.bs = {});
  const me = st[i] || (st[i] = { rel: 0.5 + (Math.random() - 0.5) * 0.3, wait: 0 });
  const hit = {};
  me.wait = Math.max(0, me.wait - dt);
  const c = s.cats[i];
  if (c.gator) {
    const cat = s.cats[1 - i];
    if (cat.done || cat.eaten || s.t < GSTART) return { mx: 0, hit };
    const [cvx] = vel(cat);
    const tx = cat.x + cvx * (0.15 + 0.25 * api.skill) + (me.off || 0);
    if (me.wait <= 0) { me.off = (Math.random() - 0.5) * 140 * (1.2 - api.skill); me.wait = 1; }
    const dx = tx - c.x;
    const mx = clamp(dx / 60, -1, 1) * (0.55 + 0.45 * api.skill);
    // leap when the cat is right above and low enough to reach (the peak of a leap is about 180 above the water)
    if (c.water && !cat.ground && Math.abs(dx) < 50 && cat.y > WATER - 260 && Math.random() < 0.04 + 0.12 * api.skill) hit.u = true;
    return { mx, hit };
  }
  if (c.done || c.eaten) return { mx: 0, hit };
  if (c.ground) {
    if (c.x < LEDGE_X - 40) return { mx: 1, hit };
    if (me.wait <= 0) { hit.u = true; me.wait = 0.6 + (1 - api.skill) * 0.6; }
    return { mx: 0.3, hit };
  }
  if (c.swim) {
    const k = reachable(s, c);
    if (k >= 0) { hit.fire = true; return { mx: 0, hit }; }
    const b = s.bars[Math.min(N_BARS - 1, Math.max(0, c.last + 1))];
    if (Math.abs(b.x - c.x) < 60 && me.wait <= 0) { hit.u = true; hit.fire = true; me.wait = 0.5; }
    return { mx: clamp((b.x - c.x) / 40, -1, 1), hit };
  }
  if (c.fly) {
    const k = reachable(s, c);
    // grab the furthest-forward vine it can (a worse bot is a little late, and sometimes misses its chance)
    if (k >= 0 && k >= c.last && c.vy > -100 && me.wait <= 0 && Math.random() < 0.25 + 0.6 * api.skill) { hit.fire = true; me.wait = 0.15; }
    return { mx: 0.4, hit };
  }
  const next = s.bars[c.bar + 1];
  const gap = next ? next.x - s.bars[c.bar].x : 300;
  const needW = 1.5 + gap / 260 + (Math.random() - 0.5) * 0.3 * (1 - api.skill);
  if (c.w > needW && c.th > me.rel && c.th < me.rel + 0.3 && (me.go || (me.go = Math.random() < 0.3 + 0.6 * api.skill ? 1 : -1)) > 0) {
    hit.fire = true;
    me.rel = 0.5 + (Math.random() - 0.5) * 0.4 * (1.2 - api.skill);
    me.go = 0;
    me.wait = 0.25;
  }
  if (c.th < 0) me.go = 0; // (a new chance to let go on every forward swing)
  return { mx: c.w >= 0 ? 1 : -1, hit };
}

function event(v, e) {
  if (e.type === 'grab') v.sound(e.i === v.me ? [[520, 0, 0.04], [780, 0.04, 0.05]] : [[300, 0, 0.03]]);
  if (e.type === 'let') { if (e.i === v.me) v.sound([[340, 0, 0.04]]); }
  if (e.type === 'jump') { if (e.i === v.me) v.sound([[500, 0, 0.04]]); }
  if (e.type === 'miss') { if (e.i === v.me) v.sound([[200, 0, 0.05]]); }
  if (e.type === 'leap') v.sound(e.i === v.me ? [[140, 0, 0.08], [220, 0.06, 0.06]] : [[120, 0, 0.08], [90, 0.08, 0.1]]);
  if (e.type === 'splash') {
    (v.splashes || (v.splashes = [])).push({ x: e.x, at: v.now });
    v.sound([[180, 0, 0.05], [130, 0.04, 0.06]]);
  }
  if (e.type === 'chomp') {
    v.burst(e.x, e.y, '#ffffff', 16, 260);
    v.pop(e.x, e.y - 50, 'CHOMP! 🐊', e.i === v.me ? '#7dffb0' : '#ff6b6b');
    v.shake(12);
    v.sound([[160, 0, 0.12], [110, 0.1, 0.18]]);
  }
}

let jungle = null;
function makeJungle() {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = H;
  const b = c.getContext('2d');
  const sky = b.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1d4634');
  sky.addColorStop(0.6, '#123123');
  sky.addColorStop(1, '#0b1d17');
  b.fillStyle = sky;
  b.fillRect(0, 0, 1600, H);
  for (let k = 0; k < 30; k++) { // hanging vines in the back
    const x = (k * 137) % 1600;
    b.strokeStyle = 'rgba(70, 140, 80, .3)';
    b.lineWidth = 3;
    b.beginPath(); b.moveTo(x, 0); b.quadraticCurveTo(x + 18, 90, x - 8, 160 + (k % 5) * 40); b.stroke();
  }
  b.fillStyle = 'rgba(20, 60, 35, .6)'; // jungle trees far away
  for (let k = 0; k < 12; k++) { const x = k * 140 + 30; b.beginPath(); b.ellipse(x, 400, 90, 140, 0, 0, Math.PI * 2); b.fill(); }
  return c;
}

// An alligator, facing left (its snout out at -100 from its middle), jaws open by 0 to 1.
function drawGator(g, x, y, open) {
  g.save();
  g.translate(x, y);
  g.scale(1.4, 1.4);
  g.fillStyle = '#2f6b2a';
  g.beginPath(); g.ellipse(0, 6, 44, 11, 0, 0, Math.PI * 2); g.fill();
  g.save();
  g.translate(-36, 2);
  g.rotate(-open * 0.6);
  g.fillStyle = '#3b8233';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-38, -4); g.lineTo(-36, 4); g.lineTo(0, 6); g.fill();
  if (open > 0.1) { g.fillStyle = '#f4f1e6'; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-6 - k * 7, 4); g.lineTo(-9 - k * 7, 9); g.lineTo(-12 - k * 7, 4); g.fill(); } }
  g.restore();
  if (open > 0.1) { g.fillStyle = '#b8333f'; g.beginPath(); g.moveTo(-36, 6); g.lineTo(-66, 8); g.lineTo(-36, 10); g.fill(); } // (inside its mouth)
  g.fillStyle = '#3b8233';
  g.beginPath(); g.moveTo(-36, 6); g.lineTo(-72, 8 + open * 4); g.lineTo(-36, 14); g.fill();
  if (open > 0.1) { g.fillStyle = '#f4f1e6'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-40 - k * 7, 8 + open * 2); g.lineTo(-43 - k * 7, 4 + open * 2); g.lineTo(-46 - k * 7, 8 + open * 2); g.fill(); } }
  g.fillStyle = '#245520';
  for (let k = -2; k <= 3; k++) { g.beginPath(); g.arc(k * 11, -3, 4, Math.PI, 0); g.fill(); }
  g.beginPath(); g.moveTo(40, 4); g.quadraticCurveTo(70, 2, 92, 10); g.lineTo(40, 14); g.fill(); // (its tail)
  g.fillStyle = '#e8d34a';
  g.beginPath(); g.arc(-30, -4, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.fillRect(-31, -7, 2, 6);
  g.restore();
}

// The gator player: swimming at the surface (half under the water), or leaping out of it nose first.
function drawPlayerGator(v, q, i) {
  const g = v.g;
  g.save();
  g.translate(q.x, q.f ? q.y : q.y - 9); // (swimming, its back and eyes stick out of the water)
  if (q.f) g.rotate(Math.atan2(q.vy, q.vx) - Math.PI); // (leaping: its snout points the way it's going)
  else if (q.fc > 0) g.scale(-1, 1);                    // (swimming: faces the way it last swam)
  // a glow in its team's color, so you can tell whose gator it is
  g.fillStyle = v.team[i].main; g.globalAlpha = 0.25;
  g.beginPath(); g.ellipse(0, 8, 74, 22, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  drawGator(g, 0, 0, q.o ? 1 : q.f ? 0.6 : 0.1);
  g.restore();
  v.label(i === v.me ? 'You 🐊' : v.names[i] + ' 🐊', q.x, q.f ? q.y + 60 : q.y - 34, 13, i === v.me ? '#ffd23f' : v.team[i].light);
}

// A super long arm in the cat's own fur (dark outline, fur middle, a light paw), with a slight tint of its team's
// color (blue or orange).
function furArm(v, i, look, x0, y0, cx, cy, x1, y1, wide) {
  const g = v.g, fur = look.fur;
  const path = () => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); };
  g.lineCap = 'round';
  path(); g.strokeStyle = fur.dark; g.lineWidth = wide + 4; g.stroke();
  path(); g.strokeStyle = fur.mid; g.lineWidth = wide; g.stroke();
  path(); g.strokeStyle = v.team[i].main; g.globalAlpha = 0.22; g.lineWidth = wide; g.stroke(); g.globalAlpha = 1;
  if (fur.sleeve) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (cx - x0) * 0.18, y0 + (cy - y0) * 0.18); g.strokeStyle = fur.sleeve; g.lineWidth = wide + 5; g.stroke(); }
  g.fillStyle = fur.light;
  v.dot(x1, y1, wide * 0.75);
  g.strokeStyle = fur.dark; g.lineWidth = 2;
  g.beginPath(); g.arc(x1, y1, wide * 0.75, 0, Math.PI * 2); g.stroke();
  g.fillStyle = v.team[i].main; g.globalAlpha = 0.22; v.dot(x1, y1, wide * 0.75); g.globalAlpha = 1;
}

function drawCat(v, c, i) {
  const g = v.g, look = (looks && looks[i]) || v.looks[i];
  if (c.e) return; // (eaten)
  const K = 1.15, feet = c.y + 40, tilt = c.sw ? Math.sin(v.now / 200) * 0.12 : clamp(c.w * 0.05, -0.4, 0.4), right = c.hx >= c.x;
  const sh = dx => [c.x + (dx * Math.cos(tilt) + 33 * Math.sin(tilt)) * K, feet - (33 * Math.cos(tilt) - dx * Math.sin(tilt)) * K];
  // the arm on the vine swaps every swing (left paw, then right paw, like monkey bars); flying, the free arm reaches for the next one
  const side = (c.f !== 0 ? 1 - c.a : c.a) ? 12.4 : -12.4;
  const [bx, by] = sh(-side), [fx, fy] = sh(side); // the dangling (or paddling) shoulder, and the reaching one
  const sway = Math.sin(v.now / 160 + i) * 14, dir = side > 0 ? -1 : 1;
  if (c.sw) furArm(v, i, look, bx, by, bx + dir * 30, by + 20, c.x * 2 - c.hx, c.hy, 9); // (paddling)
  else furArm(v, i, look, bx, by, bx + dir * 30 - c.w * 10, by + 70, bx + dir * 14 + sway, by + 110, 9);
  // the cat's body (its own picture, without arms)
  g.save();
  g.translate(c.x, feet);
  g.scale(K, K);
  F.drawBody(g, look, 0, 0, { tilt, lookRight: right });
  g.restore();
  furArm(v, i, look, fx, fy, (fx + c.hx) / 2 - c.w * 14, (fy + c.hy) / 2 + 16, c.hx, c.hy, 11);
  v.label(i === v.me ? 'You' : v.names[i], c.x, c.sw ? c.y - 78 : c.y + 62, 13, i === v.me ? '#ffd23f' : v.team[i].light);
}

function draw(v, s) {
  const g = v.g;
  if (!jungle) jungle = makeJungle();
  const end = s.bars[s.bars.length - 1][0] + 300;
  const mine = s.c[v.me] || s.c[0];
  const gi = s.gi, ci = 1 - gi;
  const cam = clamp(mine.x - 440, -120, Math.max(0, end - W)); // (your screen follows you)
  const bgx = (((-cam * 0.4) % 1600) + 1600) % 1600 - 1600;
  g.drawImage(jungle, bgx, 0);
  g.drawImage(jungle, bgx + 1600, 0);
  g.save();
  g.translate(-cam, 0);
  const wy = WATER + 8;
  // the leafy canopy, and the vines hanging from it (the last one golden, with a flower)
  g.fillStyle = '#1f5a2c';
  g.fillRect(cam, 0, W, 22);
  for (let x = Math.floor(cam / 46) * 46; x < cam + W + 46; x += 46) { // leaves along the canopy
    g.fillStyle = (x / 46) % 2 ? '#2f7a3a' : '#3d8f45';
    g.beginPath(); g.ellipse(x, 22 + Math.sin(x) * 4, 30, 16, 0, 0, Math.PI * 2); g.fill();
  }
  s.bars.forEach(([x, y], k) => {
    if (x < cam - 80 || x > cam + W + 80) return;
    const gold = k === s.bars.length - 1;
    const sway = Math.sin(v.now / 900 + k) * 8;
    const vine = () => { g.beginPath(); g.moveTo(x - 6, 14); g.bezierCurveTo(x + 14 + sway, y * 0.35, x - 14 + sway, y * 0.7, x, y); };
    g.lineCap = 'round';
    vine(); g.strokeStyle = gold ? '#b8860b' : '#1f5a1f'; g.lineWidth = 9; g.stroke();
    vine(); g.strokeStyle = gold ? '#ffd23f' : '#3f9a3a'; g.lineWidth = 5; g.stroke();
    g.fillStyle = gold ? '#ffe680' : '#58b84e'; // little leaves along the vine
    for (let f = 0.25; f < 0.95; f += 0.22) {
      const lx = x - 6 + (6 + sway) * f + Math.sin(f * 9) * 8, ly = 14 + (y - 14) * f, side = (f * 10) % 2 > 1 ? 1 : -1;
      g.beginPath(); g.ellipse(lx + side * 9, ly, 9, 4.5, side * 0.6, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = gold ? '#ffd23f' : '#3f9a3a'; // the loop at the end, where a paw grabs on
    g.lineWidth = 6;
    g.beginPath(); g.arc(x, y + 6, 9, 0, Math.PI * 2); g.stroke();
    if (gold) {
      g.fillStyle = 'rgba(255, 210, 63, .3)'; v.dot(x, y, 38);
      g.fillStyle = '#ff6fae'; [0, 1.26, 2.51, 3.77, 5.03].forEach(a => v.dot(x + Math.cos(a) * 9, y - 18 + Math.sin(a) * 9, 6));
      g.fillStyle = '#ffd23f'; v.dot(x, y - 18, 5);
    }
  });
  // the deep water (behind), the start island standing in it
  g.fillStyle = '#123f4a';
  g.fillRect(cam, wy, W, H - wy);
  g.fillStyle = '#5b4632';
  g.beginPath(); g.moveTo(-180, LEDGE_Y); g.lineTo(LEDGE_X, LEDGE_Y); g.lineTo(LEDGE_X + 14, H); g.lineTo(-180, H); g.fill();
  g.fillStyle = '#4a3828'; g.fillRect(-180, LEDGE_Y + 30, LEDGE_X + 186, 8); // (a darker layer of earth)
  g.fillStyle = '#3f8f3a'; g.fillRect(-180, LEDGE_Y - 6, LEDGE_X + 180, 10); // (grass on top)
  g.fillStyle = '#58b84e'; for (let x = -170; x < LEDGE_X; x += 22) { g.beginPath(); g.moveTo(x, LEDGE_Y - 4); g.lineTo(x + 5, LEDGE_Y - 16); g.lineTo(x + 10, LEDGE_Y - 4); g.fill(); }
  // the players: the cat, then the gator (so its jaws are in front)
  if (s.c[ci]) drawCat(v, s.c[ci], ci);
  if (s.c[gi]) drawPlayerGator(v, s.c[gi], gi);
  // the water's surface in front (so swimmers are half under it), with ripples and splashes
  g.fillStyle = 'rgba(18, 63, 74, .62)';
  g.fillRect(cam, wy, W, H - wy);
  g.fillStyle = 'rgba(120, 200, 220, .35)';
  g.fillRect(cam, wy - 1, W, 3);
  g.fillStyle = 'rgba(120, 200, 220, .25)';
  for (let x = Math.floor(cam / 40) * 40; x < cam + W; x += 40) g.fillRect(x + Math.sin(v.now / 400 + x) * 6, wy + 10, 18, 2);
  (v.splashes = (v.splashes || []).filter(p => v.now - p.at < 600)).forEach(p => {
    const k = (v.now - p.at) / 600;
    g.fillStyle = 'rgba(255, 255, 255, ' + (0.6 * (1 - k)) + ')';
    for (let d = -2; d <= 2; d++) v.dot(p.x + d * 14 * (1 + k), wy - 4 - Math.sin(Math.PI * k) * (24 - Math.abs(d) * 6), 5);
  });
  g.restore();
  // how far the cat got: a little map along the top (with the gator on it), and the time
  g.fillStyle = 'rgba(0, 0, 0, .45)';
  v.roundRect(W / 2 - 160, 36, 320, 10, 5); g.fill();
  s.c.forEach((q, i) => { g.fillStyle = q.g ? '#3b8233' : v.team[i].main; v.dot(W / 2 - 160 + 320 * clamp(q.x / end, 0, 1), 41, i === v.me ? 8 : 6); });
  g.fillStyle = '#ffd23f';
  v.dot(W / 2 + 160, 41, 6);
  v.label('⏱ ' + s.t, W / 2, 66, 16, '#ffffff');
  const amGator = v.me === gi;
  if (s.p) v.msg((s.lw === v.me ? 'You won round ' : (v.names[s.lw] || 'They') + ' won round ') + s.rd + '! Next round you swap: you\'ll be the ' + (amGator ? 'CAT 🐱' : 'GATOR 🐊'), true);
  else if (s.t >= LIMIT - 6) v.msg('Round ' + s.rd + ' · ' + (amGator ? 'You\'re the GATOR 🐊 A/D swim · W, Space or click to leap and eat the cat!' : 'You\'re the CAT 🐱 Swing to the golden vine before the gator eats you! (W/S climb the vine)'), true);
  else if (amGator) { if (s.t >= LIMIT - 9) v.msg('Swim under the cat and leap (W, Space or click) to eat it!'); }
  else if (mine.sw) v.msg('Swim! A/D to move, W or Space to hop up, click to grab a vine — before the gator gets you!', true);
  else if (mine.f === 2) v.msg('Walk to the edge (D), jump (W or Space), then click to grab a vine!');
  else if (mine.f === 1) v.msg('Click to grab a vine!');
}

})();
