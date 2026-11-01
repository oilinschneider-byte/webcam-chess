/* Classic Games: Cat Cannons. Two cats in cannons on opposite hills, both firing at the same time (no turns). Aim with
   the mouse, hold the button to charge the shot, let go to fire; then your cannon needs a moment to reload. The
   cannonballs fly in an arc (gravity, and a little wind that keeps changing), and blow a crater where they land. Balls
   from the two cannons can hit each other in the air and bounce off. A direct hit costs 2 of your 3 hearts; landing
   close costs 1. (The host's app flies the cannonballs: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const COL = 8, N = W / COL + 1;                  // the ground: a height every 8 pixels
const GRAV = 520;
const POWER_MIN = 230, POWER_MAX = 900, CHARGE = 1.4;
const BOOM = 70, CRATER = 38, CR = 22;            // blast size, crater size, a cat's size
const SHELLS = ['Normal', 'Split shot', 'Big crater'], AMMO = 2; // (the special shells: 2 each)
const HEARTS = 3, RELOAD = 1.2;                   // a cannon can fire again this long after a shot
const SPOT = [110, W - 110];
const ballR = kind => (kind === 2 ? 11 : 8);

CA.games.add('cannons', {
  name: 'Cat Cannons', icon: '💥',
  blurb: 'Both cats fire their cannons at the same time! Aim with the mouse, hold to charge, let go to fire, then reload. Watch the wind. Cannonballs can hit each other in the air. A direct hit costs 2 hearts, a near miss 1. 3 hearts each.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'cannons', mouse: true, angles: ['a'],
      pad: { buttons: [{ k: 'b', label: '🔁 Shell' }, { k: 'fire', label: '💥 Hold to charge', main: true }] },
      keys: { KeyB: 'b' }, letters: { b: 'b' },
      help: 'Aim with the mouse · hold the button to charge · let go to fire · B or right-click swaps shells · your balls can hit theirs!',
      helpTouch: 'Touch where to aim, hold to charge, let go to fire',
      note: HEARTS + ' hearts each · fire at the same time',
      init, step, snap, bot, draw, event,
    });
  },
});

function init(api) {
  const ground = [];
  const ph = [api.rng() * 6, api.rng() * 6, api.rng() * 6];
  for (let k = 0; k < N; k++) {
    const x = k * COL;
    let y = 400 - 60 * Math.sin(x / W * Math.PI) - 26 * Math.sin(x * 0.011 + ph[0]) - 14 * Math.sin(x * 0.027 + ph[1]) - 8 * Math.sin(x * 0.06 + ph[2]);
    for (const sx of SPOT) if (Math.abs(x - sx) < 50) y = 410; // (a flat spot for each cannon)
    ground.push(y);
  }
  for (let k = 1; k < N - 1; k++) for (const sx of SPOT) if (Math.abs(k * COL - sx) < 90 && Math.abs(k * COL - sx) >= 50) ground[k] = (ground[k] * 2 + 410) / 3;
  return {
    ground, hearts: [HEARTS, HEARTS], power: [0, 0], charging: [false, false], cd: [1, 1], a: [-0.9, -2.2], balls: [], endT: 0,
    wind: Math.round((api.rng() - 0.5) * 100), windT: 1, shell: [0, 0], ammo: [[0, AMMO, AMMO], [0, AMMO, AMMO]], bouncy: api.rng() < 0.5, // (bouncy: some matches the ground is bouncy)
  };
}

function groundAt(s, x) {
  const k = Math.max(0, Math.min(N - 2, Math.floor(x / COL))), f = Math.max(0, Math.min(1, x / COL - k));
  return s.ground[k] * (1 - f) + s.ground[k + 1] * f;
}
const catPos = (s, i) => ({ x: SPOT[i], y: groundAt(s, SPOT[i]) - CR - 6 });
const pivot = (s, i) => ({ x: SPOT[i], y: groundAt(s, SPOT[i]) - 30 });

function aimAngle(s, i, ax, ay) {
  const p = pivot(s, i);
  let a = Math.atan2(ay - p.y, ax - p.x);
  if (a > 0) a = ax < p.x ? -Math.PI + 0.12 : -0.12; // (always upwards)
  return Math.max(-Math.PI + 0.12, Math.min(-0.12, a));
}

function step(s, inp, dt, api) {
  if (s.endT > 0) { // somebody is out of hearts: the shells still in the air finish their flight, then it's over
    s.endT -= dt;
    flyBalls(s, dt, api);
    if (s.endT <= 0) api.end(s.hearts[0] <= 0 && s.hearts[1] <= 0 ? -1 : s.hearts[0] <= 0 ? 1 : 0, 'BOOM!');
    return;
  }
  for (let i = 0; i < 2; i++) {
    const n = inp[i];
    s.cd[i] = Math.max(0, s.cd[i] - dt);
    if (n.hit.b || n.hit.alt) { // the next shell you still have
      for (let k = 1; k <= 3; k++) { const j = (s.shell[i] + k) % 3; if (j === 0 || s.ammo[i][j] > 0) { s.shell[i] = j; break; } }
    }
    s.a[i] = aimAngle(s, i, n.ax, n.ay);
    if (!s.charging[i] && s.cd[i] <= 0 && (n.hit.fire || n.held.fire)) { s.charging[i] = true; s.power[i] = 0; }
    if (s.charging[i] && n.held.fire) s.power[i] = Math.min(1, s.power[i] + dt / CHARGE);
    if (s.charging[i] && !n.held.fire) fire(s, i, api);
  }
  flyBalls(s, dt, api);
}

function fire(s, i, api) {
  const p = pivot(s, i), a = s.a[i], v = POWER_MIN + (POWER_MAX - POWER_MIN) * s.power[i];
  let kind = s.shell[i];
  if (kind && s.ammo[i][kind] > 0) s.ammo[i][kind]--; else kind = 0;
  if (kind && s.ammo[i][kind] === 0) s.shell[i] = 0; // (that was the last one)
  const b = { x: p.x + Math.cos(a) * 34, y: p.y + Math.sin(a) * 34, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind, o: i, split: false, bn: 0, dead: false, tr: [] };
  s.balls.push(b);
  s.charging[i] = false;
  s.power[i] = 0;
  s.cd[i] = RELOAD;
  api.ev('fire', { x: b.x, y: b.y });
}

function flyBalls(s, dt, api) {
  // the wind keeps shifting, a little at a time
  s.windT -= dt;
  if (s.windT <= 0) { s.windT = 0.9; s.wind = Math.max(-80, Math.min(80, s.wind + Math.round((api.rng() - 0.5) * 44))); }
  for (let n = 0; n < 4; n++) {
    const h = dt / 4;
    for (const b of s.balls.slice()) if (!b.dead) moveBall(s, b, h, api);
    collide(s, api);
    s.balls = s.balls.filter(b => !b.dead);
  }
}

// Two balls from different cannons that touch bounce off each other (like billiard balls).
function collide(s, api) {
  const bs = s.balls;
  for (let p = 0; p < bs.length; p++) for (let q = p + 1; q < bs.length; q++) {
    const a = bs[p], b = bs[q];
    if (a.dead || b.dead || a.o === b.o) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, rr = ballR(a.kind) + ballR(b.kind);
    if (d >= rr) continue;
    const nx = dx / d, ny = dy / d, push = (rr - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const vr = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vr <= 0) continue; // (already moving apart)
    a.vx -= vr * nx; a.vy -= vr * ny; b.vx += vr * nx; b.vy += vr * ny;
    api.ev('clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: Math.min(1, vr / 600) });
  }
}

function moveBall(s, b, h, api) {
  const vy0 = b.vy;
  b.vx += s.wind * h;
  b.vy += GRAV * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  if (b.kind === 1 && !b.split && vy0 < 0 && b.vy >= 0) { // a split shot: three shells at the top of its arc
    b.split = true;
    api.ev('split', { x: b.x, y: b.y });
    [-90, 90].forEach(dx => s.balls.push({ x: b.x, y: b.y, vx: b.vx + dx, vy: b.vy, kind: 1, o: b.o, split: true, bn: 0, dead: false, tr: [] }));
  }
  for (let i = 0; i < 2; i++) {
    const c = catPos(s, i);
    if (Math.hypot(b.x - c.x, b.y - c.y) < CR + 8) { explode(s, b, b.x, b.y, i, api); return; }
  }
  if (b.x < -40 || b.x > W + 40 || b.y > H + 40) { api.ev('splash', { x: b.x }); b.dead = true; return; }
  if (b.x >= 0 && b.x <= W && b.y >= groundAt(s, b.x)) {
    if (s.bouncy && b.bn < 1) { b.bn++; b.y = groundAt(s, b.x) - 2; b.vy = -Math.abs(b.vy) * 0.6; b.vx *= 0.85; api.ev('bounce', { x: b.x, y: b.y }); return; }
    explode(s, b, b.x, b.y, -1, api);
    return;
  }
  if (CA.camWalls.inWall(b.x, b.y, 6)) { explode(s, b, b.x, b.y, -1, api); return; } // (it hit a camera wall)
  const t = b.tr;
  if (t.length === 0 || Math.hypot(b.x - t[t.length - 2], b.y - t[t.length - 1]) > 14) { t.push(Math.round(b.x), Math.round(b.y)); if (t.length > 48) t.splice(0, 2); }
}

function explode(s, b, x, y, direct, api) {
  b.dead = true;
  const big = b.kind === 2, cr = big ? CRATER * 1.7 : CRATER, boom = big ? BOOM * 1.6 : BOOM;
  for (let k = 0; k < N; k++) { // a round crater
    const dx = k * COL - x;
    if (Math.abs(dx) < cr) s.ground[k] = Math.min(H - 20, Math.max(s.ground[k], y + Math.sqrt(cr * cr - dx * dx) * 0.8));
  }
  const hurt = [0, 0];
  for (let i = 0; i < 2; i++) {
    const c = catPos(s, i);
    if (i === direct) hurt[i] = 2;
    else if (Math.hypot(c.x - x, c.y - y) < boom) hurt[i] = 1;
    s.hearts[i] = Math.max(0, s.hearts[i] - hurt[i]);
  }
  api.score(HEARTS - s.hearts[1], HEARTS - s.hearts[0]);
  api.ev('boom', { x, y, h0: hurt[0], h1: hurt[1], d: direct, big: big ? 1 : 0 });
  if ((s.hearts[0] <= 0 || s.hearts[1] <= 0) && !s.endT) s.endT = 1.2;
}

const r2 = v => Math.round(v * 100) / 100;

function snap(s) {
  return {
    gr: s.ground.map(y => Math.round(y)), h: s.hearts, pw: s.power.map(r2), a: s.a.map((v, i) => r2(v)), wd: s.wind,
    ch: s.charging.map(v => (v ? 1 : 0)), cd: s.cd.map(v => Math.round(v * 10) / 10),
    b: s.balls.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), k: b.o + '' + b.kind })), tr: s.balls.map(b => b.tr.slice()),
    sh: s.shell, am: s.ammo, bn: s.bouncy ? 1 : 0,
  };
}

// The bot tries lots of angles and powers in its head (with the wind) and picks the one that lands closest to the
// other cat; easier bots aim worse. It fires as soon as it has reloaded.
function bot(s, i, dt, api) {
  const st = (s.bs || (s.bs = {}))[i] || (s.bs[i] = { plan: null, think: 0 });
  const target = catPos(s, 1 - i), p = pivot(s, i);
  if (s.endT > 0 || (s.cd[i] > 0 && !s.charging[i])) {
    st.plan = null;
    return { ax: target.x, ay: target.y - 140, held: {}, hit: {} };
  }
  if (!st.plan) {
    let best = null, bestD = Infinity;
    for (let a = -Math.PI + 0.15; a < -0.15; a += 0.05) {
      if ((i === 0 && Math.cos(a) < 0) || (i === 1 && Math.cos(a) > 0)) continue;
      for (let pw = 0.05; pw <= 1.0001; pw += 0.05) {
        const v = POWER_MIN + (POWER_MAX - POWER_MIN) * pw;
        let x = p.x + Math.cos(a) * 34, y = p.y + Math.sin(a) * 34, vx = Math.cos(a) * v, vy = Math.sin(a) * v, d = Infinity;
        for (let k = 0; k < 400; k++) {
          vx += s.wind / 60; vy += GRAV / 60; x += vx / 60; y += vy / 60;
          d = Math.min(d, Math.hypot(x - target.x, y - target.y));
          if (x < -40 || x > W + 40 || y > H || (x >= 0 && x <= W && y >= groundAt(s, x)) || CA.camWalls.inWall(x, y, 6)) break;
        }
        if (d < bestD) { bestD = d; best = { a, pw }; }
      }
    }
    const err = 1 - api.skill;
    st.plan = { a: best.a + CA.games.kit.gauss(0, 0.02 + 0.07 * err), pw: Math.max(0.05, Math.min(1, best.pw + CA.games.kit.gauss(0, 0.02 + 0.1 * err))) };
    st.think = 0.3 + (1 - api.skill) * 1.1 + Math.random() * 0.6;
  }
  const out = { ax: p.x + Math.cos(st.plan.a) * 200, ay: p.y + Math.sin(st.plan.a) * 200, held: {}, hit: {} };
  st.think -= dt;
  if (st.think > 0) return out;
  if (!s.charging[i]) { out.hit.fire = true; out.held.fire = true; return out; }
  if (s.power[i] < st.plan.pw) out.held.fire = true;
  return out;
}

function event(v, e) {
  if (e.type === 'fire') { v.burst(e.x, e.y, '#fff3b0', 10, 200); v.sound([[120, 0, 0.12], [80, 0.05, 0.2]]); v.shake(5); }
  if (e.type === 'boom') {
    v.burst(e.x, e.y, '#ff9a3c', 26, 360);
    v.burst(e.x, e.y, '#6b4a2f', 18, 260);
    v.ring(e.x, e.y, '#ffd23f', 20);
    v.shake(e.big ? 20 : e.d >= 0 ? 16 : 10);
    v.sound('boom');
    [0, 1].forEach(i => { const h = e['h' + i]; if (h) v.pop(SPOT[i], 300, h > 1 ? 'DIRECT HIT! −2' : '−1', '#ff5a5a'); });
  }
  if (e.type === 'clash') { v.burst(e.x, e.y, '#ffffff', 12, 240); v.ring(e.x, e.y, '#ffffff', 10); v.shake(3); v.sound([[900, 0, 0.04], [600, 0.03, 0.06]]); if (e.p > 0.3) v.pop(e.x, e.y - 18, 'CLANG!', '#ffd23f'); }
  if (e.type === 'splash') v.sound([[300, 0, 0.1]]);
  if (e.type === 'split') { v.burst(e.x, e.y, '#ffd23f', 10, 160); v.sound([[600, 0, 0.05], [800, 0.04, 0.05]]); }
  if (e.type === 'bounce') { v.burst(e.x, e.y, '#e6b3ff', 6, 160); v.sound([[400, 0, 0.04], [700, 0.03, 0.05]]); }
}

function draw(v, s) {
  const g = v.g;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5aa8ff');
  sky.addColorStop(1, '#cfe9ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255, 255, 255, .8)';
  [[160, 90, 1], [520, 60, 1.3], [800, 110, 0.9]].forEach(([x, y, k]) => { const dx = ((v.now / 60 * (s.wd > 0 ? 1 : -1) * Math.min(1, Math.abs(s.wd) / 40)) % 1100 + 1100) % 1100; const X = (x + dx) % 1100 - 70; [[0, 0, 26], [24, -10, 22], [48, 0, 24]].forEach(([a, b, r]) => v.dot(X + a * k, y + b * k, r * k)); });
  g.fillStyle = s.bn ? '#b36bd6' : '#6aa84f'; // the ground (purple and springy when it's bouncy)
  g.beginPath();
  g.moveTo(0, H);
  s.gr.forEach((y, k) => g.lineTo(k * COL, y));
  g.lineTo(W, H);
  g.fill();
  g.fillStyle = '#7a5434';
  g.beginPath();
  g.moveTo(0, H);
  s.gr.forEach((y, k) => g.lineTo(k * COL, y + 12));
  g.lineTo(W, H);
  g.fill();
  const gy = x => { const k = Math.max(0, Math.min(N - 2, Math.floor(x / COL))), f = x / COL - k; return s.gr[k] * (1 - f) + s.gr[k + 1] * f; };
  [0, 1].forEach(i => {
    const x = SPOT[i], base = gy(x), py = base - 30;
    const a = s.a[i];
    v.catSide(i, x - (i ? -6 : 6), base - 8, 0.62, { lookRight: i === 0 });
    g.save(); // the barrel
    g.translate(x, py);
    g.rotate(a);
    g.fillStyle = '#2b2b38';
    v.roundRect(-6, -10, 46, 20, 8); g.fill();
    g.fillStyle = v.team[i].main;
    g.fillRect(30, -11, 8, 22);
    g.restore();
    g.fillStyle = '#5a3b22'; // the wheel
    v.dot(x, base - 10, 14);
    g.fillStyle = '#c99a63';
    v.dot(x, base - 10, 5);
    for (let k = 0; k < HEARTS; k++) v.heart(x + (k - 1) * 18, base - 110, k < s.h[i]);
    v.label(i === v.me ? 'You' : v.names[i], x, base + 22, 13, i === v.me ? '#ffd23f' : '#ffffff');
    if (s.ch[i] || s.cd[i] > 0) { // the power bar while you charge, and the reload bar after a shot
      g.fillStyle = 'rgba(0, 0, 0, .55)';
      v.roundRect(x - 40, base - 136, 80, 10, 5); g.fill();
      if (s.ch[i]) {
        g.fillStyle = s.pw[i] < 0.5 ? '#7dff8a' : s.pw[i] < 0.85 ? '#ffd23f' : '#ff5a5a';
        v.roundRect(x - 39, base - 135, Math.max(6, 78 * s.pw[i]), 8, 4); g.fill();
      } else {
        g.fillStyle = '#9aa8c8';
        v.roundRect(x - 39, base - 135, Math.max(6, 78 * (1 - s.cd[i] / RELOAD)), 8, 4); g.fill();
      }
    }
  });
  g.fillStyle = 'rgba(40, 40, 60, .35)';
  s.tr.forEach(t => { for (let k = 0; k < t.length; k += 2) v.dot(t[k], t[k + 1], 2.5); });
  s.b.forEach(p => {
    const o = +p.k[0], kind = +p.k[1], r = ballR(kind);
    g.fillStyle = '#1b1b24';
    v.dot(p.x, p.y, r);
    g.strokeStyle = v.team[o].main; // (a ring in the color of the cat that fired it)
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, .4)';
    v.dot(p.x - 2, p.y - 3, 2.5);
  });
  // wind
  g.fillStyle = 'rgba(20, 30, 60, .7)';
  v.roundRect(W / 2 - 80, 12, 160, 30, 15); g.fill();
  const wtext = s.wd === 0 ? 'No wind' : 'Wind ' + (s.wd > 0 ? '→' : '←').repeat(1 + Math.min(2, Math.floor(Math.abs(s.wd) / 22)));
  v.label('🌬️ ' + wtext, W / 2, 28, 14, '#ffffff');
  { // which shell is loaded, and the ground
    const sel = Math.round(s.sh[v.me]), am = s.am[v.me].map(Math.round);
    v.label('Shell: ' + SHELLS[sel] + (sel ? ' (' + am[sel] + ' left)' : '') + ' · B or right-click to swap', W / 2, H - 14, 13, '#1c2a4a');
    if (s.bn) v.label('🟣 Bouncy ground: shells bounce once!', W / 2, 62, 14, '#7a2fa8');
  }
  v.msg(s.ch[v.me] ? 'Let go to fire!' : s.cd[v.me] > 0 ? 'Reloading…' : 'Aim with the mouse, hold the button to charge, let go to fire. Your balls can hit theirs!');
}

})();
