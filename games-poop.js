/* Classic Games: Poop Showdown. A silly cartoon arena with two cats with big butts, and each round one of you is
   POOPOO and the other PEEPEE (you swap every round, so it's fair). Space shoots, W jumps.
   - POOPOO can't poop at somebody who is in front of you: turn your butt toward the other cat (just walk away from them,
     your cat faces the way it walks), then press Space. You strain for a moment (green fart smoke!) and fire a powerful
     poop out the back. A poop hit takes a third of your health and knocks you away; poops that meet in the air splat each
     other.
   - PEEPEE squirts pee straight ahead (a quick spray with a short reach, and only a short wait): it takes a little health,
     and the first drops to hit leave the other cat dizzy for a second (they stumble the wrong way and can't do
     anything), then they can't be made dizzy again for a moment.
   First to win 2 rounds. (The host's app runs the fight: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, GROUND = 470;
const G = 2100, RUN = 270, ACCEL = 2600, AIR_ACCEL = 1500, JUMP = 770;
const HP = 100, DMG = 34, RELOAD = 1.1, STRAIN = 0.3;            // poop
const SHOT_V = 840, SHOT_G = 430, SHOT_R = 13;
const PEE_DMG = 5, PEE_RELOAD = 0.85, PEE_V = 720, PEE_G = 240, PEE_LIFE = 0.42, PEE_R = 7;   // pee: 3 drops a squirt
const DIZZY = 1, IMMUNE = 1.2;                                   // dizzy this long, then can't be made dizzy for this long
const WIN = 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;
const roleName = r => (r === 'p' ? 'POOPOO 💩' : 'PEEPEE 💦');

CA.games.add('poop', {
  name: 'Poop Showdown', icon: '💩',
  blurb: 'One of you is POOPOO and one is PEEPEE (you swap every round). Poopoo turns their big butt toward the other cat (walk away from them) and blasts a powerful poop out the back with green fart smoke. Peepee squirts pee straight ahead and makes them dizzy. Space shoots, W jumps! First to win 2 rounds.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'poop',
      pad: { stick: true, buttons: [{ k: 'u', label: '⤒ Jump' }, { k: 'a', label: '💩💦 Shoot', main: true }] },
      help: 'A/D walk (your cat faces the way it walks) · Space shoots · W jumps · POOPOO: turn your BUTT toward them first · PEEPEE: face them and squirt · first to 2 rounds',
      helpTouch: 'Stick walks · Shoot · Jump · Poopoo shoots out the back, Peepee shoots ahead',
      note: 'First to ' + WIN + ' rounds',
      init, step, snap, bot, draw, event,
    });
  },
});

function newCat(x, face) {
  return { x, y: GROUND, vx: 0, vy: 0, ground: true, face, hp: HP, strain: 0, rel: 0.8, fa: 0, dz: 0, di: 0 };
}

function init(api) {
  const s = { wins: [0, 0], round: 0, phase: 'fight', pause: 0, rw: -1, cats: [], shots: [], roles: ['p', 'w'], t: 0, done: false };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.phase = 'fight';
  s.rw = -1;
  s.shots = [];
  s.roles = (s.round % 2 === 1) ? ['p', 'w'] : ['w', 'p']; // (the host is Poopoo first, then you swap every round)
  s.cats = [newCat(250, 1), newCat(710, -1)];
  api.ev('round', { n: s.round, r: s.roles });
}

function shoot(s, c, i, api) { // a poop, out the back
  const d = -c.face;
  s.shots.push({ x: c.x + d * 34, y: c.y - 30, vx: d * SHOT_V, vy: -130, o: i, a: 0, k: 'p' });
  c.rel = RELOAD;
  c.vx += c.face * 190; // (a little kick forward)
  api.ev('poop', { x: c.x + d * 36, y: c.y - 30, d });
}

function squirt(s, c, i, api) { // pee, straight ahead: three drops, a little spread
  for (let k = -1; k <= 1; k++) s.shots.push({ x: c.x + c.face * 30, y: c.y - 36 + k * 4, vx: c.face * (PEE_V + k * 30), vy: k * 60 - 20, o: i, a: 0, k: 'w' });
  c.rel = PEE_RELOAD;
  api.ev('pee', { x: c.x + c.face * 34, y: c.y - 36, d: c.face });
}

function stepCat(s, c, i, n, dt, api) {
  const role = s.roles[i];
  c.rel = Math.max(0, c.rel - dt);
  c.fa = Math.max(0, c.fa - dt);
  c.dz = Math.max(0, c.dz - dt);
  c.di = Math.max(0, c.di - dt);
  if (c.strain > 0) { // straining: stuck for a moment, rear end wiggling
    c.strain -= dt;
    c.vx *= Math.pow(0.02, dt);
    if (c.strain <= 0) shoot(s, c, i, api);
  } else {
    const dizzy = c.dz > 0, mx = dizzy ? -n.mx * 0.5 : n.mx; // (dizzy: you stumble the wrong way, slowly, and can't do anything else)
    if (mx) c.face = mx > 0 ? 1 : -1;
    c.vx = approach(c.vx, mx * RUN, (c.ground ? ACCEL : AIR_ACCEL) * dt);
    if (!dizzy && c.ground && (n.hit.u || n.my < -0.7)) { c.vy = -JUMP; c.ground = false; api.ev('jump', {}); }
    if (!dizzy && n.hit.a && c.rel <= 0) {
      if (role === 'p') { c.strain = STRAIN; c.fa = 1; api.ev('strain', { x: c.x - c.face * 36, y: c.y - 30 }); } else squirt(s, c, i, api);
    }
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
    const pee = sh.k === 'w';
    sh.vy += (pee ? PEE_G : SHOT_G) * dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.a += dt;
    if (sh.dead) continue;
    if (pee && sh.a > PEE_LIFE) { sh.dead = true; continue; } // (the pee only reaches so far)
    const o = s.cats[1 - sh.o], r = pee ? PEE_R : SHOT_R;
    if (Math.hypot(sh.x - o.x, sh.y - (o.y - 40)) < r + 30 || Math.hypot(sh.x - o.x, sh.y - (o.y - 74)) < r + 22) { // a hit!
      sh.dead = true;
      if (pee) {
        o.hp = Math.max(0, o.hp - PEE_DMG);
        o.vx += Math.sign(sh.vx) * 110;
        api.ev('wet', { x: sh.x, y: sh.y });
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
    if (sh.y >= GROUND - 4) { sh.dead = true; if (!pee) api.ev('ground', { x: sh.x }); continue; }
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
    c: s.cats.map((c, i) => ({ x: Math.round(c.x), y: Math.round(c.y), f: c.face, g: c.ground ? 1 : 0, hp: c.hp, st: c.strain > 0 ? 1 : 0, rl: r1(c.rel), fa: c.fa > 0 ? 1 : 0, dz: c.dz > 0 ? 1 : 0, r: s.roles[i] })),
    sh: s.shots.map(sh => ({ x: Math.round(sh.x), y: Math.round(sh.y), a: r1(sh.a * 8), k: sh.k })),
  };
}

/* ---------- the bot ---------- */

// Poopoo bot: stays a good distance away, turns its butt toward you (by walking away) and poops. Peepee bot: runs up close,
// faces you and squirts. Both jump over incoming poop.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i], role = s.roles[i];
  const st = s.bs || (s.bs = { think: 0, mx: 0, jump: 0 });
  if (s.phase !== 'fight') return { hit: {} };
  st.think -= dt;
  st.jump = Math.max(0, st.jump - dt);
  const dir = Math.sign(o.x - c.x) || 1;     // toward the other cat
  const out = { mx: st.mx, hit: {} };
  if (st.think <= 0) {
    st.think = 0.05 + (1 - api.skill) * 0.15;
    const dist = Math.abs(o.x - c.x);
    if (role === 'p') {
      // face away from them (walking away does it); only come back toward them if they are very far
      st.mx = dist > 560 ? dir * 0.6 : c.face === dir ? -dir : (dist < 300 ? -dir * 0.5 : -dir * 0.12);
      if (c.x < 90 && dir > 0 && c.face === dir) st.mx = -dir; // (backed into a wall: just turn)
      if (c.face !== dir && c.rel <= 0 && c.strain <= 0 && Math.abs(o.y - c.y) < 100 && Math.random() < 0.2 + 0.6 * api.skill) out.hit.a = true;
    } else {
      st.mx = dist > 240 ? dir * 0.85 : dist < 130 ? -dir * 0.35 : dir * 0.1;      // (always keep facing them)
      if (c.face === dir && dist < 300 && c.rel <= 0 && c.dz <= 0 && Math.abs(o.y - c.y) < 90 && Math.random() < 0.3 + 0.6 * api.skill) out.hit.a = true;
    }
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
  if (e.type === 'pee') { v.sound([[800, 0, 0.1], [700, 0.08, 0.1]]); v.pop(e.x + e.d * 30, e.y - 26, 'PSSST!', '#ffe14d'); }
  if (e.type === 'wet') { v.burst(e.x, e.y, '#ffe14d', 6, 180); v.sound([[500, 0, 0.04]]); }
  if (e.type === 'dizzy') { v.pop(e.x, e.y, 'DIZZY!', '#ffe14d'); v.sound([[300, 0, 0.1], [450, 0.08, 0.1], [300, 0.16, 0.1]]); }
  if (e.type === 'jump') v.sound([[500, 0, 0.04]]);
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
  const g = v.g, poopoo = c.r === 'p', reload = poopoo ? RELOAD : PEE_RELOAD;
  g.fillStyle = v.team[i].main; g.globalAlpha = 0.3;
  g.beginPath(); g.ellipse(c.x, GROUND + 6, 40, 9, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  drawButt(v, i, c);
  v.catSide(i, c.x, c.y, 1, { lookRight: c.f > 0, tilt: c.st ? Math.sin(v.now / 30) * 0.05 : c.dz ? Math.sin(v.now / 90) * 0.14 : 0 });
  if (c.dz) { g.fillStyle = '#ffe14d'; for (let k = 0; k < 3; k++) { const a = v.now / 150 + k * 2.1; v.star(c.x + Math.cos(a) * 26, c.y - 104 + Math.sin(a) * 8, 7); } } // dizzy: stars going round the head
  const sense = c.rl > 0 ? 1 - clamp(c.rl / reload, 0, 1) : 1; // the reload meter
  g.fillStyle = 'rgba(40, 20, 10, .6)'; v.roundRect(c.x - 24, c.y - 118, 48, 8, 4); g.fill();
  g.fillStyle = sense >= 1 ? (poopoo ? '#9be564' : '#ffe14d') : '#c8a46a'; v.roundRect(c.x - 23, c.y - 117, Math.max(3, 46 * sense), 6, 3); g.fill();
  v.label(i === v.me ? 'You' : v.names[i], c.x, c.y - 134, 12, i === v.me ? '#ffd23f' : '#ffffff');
  v.label(poopoo ? '💩 POOPOO' : '💦 PEEPEE', c.x, c.y - 150, 11, poopoo ? '#b9e98a' : '#ffe14d');
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
  s.sh.forEach(p => {
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
    if (mine.dz) v.msg('You are dizzy!');
    else if (mine.r === 'p') {
      const facingAway = them && (them.x - mine.x) * mine.f < 0;
      v.msg(mine.rl > 0 ? "You're POOPOO 💩 · reloading…" : facingAway ? "You're POOPOO 💩 · your butt is aimed at them: press SPACE to poop!" : "You're POOPOO 💩 · walk away from them to aim your butt, then SPACE");
    } else v.msg(mine.rl > 0 ? "You're PEEPEE 💦 · reloading…" : "You're PEEPEE 💦 · face them and press SPACE to squirt (get close!)");
  }
}

})();
