/* Classic Games: Poop Showdown. A silly cartoon arena with two cats with big butts. You can't
   poop at somebody who is in front of you: turn your butt toward the other cat (just walk away from them, your cat
   faces the way it walks), then left-click. You strain for a moment (green fart smoke!) and fire a powerful poop out the
   back. A poop hit takes a third of your health and knocks you away; poops that meet in the air splat each other. Jump
   over theirs. Right-click is a short-range pee in front of you that leaves the other cat dizzy for a second. Space or W jumps. First to win 2 rounds. (The host's app runs the fight: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, GROUND = 470;
const G = 2100, RUN = 270, ACCEL = 2600, AIR_ACCEL = 1500, JUMP = 770;
const HP = 100, DMG = 34, RELOAD = 1.1, STRAIN = 0.3;
const SHOT_V = 840, SHOT_G = 430, SHOT_R = 13;
const PEE_RANGE = 170, PEE_TIME = 0.4, PEE_WAIT = 2.6, DIZZY = 1;   // the pee only reaches just in front of you
const WIN = 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;

CA.games.add('poop', {
  name: 'Poop Showdown', icon: '💩',
  blurb: 'Two cats with big butts! Turn your butt toward the other cat (walk away from them) and LEFT-CLICK to blast a powerful poop out the back, with green fart smoke. RIGHT-CLICK to pee in front of you: a short spray that makes them dizzy for a second. Space jumps over theirs! First to win 2 rounds.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'poop', mouse: true,
      pad: { stick: true, buttons: [{ k: 'a', label: '⤒ Jump' }, { k: 'alt', label: '💦 Pee' }, { k: 'fire', label: '💩 Poop', main: true }] },
      help: 'A/D walk (your cat faces the way it walks) · turn your BUTT toward them, then LEFT-CLICK fires a poop out the back · RIGHT-CLICK pees in front of you (dizzy!) · Space or W jumps · first to 2 rounds',
      helpTouch: 'Stick walks · face away from them, then Poop! · Pee when they are close in front of you · Jump over theirs',
      note: 'First to ' + WIN + ' rounds',
      init, step, snap, bot, draw, event,
    });
  },
});

function newCat(x, face) {
  return { x, y: GROUND, vx: 0, vy: 0, ground: true, face, hp: HP, strain: 0, rel: 0.8, fa: 0, pe: 0, pc: 0, peHit: false, dz: 0 };
}

function init(api) {
  const s = { wins: [0, 0], round: 0, phase: 'fight', pause: 0, rw: -1, cats: [], shots: [], t: 0, done: false };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.phase = 'fight';
  s.rw = -1;
  s.shots = [];
  s.cats = [newCat(250, 1), newCat(710, -1)];
  api.ev('round', { n: s.round });
}

function shoot(s, c, i, api) {
  const d = -c.face; // out the back
  s.shots.push({ x: c.x + d * 34, y: c.y - 30, vx: d * SHOT_V, vy: -130, o: i, a: 0 });
  c.rel = RELOAD;
  c.vx += c.face * 190; // (a little kick forward)
  api.ev('poop', { x: c.x + d * 36, y: c.y - 30, d });
}

function stepCat(s, c, i, n, dt, api) {
  c.rel = Math.max(0, c.rel - dt);
  c.fa = Math.max(0, c.fa - dt);
  c.pc = Math.max(0, c.pc - dt);
  c.dz = Math.max(0, c.dz - dt);
  if (c.strain > 0) { // straining: stuck for a moment, rear end wiggling
    c.strain -= dt;
    c.vx *= Math.pow(0.02, dt);
    if (c.strain <= 0) shoot(s, c, i, api);
  } else if (c.pe > 0) { // peeing: a short spray in front of you, it makes the other cat dizzy
    c.pe -= dt;
    c.vx *= Math.pow(0.02, dt);
    const o = s.cats[1 - i];
    if (!c.peHit && (o.x - c.x) * c.face > 0 && Math.abs(o.x - c.x) < PEE_RANGE && Math.abs(o.y - c.y) < 80) {
      c.peHit = true;
      o.dz = DIZZY;
      o.strain = 0;
      o.pe = 0;
      api.ev('dizzy', { x: o.x, y: o.y - 118, i: 1 - i });
    }
  } else {
    const dizzy = c.dz > 0, mx = dizzy ? -n.mx * 0.5 : n.mx; // (dizzy: you stumble the wrong way, slowly, and can't do anything else)
    if (mx) c.face = mx > 0 ? 1 : -1;
    c.vx = approach(c.vx, mx * RUN, (c.ground ? ACCEL : AIR_ACCEL) * dt);
    if (!dizzy && c.ground && (n.hit.u || n.hit.a || n.my < -0.7)) { c.vy = -JUMP; c.ground = false; api.ev('jump', {}); }
    if (!dizzy && n.hit.fire && c.rel <= 0) { c.strain = STRAIN; c.fa = 1; api.ev('strain', { x: c.x - c.face * 36, y: c.y - 30 }); }
    if (!dizzy && n.hit.alt && c.pc <= 0) { c.pe = PEE_TIME; c.pc = PEE_WAIT; c.peHit = false; api.ev('pee', { x: c.x + c.face * 30, y: c.y - 34, d: c.face }); }
  }
  c.vy += G * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  if (c.y >= GROUND) { c.y = GROUND; c.vy = 0; c.ground = true; } else c.ground = false;
  if (c.x < 50 || c.x > W - 50) { c.x = clamp(c.x, 50, W - 50); c.vx = 0; }
  const p = CA.camWalls.push(c.x, c.y - 80, 26);  // (the camera walls in the top corners)
  if (p) { c.x = p.x; c.y = p.y + 80; if (c.vy < 0) c.vy = 0; }
}

function stepShots(s, dt, api) {
  for (const sh of s.shots) {
    sh.vy += SHOT_G * dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.a += dt;
    if (sh.dead) continue;
    const o = s.cats[1 - sh.o];
    if (Math.hypot(sh.x - o.x, sh.y - (o.y - 40)) < SHOT_R + 30 || Math.hypot(sh.x - o.x, sh.y - (o.y - 74)) < SHOT_R + 22) { // a hit!
      sh.dead = true;
      o.hp = Math.max(0, o.hp - DMG);
      o.vx = Math.sign(sh.vx) * 440;
      o.vy = -330;
      o.ground = false;
      o.strain = 0;
      api.ev('splat', { x: sh.x, y: sh.y, i: 1 - sh.o, hp: o.hp });
      continue;
    }
    if (sh.y >= GROUND - 4) { sh.dead = true; api.ev('ground', { x: sh.x }); continue; }
    if (sh.x < -30 || sh.x > W + 30) { sh.dead = true; continue; }
    if (CA.camWalls.inWall(sh.x, sh.y, 6)) { sh.dead = true; api.ev('ground', { x: sh.x, y: sh.y }); }
  }
  for (let p = 0; p < s.shots.length; p++) for (let q = p + 1; q < s.shots.length; q++) { // poops that meet splat each other
    const a = s.shots[p], b = s.shots[q];
    if (a.dead || b.dead || a.o === b.o || Math.hypot(a.x - b.x, a.y - b.y) > SHOT_R * 2) continue;
    a.dead = b.dead = true;
    api.ev('clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  s.shots = s.shots.filter(sh => !sh.dead);
}

function step(s, inp, dt, api) {
  if (s.done) return;
  if (s.phase === 'pause') {
    s.pause -= dt;
    s.cats.forEach(c => { c.vy += G * dt; c.y = Math.min(GROUND, c.y + c.vy * dt); c.x = clamp(c.x + c.vx * dt, 50, W - 50); c.vx *= 0.92; if (c.y >= GROUND) { c.y = GROUND; c.vy = 0; c.ground = true; } c.fa = Math.max(0, c.fa - dt); });
    stepShots(s, dt, api);
    if (s.pause <= 0) {
      if (s.wins[0] >= WIN || s.wins[1] >= WIN) { s.done = true; api.end(s.wins[0] >= WIN ? 0 : 1, 'SPLAT!'); } else newRound(s, api);
    }
    return;
  }
  s.t += dt;
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
  }
}

function snap(s) {
  return {
    rd: s.round, w: s.wins, ph: s.phase, rw: s.rw,
    c: s.cats.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), f: c.face, g: c.ground ? 1 : 0, hp: c.hp, st: c.strain > 0 ? 1 : 0, rl: r1(c.rel), fa: c.fa > 0 ? 1 : 0, pe: c.pe > 0 ? 1 : 0, pc: r1(c.pc), dz: c.dz > 0 ? 1 : 0 })),
    sh: s.shots.map(sh => ({ x: Math.round(sh.x), y: Math.round(sh.y), a: r1(sh.a * 8) })),
  };
}

/* ---------- the bot ---------- */

// The bot stays a good distance away, turns its butt toward you (by walking away) and poops; it jumps over incoming poops.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = { think: 0, mx: 0, jump: 0 });
  if (s.phase !== 'fight') return { hit: {} };
  st.think -= dt;
  st.jump = Math.max(0, st.jump - dt);
  const dir = Math.sign(o.x - c.x) || 1;     // toward the other cat
  const out = { mx: st.mx, hit: {} };
  if (st.think <= 0) {
    st.think = 0.05 + (1 - api.skill) * 0.15;
    const dist = Math.abs(o.x - c.x);
    // face away from them (walking away does it); only come back toward them if they are very far
    st.mx = dist > 560 ? dir * 0.6 : c.face === dir ? -dir : (dist < 300 ? -dir * 0.5 : -dir * 0.12);
    if (c.x < 90 && dir > 0 && c.face === dir) st.mx = -dir; // (backed into a wall: just turn)
    if (c.face !== dir && c.rel <= 0 && c.strain <= 0 && Math.abs(o.y - c.y) < 100 && Math.random() < 0.2 + 0.6 * api.skill) out.hit.fire = true;
    if (dist < PEE_RANGE - 20 && c.pc <= 0 && c.dz <= 0 && Math.abs(o.y - c.y) < 70 && Math.random() < 0.3 + 0.5 * api.skill) { // they're close: turn toward them and pee
      if (c.face === dir) out.hit.alt = true; else st.mx = dir * 0.2;
    }
    for (const sh of s.shots) { // an incoming poop: jump over it
      if (sh.o === i || st.jump > 0 || !c.ground) continue;
      if (Math.sign(sh.vx) === Math.sign(c.x - sh.x) && Math.abs(sh.x - c.x) < 260 && Math.abs(sh.x - c.x) > 60 && Math.abs(sh.y - (c.y - 40)) < 90 && Math.random() < 0.15 + 0.6 * api.skill) { out.hit.u = true; st.jump = 0.8; }
    }
  }
  out.mx = st.mx;
  return out;
}

/* ---------- drawing ---------- */

const puffs = [];                                     // green smoke (just for show, on each screen)
const puddles = [];
const drops = [];                                     // pee (just for show)
let emit = [0, 0], lastRd = -1;

function addDrop(x, y, vx, vy) { drops.push({ x, y, vx, vy, life: 0.55, max: 0.55 }); if (drops.length > 160) drops.shift(); }
function addPuff(x, y, vx, vy, r, life) { puffs.push({ x, y, vx, vy, r, life, max: life }); if (puffs.length > 140) puffs.shift(); }

function event(v, e) {
  if (e.type === 'strain') { v.sound([[150, 0, 0.08], [110, 0.05, 0.1]]); v.shake(2); }
  if (e.type === 'poop') {
    for (let k = 0; k < 18; k++) addPuff(e.x, e.y + (Math.random() - 0.5) * 14, e.d * (60 + Math.random() * 220), -Math.random() * 90, 10 + Math.random() * 14, 0.9 + Math.random() * 0.8);
    v.sound([[90, 0, 0.14], [140, 0.04, 0.1], [70, 0.1, 0.16]]);
    v.shake(7);
    v.pop(e.x, e.y - 34, 'PFFFT!', '#9be564');
  }
  if (e.type === 'splat') {
    v.burst(e.x, e.y, '#7a4a1f', 22, 360);
    v.burst(e.x, e.y, '#a8682c', 10, 240);
    v.pop(e.x, e.y - 50, 'SPLAT!', '#c8864a');
    v.shake(14);
    v.sound('boom');
  }
  if (e.type === 'ground') { puddles.push({ x: e.x, t0: performance.now() }); if (puddles.length > 8) puddles.shift(); v.burst(e.x, GROUND - 4, '#7a4a1f', 8, 200); v.sound([[200, 0, 0.06]]); }
  if (e.type === 'clash') { v.burst(e.x, e.y, '#7a4a1f', 14, 260); v.pop(e.x, e.y - 20, 'SPLORT!', '#c8864a'); v.sound([[300, 0, 0.05], [200, 0.04, 0.08]]); }
  if (e.type === 'pee') { for (let k = 0; k < 26; k++) addDrop(e.x, e.y, e.d * (180 + Math.random() * 220), -90 + Math.random() * 150); v.sound([[800, 0, 0.12], [700, 0.1, 0.12], [600, 0.2, 0.12]]); v.pop(e.x + e.d * 40, e.y - 30, 'PSSSS!', '#ffe14d'); }
  if (e.type === 'dizzy') { v.pop(e.x, e.y, 'DIZZY!', '#ffe14d'); v.sound([[300, 0, 0.1], [450, 0.08, 0.1], [300, 0.16, 0.1]]); }
  if (e.type === 'jump') v.sound([[500, 0, 0.04]]);
  if (e.type === 'round') { v.note('Round ' + e.n + ' · first to ' + WIN); puffs.length = 0; puddles.length = 0; drops.length = 0; }
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

function drawButt(v, i, c) {
  const g = v.g, fur = v.looks[i].fur, d = -c.f;
  const bx = c.x + d * 24, by = c.y - 28;
  const wob = c.st ? 1 + 0.14 * Math.sin(v.now / 32) : 1;
  g.save();
  g.translate(bx, by);
  g.scale(wob, 1 / wob);
  const gr = g.createRadialGradient(-d * 4, -10, 4, 0, 0, 30);
  gr.addColorStop(0, fur.light); gr.addColorStop(1, fur.mid);
  g.fillStyle = gr; g.strokeStyle = fur.dark; g.lineWidth = 3;
  [[0, -11], [0, 11]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 19, 0, Math.PI * 2); g.fill(); g.stroke(); }); // two big cheeks
  g.beginPath(); g.arc(0, -11, 17, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); // (the top one on top, so the seam shows)
  g.strokeStyle = fur.dark; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-d * 6, -1); g.quadraticCurveTo(d * 3, 0, d * 17, 0); g.stroke();
  g.restore();
}

function drawCat(v, s, i, c) {
  const g = v.g;

  g.fillStyle = v.team[i].main; g.globalAlpha = 0.3;
  g.beginPath(); g.ellipse(c.x, GROUND + 6, 40, 9, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  drawButt(v, i, c);
  v.catSide(i, c.x, c.y, 1, { lookRight: c.f > 0, tilt: c.st ? Math.sin(v.now / 30) * 0.05 : c.dz ? Math.sin(v.now / 90) * 0.14 : 0 });
  if (c.dz) { g.fillStyle = '#ffe14d'; for (let k = 0; k < 3; k++) { const a = v.now / 150 + k * 2.1; v.star(c.x + Math.cos(a) * 26, c.y - 104 + Math.sin(a) * 8, 7); } } // dizzy: stars going round the head
  const sense = c.rl > 0 ? 1 - clamp(c.rl / RELOAD, 0, 1) : 1; // the reload meter
  g.fillStyle = 'rgba(40, 20, 10, .6)'; v.roundRect(c.x - 24, c.y - 118, 48, 8, 4); g.fill();
  g.fillStyle = sense >= 1 ? '#9be564' : '#c8a46a'; v.roundRect(c.x - 23, c.y - 117, Math.max(3, 46 * sense), 6, 3); g.fill();
  v.label(i === v.me ? 'You' : v.names[i], c.x, c.y - 134, 12, i === v.me ? '#ffd23f' : '#ffffff');
}

function drawPuffs(v) {
  const g = v.g, dt = Math.min(v.dt, 0.05);
  for (let k = puffs.length - 1; k >= 0; k--) {
    const p = puffs[k];
    p.life -= dt;
    if (p.life <= 0) { puffs.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.25, dt); p.vy = p.vy * Math.pow(0.4, dt) - 18 * dt;
    const a = p.life / p.max, r = p.r + (1 - a) * 22;
    const gr = g.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
    gr.addColorStop(0, 'rgba(160, 235, 90, ' + (0.62 * a) + ')');
    gr.addColorStop(0.6, 'rgba(110, 195, 60, ' + (0.4 * a) + ')');
    gr.addColorStop(1, 'rgba(90, 160, 50, 0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
  }
}

function draw(v, s) {
  const g = v.g;
  if (s.rd !== lastRd) { lastRd = s.rd; puffs.length = 0; puddles.length = 0; }
  drawBg(v);
  const now = performance.now();
  puddles.forEach(p => { // old poops on the floor
    const a = clamp(1 - (now - p.t0) / 9000, 0, 1);
    g.globalAlpha = a;
    g.fillStyle = '#6b3f1a'; g.beginPath(); g.ellipse(p.x, GROUND + 3, 26, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8a5526'; g.beginPath(); g.ellipse(p.x - 4, GROUND + 1, 14, 3.5, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  });
  s.c.forEach((c, i) => { // fart smoke from the butt while pooping
    if (!c.fa) { emit[i] = 0; return; }
    emit[i] += v.dt * 80;
    const d = -c.f;
    while (emit[i] >= 1) { emit[i]--; addPuff(c.x + d * 40, c.y - 28 + (Math.random() - 0.5) * 16, d * (30 + Math.random() * 110), -10 - Math.random() * 50, 8 + Math.random() * 9, 0.8 + Math.random() * 0.8); }
  });
  s.c.forEach((c, i) => drawCat(v, s, i, c));
  drawPuffs(v);
  { // the pee
    const dt = Math.min(v.dt, 0.05);
    s.c.forEach(c => { if (c.pe) for (let k = 0; k < 2; k++) addDrop(c.x + c.f * 32, c.y - 34, c.f * (160 + Math.random() * 220), -70 + Math.random() * 130); });
    for (let k = drops.length - 1; k >= 0; k--) {
      const d = drops[k];
      d.life -= dt;
      if (d.life <= 0 || d.y > GROUND) { drops.splice(k, 1); continue; }
      d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      g.fillStyle = 'rgba(255, 225, 60, ' + (0.4 + 0.6 * d.life / d.max) + ')';
      g.beginPath(); g.arc(d.x, d.y, 3.2, 0, Math.PI * 2); g.fill();
    }
  }
  s.sh.forEach(p => {
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
    const facingAway = them && (them.x - mine.x) * mine.f < 0;
    v.msg(mine.dz ? 'You are dizzy!' : mine.rl > 0 ? 'Reloading…' : facingAway ? 'Your butt is aimed at them: LEFT-CLICK to POOP! (right-click pees in front of you)' : 'Walk away from them to aim your butt, then LEFT-CLICK · RIGHT-CLICK pees in front of you');
  }
}

})();
