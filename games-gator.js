/* Classic Games: Gator Bars. Two cats race across the same jungle vines over a pit of alligators. Both start standing on
   a ledge: A and D walk, W or Space jumps, and a click grabs a vine your super long arm can reach. Hanging, A and D
   pump the swing higher (push the way you're swinging); click (or Space) to let go and fly, then click again to grab
   the next vine. Miss, and the alligators get you: you start again from the last vine you held.
   The cats swing right through each other, but a cat swinging fast into the other one bonks it: a hanging cat is
   knocked off its vine (and probably into the gators), a flying one is knocked off course. First to the golden vine
   wins (after 2 minutes, whoever got further). Each screen follows its own cat. (The host's app runs it: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const G = 1300;               // gravity (and the swing's)
const RMAX = 250, RMIN = 110, REST = 205; // the super long arms: how far they reach, and how long they hang
const PUMP = 4.6, DAMP = 0.1;
const WATER = 470;            // fall below this and the alligators get you
const N_BARS = 16, LIMIT = 120, CHOMP = 1.3;
const LEDGE_X = 150, LEDGE_Y = 400, WALK = 190, JUMP = 760; // the start ledge (its right edge and top); walking and jumping on it
const BONK_R = 58, BONK_SPEED = 330, BONK_WAIT = 0.7; // how close, how fast a swing has to be to knock the other cat
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const F = CA.floppy;  // (the cats' pictures without arms: see games-floppy.js)
let looks = null;

CA.games.add('gator', {
  name: 'Gator Bars', icon: '🐊',
  blurb: 'Race the other cat across the jungle vines over a pit of alligators! You both start on the ledge: A/D walk, W or Space jumps, and a click grabs a vine with your super long arm. Swing higher with A/D, then click again to let go and fly to the next vine (click to grab it). Swing into the other cat fast to knock them off! First to the golden vine wins.',
  start(ctx) {
    looks = [];
    looks[ctx.isHost ? 0 : 1] = { pics: F.pictures(CA.profile.equip), fur: F.fur(CA.profile.equip) };
    looks[ctx.isHost ? 1 : 0] = { pics: F.pictures(ctx.oppEquip), fur: F.fur(ctx.oppEquip) };
    CA.duel.run(ctx, {
      id: 'gator', mouse: true,
      help: 'A/D walk and swing · W or Space jump · click to grab a vine, click again to let go · swing into the other cat to knock them off!',
      helpTouch: 'Stick walks and swings · Jump · Grab / Let go',
      pad: { stick: true, buttons: [{ k: 'u', label: '⤒ Jump' }, { k: 'fire', label: '🙌 Grab · Let go', main: true }] },
      note: 'First to the golden vine',
      init, step, snap, bot, draw, event,
      lerp: (a, b, f) => ({ bars: b.bars, t: b.t, c: b.c.map((q, i) => { const o = a.c[i]; if (!o || o.d !== q.d || (o.f !== q.f && Math.hypot(o.x - q.x, o.y - q.y) > 80)) return q; const m = k => o[k] + (q[k] - o[k]) * f; return Object.assign({}, q, { x: m('x'), y: m('y'), hx: m('hx'), hy: m('hy') }); }) }),
    });
  },
});

function init(api) {
  const bars = [{ x: 260, y: 110 }];
  for (let k = 1; k < N_BARS; k++) {
    const p = bars[k - 1];
    bars.push({ x: p.x + 250 + api.rng() * 130 + k * 3, y: clamp(p.y + (api.rng() - 0.5) * 70, 80, 170) });
  }
  // both start standing on the ledge
  return { t: 0, bars, cats: [0, 1].map(i => onLedge(i)) };
}

// A cat standing on the start ledge (c.y is where its body is: its feet are 40 below).
function onLedge(i) {
  return { bar: 0, last: -1, R: REST, th: 0, w: 0, fly: false, ground: true, x: i ? 30 : 80, y: LEDGE_Y - 40, vx: 0, vy: 0, dead: 0, done: false, from: -1, fromT: 0, bonk: 0, stun: 0 };
}

function hang(bars, k, th) {
  const c = { bar: k, last: k, R: REST, th: th || 0, w: 0, fly: false, ground: false, x: 0, y: 0, vx: 0, vy: 0, dead: 0, done: false, from: -1, fromT: 0, bonk: 0, stun: 0 };
  place(c, bars);
  return c;
}

// Where a cat's screen is scrolled to (each screen follows its own cat).
function camOf(s, c) {
  const end = s.bars[s.bars.length - 1].x + 300;
  return clamp(c.x - 440, -120, Math.max(0, end - W));
}

function place(c, bars) {
  const b = bars[c.bar];
  c.x = b.x + c.R * Math.sin(c.th);
  c.y = b.y + c.R * Math.cos(c.th);
}

// how fast a cat is moving (hanging: along its swing)
const vel = c => (c.fly || c.ground ? [c.vx, c.vy] : [c.R * c.w * Math.cos(c.th), -c.R * c.w * Math.sin(c.th)]);

function letGo(c, api, i) {
  [c.vx, c.vy] = vel(c);
  c.fly = true;
  c.ground = false;
  c.from = c.bar;
  c.fromT = 0.35;
  if (api) api.ev('let', { i });
}

// The vine your paw can reach (the nearest one above you), or -1.
function reachable(s, c) {
  let best = -1, bd = 1e9;
  s.bars.forEach((b, k) => {
    if (k === c.from && c.fromT > 0) return;
    const d = Math.hypot(c.x - b.x, c.y - b.y);
    if (d <= RMAX && b.y < c.y - 40 && d < bd) { bd = d; best = k; }
  });
  return best;
}

function grab(s, c, k, i, api) {
  const b = s.bars[k], d = Math.hypot(c.x - b.x, c.y - b.y);
  c.fly = false;
  c.ground = false;
  c.bar = k;
  c.R = clamp(d, RMIN, RMAX);
  c.th = Math.atan2(c.x - b.x, c.y - b.y);
  c.w = (c.vx * Math.cos(c.th) - c.vy * Math.sin(c.th)) / c.R;
  if (k > c.last) c.last = k;
  place(c, s.bars);
  api.ev('grab', { i, k });
  if (k === N_BARS - 1) { c.done = true; api.end(i, 'Made it across!'); return true; }
  return false;
}

function step(s, inp, dt, api) {
  s.t += dt;
  for (let i = 0; i < 2; i++) {
    const c = s.cats[i], ip = inp[i], hit = ip.hit || {};
    c.bonk = Math.max(0, c.bonk - dt);
    if (c.done) continue;
    if (c.dead > 0) {
      c.dead -= dt;
      if (c.dead <= 0) { // back to the last vine you held (or the ledge, if you never got one)
        const last = c.last;
        Object.assign(c, last < 0 ? onLedge(i) : hang(s.bars, last));
        c.last = last;
        c.bonk = 1.5; // (safe from bonks for a moment)
      }
      continue;
    }
    const mx = clamp(ip.mx || 0, -1, 1); // A / D
    const click = hit.fire;              // the mouse button
    const jump = hit.u || hit.a;         // W or Space
    if (c.ground) {
      // on the ledge: A and D walk, W or Space jumps, a click grabs a vine if one is in reach
      c.vx = mx * WALK;
      c.x = Math.max(-110, c.x + c.vx * dt);
      if (jump) { c.ground = false; c.fly = true; c.vy = -JUMP; c.from = -1; api.ev('jump', { i }); }
      else if (c.x > LEDGE_X) { c.ground = false; c.fly = true; c.vy = 0; } // (walked off the edge)
      if (click) { const k = reachable(s, c); if (k >= 0 && grab(s, c, k, i, api)) return; }
      continue;
    }
    if (!c.fly) {
      // hanging: a pendulum. Gravity pulls it back down, and A / D (pushing the way it swings) pump it higher.
      c.w += (-(G / c.R) * Math.sin(c.th) + mx * PUMP - DAMP * c.w) * dt;
      c.th += c.w * dt;
      if (c.th > 2.3) { c.th = 2.3; c.w = Math.min(0, c.w); }
      if (c.th < -2.3) { c.th = -2.3; c.w = Math.max(0, c.w); }
      c.R += (REST - c.R) * Math.min(1, dt * 1.5); // (the arm slowly settles to its hanging length)
      place(c, s.bars);
      if (click || hit.a) letGo(c, api, i); // a click (or Space) lets go
      continue;
    }
    // flying: a click grabs the nearest vine in reach (not the one you just let go of, for a moment)
    c.fromT -= dt;
    c.stun = Math.max(0, c.stun - dt);
    c.vy += G * dt;
    c.vx += mx * 160 * dt; // (A / D steer a little in the air)
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (click && c.stun <= 0) {
      const k = reachable(s, c);
      if (k >= 0) { if (grab(s, c, k, i, api)) return; continue; }
      api.ev('miss', { i });
    }
    // landing back on the ledge
    if (c.vy > 0 && c.x <= LEDGE_X && c.y + 40 >= LEDGE_Y) { c.y = LEDGE_Y - 40; c.vy = 0; c.vx = 0; c.fly = false; c.ground = true; continue; }
    if (c.y > WATER || c.x < -140) {
      c.dead = CHOMP;
      c.fly = false;
      api.ev('chomp', { i, x: Math.round(c.x) });
    }
  }
  // bonk: a cat swinging fast into the other knocks it (they pass through each other otherwise)
  const [a, b] = s.cats;
  if (!a.ground && !b.ground && !a.dead && !b.dead && !a.done && !b.done && a.bonk <= 0 && b.bonk <= 0 && Math.hypot(a.x - b.x, a.y - b.y) < BONK_R) {
    const va = vel(a), vb = vel(b), sa = Math.hypot(va[0], va[1]), sb = Math.hypot(vb[0], vb[1]);
    if (Math.max(sa, sb) > BONK_SPEED) {
      const hi = sa >= sb ? 0 : 1, hit = s.cats[hi], vic = s.cats[1 - hi], hv = hi ? vb : va;
      if (!vic.fly) letGo(vic, null, 1 - hi);
      vic.vx += hv[0] * 0.9;
      vic.vy += hv[1] * 0.9 - 120;
      vic.stun = 0.45; // (knocked loose: it can't grab anything for a moment)
      hit.bonk = vic.bonk = BONK_WAIT;
      api.ev('bonk', { i: hi, x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
    }
  }
  if (s.t >= LIMIT) {
    const far = c => c.last * 10000 + c.x;
    const fa = far(s.cats[0]), fb = far(s.cats[1]);
    api.end(fa === fb ? -1 : fa > fb ? 0 : 1, "Time's up!");
  }
}

function snap(s) {
  return {
    bars: s.bars.map(b => [Math.round(b.x), Math.round(b.y)]),
    t: Math.max(0, Math.ceil(LIMIT - s.t)),
    c: s.cats.map(c => {
      const b = s.bars[c.bar];
      const hand = c.ground ? { x: c.x + 24, y: c.y + 70 } : c.fly ? { x: c.x + c.vx * 0.05, y: c.y - REST * 0.8 } : b;
      return { x: Math.round(c.x), y: Math.round(c.y), hx: Math.round(hand.x), hy: Math.round(hand.y), f: c.fly ? 1 : c.ground ? 2 : 0, d: c.dead > 0 ? 1 : 0, l: c.last, w: Math.round(c.w * 10) / 10 };
    }),
  };
}

// The bot plays with the same controls. On the ledge it walks to the edge and jumps, and clicks a vine once it's in
// reach. Hanging, it pumps the way it swings (A / D) and lets go on the forward swing once it's going fast enough (a
// worse bot judges it worse, and sometimes ends up with the gators). Flying, it grabs the next vine in reach. When the
// other cat is hanging on the next vine, it tries to swing into it.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = {});
  const me = st[i] || (st[i] = { rel: 0.5 + (Math.random() - 0.5) * 0.3, wait: 0 });
  const hit = {};
  if (c.dead > 0 || c.done) return { mx: 0, hit };
  me.wait = Math.max(0, me.wait - dt);
  if (c.ground) {
    if (c.x < LEDGE_X - 40) return { mx: 1, hit };
    if (me.wait <= 0) { hit.u = true; me.wait = 0.6 + (1 - api.skill) * 0.6; }
    return { mx: 0.3, hit };
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
  const target = !o.dead && !o.fly && !o.ground && o.bar === c.bar + 1 && api.skill > 0.3 && Math.random() < 0.5; // (the other cat is on the next vine: crash into it)
  if (c.w > needW && c.th > me.rel && c.th < me.rel + 0.3 && (me.go || (me.go = Math.random() < 0.3 + 0.6 * api.skill ? 1 : -1)) > 0) {
    hit.fire = true;
    me.rel = (target ? 0.35 : 0.5) + (Math.random() - 0.5) * 0.4 * (1.2 - api.skill);
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
  if (e.type === 'bonk') {
    v.burst(e.x, e.y, '#fff3b0', 18, 300);
    v.ring(e.x, e.y, v.team[e.i].main, 24);
    v.pop(e.x, e.y - 40, e.i === v.me ? 'BONK! 💥' : 'BONKED!', e.i === v.me ? '#7dffb0' : '#ff6b6b');
    v.shake(10);
    v.sound([[500, 0, 0.04], [250, 0.03, 0.1]]);
  }
  if (e.type === 'chomp') {
    v.shake(e.i === v.me ? 12 : 4);
    v.sound(e.i === v.me ? [[160, 0, 0.12], [110, 0.1, 0.18]] : [[220, 0, 0.06]]);
    (v.chomps || (v.chomps = [])).push({ i: e.i, x: e.x, at: v.now });
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
  g.fillStyle = '#3b8233';
  g.beginPath(); g.moveTo(-36, 6); g.lineTo(-72, 8); g.lineTo(-36, 14); g.fill();
  g.fillStyle = '#245520';
  for (let k = -2; k <= 3; k++) { g.beginPath(); g.arc(k * 11, -3, 4, Math.PI, 0); g.fill(); }
  g.fillStyle = '#e8d34a';
  g.beginPath(); g.arc(-30, -4, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.fillRect(-31, -7, 2, 6);
  g.restore();
}

// A super long arm in the cat's own fur (dark outline, fur middle, a light paw), with a slight tint of its team's
// color (blue or orange) so you can tell the cats apart.
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
  if (c.d) { // just got chomped: a splash
    g.fillStyle = 'rgba(255, 255, 255, .55)';
    v.dot(c.x, WATER + 14, 22 + Math.random() * 8);
    return;
  }
  const K = 1.15, feet = c.y + 40, tilt = clamp(c.w * 0.05, -0.4, 0.4), right = c.hx >= c.x;
  const sh = dx => [c.x + (dx * Math.cos(tilt) + 33 * Math.sin(tilt)) * K, feet - (33 * Math.cos(tilt) - dx * Math.sin(tilt)) * K];
  const [bx, by] = sh(right ? -12.4 : 12.4), [fx, fy] = sh(right ? 12.4 : -12.4); // the back shoulder, and the front one (the swinging arm)
  const sway = Math.sin(v.now / 160 + i) * 14, dir = right ? -1 : 1;
  // the other arm, dangling (super long too)
  furArm(v, i, look, bx, by, bx + dir * 30 - c.w * 10, by + 70, bx + dir * 14 + sway, by + 110, 9);
  // the cat's body (its own picture, without arms)
  g.save();
  g.translate(c.x, feet);
  g.scale(K, K);
  F.drawBody(g, look, 0, 0, { tilt, lookRight: right });
  g.restore();
  // the long arm, up to the paw on the vine (it bows a little with the swing)
  furArm(v, i, look, fx, fy, (fx + c.hx) / 2 - c.w * 14, (fy + c.hy) / 2 + 16, c.hx, c.hy, 11);
  v.label(i === v.me ? 'You' : v.names[i], c.x, c.y + 62, 13, i === v.me ? '#ffd23f' : v.team[i].light);
}

function draw(v, s) {
  const g = v.g;
  if (!jungle) jungle = makeJungle();
  const end = s.bars[s.bars.length - 1][0] + 300;
  const mine = s.c[v.me] || s.c[0];
  const cam = clamp(mine.x - 440, -120, Math.max(0, end - W)); // (your screen follows your own cat)
  const bgx = (((-cam * 0.4) % 1600) + 1600) % 1600 - 1600;
  g.drawImage(jungle, bgx, 0);
  g.drawImage(jungle, bgx + 1600, 0);
  g.save();
  g.translate(-cam, 0);
  // the water and the alligators, bobbing
  const wy = WATER + 8;
  g.fillStyle = '#123f4a';
  g.fillRect(cam, wy, W, H - wy);
  g.fillStyle = 'rgba(120, 200, 220, .25)';
  for (let x = Math.floor(cam / 40) * 40; x < cam + W; x += 40) g.fillRect(x + Math.sin(v.now / 400 + x) * 6, wy + 6, 18, 2);
  const chomps = (v.chomps || []).filter(q => v.now - q.at < 900);
  for (let x = 260; x < end; x += 300) {
    if (x < cam - 120 || x > cam + W + 120) continue;
    const near = chomps.find(q => Math.abs(q.x - x) < 220);
    const open = near ? Math.max(0, 1 - (v.now - near.at) / 600) : (Math.sin(v.now / 700 + x) > 0.85 ? 0.3 : 0);
    drawGator(g, x + Math.sin(v.now / 900 + x) * 10, wy + 6 + Math.sin(v.now / 500 + x) * 2, open);
  }
  // the start ledge, the leafy canopy, and the vines hanging from it (the last one golden, with a flower)
  g.fillStyle = '#5b4632';
  g.fillRect(-180, LEDGE_Y, LEDGE_X + 180, H - LEDGE_Y);
  g.fillStyle = '#3f8f3a'; g.fillRect(-180, LEDGE_Y - 6, LEDGE_X + 180, 10); // (grass on top)
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
    // little leaves along the vine
    g.fillStyle = gold ? '#ffe680' : '#58b84e';
    for (let f = 0.25; f < 0.95; f += 0.22) {
      const lx = x - 6 + (6 + sway) * f + Math.sin(f * 9) * 8, ly = 14 + (y - 14) * f, side = (f * 10) % 2 > 1 ? 1 : -1;
      g.beginPath(); g.ellipse(lx + side * 9, ly, 9, 4.5, side * 0.6, 0, Math.PI * 2); g.fill();
    }
    // the loop at the end, where a paw grabs on
    g.strokeStyle = gold ? '#ffd23f' : '#3f9a3a';
    g.lineWidth = 6;
    g.beginPath(); g.arc(x, y + 6, 9, 0, Math.PI * 2); g.stroke();
    if (gold) {
      g.fillStyle = 'rgba(255, 210, 63, .3)'; v.dot(x, y, 38);
      g.fillStyle = '#ff6fae'; [0, 1.26, 2.51, 3.77, 5.03].forEach(a => v.dot(x + Math.cos(a) * 9, y - 18 + Math.sin(a) * 9, 6));
      g.fillStyle = '#ffd23f'; v.dot(x, y - 18, 5);
    }
  });
  // the other cat first, so yours is in front
  [1 - v.me, v.me].forEach(i => { if (s.c[i]) drawCat(v, s.c[i], i); });
  g.restore();
  // how far each cat got: a little map along the top, and the time
  g.fillStyle = 'rgba(0, 0, 0, .45)';
  v.roundRect(W / 2 - 160, 36, 320, 10, 5); g.fill();
  s.c.forEach((q, i) => { g.fillStyle = v.team[i].main; v.dot(W / 2 - 160 + 320 * clamp(q.x / end, 0, 1), 41, i === v.me ? 8 : 6); });
  g.fillStyle = '#ffd23f';
  v.dot(W / 2 + 160, 41, 6);
  v.label('⏱ ' + s.t, W / 2, 66, 16, '#ffffff');
  if (mine.d) v.msg('CHOMP! 🐊 The gators got you…', true);
  else if (mine.f === 2) v.msg('Walk to the edge (D), jump (W or Space), then click to grab a vine!');
  else if (mine.f === 1) v.msg('Click to grab a vine!');
}

})();
