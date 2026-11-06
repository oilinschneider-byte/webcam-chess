/* Laser Pointer, on the arcade engine (games-duel.js): the host's app runs it, both cats chase with the mouse (or a
   finger), and your paw can only speed up so fast, so nobody can teleport. A red laser dot zips around the floor.
   Every moment your paw is on the dot scores. It speeds up as it goes, and for the last 10 seconds it splits in two.
   30 seconds, most time on the dot wins. (Cheese Grab is in games-cheesegrab.js.) */
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
