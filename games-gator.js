/* Classic Games: Gator Bars. A swinging race! Both cats start on a little island and race across the jungle vines to
   the golden one. It's all the mouse button: click to jump off the island, HOLD it to grab a vine and hang on (your
   swing builds up by itself), and LET GO to fly off it. Hold it again in the air to catch the next vine. Alligators lurk
   in the water below and leap at anyone who falls in or swings too low: get eaten and it's back to the island. In the
   water, click to hop back up. First to win 2 races; if time runs out, whoever got furthest wins the race.
   Each screen follows its own player. (The host's app runs it: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const G = 1300;               // gravity (and the swing's)
const RMAX = 250, RMIN = 80, REST = 205; // the super long arms: how far they reach, and how long they hang
const ROUNDS = 2, PAUSE = 3;  // first to win 2 races; the break between races
const GRAB = 330, GRAB_HOLD = 0.3; // how far a paw can snatch a vine from (the arm stretches), and how long a click keeps trying
const PUMP = 3.4, DAMP = 0.05, SWING_MAX = 1.3; // the swing builds up by itself, up to about this far out (radians)
const WATER = 470;            // the water's surface
const N_BARS = 16, LIMIT = 75;
const LEDGE_X = 150, LEDGE_Y = 400, JUMP = 760, JUMP_VX = 300; // the start island (its right edge and top); jumping off it
const HOP = 640, HOP_VX = 220; // the cat in the water: hopping back up
const GATORS = 4, GSWIM = 300, GJUMP = 640, GWAIT = 1.1, NOTICE = 260, LOW = 230; // the alligators
const EAT_R = 58, RESPAWN = 1.6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const F = CA.floppy;  // (the cats' pictures without arms: see games-floppy.js)
let looks = null;

CA.games.add('gator', {
  name: 'Gator Bars', icon: '🐊',
  blurb: 'A swinging race across the jungle vines! It\'s all the mouse button: click to jump, HOLD to grab a vine and swing, LET GO to fly to the next one. Alligators lurk in the water below. First to the golden vine wins the race; first to 2!',
  start(ctx) {
    looks = [];
    looks[ctx.isHost ? 0 : 1] = { pics: F.pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
    looks[ctx.isHost ? 1 : 0] = { pics: F.pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };
    CA.duel.run(ctx, {
      id: 'gator', mouse: true,
      help: 'Only the mouse button: click to jump off the island · HOLD to grab a vine and swing · LET GO to fly · hold again to catch the next one · watch out for the gators!',
      helpTouch: 'Tap to jump · hold to grab and swing · let go to fly',
      pad: { buttons: [{ k: 'fire', label: '🙌 Hold to grab · let go to fly', main: true }] },
      note: 'Race to the golden vine · first to 2',
      init, step, snap, bot, draw, event,
      lerp: (a, b, f) => Object.assign({}, b, {
        c: b.c.map((q, i) => {
          const o = a.c[i];
          if (!o || o.e !== q.e || o.sw !== q.sw || (o.f !== q.f && Math.hypot(o.x - q.x, o.y - q.y) > 80)) return q;
          const m = k => (o[k] === undefined ? q[k] : o[k] + (q[k] - o[k]) * f);
          return Object.assign({}, q, { x: m('x'), y: m('y'), hx: m('hx'), hy: m('hy') });
        }),
        gz: b.gz.map((q, k) => { const o = a.gz[k]; if (!o || Math.abs(o[0] - q[0]) > 80) return q; const r = q.slice(); r[0] = o[0] + (q[0] - o[0]) * f; r[1] = o[1] + (q[1] - o[1]) * f; return r; }),
      }),
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
  newRound(s);
  return s;
}

// A new race: both cats back on the island, and the gators somewhere in the water.
function newRound(s) {
  s.t = 0;
  s.rd++;
  s.cats = [onLedge(0), onLedge(1)];
  const end = s.bars[N_BARS - 1].x;
  s.gators = [];
  for (let k = 0; k < GATORS; k++) {
    const home = LEDGE_X + 300 + (end - LEDGE_X - 300) * (k + 0.2 + Math.random() * 0.6) / GATORS;
    s.gators.push({ x: home, y: WATER, vx: 0, vy: 0, face: Math.random() < 0.5 ? -1 : 1, water: true, wait: GWAIT + Math.random() * 2, eat: 0, home, dir: Math.random() < 0.5 ? -1 : 1 });
  }
}

// A cat standing on the start island (c.y is where its body is: its feet are 40 below).
function onLedge(i) {
  return { bar: 0, last: -1, R: REST, th: 0, w: 0, fly: false, ground: true, swim: false, x: 50 + i * 50, y: LEDGE_Y - 40, vx: 0, vy: 0, done: false, eaten: false, dead: 0, from: -1, fromT: 0, hand: 0, want: 0 };
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
  if (k === N_BARS - 1) { c.done = true; roundOver(s, api, i, 'Made it to the golden vine!'); return true; }
  return false;
}

// Where a gator's jaws are: at the front of its head (in the water), or up top while it leaps.
function jaws(q) {
  if (q.water) return [q.x + q.face * 70, q.y - 6];
  const sp = Math.hypot(q.vx, q.vy) || 1;
  return [q.x + (q.vx / sp) * 70, q.y + (q.vy / sp) * 70];
}

// Someone won the race: a point for them, and either the next race or the end.
function roundOver(s, api, w, text) {
  if (w >= 0) s.wins[w]++;
  s.last = w;
  api.score(s.wins[0], s.wins[1]);
  api.ev('round', { w, text });
  if (w >= 0 && s.wins[w] >= ROUNDS) { s.pause = 1e9; api.end(w, text); }
  else s.pause = PAUSE;
}

function stepCat(s, c, i, ip, dt, api) {
  if (c.done) return false;
  if (c.eaten) { // (back to the island after a moment)
    c.dead -= dt;
    if (c.dead <= 0) { s.cats[i] = onLedge(i); api.ev('respawn', { i }); }
    return false;
  }
  const hit = ip.hit || {}, held = !!(ip.held || {}).fire;
  if (hit.fire) c.want = GRAB_HOLD;
  c.want = Math.max(0, c.want - dt);
  const tryGrab = () => { if (held || c.want > 0) { const k = reachable(s, c); if (k >= 0) return grab(s, c, k, i, api) ? 2 : 1; } return 0; };
  if (c.ground) { // on the island: a click jumps off it
    if (hit.fire) { c.ground = false; c.fly = true; c.vy = -JUMP; c.vx = JUMP_VX; c.from = -1; api.ev('jump', { i }); }
  } else if (c.swim) { // in the water: a click hops back up (and holding grabs a vine on the way)
    c.vx *= Math.pow(0.2, dt);
    c.x = Math.max(LEDGE_X + 14, c.x + c.vx * dt);
    c.y = WATER - 15;
    if (hit.fire) { c.swim = false; c.fly = true; c.vy = -HOP; c.vx = HOP_VX; c.from = -1; api.ev('jump', { i }); }
  } else if (!c.fly) {
    // hanging: a pendulum, and the swing builds up by itself (up to about SWING_MAX out). Let go of the button to fly.
    const R = c.R, energy = 0.5 * R * R * c.w * c.w + G * R * (1 - Math.cos(c.th));
    const push = energy < G * R * (1 - Math.cos(SWING_MAX)) ? PUMP * (c.w >= 0 ? 1 : -1) : 0;
    c.w += (-(G / R) * Math.sin(c.th) + push - DAMP * c.w) * dt;
    c.th += c.w * dt;
    if (c.th > 2.3) { c.th = 2.3; c.w = Math.min(0, c.w); }
    if (c.th < -2.3) { c.th = -2.3; c.w = Math.max(0, c.w); }
    place(c, s.bars);
    if (!held) { letGo(c, api, i); c.want = 0; }
    return false;
  } else {
    // flying: holding the button grabs the nearest vine in reach (not the one it just let go of, for a moment)
    c.fromT -= dt;
    c.vy += G * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    const g = tryGrab();
    if (g === 2) return true;
    if (!g) {
      if (c.vy > 0 && c.x <= LEDGE_X && c.y + 40 >= LEDGE_Y) { c.y = LEDGE_Y - 40; c.vy = 0; c.vx = 0; c.fly = false; c.ground = true; } // (back on the island)
      else if (c.x < LEDGE_X + 14 && c.y + 40 > LEDGE_Y) { c.x = LEDGE_X + 14; c.vx = Math.max(0, c.vx); } // (bumps the island's side)
      if (c.fly && c.vy > 0 && c.y > WATER - 15) { // splash! now it has to get out
        c.fly = false; c.swim = true; c.vy = 0; c.y = WATER - 15;
        api.ev('splash', { i, x: Math.round(c.x) });
      }
    }
  }
  return false;
}

// The gators: each one swims to and fro near its own spot, and goes for any cat that's in the water or swinging low
// nearby, leaping out at it now and then.
function stepGator(s, q, dt, api) {
  q.wait = Math.max(0, q.wait - dt);
  q.eat = Math.max(0, q.eat - dt);
  let prey = null, pd = NOTICE;
  for (const c of s.cats) {
    if (c.ground || c.eaten || c.done || c.y < WATER - LOW) continue;
    const d = Math.abs(c.x - q.x);
    if (d < pd) { pd = d; prey = c; }
  }
  if (q.water) {
    let want;
    if (prey) want = clamp((prey.x - q.x) / 50, -1, 1) * GSWIM;
    else { if (Math.abs(q.x - q.home) > 170) q.dir = q.x > q.home ? -1 : 1; want = q.dir * GSWIM * 0.35; }
    q.vx += (want - q.vx) * Math.min(1, dt * 5);
    if (Math.abs(q.vx) > 10) q.face = q.vx > 0 ? 1 : -1;
    q.x += q.vx * dt;
    q.y = WATER;
    if (prey && pd < 90 && q.wait <= 0 && Math.random() < dt * 3) { q.water = false; q.vy = -GJUMP * (0.85 + Math.random() * 0.25); q.eat = 0.5; api.ev('leap', { x: Math.round(q.x) }); }
  } else {
    q.vy += G * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (q.vy > 0 && q.y >= WATER) { q.y = WATER; q.vy = 0; q.water = true; q.wait = GWAIT; api.ev('splash', { x: Math.round(q.x) }); }
  }
  q.x = clamp(q.x, LEDGE_X + 60, s.bars[N_BARS - 1].x + 200);
  s.cats.forEach((c, i) => { // chomp: the jaws reach a cat (not while it's safe on the island)
    if (c.ground || c.eaten || c.done) return;
    const [jx, jy] = jaws(q);
    if (Math.hypot(c.x - jx, c.y + 10 - jy) < EAT_R) {
      c.eaten = true;
      c.dead = RESPAWN;
      q.eat = 1;
      api.ev('chomp', { i, x: Math.round(c.x), y: Math.round(c.y) });
    }
  });
}

function step(s, inp, dt, api) {
  if (s.pause > 0) { s.pause -= dt; if (s.pause <= 0) newRound(s); return; }
  s.t += dt;
  for (let i = 0; i < 2; i++) if (stepCat(s, s.cats[i], i, inp[i], dt, api)) return;
  for (const q of s.gators) stepGator(s, q, dt, api);
  if (s.t >= LIMIT) { // time's up: whoever got further along wins the race
    const [a, b] = s.cats, fa = a.last * 1000 + a.x, fb = b.last * 1000 + b.x;
    roundOver(s, api, Math.abs(fa - fb) < 1 ? -1 : fa > fb ? 0 : 1, "Time's up!");
  }
}

function snap(s) {
  return {
    bars: s.bars.map(b => [Math.round(b.x), Math.round(b.y)]),
    t: Math.max(0, Math.ceil(LIMIT - s.t)),
    wins: s.wins,
    rd: s.rd,
    p: s.pause > 0 ? 1 : 0,
    lw: s.last,
    c: s.cats.map(c => {
      const b = s.bars[c.bar];
      const hand = c.ground ? { x: c.x + 24, y: c.y + 70 }
        : c.swim ? { x: c.x + Math.sin(s.t * 8) * 40, y: c.y + 30 }
        : c.fly ? { x: c.x + c.vx * 0.05, y: c.y - REST * 0.8 } : b;
      return { x: Math.round(c.x), y: Math.round(c.y), hx: Math.round(hand.x), hy: Math.round(hand.y), f: c.fly ? 1 : c.ground ? 2 : c.swim ? 3 : 0, sw: c.swim ? 1 : 0, e: c.eaten ? 1 : 0, l: c.last, w: Math.round(c.w * 100) / 100, a: c.hand || 0, d: c.done ? 1 : 0 };
    }),
    gz: s.gators.map(q => [Math.round(q.x), Math.round(q.y), Math.round(q.vx), Math.round(q.vy), q.water ? 0 : 1, q.face, q.eat > 0 ? 1 : 0]),
  };
}

// The bot plays with the same button. On the island it clicks to jump. Flying, it holds the button so it catches the
// next vine. Hanging, it keeps holding while the swing builds, and lets go on a forward swing once it's going fast
// enough (a worse bot judges it worse). In the water it clicks to hop up, once it's under a vine.
function bot(s, i, dt, api) {
  const st = s.bs || (s.bs = {});
  const me = st[i] || (st[i] = { rel: 0.5 + (Math.random() - 0.5) * 0.3, wait: 0 });
  const hit = {}, held = {};
  me.wait = Math.max(0, me.wait - dt);
  const c = s.cats[i];
  if (s.pause > 0 || c.done || c.eaten) return { hit, held };
  if (c.ground) { if (me.wait <= 0) { hit.fire = true; held.fire = true; me.wait = 0.6 + (1 - api.skill) * 0.8; } return { hit, held }; }
  if (c.swim) {
    const b = s.bars[Math.min(N_BARS - 1, Math.max(0, c.last + 1))];
    if (me.wait <= 0 && Math.abs(b.x - c.x - 120) < 140) { hit.fire = true; held.fire = true; me.wait = 0.5; }
    return { hit, held };
  }
  if (c.fly) {
    // hold to catch the next vine (a worse bot is sometimes late)
    if (c.vy > -100 && Math.random() < 0.3 + 0.7 * api.skill) me.hold = true;
    if (me.hold) held.fire = true;
    return { hit, held };
  }
  me.hold = false;
  const next = s.bars[c.bar + 1];
  const gap = next ? next.x - s.bars[c.bar].x : 300;
  const needW = 1.4 + gap / 300 + (Math.random() - 0.5) * 0.3 * (1 - api.skill);
  if (c.w > needW && c.th > me.rel && c.th < me.rel + 0.3 && (me.go || (me.go = Math.random() < 0.3 + 0.6 * api.skill ? 1 : -1)) > 0) {
    me.rel = 0.5 + (Math.random() - 0.5) * 0.4 * (1.2 - api.skill);
    me.go = 0;
    return { hit, held }; // (lets go)
  }
  if (c.th < 0) me.go = 0; // (a new chance to let go on every forward swing)
  held.fire = true;
  return { hit, held };
}

function event(v, e) {
  if (e.type === 'grab') { v.sound(e.i === v.me ? [[520, 0, 0.04], [780, 0.04, 0.05]] : [[300, 0, 0.03]]); v.mood(e.i, 'happy', 0.5); }
  if (e.type === 'let') { if (e.i === v.me) v.sound([[340, 0, 0.04], [700, 0.02, 0.12, { w: 'noise', to: 2000, q: 1, g: 0.4 }]]); v.mood(e.i, 'shock', 0.5); }
  if (e.type === 'jump') { if (e.i === v.me) v.sound([[500, 0, 0.04]]); }
  if (e.type === 'leap') v.sound([[120, 0, 0.08], [90, 0.08, 0.1]]);
  if (e.type === 'splash') {
    (v.splashes || (v.splashes = [])).push({ x: e.x, at: v.now });
    v.sound([[180, 0, 0.05], [130, 0.04, 0.06]]);
    if (e.i != null) v.mood(e.i, 'shock', 2);
  }
  if (e.type === 'chomp') {
    v.burst(e.x, e.y, '#ffffff', 16, 260);
    v.pop(e.x, e.y - 50, 'CHOMP! 🐊', '#ff6b6b');
    v.shake(e.i === v.me ? 14 : 6);
    v.sound([[160, 0, 0.12], [110, 0.1, 0.18]]);
    v.mood(e.i, 'ko', 1.6);
  }
  if (e.type === 'respawn' && e.i === v.me) v.note('Back to the island! Go again!');
  if (e.type === 'round') {
    if (e.w >= 0) { v.banner(e.w === v.me ? 'YOU WIN THE RACE!' : v.names[e.w] + ' WINS THE RACE!', e.w === v.me ? '#ffd23f' : '#ff9a9a'); v.mood(e.w, 'happy', 3); v.mood(1 - e.w, 'sad', 3); }
    else v.banner('A TIE!', '#ffffff');
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
  const face = c.sw ? 'shock' : c.d ? 'happy' : c.f === 1 ? 'squint' : c.f === 0 && Math.abs(c.w) > 2.2 ? 'happy' : undefined; // (its face: how it's doing)
  F.drawBody(g, look, 0, 0, { tilt, lookRight: right, face });
  g.restore();
  furArm(v, i, look, fx, fy, (fx + c.hx) / 2 - c.w * 14, (fy + c.hy) / 2 + 16, c.hx, c.hy, 11);
  v.label(i === v.me ? 'You' : v.names[i], c.x, c.sw ? c.y - 78 : c.y + 62, 13, i === v.me ? '#ffd23f' : v.team[i].light);
}


// A lurking alligator: swimming at the surface (just its back and eyes showing), or leaping out nose first.
function drawLurker(v, q) {
  const [x, y, vx, vy, fly, face, open] = q, g = v.g;
  g.save();
  g.translate(x, fly ? y : y - 9);
  if (fly) g.rotate(Math.atan2(vy, vx) - Math.PI);
  else if (face > 0) g.scale(-1, 1);
  drawGator(g, 0, 0, open ? 1 : fly ? 0.6 : 0.1);
  g.restore();
}

function draw(v, s) {
  const g = v.g;
  if (!jungle) jungle = makeJungle();
  const end = s.bars[s.bars.length - 1][0] + 300;
  const mine = s.c[v.me] || s.c[0];
  const cam = clamp(mine.x - 400, -120, Math.max(0, end - W)); // (your screen follows you)
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
  // the cats (the other one a little see-through), then the gators (so their jaws are in front)
  [1 - v.me, v.me].forEach(i => { if (s.c[i]) { g.globalAlpha = i === v.me ? 1 : 0.75; drawCat(v, s.c[i], i); g.globalAlpha = 1; } });
  (s.gz || []).forEach(q => { if (q[0] > cam - 150 && q[0] < cam + W + 150) drawLurker(v, q); });
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
  // the race so far: a little map along the top (with the gators on it), and the time
  g.fillStyle = 'rgba(0, 0, 0, .45)';
  v.roundRect(W / 2 - 160, 36, 320, 10, 5); g.fill();
  (s.gz || []).forEach(q => { g.fillStyle = '#3b8233'; v.dot(W / 2 - 160 + 320 * clamp(q[0] / end, 0, 1), 41, 4); });
  s.c.forEach((q, i) => { g.fillStyle = v.team[i].main; v.dot(W / 2 - 160 + 320 * clamp(q.x / end, 0, 1), 41, i === v.me ? 8 : 6); });
  g.fillStyle = '#ffd23f';
  v.dot(W / 2 + 160, 41, 6);
  v.label('⏱ ' + s.t + '   ·   Race ' + s.rd + '   ·   ' + v.names[0] + ' ' + s.wins[0] + ' – ' + s.wins[1] + ' ' + v.names[1], W / 2, 66, 15, '#ffffff');
  if (s.p) v.msg(s.lw < 0 ? 'A tie! Next race…' : (s.lw === v.me ? 'You won race ' : (v.names[s.lw] || 'They') + ' won race ') + s.rd + '! Next race…', true);
  else if (mine.e) v.msg('CHOMP! Back to the island…', true);
  else if (mine.sw) v.msg('In the water with the gators! Click to hop out (hold to grab a vine)', true);
  else if (mine.f === 2) v.msg('Click to jump off the island, and HOLD to grab the first vine!');
  else if (mine.f === 1) v.msg('Hold the button to catch the next vine!');
  else if (mine.f === 0) v.msg('Keep holding to swing · let go on a forward swing to fly to the next vine!');
}

})();
