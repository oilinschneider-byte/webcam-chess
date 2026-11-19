/* Classic Games: Poop Showdown. A silly cartoon arena with two cats with big butts, and each round one of you is
   POOPOO and the other PEEPEE (you swap every round, so it's fair). Space shoots, W jumps.
   - POOPOO can't poop at somebody who is in front of you: turn your butt toward the other cat (just walk away from them,
     your cat faces the way it walks), then press Space. You strain for a moment (green fart smoke!) and fire a powerful
     poop out the back. A poop hit takes a third of your health and knocks you away; poops that meet in the air splat each
     other.
   - PEEPEE squirts pee straight ahead (a quick spray with a short reach, and only a short wait): it takes a little health,
     and the first drops to hit leave the other cat dizzy for a second (they stumble about and can't do anything), then
     they can't be made dizzy again for a moment.
   - Special moves: keep holding Space and, when your special is ready (the star by your health bar), you do it.
     POOPOO poops a whole MOUNTAIN under itself: it rides up on top for a few seconds, then the mountain sinks into a
     sludge puddle. In the sludge you're slow, and it stings a little.
     PEEPEE makes it RAIN pee over the other cat for a moment: every drop stings a tiny bit.
   Getting hit never turns your cat round. First to win 2 rounds. (The host's app runs the fight: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, GROUND = 470;
const G = 2100, RUN = 270, ACCEL = 2600, AIR_ACCEL = 1500, JUMP = 770;
const HP = 100, DMG = 34, RELOAD = 1.1, STRAIN = 0.3;            // poop
const SHOT_V = 840, SHOT_G = 430, SHOT_R = 13;
const PEE_DMG = 5, PEE_RELOAD = 0.85, PEE_V = 720, PEE_G = 240, PEE_LIFE = 0.42, PEE_R = 7;   // pee: 3 drops a squirt
const DIZZY = 1, IMMUNE = 1.2;                                   // dizzy this long, then can't be made dizzy for this long
const HOLD = 0.6, SPECIAL_WAIT = 8;                               // hold Space this long for the special; it comes back after this long
const MOUND_UP = 0.45, MOUND_STAY = 3, MOUND_DOWN = 0.7, MOUND_H = 120, MOUND_W = 95; // the poop mountain
const SLUDGE_T = 4.5, SLUDGE_W = 150, SLUDGE_SLOW = 0.45, SLUDGE_DMG = 3;  // ...and the sludge it leaves (damage a second)
const RAIN_T = 1.6, RAIN_EVERY = 0.045, RAIN_DMG = 1.5, RAIN_SPREAD = 150;  // the pee rain
const WIN = 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;
const roleName = r => (r === 'p' ? 'POOPOO 💩' : 'PEEPEE 💦');

CA.games.add('poop', {
  name: 'Poop Showdown', icon: '💩',
  blurb: 'One of you is POOPOO and one is PEEPEE (you swap every round). Poopoo turns their big butt toward the other cat (walk away from them) and blasts a powerful poop out the back. Peepee squirts pee straight ahead and makes them dizzy. HOLD Space for a special: a poop MOUNTAIN, or pee RAIN! W jumps. First to win 2 rounds.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'poop',
      pad: { stick: true, buttons: [{ k: 'u', label: '⤒ Jump' }, { k: 'a', label: '💩💦 Shoot (hold: special)', main: true }] },
      help: 'A/D walk · Space shoots · HOLD Space for your special · W jumps · POOPOO: turn your BUTT toward them first · PEEPEE: face them and squirt · first to 2 rounds',
      helpTouch: 'Stick walks · Shoot (hold it for a special) · Jump · Poopoo shoots out the back, Peepee shoots ahead',
      note: 'First to ' + WIN + ' rounds',
      init, step, snap, bot, draw, event,
    });
  },
});

function newCat(x, face) {
  return { x, y: GROUND, vx: 0, vy: 0, ground: true, face, hp: HP, strain: 0, rel: 0.8, fa: 0, dz: 0, di: 0, hold: 0, held: false, sp: SPECIAL_WAIT * 0.5, slow: 0 };
}

function init(api) {
  const s = { wins: [0, 0], round: 0, phase: 'fight', pause: 0, rw: -1, cats: [], shots: [], mounds: [], rain: null, roles: ['p', 'w'], t: 0, done: false };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.phase = 'fight';
  s.rw = -1;
  s.shots = [];
  s.mounds = [];
  s.rain = null;
  s.roles = (s.round % 2 === 1) ? ['p', 'w'] : ['w', 'p']; // (the host is Poopoo first, then you swap every round)
  s.cats = [newCat(250, 1), newCat(710, -1)];
  api.ev('round', { n: s.round, r: s.roles });
}

// How high the floor is at x: the floor, or the top of a poop mountain.
function groundAt(mounds, x) {
  let y = GROUND;
  for (const m of mounds) {
    const h = Array.isArray(m) ? m[1] : m.h, mx = Array.isArray(m) ? m[0] : m.x;
    const d = Math.abs(x - mx) / MOUND_W;
    if (d < 1) y = Math.min(y, GROUND - h * (1 - d * d));
  }
  return y;
}
const inSludge = (s, x) => s.mounds.some(m => m.sl > 0 && Math.abs(x - m.x) < SLUDGE_W);

function shoot(s, c, i, api) { // a poop, out the back
  const d = -c.face;
  s.shots.push({ x: c.x + d * 34, y: c.y - 30, vx: d * SHOT_V, vy: -130, o: i, a: 0, k: 'p' });
  c.rel = RELOAD;
  c.vx += c.face * 190; // (a little kick forward)
  api.ev('poop', { x: c.x + d * 36, y: c.y - 30, d, i });
}

function squirt(s, c, i, api) { // pee, straight ahead: three drops, a little spread
  for (let k = -1; k <= 1; k++) s.shots.push({ x: c.x + c.face * 30, y: c.y - 36 + k * 4, vx: c.face * (PEE_V + k * 30), vy: k * 60 - 20, o: i, a: 0, k: 'w' });
  c.rel = PEE_RELOAD;
  api.ev('pee', { x: c.x + c.face * 34, y: c.y - 36, d: c.face, i });
}

// The special moves (hold Space): a poop mountain right under you, or pee rain over the other cat.
function special(s, c, i, api) {
  c.sp = SPECIAL_WAIT;
  c.strain = 0;
  if (s.roles[i] === 'p') {
    s.mounds = s.mounds.filter(m => m.o !== i);
    s.mounds.push({ o: i, x: clamp(c.x, MOUND_W, W - MOUND_W), h: 0, t: 0, sl: 0 });
    api.ev('mound', { x: c.x, y: GROUND, i });
  } else {
    s.rain = { o: i, t: RAIN_T, acc: 0, x: s.cats[1 - i].x };
    api.ev('rain', { x: s.cats[1 - i].x, i });
  }
}

function stepCat(s, c, i, n, dt, api) {
  const role = s.roles[i];
  c.rel = Math.max(0, c.rel - dt);
  c.fa = Math.max(0, c.fa - dt);
  c.dz = Math.max(0, c.dz - dt);
  c.di = Math.max(0, c.di - dt);
  c.sp = Math.max(0, c.sp - dt);
  // (holding Space: past HOLD seconds, the special, once per press)
  if (n.held.a) c.hold += dt; else { c.hold = 0; c.held = false; }
  const dizzy = c.dz > 0;
  if (!dizzy && !c.held && c.hold >= HOLD && c.sp <= 0) { c.held = true; special(s, c, i, api); }
  const onOwn = s.mounds.some(m => m.o === i && m.h > 30 && Math.abs(c.x - m.x) < MOUND_W);
  const sludge = c.ground && !onOwn && inSludge(s, c.x);
  c.slow = sludge ? 1 : 0;
  if (sludge) c.hp = Math.max(0, c.hp - SLUDGE_DMG * dt);
  const run = RUN * (sludge ? SLUDGE_SLOW : 1);
  if (c.strain > 0) { // straining: stuck for a moment, rear end wiggling
    c.strain -= dt;
    c.vx *= Math.pow(0.02, dt);
    if (c.strain <= 0) shoot(s, c, i, api);
  } else {
    // (dizzy: you stumble the other way, slowly, and can't do anything else. Your cat keeps facing the way it was:
    // nothing that happens to you turns it round, only walking does.)
    const mx = dizzy ? -n.mx * 0.5 : n.mx;
    if (n.mx && !dizzy) c.face = n.mx > 0 ? 1 : -1;
    c.vx = approach(c.vx, mx * run, (c.ground ? ACCEL : AIR_ACCEL) * dt);
    if (!dizzy && c.ground && (n.hit.u || n.my < -0.7)) { c.vy = -JUMP * (sludge ? 0.75 : 1); c.ground = false; api.ev('jump', {}); }
    if (!dizzy && n.hit.a && c.rel <= 0) {
      if (role === 'p') { c.strain = STRAIN; c.fa = 1; api.ev('strain', { x: c.x - c.face * 36, y: c.y - 30, i }); } else squirt(s, c, i, api);
    }
  }
  c.vy += G * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  if (c.x < 50 || c.x > W - 50) { c.x = clamp(c.x, 50, W - 50); c.vx = 0; }
  const floor = groundAt(s.mounds, c.x);
  if (c.y >= floor) { c.y = floor; c.vy = Math.min(0, c.vy); c.ground = true; }
  else if (c.ground && c.vy >= 0 && c.y > floor - 14) { c.y = floor; c.vy = 0; } // (walking down the side of a mountain)
  else c.ground = false;
  const p = CA.camWalls.push(c.x, c.y - 80, 26);  // (the camera walls in the top corners)
  if (p) { c.x = p.x; c.y = p.y + 80; if (c.vy < 0) c.vy = 0; }
}

function stepMounds(s, dt) {
  const end = MOUND_UP + MOUND_STAY + MOUND_DOWN + SLUDGE_T;
  for (const m of s.mounds) {
    m.t += dt;
    if (m.t < MOUND_UP) m.h = MOUND_H * (m.t / MOUND_UP);
    else if (m.t < MOUND_UP + MOUND_STAY) m.h = MOUND_H;
    else m.h = Math.max(0, MOUND_H * (1 - (m.t - MOUND_UP - MOUND_STAY) / MOUND_DOWN));
    if (m.t > end - 0.6) m.sl = Math.max(0, m.sl - dt * 2);              // (the sludge dries up)
    else if (m.t > MOUND_UP + MOUND_STAY * 0.5) m.sl = Math.min(1, m.sl + dt * 2); // (it starts oozing)
  }
  s.mounds = s.mounds.filter(m => m.t < end);
}

function stepRain(s, dt) {
  const r = s.rain;
  if (!r) return;
  r.t -= dt;
  r.acc += dt;
  r.x += (s.cats[1 - r.o].x - r.x) * Math.min(1, dt * 1.5); // (the cloud drifts after them, a bit slowly)
  while (r.acc >= RAIN_EVERY) {
    r.acc -= RAIN_EVERY;
    s.shots.push({ x: r.x + (Math.random() - 0.5) * 2 * RAIN_SPREAD, y: 70 + Math.random() * 20, vx: 0, vy: 260 + Math.random() * 140, o: r.o, a: 0, k: 'r' });
  }
  if (r.t <= 0) s.rain = null;
}

function stepShots(s, dt, api) {
  for (const sh of s.shots) {
    const pee = sh.k !== 'p', rain = sh.k === 'r';
    sh.vy += (rain ? 900 : pee ? PEE_G : SHOT_G) * dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.a += dt;
    if (sh.dead) continue;
    if (sh.k === 'w' && sh.a > PEE_LIFE) { sh.dead = true; continue; } // (the pee only reaches so far)
    const o = s.cats[1 - sh.o], r = rain ? 5 : pee ? PEE_R : SHOT_R;
    if (Math.hypot(sh.x - o.x, sh.y - (o.y - 40)) < r + 30 || Math.hypot(sh.x - o.x, sh.y - (o.y - 74)) < r + 22) { // a hit!
      sh.dead = true;
      if (rain) {
        o.hp = Math.max(0, o.hp - RAIN_DMG);
        api.ev('drip', { x: sh.x, y: sh.y, i: 1 - sh.o });
      } else if (pee) {
        o.hp = Math.max(0, o.hp - PEE_DMG);
        o.vx += Math.sign(sh.vx) * 110;
        api.ev('wet', { x: sh.x, y: sh.y, i: 1 - sh.o });
        if (o.dz <= 0 && o.di <= 0) { // dizzy, once (then immune for a moment)
          o.dz = DIZZY;
          o.di = DIZZY + IMMUNE;
          o.strain = 0;
          api.ev('dizzy', { x: o.x, y: o.y - 118, i: 1 - sh.o });
        }
      } else {
        o.hp = Math.max(0, o.hp - DMG);
        o.vx = Math.sign(sh.vx) * 440;
        o.vy = -330;
        o.ground = false;
        o.strain = 0;
        api.ev('splat', { x: sh.x, y: sh.y, i: 1 - sh.o, hp: o.hp });
      }
      continue;
    }
    const floor = groundAt(s.mounds, sh.x);
    if (sh.y >= floor - 4) { sh.dead = true; if (!pee) api.ev('ground', { x: sh.x, y: floor }); continue; }
    if (sh.x < -30 || sh.x > W + 30) { sh.dead = true; continue; }
    if (CA.camWalls.inWall(sh.x, sh.y, 6)) { sh.dead = true; if (!pee) api.ev('ground', { x: sh.x, y: sh.y }); }
  }
  for (let p = 0; p < s.shots.length; p++) for (let q = p + 1; q < s.shots.length; q++) { // poops that meet splat each other
    const a = s.shots[p], b = s.shots[q];
    if (a.dead || b.dead || a.o === b.o || a.k !== 'p' || b.k !== 'p' || Math.hypot(a.x - b.x, a.y - b.y) > SHOT_R * 2) continue;
    a.dead = b.dead = true;
    api.ev('clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  s.shots = s.shots.filter(sh => !sh.dead);
}

function step(s, inp, dt, api) {
  if (s.done) return;
  if (s.phase === 'pause') {
    s.pause -= dt;
    s.cats.forEach(c => {
      c.vy += G * dt;
      c.x = clamp(c.x + c.vx * dt, 50, W - 50);
      c.vx *= 0.92;
      const floor = groundAt(s.mounds, c.x);
      c.y = Math.min(floor, c.y + c.vy * dt);
      if (c.y >= floor) { c.vy = 0; c.ground = true; }
      c.fa = Math.max(0, c.fa - dt);
    });
    stepMounds(s, dt);
    stepShots(s, dt, api);
    if (s.pause <= 0) {
      if (s.wins[0] >= WIN || s.wins[1] >= WIN) { s.done = true; api.end(s.wins[0] >= WIN ? 0 : 1, 'SPLAT!'); } else newRound(s, api);
    }
    return;
  }
  s.t += dt;
  stepMounds(s, dt);
  stepRain(s, dt);
  s.cats.forEach((c, i) => stepCat(s, c, i, inp[i], dt, api));
  stepShots(s, dt, api);
  const out = s.cats.map(c => c.hp <= 0);
  if (out[0] || out[1]) {
    const w = out[0] && out[1] ? -1 : out[0] ? 1 : 0;
    if (w >= 0) s.wins[w]++;
    api.score(s.wins[0], s.wins[1]);
    s.rw = w;
    s.phase = 'pause';
    s.pause = 2.2;
    s.rain = null;
  }
}

function snap(s) {
  return {
    rd: s.round, w: s.wins, ph: s.phase, rw: s.rw,
    c: s.cats.map((c, i) => ({ x: Math.round(c.x), y: Math.round(c.y), f: c.face, g: c.ground ? 1 : 0, hp: Math.round(c.hp * 10) / 10, st: c.strain > 0 ? 1 : 0, rl: r1(c.rel), fa: c.fa > 0 ? 1 : 0, dz: c.dz > 0 ? 1 : 0, r: s.roles[i], sp: r1(c.sp), sl: c.slow, hd: c.hold > 0.15 && c.sp <= 0 ? 1 : 0 })),
    sh: s.shots.map(sh => ({ x: Math.round(sh.x), y: Math.round(sh.y), a: r1(sh.a * 8), k: sh.k })),
    m: s.mounds.map(m => [Math.round(m.x), Math.round(m.h), Math.round(m.sl * 100) / 100, m.o]),
    rn: s.rain ? [Math.round(s.rain.x), s.rain.o] : 0,
  };
}

/* ---------- the bot ---------- */

// Poopoo bot: stays a good distance away, turns its butt toward you (by walking away) and poops. Peepee bot: runs up close,
// faces you and squirts. Both jump over incoming poop, get out of sludge, and use their special now and then.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i], role = s.roles[i];
  const st = s.bs || (s.bs = { think: 0, mx: 0, jump: 0, hold: 0 });
  if (s.phase !== 'fight') return { hit: {} };
  st.think -= dt;
  st.jump = Math.max(0, st.jump - dt);
  st.hold = Math.max(0, st.hold - dt);
  const dir = Math.sign(o.x - c.x) || 1;     // toward the other cat
  const out = { mx: st.mx, hit: {}, held: st.hold > 0 ? { a: true } : {} };
  if (st.think <= 0) {
    st.think = 0.05 + (1 - api.skill) * 0.15;
    const dist = Math.abs(o.x - c.x);
    if (c.sp <= 0 && st.hold <= 0 && c.dz <= 0 && Math.random() < 0.02 + 0.06 * api.skill) { st.hold = HOLD + 0.2; out.held = { a: true }; }
    if (role === 'p') {
      // face away from them (walking away does it); only come back toward them if they are very far
      st.mx = dist > 560 ? dir * 0.6 : c.face === dir ? -dir : (dist < 300 ? -dir * 0.5 : -dir * 0.12);
      if (c.x < 90 && dir > 0 && c.face === dir) st.mx = -dir; // (backed into a wall: just turn)
      if (c.face !== dir && c.rel <= 0 && c.strain <= 0 && Math.abs(o.y - c.y) < 100 && Math.random() < 0.2 + 0.6 * api.skill) out.hit.a = true;
    } else {
      st.mx = dist > 240 ? dir * 0.85 : dist < 130 ? -dir * 0.35 : dir * 0.1;      // (always keep facing them)
      if (c.face === dir && dist < 300 && c.rel <= 0 && c.dz <= 0 && Math.abs(o.y - c.y) < 90 && Math.random() < 0.3 + 0.6 * api.skill) out.hit.a = true;
    }
    if (c.slow) st.mx = c.x < W / 2 ? 1 : -1; // (get out of the sludge)
    for (const sh of s.shots) { // an incoming poop: jump over it
      if (sh.o === i || sh.k !== 'p' || st.jump > 0 || !c.ground) continue;
      if (Math.sign(sh.vx) === Math.sign(c.x - sh.x) && Math.abs(sh.x - c.x) < 260 && Math.abs(sh.x - c.x) > 60 && Math.abs(sh.y - (c.y - 40)) < 90 && Math.random() < 0.15 + 0.6 * api.skill) { out.hit.u = true; st.jump = 0.8; }
    }
  }
  out.mx = st.mx;
  return out;
}

/* ---------- drawing ---------- */

const puffs = [];                                     // green smoke (just for show, on each screen)
const puddles = [];
let emit = [0, 0], lastRd = -1;

function addPuff(x, y, vx, vy, r, life) { puffs.push({ x, y, vx, vy, r, life, max: life }); if (puffs.length > 140) puffs.shift(); }

function event(v, e) {
  if (e.type === 'strain') { v.sound([[150, 0, 0.08], [110, 0.05, 0.1]]); v.shake(2); }
  if (e.type === 'poop') {
    for (let k = 0; k < 18; k++) addPuff(e.x, e.y + (Math.random() - 0.5) * 14, e.d * (60 + Math.random() * 220), -Math.random() * 90, 10 + Math.random() * 14, 0.9 + Math.random() * 0.8);
    v.sound([[90, 0, 0.14], [140, 0.04, 0.1], [70, 0.1, 0.16]]);
    v.shake(7);
    v.pop(e.x, e.y - 34, 'PFFFT!', '#9be564');
    v.mood(e.i, 'smug', 0.8);
  }
  if (e.type === 'splat') {
    v.burst(e.x, e.y, '#7a4a1f', 22, 360);
    v.burst(e.x, e.y, '#a8682c', 10, 240);
    v.pop(e.x, e.y - 50, 'SPLAT!', '#c8864a');
    v.shake(14);
    v.sound('boom');
    v.mood(e.i, 'hurt', 1);
    v.mood(1 - e.i, 'happy', 1);
  }
  if (e.type === 'ground') { puddles.push({ x: e.x, y: e.y || GROUND, t0: performance.now() }); if (puddles.length > 8) puddles.shift(); v.burst(e.x, (e.y || GROUND) - 4, '#7a4a1f', 8, 200); v.sound([[200, 0, 0.06]]); }
  if (e.type === 'clash') { v.burst(e.x, e.y, '#7a4a1f', 14, 260); v.pop(e.x, e.y - 20, 'SPLORT!', '#c8864a'); v.sound([[300, 0, 0.05], [200, 0.04, 0.08]]); }
  if (e.type === 'pee') { v.sound([[800, 0, 0.1], [700, 0.08, 0.1]]); v.pop(e.x + e.d * 30, e.y - 26, 'PSSST!', '#ffe14d'); v.mood(e.i, 'smug', 0.6); }
  if (e.type === 'wet') { v.burst(e.x, e.y, '#ffe14d', 6, 180); v.sound([[500, 0, 0.04]]); v.mood(e.i, 'shock', 0.6); }
  if (e.type === 'drip') { v.burst(e.x, e.y, '#ffe14d', 3, 120); v.sound([[900, 0, 0.03, { w: 'sine', g: 0.4 }]]); v.mood(e.i, 'hurt', 0.4); }
  if (e.type === 'dizzy') { v.pop(e.x, e.y, 'DIZZY!', '#ffe14d'); v.sound([[300, 0, 0.1], [450, 0.08, 0.1], [300, 0.16, 0.1]]); }
  if (e.type === 'jump') v.sound([[500, 0, 0.04]]);
  if (e.type === 'mound') { // the poop mountain
    v.sound([[70, 0, 0.5, { w: 'sawtooth', to: 140, g: 0.6 }], [400, 0, 0.5, { w: 'noise', to: 120, g: 0.8 }]]);
    v.shake(16);
    v.burst(e.x, e.y - 10, '#7a4a1f', 26, 420);
    v.banner('POOP MOUNTAIN! 💩', '#c8864a');
    v.mood(e.i, 'angry', 1.2);
  }
  if (e.type === 'rain') { // the pee rain
    v.sound([[1200, 0, 0.6, { w: 'noise', to: 3000, q: 1, g: 0.7 }], [900, 0, 0.12], [1200, 0.1, 0.16]]);
    v.banner('PEE RAIN! 💦', '#ffe14d');
    v.mood(e.i, 'smug', 1.8);
    v.mood(1 - e.i, 'shock', 1.2);
  }
  if (e.type === 'round') {
    v.note('Round ' + e.n + ' · you are ' + roleName((e.r || [])[v.me]));
    puffs.length = 0;
    puddles.length = 0;
  }
}

function drawBg(v) {
  const g = v.g;
  g.fillStyle = '#c4efe8'; // a bathroom wall
  g.fillRect(0, 0, W, GROUND);
  g.strokeStyle = 'rgba(80, 160, 150, .35)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, GROUND); g.stroke(); }
  for (let y = 0; y <= GROUND; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#ff9ec9'; // a pink stripe
  g.fillRect(0, GROUND - 120, W, 18);
  g.fillStyle = '#ffe14d';
  g.fillRect(0, GROUND - 100, W, 6);
  g.fillStyle = '#8ad4ff'; // a window
  v.roundRect(W / 2 - 70, 70, 140, 110, 14); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 6; v.roundRect(W / 2 - 70, 70, 140, 110, 14); g.stroke();
  g.beginPath(); g.moveTo(W / 2, 70); g.lineTo(W / 2, 180); g.moveTo(W / 2 - 70, 125); g.lineTo(W / 2 + 70, 125); g.stroke();
  for (let x = 0; x < W; x += 48) for (let r = 0; r < 3; r++) { g.fillStyle = (x / 48 + r) % 2 ? '#fff6fb' : '#ffc7e2'; g.fillRect(x, GROUND + r * 24, 48, 24); } // a checkered floor
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, GROUND, W, 5);
  [[58, 1], [W - 58, -1]].forEach(([x, d]) => { // toilets, just for fun
    g.fillStyle = '#ffffff'; v.roundRect(x - 24, GROUND - 118, 48, 52, 8); g.fill();
    g.strokeStyle = '#cfd8e6'; g.lineWidth = 3; v.roundRect(x - 24, GROUND - 118, 48, 52, 8); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + d * 8, GROUND - 56, 36, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillRect(x - 14, GROUND - 40, 28, 40); g.strokeRect(x - 14, GROUND - 40, 28, 40);
  });
}

// A poop mountain, and the sludge puddle it leaves.
function drawMound(v, m) {
  const g = v.g, [x, h, sl] = m;
  if (sl > 0) { // the sludge: a wide brown puddle with bubbles
    g.globalAlpha = sl;
    g.fillStyle = '#6b3f1a';
    g.beginPath(); g.ellipse(x, GROUND + 4, SLUDGE_W, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a5526';
    g.beginPath(); g.ellipse(x - 20, GROUND + 1, SLUDGE_W * 0.7, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#a8682c';
    for (let k = 0; k < 6; k++) {
      const t = v.now / 600 + k * 1.7, bx = x + Math.sin(k * 2.3) * SLUDGE_W * 0.8, r = 3 + 3 * Math.abs(Math.sin(t));
      g.beginPath(); g.arc(bx, GROUND + 1 - r * 0.4, r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  if (h < 2) return;
  // the mountain: a swirly soft-serve hill, three rolls high, with a shine
  g.save();
  g.beginPath();
  g.moveTo(x - MOUND_W, GROUND);
  for (let k = 0; k <= 24; k++) { const dx = -MOUND_W + (2 * MOUND_W) * k / 24, d = dx / MOUND_W; g.lineTo(x + dx, GROUND - h * (1 - d * d)); }
  g.closePath();
  const gr = g.createLinearGradient(0, GROUND - h, 0, GROUND);
  gr.addColorStop(0, '#9a6232'); gr.addColorStop(1, '#5e3615');
  g.fillStyle = gr;
  g.fill();
  g.clip();
  g.strokeStyle = 'rgba(40, 20, 6, .45)';
  g.lineWidth = 4;
  for (let k = 1; k <= 3; k++) { // the rolls
    const y = GROUND - h * (k / 3.6);
    g.beginPath(); g.moveTo(x - MOUND_W, y + 8); g.quadraticCurveTo(x, y - 14, x + MOUND_W, y + 8); g.stroke();
  }
  g.fillStyle = 'rgba(255, 255, 255, .18)';
  g.beginPath(); g.ellipse(x - MOUND_W * 0.3, GROUND - h * 0.7, 14, 26, -0.5, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = 'rgba(100, 160, 60, .5)'; // a little stink above it
  for (let k = 0; k < 3; k++) {
    const t = (v.now / 900 + k / 3) % 1;
    g.globalAlpha = 0.5 * (1 - t);
    g.beginPath(); g.arc(x - 20 + k * 20 + Math.sin(t * 6 + k) * 6, GROUND - h - 10 - t * 40, 6 + t * 8, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

// The pee rain's cloud, over the other cat.
function drawCloud(v, x) {
  const g = v.g, y = 70 + Math.sin(v.now / 200) * 3;
  g.fillStyle = 'rgba(255, 236, 140, .95)';
  g.strokeStyle = '#d6b42a';
  g.lineWidth = 3;
  g.beginPath();
  [[-60, 6, 26], [-28, -8, 32], [8, -14, 36], [44, -4, 30], [70, 8, 22]].forEach(([dx, dy, r]) => { g.moveTo(x + dx + r, y + dy); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); });
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255, 236, 140, .95)';
  g.fillRect(x - 70, y, 150, 20);
}

const jig = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }]; // a spring per butt, so it flops about after you move

// One big round butt, part of the cat's body: it bulges out the back from the waist, with a crease and a shine, and the
// tail swishing up out of the top of it. It wobbles on a spring when the cat moves, and shakes while pooping.
function drawButt(v, i, c) {
  const g = v.g, fur = v.looks[i].fur, d = -c.f, dt = Math.min(v.dt || 0.016, 0.05), j = jig[i] || (jig[i] = { x: 0, y: 0, vx: 0, vy: 0 });
  const strain = c.st ? Math.sin(v.now / 28) * 6 : 0; // (a strong shake while pooping)
  const tx = -(c.vx || 0) * 0.06 * d + strain, ty = -(c.vy || 0) * 0.05;
  j.vx += ((tx - j.x) * 380 - j.vx * 7) * dt; j.vy += ((ty - j.y) * 380 - j.vy * 7) * dt;
  j.x += j.vx * dt; j.y += j.vy * dt;
  const jx = clamp(j.x, -12, 12), jy = clamp(j.y + Math.sin(v.now / 170 + i) * 1.2, -12, 12);
  g.save();
  g.translate(c.x + d * 12, c.y - 30);
  g.scale(d, 1); // from here +x is out the back
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // the tail first, so the butt sits in front of where it starts
  const wag = Math.sin(v.now / 260 + i * 2) * 8 + jx * 0.6;
  g.strokeStyle = fur.dark; g.lineWidth = 13;
  g.beginPath(); g.moveTo(26, -26); g.bezierCurveTo(48, -46, 70 + wag, -62, 58 + wag * 1.4, -96); g.stroke();
  g.strokeStyle = fur.mid; g.lineWidth = 8.5;
  g.beginPath(); g.moveTo(26, -26); g.bezierCurveTo(48, -46, 70 + wag, -62, 58 + wag * 1.4, -96); g.stroke();
  // the butt: one round shape from the waist, out and down, and back under to the legs
  const gr = g.createRadialGradient(22 + jx, -10 + jy, 4, 24 + jx, 0 + jy, 52);
  gr.addColorStop(0, fur.light); gr.addColorStop(0.75, fur.mid); gr.addColorStop(1, fur.dark);
  g.fillStyle = gr;
  g.strokeStyle = fur.dark;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-8, -30);
  g.bezierCurveTo(22 + jx * 0.6, -44 + jy * 0.5, 58 + jx, -24 + jy, 56 + jx, 4 + jy);
  g.bezierCurveTo(54 + jx, 30 + jy, 22 + jx * 0.5, 40 + jy * 0.6, -6, 28);
  g.closePath();
  g.fill();
  g.stroke();
  // the crease, and a shine
  g.strokeStyle = fur.dark; g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(8, -14); g.quadraticCurveTo(34 + jx * 0.8, -12 + jy, 50 + jx, 8 + jy); g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, .28)';
  g.beginPath(); g.ellipse(26 + jx * 0.8, -20 + jy * 0.8, 11, 6, -0.35, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawCat(v, s, i, c) {
  const g = v.g, poopoo = c.r === 'p', reload = poopoo ? RELOAD : PEE_RELOAD;
  g.fillStyle = v.team[i].main; g.globalAlpha = 0.3;
  g.beginPath(); g.ellipse(c.x, groundAt(s.m || [], c.x) + 6, 40, 9, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  drawButt(v, i, c);
  // (its face: dizzy, straining, about to do its special, or stuck in sludge; otherwise whatever its mood is)
  const face = c.dz ? 'dizzy' : c.st ? 'squint' : c.hd ? 'angry' : c.sl ? 'hurt' : undefined;
  v.catSide(i, c.x, c.y, 1, { lookRight: c.f > 0, face, bob: 0.25, tilt: c.st ? Math.sin(v.now / 30) * 0.05 : c.dz ? Math.sin(v.now / 90) * 0.14 : 0 });
  if (c.dz) { g.fillStyle = '#ffe14d'; for (let k = 0; k < 3; k++) { const a = v.now / 150 + k * 2.1; v.star(c.x + Math.cos(a) * 26, c.y - 104 + Math.sin(a) * 8, 7); } } // dizzy: stars going round the head
  if (c.hd) { // charging up the special: a glow round it
    g.strokeStyle = poopoo ? 'rgba(160, 100, 40, .7)' : 'rgba(255, 225, 77, .8)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(c.x, c.y - 50, 58 + Math.sin(v.now / 60) * 4, 0, Math.PI * 2); g.stroke();
  }
  const sense = c.rl > 0 ? 1 - clamp(c.rl / reload, 0, 1) : 1; // the reload meter
  g.fillStyle = 'rgba(40, 20, 10, .6)'; v.roundRect(c.x - 24, c.y - 118, 48, 8, 4); g.fill();
  g.fillStyle = sense >= 1 ? (poopoo ? '#9be564' : '#ffe14d') : '#c8a46a'; v.roundRect(c.x - 23, c.y - 117, Math.max(3, 46 * sense), 6, 3); g.fill();
  // the special: a ring that fills up, and a star when it's ready
  const sp = 1 - clamp((c.sp || 0) / SPECIAL_WAIT, 0, 1), sx = c.x + 36, sy = c.y - 114;
  g.fillStyle = 'rgba(40, 20, 10, .6)'; g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = sp >= 1 ? '#ffd23f' : '#c8a46a'; g.lineWidth = 3;
  g.beginPath(); g.arc(sx, sy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sp); g.stroke();
  if (sp >= 1) { g.fillStyle = '#ffd23f'; v.star(sx, sy, 6 + Math.sin(v.now / 120)); }
  v.label(i === v.me ? 'You' : v.names[i], c.x, c.y - 134, 12, i === v.me ? '#ffd23f' : '#ffffff');
  v.label(poopoo ? '💩 POOPOO' : '💦 PEEPEE', c.x, c.y - 150, 11, poopoo ? '#b9e98a' : '#ffe14d');
}

function drawPuffs(v) {
  const g = v.g, dt = Math.min(v.dt, 0.05), pic = puffPicture();
  for (let k = puffs.length - 1; k >= 0; k--) {
    const p = puffs[k];
    p.life -= dt;
    if (p.life <= 0) { puffs.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.25, dt); p.vy = p.vy * Math.pow(0.4, dt) - 18 * dt;
    const a = p.life / p.max, r = p.r + (1 - a) * 22;
    g.globalAlpha = a;
    g.drawImage(pic, p.x - r, p.y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

// One puff of smoke, painted once: every puff on the screen is this picture, bigger or smaller and more or less faded.
// (Painting each puff from scratch on every frame, a hundred of them, is what made slower computers stutter.)
let puffPic = null;
function puffPicture() {
  if (puffPic) return puffPic;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d'), gr = x.createRadialGradient(48, 48, 1, 48, 48, 48);
  gr.addColorStop(0, 'rgba(160, 235, 90, .62)');
  gr.addColorStop(0.6, 'rgba(110, 195, 60, .4)');
  gr.addColorStop(1, 'rgba(90, 160, 50, 0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 96, 96);
  return (puffPic = c);
}

function draw(v, s) {
  const g = v.g;
  if (s.rd !== lastRd) { lastRd = s.rd; puffs.length = 0; puddles.length = 0; }
  drawBg(v);
  const now = performance.now();
  puddles.forEach(p => { // old poops on the floor
    const a = clamp(1 - (now - p.t0) / 9000, 0, 1);
    if (p.y < GROUND - 2) return;
    g.globalAlpha = a;
    g.fillStyle = '#6b3f1a'; g.beginPath(); g.ellipse(p.x, GROUND + 3, 26, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a5526'; g.beginPath(); g.ellipse(p.x - 4, GROUND + 1, 14, 3.5, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  });
  (s.m || []).forEach(m => drawMound(v, m));
  s.c.forEach((c, i) => { // fart smoke from the butt while pooping
    if (!c.fa) { emit[i] = 0; return; }
    emit[i] += v.dt * 80;
    const d = -c.f;
    while (emit[i] >= 1) { emit[i]--; addPuff(c.x + d * 50, c.y - 26 + (Math.random() - 0.5) * 16, d * (30 + Math.random() * 110), -10 - Math.random() * 50, 8 + Math.random() * 9, 0.8 + Math.random() * 0.8); }
  });
  s.c.forEach((c, i) => drawCat(v, s, i, c));
  drawPuffs(v);
  if (s.rn) drawCloud(v, s.rn[0]);
  s.sh.forEach(p => {
    if (p.k === 'r') { // a raindrop of pee
      g.fillStyle = '#ffe14d';
      g.beginPath(); g.moveTo(p.x, p.y - 8); g.quadraticCurveTo(p.x + 4, p.y, p.x, p.y + 3); g.quadraticCurveTo(p.x - 4, p.y, p.x, p.y - 8); g.fill();
      return;
    }
    if (p.k === 'w') { // a drop of pee
      g.fillStyle = 'rgba(255, 235, 120, .35)'; g.beginPath(); g.arc(p.x, p.y, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(p.x, p.y, 5.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(p.x - 1.5, p.y - 1.5, 2, 0, Math.PI * 2); g.fill();
      return;
    }
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a * 0.9);
    g.font = '30px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText('💩', 0, 0);
    g.restore();
  });
  // health bars along the top, between the camera walls
  [0, 1].forEach(i => {
    const c = s.c[i], x0 = i === 0 ? 200 : 520, w = 240;
    g.fillStyle = 'rgba(40, 20, 10, .7)'; v.roundRect(x0, 14, w, 20, 10); g.fill();
    g.fillStyle = c.hp > 50 ? '#3ddc84' : c.hp > 25 ? '#ffd23f' : '#ff5a5a';
    if (c.hp > 0) { v.roundRect(x0 + 3, 17, (w - 6) * c.hp / HP, 14, 7); g.fill(); }
    v.label((i === v.me ? 'You' : v.names[i]) + '  ' + '💩'.repeat(s.w[i]), x0 + w / 2, 24, 12, '#ffffff');
  });
  v.label('Round ' + s.rd, W / 2, 48, 13, '#5a3b22');
  if (s.ph === 'pause') v.bigText(s.rw < 0 ? 'Both splatted! Again' : s.rw === v.me ? 'You win the round!' : v.names[s.rw] + ' wins the round!', 100, 32, '#7a4a1f', 1);
  const mine = s.c[v.me], them = s.c[1 - v.me];
  if (mine && s.ph === 'fight') {
    const ready = mine.sp <= 0 ? ' · ★ HOLD Space for your special!' : '';
    if (mine.dz) v.msg('You are dizzy!');
    else if (mine.sl) v.msg('You\'re stuck in the sludge! Get out!', true);
    else if (mine.r === 'p') {
      const facingAway = them && (them.x - mine.x) * mine.f < 0;
      v.msg((mine.rl > 0 ? "You're POOPOO 💩 · reloading…" : facingAway ? "You're POOPOO 💩 · your butt is aimed at them: press SPACE to poop!" : "You're POOPOO 💩 · walk away from them to aim your butt, then SPACE") + ready);
    } else v.msg((mine.rl > 0 ? "You're PEEPEE 💦 · reloading…" : "You're PEEPEE 💦 · face them and press SPACE to squirt (get close!)") + ready);
  }
}

})();
