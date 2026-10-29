/* Classic Games: Cat Cannons. Two cats in cannons on opposite hills take turns firing. Aim with the mouse, hold the
   button to charge the shot, let go to fire. The cannonball flies in an arc (gravity, and a little wind), and blows a
   crater where it lands. A direct hit costs 2 of your 3 hearts; landing close costs 1. You have 10 seconds a shot.
   (The host's app flies the cannonballs: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const COL = 8, N = W / COL + 1;                  // the ground: a height every 8 pixels
const GRAV = 520;
const POWER_MIN = 230, POWER_MAX = 900, CHARGE = 1.4;
const BOOM = 70, CRATER = 38, CR = 22;            // blast size, crater size, a cat's size
const TURN = 10, HEARTS = 3;
const SPOT = [110, W - 110];

CA.games.add('cannons', {
  name: 'Cat Cannons', icon: '💥',
  blurb: 'Take turns firing your cannon at the other cat! Aim with the mouse, hold to charge, let go to fire. Watch the wind. A direct hit costs 2 hearts, a near miss 1. 3 hearts each.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'cannons', mouse: true, angles: ['a'],
      pad: { buttons: [{ k: 'fire', label: '💥 Hold to charge', main: true }] },
      help: 'Your turn: aim with the mouse · hold the button to charge · let go to fire',
      helpTouch: 'Your turn: touch where to aim, hold to charge, let go to fire',
      note: HEARTS + ' hearts each · take turns',
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
  const s = { ground, hearts: [HEARTS, HEARTS], turn: 0, turnT: TURN, power: 0, charging: false, ball: null, trail: [], wait: 0, wind: 0, aim: [-0.9, -2.2], shots: 0 };
  newTurn(s, api, 0);
  return s;
}

function groundAt(s, x) {
  const k = Math.max(0, Math.min(N - 2, Math.floor(x / COL))), f = Math.max(0, Math.min(1, x / COL - k));
  return s.ground[k] * (1 - f) + s.ground[k + 1] * f;
}
const catPos = (s, i) => ({ x: SPOT[i], y: groundAt(s, SPOT[i]) - CR - 6 });
const pivot = (s, i) => ({ x: SPOT[i], y: groundAt(s, SPOT[i]) - 30 });

function newTurn(s, api, who) {
  s.turn = who;
  s.turnT = TURN;
  s.power = 0;
  s.charging = false;
  s.ball = null;
  s.wind = Math.round((api.rng() - 0.5) * 120);
  api.ev('turn', { who });
}

function aimAngle(s, i, ax, ay) {
  const p = pivot(s, i);
  let a = Math.atan2(ay - p.y, ax - p.x);
  if (a > 0) a = ax < p.x ? -Math.PI + 0.12 : -0.12; // (always upwards)
  return Math.max(-Math.PI + 0.12, Math.min(-0.12, a));
}

function step(s, inp, dt, api) {
  if (s.wait > 0) {
    s.wait -= dt;
    if (s.wait <= 0) {
      if (s.hearts[0] <= 0 || s.hearts[1] <= 0) {
        const w = s.hearts[0] <= 0 && s.hearts[1] <= 0 ? -1 : s.hearts[0] <= 0 ? 1 : 0;
        api.end(w, 'BOOM!');
      } else newTurn(s, api, 1 - s.turn);
    }
    return;
  }
  if (s.ball) { flyBall(s, dt, api); return; }
  const i = s.turn, n = inp[i];
  s.a = aimAngle(s, i, n.ax, n.ay);
  if (n.hit.fire) s.charging = true;
  if (s.charging && n.held.fire) s.power = Math.min(1, s.power + dt / CHARGE);
  if (s.charging && !n.held.fire) { fire(s, api); return; }
  s.turnT -= dt;
  if (s.turnT <= 0) { api.ev('slow', { who: i }); s.wait = 1; s.ball = null; }
}

function fire(s, api) {
  const i = s.turn, p = pivot(s, i), a = s.a, v = POWER_MIN + (POWER_MAX - POWER_MIN) * s.power;
  s.ball = { x: p.x + Math.cos(a) * 34, y: p.y + Math.sin(a) * 34, vx: Math.cos(a) * v, vy: Math.sin(a) * v };
  s.trail = [];
  s.charging = false;
  s.shots++;
  api.ev('fire', { x: s.ball.x, y: s.ball.y });
}

function flyBall(s, dt, api) {
  const b = s.ball;
  for (let n = 0; n < 4; n++) {
    const h = dt / 4;
    b.vx += s.wind * h;
    b.vy += GRAV * h;
    b.x += b.vx * h;
    b.y += b.vy * h;
    for (let i = 0; i < 2; i++) {
      const c = catPos(s, i);
      if (Math.hypot(b.x - c.x, b.y - c.y) < CR + 8) { explode(s, b.x, b.y, i, api); return; }
    }
    if (b.x < -40 || b.x > W + 40 || b.y > H + 40) { api.ev('splash', { x: b.x }); s.ball = null; s.wait = 1; return; }
    if (b.x >= 0 && b.x <= W && b.y >= groundAt(s, b.x)) { explode(s, b.x, b.y, -1, api); return; }
    if (CA.camWalls.inWall(b.x, b.y, 6)) { explode(s, b.x, b.y, -1, api); return; } // (it hit a camera wall)
  }
  if (s.trail.length === 0 || Math.hypot(b.x - s.trail[s.trail.length - 2], b.y - s.trail[s.trail.length - 1]) > 14) s.trail.push(Math.round(b.x), Math.round(b.y));
}

function explode(s, x, y, direct, api) {
  for (let k = 0; k < N; k++) { // a round crater
    const dx = k * COL - x;
    if (Math.abs(dx) < CRATER) s.ground[k] = Math.min(H - 20, Math.max(s.ground[k], y + Math.sqrt(CRATER * CRATER - dx * dx) * 0.8));
  }
  const hurt = [0, 0];
  for (let i = 0; i < 2; i++) {
    const c = catPos(s, i);
    if (i === direct) hurt[i] = 2;
    else if (Math.hypot(c.x - x, c.y - y) < BOOM) hurt[i] = 1;
    s.hearts[i] = Math.max(0, s.hearts[i] - hurt[i]);
  }
  api.score(HEARTS - s.hearts[1], HEARTS - s.hearts[0]);
  api.ev('boom', { x, y, h0: hurt[0], h1: hurt[1], d: direct });
  s.ball = null;
  s.wait = 1.4;
}

function snap(s) {
  return {
    gr: s.ground.map(y => Math.round(y)), h: s.hearts, tn: s.turn, tt: Math.round(s.turnT * 10) / 10, pw: Math.round(s.power * 100) / 100,
    a: Math.round((s.a || (s.turn ? -2.3 : -0.8)) * 100) / 100, wd: s.wind, ch: s.charging ? 1 : 0, wt: s.wait > 0 ? 1 : 0,
    b: s.ball ? [Math.round(s.ball.x), Math.round(s.ball.y)] : null, tr: s.trail.slice(),
  };
}

// The bot tries lots of angles and powers in its head (with the wind) and picks the one that lands closest to the
// other cat; easier bots aim worse.
function bot(s, i, dt, api) {
  const st = s.bs || (s.bs = { shot: -1, plan: null, think: 0 });
  if (s.turn !== i || s.ball || s.wait > 0) { st.plan = null; return {}; }
  if (!st.plan) {
    const target = catPos(s, 1 - i), p = pivot(s, i);
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
    st.think = 0.8 + Math.random() * 1.2;
  }
  const p = pivot(s, i);
  const out = { ax: p.x + Math.cos(st.plan.a) * 200, ay: p.y + Math.sin(st.plan.a) * 200, held: {}, hit: {} };
  st.think -= dt;
  if (st.think > 0) return out;
  if (!s.charging) { out.hit.fire = true; out.held.fire = true; return out; }
  if (s.power < st.plan.pw) out.held.fire = true;
  return out;
}

function event(v, e) {
  if (e.type === 'fire') { v.burst(e.x, e.y, '#fff3b0', 10, 200); v.sound([[120, 0, 0.12], [80, 0.05, 0.2]]); v.shake(5); }
  if (e.type === 'boom') {
    v.burst(e.x, e.y, '#ff9a3c', 26, 360);
    v.burst(e.x, e.y, '#6b4a2f', 18, 260);
    v.ring(e.x, e.y, '#ffd23f', 20);
    v.shake(e.d >= 0 ? 16 : 10);
    v.sound('boom');
    [0, 1].forEach(i => { const h = e['h' + i]; if (h) v.pop(SPOT[i], 300, h > 1 ? 'DIRECT HIT! −2' : '−1', '#ff5a5a'); });
  }
  if (e.type === 'splash') v.sound([[300, 0, 0.1]]);
  if (e.type === 'slow') { v.pop(SPOT[e.who], 300, 'Too slow!', '#ff9a9a'); v.sound('miss'); }
  if (e.type === 'turn') v.sound('tick');
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
  g.fillStyle = '#6aa84f'; // the ground
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
    const a = s.tn === i ? s.a : (i ? -2.4 : -0.75);
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
    if (s.tn === i && !s.b && !s.wt) { // the power bar
      g.fillStyle = 'rgba(0, 0, 0, .55)';
      v.roundRect(x - 40, base - 136, 80, 10, 5); g.fill();
      g.fillStyle = s.pw < 0.5 ? '#7dff8a' : s.pw < 0.85 ? '#ffd23f' : '#ff5a5a';
      v.roundRect(x - 39, base - 135, Math.max(6, 78 * s.pw), 8, 4); g.fill();
    }
  });
  if (s.tr.length >= 4) {
    g.fillStyle = 'rgba(40, 40, 60, .35)';
    for (let k = 0; k < s.tr.length; k += 2) v.dot(s.tr[k], s.tr[k + 1], 2.5);
  }
  if (s.b) { g.fillStyle = '#1b1b24'; v.dot(s.b[0], s.b[1], 8); g.fillStyle = 'rgba(255, 255, 255, .4)'; v.dot(s.b[0] - 2, s.b[1] - 3, 2.5); }
  // wind
  g.fillStyle = 'rgba(20, 30, 60, .7)';
  v.roundRect(W / 2 - 80, 12, 160, 30, 15); g.fill();
  const wtext = s.wd === 0 ? 'No wind' : 'Wind ' + (s.wd > 0 ? '→' : '←').repeat(1 + Math.min(2, Math.floor(Math.abs(s.wd) / 22)));
  v.label('🌬️ ' + wtext, W / 2, 28, 14, '#ffffff');
  if (!s.b && !s.wt) v.label((s.tn === v.me ? 'Your turn' : v.names[s.tn] + "'s turn") + ' · ⏱ ' + Math.ceil(s.tt), W / 2, 62, 16, s.tn === v.me ? '#ffd23f' : '#ffffff');
  if (s.tn === v.me && !s.b && !s.wt) v.msg(s.ch ? 'Let go to fire!' : 'Your turn! Aim with the mouse, hold the button to charge, let go to fire');
  else if (!s.b && !s.wt) v.msg(v.names[s.tn] + ' is aiming…');
}

})();
