/* Classic Games: Dodge. Both cats are on the same map, a bright candy-colored meadow, while colorful things rain down
   from the sky: bouncy balls and shooting stars (a hit costs a life), and bombs (they bounce, flash, then blow up
   with a big blast). A falling ❤️ gives a life back. Space grabs the other cat when you're close: you carry them for
   a moment, then toss them wherever you're facing (a good way to throw them under a bomb). 3 lives each: the last
   cat standing wins. The more time goes by, the thicker it rains. (The host's app runs everything: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, GROUND = 470;
const G = 2100, RUN = 290, JUMP = 800, ACCEL = 2600, AIR_ACCEL = 1500;
const LIVES = 3, INVULN = 1.3;
const GRAB_RANGE = 84, GRAB_TIME = 0.6, GRAB_WAIT = 3.2, THROW_X = 700, THROW_Y = 560;
const BLAST = 100, FUSE = 0.9;
const CAT = 0.85;                                   // how big the cats are drawn
const LIMIT = 100;                                  // seconds: then the cat with more lives wins
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));
const r1 = v => Math.round(v * 10) / 10;

CA.games.add('dodge', {
  name: 'Dodge', icon: '☄️',
  blurb: 'Two cats, one map, and colorful things falling from the sky! Dodge the balls, stars and bombs (3 lives each), catch ❤️ to heal, and press Space to GRAB the other cat and toss them into the danger. Last cat standing wins!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'dodge',
      pad: { stick: true, buttons: [{ k: 'u', label: '⤒ Jump' }, { k: 'a', label: '✋ Grab', main: true }] },
      help: 'A/D run · W jump · Space grabs the other cat (then they get thrown the way you face) · dodge the balls, stars and bombs · ❤️ heals',
      helpTouch: 'Stick runs · Jump · Grab the other cat when you are close',
      note: LIVES + ' lives each · last cat standing wins',
      init, step, snap, bot, draw, event,
    });
  },
});

function newCat(x, face) {
  return { x, y: GROUND, vx: 0, vy: 0, ground: true, face, lives: LIVES, inv: 0, gw: 1, hold: 0, by: -1 };
}

function init() {
  return { t: 0, cats: [newCat(250, 1), newCat(710, -1)], obs: [], next: 1.4, id: 0, endT: 0 };
}

/* ---------- the things that fall ---------- */

function spawn(s, api) {
  const r = api.rng(), k = r < 0.07 ? 'heart' : r < 0.24 ? 'bomb' : r < 0.44 ? 'star' : 'ball';
  let x = 40 + api.rng() * (W - 80);
  if (api.rng() < 0.28) x = clamp(s.cats[Math.floor(api.rng() * 2)].x + (api.rng() - 0.5) * 120, 40, W - 40); // (some are aimed at a cat)
  const o = { id: ++s.id, k, x, y: -40, vx: (api.rng() - 0.5) * 70, vy: 60, r: 18, h: Math.floor(api.rng() * 360), fz: -1, age: 0 };
  if (k === 'ball') { o.r = 16 + api.rng() * 15; o.g = 520; }
  if (k === 'star') { o.r = 12; o.g = 760; o.vy = 260; o.vx *= 1.8; }
  if (k === 'bomb') { o.r = 20; o.g = 480; }
  if (k === 'heart') { o.r = 16; o.g = 220; o.vx *= 0.3; }
  s.obs.push(o);
}

function hurt(s, c, i, api, x, y) {
  c.lives--;
  c.inv = INVULN;
  c.vy = -380;
  c.ground = false;
  if (c.hold > 0) { s.cats[1 - i].by = -1; c.hold = 0; } // (a hit drops whoever you were carrying)
  if (c.by >= 0) { s.cats[c.by].hold = 0; c.by = -1; }
  api.ev('hit', { x, y, i, l: c.lives });
}

const hits = (c, x, y, r) => Math.hypot(x - c.x, y - (c.y - 34)) < r + 24 || Math.hypot(x - c.x, y - (c.y - 62)) < r + 19;

function stepObs(s, dt, api) {
  for (const o of s.obs) {
    o.age += dt;
    o.vy += o.g * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx); }
    if (o.x > W - o.r) { o.x = W - o.r; o.vx = -Math.abs(o.vx); }
    if (o.dead) continue;
    if (o.k === 'bomb') {
      if (o.fz >= 0) { o.fz -= dt; if (o.fz <= 0) { blast(s, o, api); continue; } }
      if (o.y + o.r >= GROUND) { o.y = GROUND - o.r; o.vy = -Math.abs(o.vy) * 0.42; o.vx *= 0.7; if (o.fz < 0) o.fz = FUSE; }
      s.cats.forEach(c => { if (!o.dead && c.inv <= 0 && hits(c, o.x, o.y, o.r)) blast(s, o, api); }); // (touching a bomb sets it off)
      continue;
    }
    if (o.k === 'heart') {
      if (o.y + o.r >= GROUND) { o.y = GROUND - o.r; o.vy = 0; o.vx = 0; }
      if (o.age > 9) { o.dead = true; continue; }
      s.cats.forEach((c, i) => {
        if (o.dead || c.lives >= LIVES || !hits(c, o.x, o.y, o.r)) return;
        o.dead = true;
        c.lives++;
        api.score(s.cats[0].lives, s.cats[1].lives);
        api.ev('heal', { x: c.x, y: c.y - 70, i });
      });
      continue;
    }
    // a ball or a star
    if (o.y + o.r >= GROUND) { o.dead = true; api.ev('splat', { x: o.x, y: GROUND - 4, h: o.h, k: o.k }); continue; }
    for (let i = 0; i < 2; i++) {
      const c = s.cats[i];
      if (c.inv > 0 || !hits(c, o.x, o.y, o.r)) continue;
      o.dead = true;
      hurt(s, c, i, api, o.x, o.y);
      api.ev('splat', { x: o.x, y: o.y, h: o.h, k: o.k });
      break;
    }
  }
  s.obs = s.obs.filter(o => !o.dead);
  api.score(s.cats[0].lives, s.cats[1].lives);
}

function blast(s, o, api) {
  o.dead = true;
  api.ev('boom', { x: o.x, y: o.y });
  s.cats.forEach((c, i) => { if (c.inv <= 0 && Math.hypot(c.x - o.x, (c.y - 36) - o.y) < BLAST + 16) hurt(s, c, i, api, c.x, c.y - 40); });
}

/* ---------- the cats ---------- */

function stepCat(s, c, i, n, dt, api) {
  const o = s.cats[1 - i];
  c.inv = Math.max(0, c.inv - dt);
  c.gw = Math.max(0, c.gw - dt);
  if (c.by >= 0) { // being carried: stuck in front of the cat that grabbed you
    const h = s.cats[c.by];
    c.x = clamp(h.x + h.face * 36, 30, W - 30);
    c.y = h.y - 10;
    c.vx = c.vy = 0;
    return;
  }
  const holding = c.hold > 0;
  if (n.mx) c.face = n.mx > 0 ? 1 : -1;
  if (!holding && c.gw <= 0 && n.hit.a && o.by < 0 && Math.abs(o.x - c.x) < GRAB_RANGE && Math.abs(o.y - c.y) < 90) { // grab!
    c.hold = GRAB_TIME;
    c.gw = GRAB_WAIT;
    o.by = i;
    api.ev('grab', { x: o.x, y: o.y - 80 });
  }
  const want = n.mx * RUN * (c.hold > 0 ? 0.45 : 1);
  c.vx = approach(c.vx, want, (c.ground ? ACCEL : AIR_ACCEL) * dt);
  if (c.ground && c.hold <= 0 && (n.hit.u || n.my < -0.7)) { c.vy = -JUMP; c.ground = false; api.ev('jump', { x: c.x, y: c.y }); }
  c.vy += G * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  if (c.y >= GROUND) { c.y = GROUND; c.vy = 0; c.ground = true; } else c.ground = false;
  if (c.x < 34 || c.x > W - 34) { c.x = clamp(c.x, 34, W - 34); c.vx = 0; }
  const p = CA.camWalls.push(c.x, c.y - 72, 26); // (the camera walls in the top corners)
  if (p) { c.x = p.x; c.y = p.y + 72; if (c.vy < 0) c.vy = 0; }
}

function step(s, inp, dt, api) {
  s.t += dt;
  if (s.endT > 0) {
    s.endT -= dt;
    stepObs(s, dt, api);
    if (s.endT <= 0) {
      const [a, b] = s.cats; // (more lives left wins; the same, even both out, is a draw)
      api.end(a.lives === b.lives ? -1 : a.lives > b.lives ? 0 : 1, 'LAST CAT!');
    }
    return;
  }
  s.next -= dt;
  while (s.next <= 0) { spawn(s, api); s.next += Math.max(0.15, 0.85 - s.t * 0.011) * (0.7 + api.rng() * 0.6); }
  s.cats.forEach((c, i) => stepCat(s, c, i, inp[i], dt, api));
  s.cats.forEach((c, i) => { // the throw, when the grab runs out
    if (c.hold <= 0) return;
    c.hold -= dt;
    if (c.hold > 0) return;
    const o = s.cats[1 - i];
    if (o.by !== i) return;
    o.by = -1;
    o.vx = c.face * THROW_X;
    o.vy = -THROW_Y;
    o.ground = false;
    api.ev('throw', { x: o.x, y: o.y - 60, f: c.face });
  });
  stepObs(s, dt, api);
  const [a, b] = s.cats;
  if (a.lives <= 0 || b.lives <= 0) { s.endT = 0.9; return; }
  if (s.t >= LIMIT) s.endT = 0.5;
}

function snap(s) {
  return {
    t: r1(s.t),
    c: s.cats.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), f: c.face, g: c.ground ? 1 : 0, l: c.lives, iv: c.inv > 0 ? 1 : 0, hd: c.hold > 0 ? 1 : 0, hb: c.by >= 0 ? 1 : 0, gw: r1(c.gw) })),
    o: s.obs.map(o => ({ x: Math.round(o.x), y: Math.round(o.y), r: Math.round(o.r), k: o.k, h: o.h, fz: o.fz < 0 ? -1 : Math.round(o.fz * 100) / 100 })),
  };
}

/* ---------- the bot ---------- */

// The bot moves to the nearest spot where nothing is about to land on it, goes for hearts, and now and then grabs you.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = { think: 0, mx: 0 });
  if (c.by >= 0) return { hit: {} };
  st.think -= dt;
  const out = { hit: {} };
  if (st.think <= 0) {
    st.think = 0.04 + (1 - api.skill) * 0.16;
    let best = c.x, bestScore = -1e9;
    for (let x = clamp(c.x - 170, 40, W - 40); x <= clamp(c.x + 170, 40, W - 40); x += 15) {
      let score = -Math.abs(x - c.x) * 0.05;
      for (const ob of s.obs) {
        if (ob.k === 'heart') { if (c.lives < LIVES && Math.abs(ob.x - x) < 24) score += 14; continue; }
        const tt = Math.max(0, (GROUND - 40 - ob.y) / Math.max(120, ob.vy + 120)); // (roughly: when it gets down to a cat's height)
        const ox = ob.x + ob.vx * tt, reach = ob.r + (ob.k === 'bomb' ? BLAST : 34);
        if (tt < 1.4 && Math.abs(ox - x) < reach) score -= 40 + (1.4 - tt) * 20;
        else if (ob.k === 'bomb' && ob.fz >= 0 && Math.abs(ob.x - x) < BLAST + 30) score -= 60;
      }
      score += (Math.random() - 0.5) * (1 - api.skill) * 12;
      if (score > bestScore) { bestScore = score; best = x; }
    }
    st.mx = clamp((best - c.x) / 30, -1, 1);
    if (c.gw <= 0 && Math.abs(o.x - c.x) < GRAB_RANGE - 12 && o.by < 0 && Math.random() < 0.15 + 0.5 * api.skill) out.hit.a = true; // grab!
  }
  out.mx = Math.abs(st.mx) < 0.08 ? 0 : st.mx;
  return out;
}

/* ---------- drawing ---------- */

function event(v, e) {
  if (e.type === 'hit') { v.burst(e.x, e.y, '#ff5a5a', 16, 300); v.pop(e.x, e.y - 50, e.l > 0 ? '−1 ❤️' : 'K.O.!', '#ff5a5a'); v.shake(10); v.sound(e.i === v.me ? 'miss' : 'point'); }
  if (e.type === 'splat') { const c = 'hsl(' + e.h + ', 90%, 62%)'; v.burst(e.x, e.y, c, e.k === 'star' ? 8 : 14, 260); }
  if (e.type === 'boom') { v.burst(e.x, e.y, '#ffb347', 30, 420); v.burst(e.x, e.y, '#ff4d4d', 18, 300); v.ring(e.x, e.y, '#ffd23f', 30); v.shake(16); v.sound('boom'); }
  if (e.type === 'heal') { v.pop(e.x, e.y, '+1 ❤️', '#7dff8a'); v.sound('point'); }
  if (e.type === 'grab') { v.pop(e.x, e.y, 'GRAB!', '#ffd23f'); v.sound([[500, 0, 0.05], [700, 0.05, 0.07]]); }
  if (e.type === 'throw') { v.pop(e.x, e.y, 'TOSS!', '#3ddc84'); v.burst(e.x, e.y + 40, '#ffffff', 10, 260); v.sound([[400, 0, 0.04], [900, 0.04, 0.09]]); }
  if (e.type === 'jump') v.sound([[520, 0, 0.04]]);
}

const HUES = [0, 40, 120, 190, 270, 320];
let sky = null;
function makeSky() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const gr = b.createLinearGradient(0, 0, 0, GROUND);
  gr.addColorStop(0, '#4ecbff');
  gr.addColorStop(0.55, '#a98bff');
  gr.addColorStop(1, '#ffb3d9');
  b.fillStyle = gr;
  b.fillRect(0, 0, W, H);
  ['#ff5a5a', '#ff9a3c', '#ffe14d', '#5dde7a', '#4da3ff', '#a46bff'].forEach((col, k) => { // a big rainbow
    b.strokeStyle = col;
    b.globalAlpha = 0.55;
    b.lineWidth = 16;
    b.beginPath(); b.arc(W / 2, GROUND + 110, 400 - k * 15, Math.PI * 1.08, Math.PI * 1.92); b.stroke();
  });
  b.globalAlpha = 1;
  b.fillStyle = '#ffe14d'; // the sun
  b.beginPath(); b.arc(830, 110, 40, 0, Math.PI * 2); b.fill();
  b.fillStyle = 'rgba(255, 245, 160, .4)';
  b.beginPath(); b.arc(830, 110, 62, 0, Math.PI * 2); b.fill();
  // far-off candy hills
  [['#7be8a3', 0.012, 30, 405], ['#5ad18a', 0.02, 22, 430]].forEach(([col, f, a, y0]) => {
    b.fillStyle = col;
    b.beginPath(); b.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 20) b.lineTo(x, y0 + Math.sin(x * f + a) * a);
    b.lineTo(W, GROUND); b.fill();
  });
  // the ground: stripes of candy
  for (let x = 0; x < W; x += 60) { b.fillStyle = HUES.map(h => 'hsl(' + h + ', 80%, 62%)')[(x / 60) % HUES.length | 0]; b.fillRect(x, GROUND + 8, 60, H - GROUND); }
  b.fillStyle = '#58d36f';
  b.fillRect(0, GROUND - 2, W, 14);
  b.fillStyle = '#7cf08a';
  for (let x = 0; x < W; x += 14) b.fillRect(x, GROUND - 6 - (x * 7) % 5, 6, 8);
  [[80, '#ff6b9d'], [330, '#ffe14d'], [600, '#ffffff'], [880, '#ff9a3c']].forEach(([x, col]) => { // flowers
    b.fillStyle = col;
    for (let k = 0; k < 5; k++) { const a = k * 1.2566; b.beginPath(); b.arc(x + Math.cos(a) * 6, GROUND - 12 + Math.sin(a) * 6, 4, 0, Math.PI * 2); b.fill(); }
    b.fillStyle = '#ff7a1a'; b.beginPath(); b.arc(x, GROUND - 12, 3, 0, Math.PI * 2); b.fill();
  });
  return c;
}

function drawOb(v, o, now) {
  const g = v.g, col = 'hsl(' + o.h + ', 90%, 60%)', dark = 'hsl(' + o.h + ', 80%, 38%)';
  if (o.k === 'ball') {
    const gr = g.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, o.r * 0.1, o.x, o.y, o.r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, col); gr.addColorStop(1, dark);
    g.fillStyle = gr;
    v.dot(o.x, o.y, o.r);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3;
    g.beginPath(); g.arc(o.x, o.y, o.r * 0.62, Math.PI * 1.1, Math.PI * 1.8); g.stroke();
  } else if (o.k === 'star') {
    g.save(); g.translate(o.x, o.y); g.rotate(now / 160);
    g.fillStyle = col; v.star(0, 0, o.r + 4);
    g.fillStyle = '#ffffff'; v.star(0, 0, o.r * 0.5);
    g.restore();
  } else if (o.k === 'bomb') {
    const flash = o.fz >= 0 && Math.floor(now / (o.fz < 0.4 ? 60 : 120)) % 2;
    g.fillStyle = flash ? '#ff4d4d' : '#2b2b3a';
    v.dot(o.x, o.y, o.r);
    g.fillStyle = 'rgba(255,255,255,.35)'; v.dot(o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.25);
    g.strokeStyle = '#a97b3a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(o.x + 3, o.y - o.r + 2); g.quadraticCurveTo(o.x + 12, o.y - o.r - 8, o.x + 8, o.y - o.r - 14); g.stroke();
    g.fillStyle = Math.floor(now / 70) % 2 ? '#ffd23f' : '#ff7a1a';
    v.star(o.x + 8, o.y - o.r - 15, 6);
    if (o.fz >= 0) { g.strokeStyle = 'rgba(255, 80, 80, .55)'; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.arc(o.x, o.y, BLAST, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  } else {
    g.save(); g.translate(o.x, o.y + Math.sin(now / 160) * 2); g.scale(1.5, 1.5);
    g.fillStyle = '#ff4d79'; v.heart(0, 0, true);
    g.restore();
  }
}

function draw(v, s) {
  const g = v.g;
  if (!sky) sky = makeSky();
  g.drawImage(sky, 0, 0, W, H);
  g.fillStyle = 'rgba(255, 255, 255, .85)'; // clouds drifting by
  [[0.1, 70, 1], [0.35, 120, 1.3], [0.62, 55, 0.9], [0.85, 100, 1.1]].forEach(([f, y, k]) => {
    const X = ((f * W + v.now / 40 * k) % (W + 200)) - 100;
    [[0, 0, 22], [22, -9, 19], [44, 0, 21]].forEach(([a, b, r]) => v.dot(X + a * k, y + b * k, r * k));
  });
  s.o.forEach(o => { // a colored shadow on the ground where it will land
    if (o.k === 'heart' && o.y + o.r >= GROUND - 1) return;
    const k = clamp(1 - (GROUND - o.y) / GROUND, 0.1, 1);
    g.fillStyle = o.k === 'bomb' ? 'rgba(255, 60, 60, ' + (0.15 + 0.3 * k) + ')' : 'rgba(40, 20, 90, ' + (0.12 + 0.28 * k) + ')';
    g.beginPath(); g.ellipse(o.x, GROUND + 4, o.r * (0.6 + k * 0.7), 5 + 3 * k, 0, 0, Math.PI * 2); g.fill();
  });
  s.c.forEach((c, i) => {
    g.fillStyle = v.team[i].main; g.globalAlpha = 0.35; // a ring in the player's color under the feet
    g.beginPath(); g.ellipse(c.x, GROUND + 6, 34, 9, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  });
  s.c.forEach((c, i) => {
    const blink = c.iv && Math.floor(v.now / 90) % 2;
    const tilt = c.hb ? 0.5 * c.f : (c.g ? 0 : 0.12 * c.f);
    v.catSide(i, c.x, c.y, CAT, { lookRight: c.f > 0, tilt: Math.sin(v.now / 170 + i) * (c.hb ? 0.15 : 0) + tilt, alpha: blink ? 0.4 : 1 });
    if (c.hd) { g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.beginPath(); g.arc(c.x + c.f * 36, c.y - 45, 40, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < LIVES; k++) v.heart(c.x + (k - 1) * 17, c.y - 108, k < c.l);
    v.label(i === v.me ? 'You' : v.names[i], c.x, c.y - 126, 12, i === v.me ? '#ffd23f' : '#ffffff');
  });
  s.o.forEach(o => drawOb(v, o, v.now));
  g.fillStyle = 'rgba(30, 20, 70, .6)';
  v.roundRect(W / 2 - 150, 8, 300, 30, 15); g.fill();
  v.label('❤️ ' + '❤️'.repeat(Math.max(0, s.c[0].l)) + '  ·  ' + '❤️'.repeat(Math.max(0, s.c[1].l)), W / 2, 24, 15, '#ffffff');
  const mine = s.c[v.me];
  if (mine) v.msg(mine.hb ? 'You got grabbed!' : mine.hd ? 'You grabbed them! Face the danger…' : mine.gw > 0 ? 'Grab ready in ' + mine.gw.toFixed(1) + 's' : 'Dodge! Space grabs the other cat when you are close');
}

})();
