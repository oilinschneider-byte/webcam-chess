/* Two pointer games on the arcade engine (games-duel.js): the host's app runs them, both cats chase with the mouse
   (or a finger), and your paw can only speed up so fast, so nobody can teleport.

   Cheese Grab: cheese keeps raining into the middle of the kitchen. Touch a piece with your paw to grab it: 1 point,
   and a rare golden cheese is worth 5. 30 seconds, most cheese wins.

   Laser Pointer: a red laser dot zips around the floor. Every moment your paw is on the dot scores. It speeds up as it
   goes, and for the last 10 seconds it splits in two. 30 seconds, most time on the dot wins. */
(() => {
'use strict';

const W = 960, H = 540;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A paw that chases where you point, but can only go so fast and speed up so fast (like the paddles in Air Hockey).
function movePaw(p, tx, ty, dt, top, accel) {
  tx = clamp(tx, 30, W - 30);
  ty = clamp(ty, 60, H - 30);
  let wx = (tx - p.x) / dt, wy = (ty - p.y) / dt;
  const ws = Math.hypot(wx, wy);
  if (ws > top) { wx *= top / ws; wy *= top / ws; }
  let ax = (wx - p.vx) / dt, ay = (wy - p.vy) / dt;
  const as = Math.hypot(ax, ay);
  if (as > accel) { ax *= accel / as; ay *= accel / as; }
  p.vx += ax * dt;
  p.vy += ay * dt;
  p.x = clamp(p.x + p.vx * dt, 30, W - 30);
  p.y = clamp(p.y + p.vy * dt, 60, H - 30);
  const q = CA.camWalls.push(p.x, p.y, 26);
  if (q) { p.x = q.x; p.y = q.y; }
}

// A paw on the screen: a pad and toe beans in the player's color. Your own paw follows your mouse right away.
function drawPaw(v, i, x, y, glow) {
  const g = v.g;
  if (glow) { g.globalAlpha = 0.35; g.fillStyle = '#ff3b30'; v.dot(x, y, 40); g.globalAlpha = 1; }
  g.fillStyle = 'rgba(0, 0, 0, .25)';
  v.dot(x + 3, y + 5, 24);
  g.fillStyle = v.team[i].dark;
  v.dot(x, y, 24);
  g.fillStyle = v.team[i].light;
  v.dot(x, y + 5, 11);
  [[-13, -9], [-4, -15], [6, -15], [14, -8]].forEach(([a, b]) => v.dot(x + a, y + b, 5));
  v.label(i === v.me ? 'You' : v.names[i], x, y + 38, 12, i === v.me ? '#ffd23f' : '#ffffff');
}
const pawAt = (v, i, p) => (i === v.me && !v.host && v.aim.seen ? { x: clamp(v.aim.x, 30, W - 30), y: clamp(v.aim.y, 60, H - 30) } : p);

function bigScores(v, a, b, fmt) {
  const f = fmt || (n => String(n));
  v.label(f(a), W / 2 - 110, 44, 46, v.team[0].main);
  v.label(f(b), W / 2 + 110, 44, 46, v.team[1].main);
  v.label(v.names[0], W / 2 - 110, 76, 14, v.team[0].light);
  v.label(v.names[1], W / 2 + 110, 76, 14, v.team[1].light);
}

/* ================= CHEESE GRAB ================= */

const CHEESE_LEN = 30, CR = 15, GOLD_P = 0.06;

CA.games.add('cheese', {
  name: 'Cheese Grab', icon: '🧀',
  blurb: 'Cheese is raining into the kitchen! Move the mouse to move your paw and grab as many pieces as you can. Golden cheese is worth 5. 30 seconds, most cheese wins!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'cheese', mouse: true,
      help: 'Move the mouse to move your paw · touch cheese to grab it · golden cheese is worth 5',
      helpTouch: 'Drag your finger to move your paw · grab the cheese!',
      note: '30 seconds · most cheese wins',
      init: () => ({ t: 0, sc: [0, 0], drop: 0.3, id: 0, ch: [], paws: [{ x: 300, y: 380, vx: 0, vy: 0 }, { x: 660, y: 380, vx: 0, vy: 0 }] }),
      step: cheeseStep,
      snap: s => ({ sc: s.sc, r: Math.max(0, Math.ceil(CHEESE_LEN - s.t)), p: s.paws.map(p => [Math.round(p.x), Math.round(p.y)]), c: s.ch.map(c => [c.id, Math.round(c.x), Math.round(c.y), c.g, Math.round(c.a * 10)]) }),
      lerp: cheeseLerp,
      bot: cheeseBot,
      draw: cheeseDraw,
      event: cheeseEvent,
    });
  },
});

function cheeseStep(s, inp, dt, api) {
  s.t += dt;
  for (let i = 0; i < 2; i++) movePaw(s.paws[i], inp[i].ax, inp[i].ay, dt, inp[i].top || 1500, 11000);
  // a new shower of cheese every second or so, more of it as the time runs out
  s.drop -= dt;
  if (s.drop <= 0 && s.t < CHEESE_LEN - 0.5) {
    s.drop = 0.75 + api.rng() * 0.6;
    const n = 3 + Math.floor(api.rng() * 3) + (s.t > 20 ? 2 : 0);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (api.rng() - 0.5) * 2.4, sp = 260 + api.rng() * 420;
      s.ch.push({ id: s.id++, x: W / 2 + (api.rng() - 0.5) * 60, y: 150, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: api.rng() < GOLD_P ? 1 : 0, life: 7, a: (api.rng() - 0.5) * 6 });
    }
    api.ev('drop', {});
  }
  for (let k = s.ch.length - 1; k >= 0; k--) {
    const c = s.ch[k];
    c.vy += 900 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.y > H - 30 - CR) { c.y = H - 30 - CR; c.vy = -Math.abs(c.vy) * 0.45; c.vx *= 0.8; if (!c.landed) { c.landed = 1; c.life = Math.min(c.life, 1.6); } } // (cheese on the floor only lasts a moment)
    if (c.x < CR + 10) { c.x = CR + 10; c.vx = Math.abs(c.vx) * 0.6; }
    if (c.x > W - CR - 10) { c.x = W - CR - 10; c.vx = -Math.abs(c.vx) * 0.6; }
    CA.camWalls.bounce(c, CR, 0.5);
    c.a += c.vx * dt * 0.02;
    c.life -= dt;
    let got = -1;
    for (let i = 0; i < 2; i++) if (Math.hypot(s.paws[i].x - c.x, s.paws[i].y - c.y) < 26 + CR) { got = i; break; }
    if (got >= 0) {
      s.sc[got] += c.g ? 5 : 1;
      api.score(s.sc[0], s.sc[1]);
      api.ev('grab', { i: got, x: Math.round(c.x), y: Math.round(c.y), g: c.g });
      s.ch.splice(k, 1);
    } else if (c.life <= 0) s.ch.splice(k, 1);
  }
  if (s.t >= CHEESE_LEN) api.end(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, "Time's up!");
}

// Smooth the paws, and each piece of cheese that was there in both snaps (new ones just appear).
function cheeseLerp(a, b, f) {
  const m = (p, q) => p + (q - p) * f;
  const old = {};
  a.c.forEach(c => { old[c[0]] = c; });
  return {
    sc: b.sc, r: b.r,
    p: b.p.map((q, i) => (a.p[i] ? [m(a.p[i][0], q[0]), m(a.p[i][1], q[1])] : q)),
    c: b.c.map(c => { const o = old[c[0]]; return o ? [c[0], m(o[1], c[1]), m(o[2], c[2]), c[3], c[4]] : c; }),
  };
}

function cheeseBot(s, i, dt, api) {
  const st = s.bs || (s.bs = { think: 0, tx: s.paws[i].x, ty: s.paws[i].y });
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.07 + (1 - api.skill) * 0.25;
    const p = s.paws[i];
    let best = null, bd = 1e9;
    for (const c of s.ch) {
      const d = Math.hypot(c.x - p.x, c.y - p.y) - (c.g ? 260 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { st.tx = best.x + best.vx * 0.12 + (Math.random() - 0.5) * 60 * (1 - api.skill); st.ty = best.y + best.vy * 0.12; }
  }
  return { ax: st.tx, ay: st.ty, top: 600 + 600 * api.skill };
}

function cheeseEvent(v, e) {
  if (e.type === 'grab') {
    v.burst(e.x, e.y, e.g ? '#fff3a0' : '#ffcf3d', e.g ? 26 : 8, e.g ? 320 : 180);
    if (e.g || e.i === v.me) v.pop(e.x, e.y - 20, e.g ? '+5!' : '+1', e.g ? '#fff3a0' : v.team[e.i].light);
    if (e.g) v.shake(6);
    v.sound(e.i === v.me ? (e.g ? [[880, 0, 0.06], [1175, 0.06, 0.06], [1568, 0.12, 0.1]] : [[660 + Math.random() * 200, 0, 0.05]]) : [[300, 0, 0.03]]);
  }
  if (e.type === 'drop') v.sound([[200, 0, 0.04]]);
}

let kitchen = null;
function makeKitchen() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const sky = b.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2b2238');
  sky.addColorStop(1, '#1b1526');
  b.fillStyle = sky;
  b.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 60) for (let y = H - 140; y < H; y += 60) { // checkered kitchen floor
    b.fillStyle = ((x + y) / 60) % 2 ? '#e9e2f0' : '#cfc3dc';
    b.fillRect(x, y, 60, 60);
  }
  b.fillStyle = 'rgba(0, 0, 0, .25)';
  b.fillRect(0, H - 140, W, 6);
  // a big cheese wheel hanging over the middle, where the cheese comes from
  b.fillStyle = '#ffcf3d';
  b.beginPath(); b.moveTo(W / 2 - 70, 140); b.lineTo(W / 2 + 70, 140); b.lineTo(W / 2 + 50, 96); b.lineTo(W / 2 - 50, 96); b.closePath(); b.fill();
  b.fillStyle = '#e0a800';
  [[-30, 120, 9], [10, 112, 6], [40, 126, 7], [-48, 106, 5]].forEach(([dx, y, r]) => { b.beginPath(); b.arc(W / 2 + dx, y, r, 0, Math.PI * 2); b.fill(); });
  return c;
}

function drawCheese(v, x, y, gold, rot) {
  const g = v.g;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (gold) { g.globalAlpha = 0.4; g.fillStyle = '#fff3a0'; v.dot(0, 0, 26); g.globalAlpha = 1; }
  g.fillStyle = gold ? '#ffe066' : '#ffcf3d';
  g.strokeStyle = gold ? '#fff8d0' : '#c98f00';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-15, 10); g.lineTo(15, 10); g.lineTo(-11, -13); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = gold ? '#f2b500' : '#d99a00';
  v.dot(-4, 4, 3);
  v.dot(-9, -4, 2);
  g.restore();
}

function cheeseDraw(v, s) {
  const g = v.g;
  if (!kitchen) kitchen = makeKitchen();
  g.drawImage(kitchen, 0, 0, W, H);
  s.c.forEach(([id, x, y, gold, a]) => drawCheese(v, x, y, gold, a / 10));
  s.p.forEach(([x, y], i) => { const q = pawAt(v, i, { x, y }); drawPaw(v, i, q.x, q.y); });
  bigScores(v, s.sc[0], s.sc[1]);
  v.label(String(s.r), W / 2, 44, 30, s.r <= 5 ? '#ff6b6b' : '#ffffff');
}

/* ================= LASER POINTER ================= */

const LASER_LEN = 30, SPLIT_AT = 20, ON_R = 34;

CA.games.add('laser', {
  name: 'Laser Pointer', icon: '🔴',
  blurb: 'A red laser dot zips around the floor. Keep your paw on it! Every moment on the dot scores. It gets faster, and for the last 10 seconds it splits in two. 30 seconds, most time on the dot wins!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'laser', mouse: true,
      help: 'Move the mouse to move your paw · keep it on the red dot · it splits in two at the end!',
      helpTouch: 'Drag your finger to move your paw · stay on the red dot!',
      note: '30 seconds · most time on the dot wins',
      init: api => ({ t: 0, on: [0, 0], paws: [{ x: 300, y: 300, vx: 0, vy: 0 }, { x: 660, y: 300, vx: 0, vy: 0 }], dots: [newDot(api, W / 2, H / 2)], tick: 0 }),
      step: laserStep,
      snap: s => ({ sc: s.on.map(n => Math.round(n * 10)), r: Math.max(0, Math.ceil(LASER_LEN - s.t)), p: s.paws.map(p => [Math.round(p.x), Math.round(p.y)]), d: s.dots.map(d => [Math.round(d.x), Math.round(d.y)]) }),
      lerp: (a, b, f) => ({ sc: b.sc, r: b.r, p: lerpPts(a.p, b.p, f), d: lerpPts(a.d, b.d, f) }),
      bot: laserBot,
      draw: laserDraw,
      event: laserEvent,
    });
  },
});

const lerpPts = (a, b, f) => b.map((q, i) => (a[i] ? [a[i][0] + (q[0] - a[i][0]) * f, a[i][1] + (q[1] - a[i][1]) * f] : q));
function newDot(api, x, y) { return { x, y, vx: 0, vy: 0, tx: x, ty: y, wait: 0 }; }
function pickTarget(d, api, far) {
  for (let k = 0; k < 12; k++) {
    const tx = 70 + api.rng() * (W - 140), ty = 110 + api.rng() * (H - 170);
    if (CA.camWalls.push(tx, ty, 40)) continue;
    if (!far || Math.hypot(tx - d.x, ty - d.y) > 220) { d.tx = tx; d.ty = ty; return; }
  }
}

function laserStep(s, inp, dt, api) {
  s.t += dt;
  for (let i = 0; i < 2; i++) movePaw(s.paws[i], inp[i].ax, inp[i].ay, dt, inp[i].top || 1300, 9000);
  if (s.t >= SPLIT_AT && s.dots.length < 2) {
    const d = s.dots[0];
    s.dots.push(newDot(api, d.x, d.y));
    pickTarget(s.dots[1], api, true);
    api.ev('split', { x: Math.round(d.x), y: Math.round(d.y) });
  }
  const speed = 330 + 420 * Math.min(1, s.t / LASER_LEN);
  s.dots.forEach(d => {
    if (d.wait > 0) { d.wait -= dt; d.vx *= 0.8; d.vy *= 0.8; return; }
    const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
    if (dist < 12) {
      // sometimes it stops for a moment (to tease), sometimes it zips off far away
      if (api.rng() < 0.25) d.wait = 0.2 + api.rng() * 0.4;
      pickTarget(d, api, api.rng() < 0.5);
      return;
    }
    const zip = dist > 260 ? 1.5 : 1;
    const wx = dx / dist * speed * zip, wy = dy / dist * speed * zip;
    d.vx += (wx - d.vx) * Math.min(1, dt * 7);
    d.vy += (wy - d.vy) * Math.min(1, dt * 7);
    d.x += d.vx * dt;
    d.y += d.vy * dt;
  });
  for (let i = 0; i < 2; i++) {
    const p = s.paws[i];
    if (s.dots.some(d => Math.hypot(d.x - p.x, d.y - p.y) < ON_R)) s.on[i] += dt;
  }
  s.tick += dt;
  if (s.tick > 0.5) { s.tick = 0; api.score(Math.round(s.on[0] * 10) / 10, Math.round(s.on[1] * 10) / 10); }
  if (s.t >= LASER_LEN) {
    api.score(Math.round(s.on[0] * 10) / 10, Math.round(s.on[1] * 10) / 10);
    const a = Math.round(s.on[0] * 10), b = Math.round(s.on[1] * 10);
    api.end(a === b ? -1 : a > b ? 0 : 1, "Time's up!");
  }
}

function laserBot(s, i, dt, api) {
  const st = s.bs || (s.bs = { think: 0, tx: s.paws[i].x, ty: s.paws[i].y, pick: 0 });
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.05 + (1 - api.skill) * 0.22;
    const p = s.paws[i];
    let d = s.dots[0];
    if (s.dots[1] && Math.hypot(s.dots[1].x - p.x, s.dots[1].y - p.y) < Math.hypot(d.x - p.x, d.y - p.y)) d = s.dots[1];
    st.tx = d.x + d.vx * 0.06 * api.skill + (Math.random() - 0.5) * 50 * (1 - api.skill);
    st.ty = d.y + d.vy * 0.06 * api.skill + (Math.random() - 0.5) * 50 * (1 - api.skill);
  }
  return { ax: st.tx, ay: st.ty, top: 650 + 550 * api.skill };
}

function laserEvent(v, e) {
  if (e.type === 'split') { v.burst(e.x, e.y, '#ff3b30', 24, 300); v.pop(e.x, e.y - 30, 'SPLIT!', '#ff6b6b'); v.shake(6); v.sound([[500, 0, 0.06], [900, 0.05, 0.08]]); }
}

let room = null;
function makeRoom() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#3b2a22';
  b.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 36) { // wooden floorboards
    b.fillStyle = (y / 36) % 2 ? '#5a4033' : '#523a2e';
    b.fillRect(0, y, W, 34);
    b.fillStyle = 'rgba(0, 0, 0, .25)';
    for (let x = ((y / 36) % 2) * 120; x < W; x += 240) b.fillRect(x, y, 3, 34);
  }
  const vig = b.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 620);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, .6)');
  b.fillStyle = vig;
  b.fillRect(0, 0, W, H);
  return c;
}

let laserSnd = 0;
function laserDraw(v, s) {
  const g = v.g;
  if (!room) room = makeRoom();
  g.drawImage(room, 0, 0, W, H);
  // the dots: a glow, a bright core and a little flicker
  s.d.forEach(([x, y]) => {
    const fl = 0.85 + Math.random() * 0.15;
    g.globalAlpha = 0.25 * fl; g.fillStyle = '#ff2a2a'; v.dot(x, y, 34);
    g.globalAlpha = 0.6 * fl; v.dot(x, y, 16);
    g.globalAlpha = 1; g.fillStyle = '#ffd0d0'; v.dot(x, y, 7);
  });
  let mineOn = false;
  s.p.forEach(([x, y], i) => {
    const q = pawAt(v, i, { x, y });
    const on = s.d.some(([dx, dy]) => Math.hypot(dx - q.x, dy - q.y) < ON_R);
    if (i === v.me) mineOn = on;
    drawPaw(v, i, q.x, q.y, on);
  });
  if (mineOn && v.now - laserSnd > 220) { laserSnd = v.now; v.sound([[1200 + Math.random() * 300, 0, 0.025]]); }
  bigScores(v, s.sc[0], s.sc[1], n => (n / 10).toFixed(1) + 's');
  v.label(String(s.r), W / 2, 44, 30, s.r <= 10 ? '#ff6b6b' : '#ffffff');
}

})();
