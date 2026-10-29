/* Classic Games: Kart Dash. Two cats in karts, three laps. W speeds up, S brakes (and reverses), A and D steer, Space
   is a short boost. A lap only counts if you went through every checkpoint in order, so cutting corners doesn't
   help. Both karts are exactly the same. (The host's app runs the race: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540;
const HW = 54;                                   // half the road's width
const KR = 15;                                   // a kart's size
const ACCEL = 380, BRAKE = 700, TOP = 300, REVERSE = 120, BOOST_TOP = 430, BOOST_TIME = 1, BOOST_WAIT = 4;
const LAPS = 3, CPS = 8, LIMIT = 240;
// (the road bends round the camera walls in the top corners: see cam-walls.js)
const KEYS = [[330, 90], [480, 80], [630, 90], [720, 185], [850, 280], [870, 380], [780, 450], [600, 455], [480, 340], [360, 455], [180, 450], [90, 370], [100, 270], [230, 200]];

// The road's middle line: a smooth loop through KEYS.
const PATH = (() => {
  const out = [], n = KEYS.length;
  for (let k = 0; k < n; k++) {
    const p0 = KEYS[(k - 1 + n) % n], p1 = KEYS[k], p2 = KEYS[(k + 1) % n], p3 = KEYS[(k + 2) % n];
    for (let t = 0; t < 1; t += 1 / 20) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
})();
const N = PATH.length;
const CP_AT = Array.from({ length: CPS }, (_, k) => Math.round(k * N / CPS)); // checkpoint 0 is the start line

// The nearest point of the road's middle line to (x, y), searching near index `hint`.
function nearestIdx(x, y, hint) {
  let best = hint, bd = Infinity;
  for (let d = -14; d <= 14; d++) {
    const k = (hint + d + N) % N, dd = (PATH[k][0] - x) ** 2 + (PATH[k][1] - y) ** 2;
    if (dd < bd) { bd = dd; best = k; }
  }
  return best;
}

CA.games.add('kart', {
  name: 'Kart Dash', icon: '🏎️',
  blurb: 'Race your kart three laps around the track! W to speed up, S to brake, A and D to steer, Space for a quick boost. You have to go through every checkpoint, so no shortcuts!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'kart', angles: ['h'],
      pad: { stick: true, buttons: [{ k: 'a', label: '🚀 Boost', main: true }] },
      help: 'W go · S brake · A/D steer · Space boost · 3 laps, every checkpoint counts',
      helpTouch: 'Stick: up to go, down to brake, sideways to steer · Boost',
      note: LAPS + ' laps',
      init, step, snap, bot, draw, event,
    });
  },
});

function init() {
  const k0 = N - 5, dir = Math.atan2(PATH[0][1] - PATH[k0][1], PATH[0][0] - PATH[k0][0]);
  const nx = -Math.sin(dir), ny = Math.cos(dir);
  return {
    t: 0, done: -1,
    karts: [-1, 1].map(side => ({
      x: PATH[k0][0] + nx * side * 22, y: PATH[k0][1] + ny * side * 22, h: dir, v: 0, idx: k0, lap: 0, cp: 0, go: false, boost: 0, wait: 0, fin: 0,
    })),
  };
}

function step(s, inp, dt, api) {
  s.t += dt;
  s.karts.forEach((k, i) => {
    const n = inp[i];
    const go = n.my < -0.3 || n.held.u, brake = n.my > 0.3 || n.held.d;
    k.wait = Math.max(0, k.wait - dt);
    if (n.hit.a && k.wait <= 0) { k.boost = BOOST_TIME; k.wait = BOOST_WAIT; api.ev('boost', { x: k.x, y: k.y }); }
    k.boost = Math.max(0, k.boost - dt);
    const top = (k.boost > 0 ? BOOST_TOP : TOP) * (n.top || 1);
    if (go) k.v += (k.boost > 0 ? ACCEL * 1.8 : ACCEL) * dt;
    else if (brake) k.v -= (k.v > 0 ? BRAKE : ACCEL * 0.6) * dt;
    else k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), 90 * dt);
    k.v -= k.v * 0.25 * dt; // (drag)
    k.v = Math.max(-REVERSE, Math.min(top, k.v));
    k.h += n.mx * 2.6 * Math.min(1, Math.abs(k.v) / 110) * Math.sign(k.v || 1) * dt;
    k.x += Math.cos(k.h) * k.v * dt;
    k.y += Math.sin(k.h) * k.v * dt;
    // the edges of the road are walls
    k.idx = nearestIdx(k.x, k.y, k.idx);
    const [cx, cy] = PATH[k.idx], d = Math.hypot(k.x - cx, k.y - cy);
    if (d > HW - KR) {
      k.x = cx + (k.x - cx) / d * (HW - KR);
      k.y = cy + (k.y - cy) / d * (HW - KR);
      if (Math.abs(k.v) > 120) api.ev('wall', { x: k.x, y: k.y });
      k.v *= 0.55;
    }
    // Checkpoints, in order. k.cp is the next one you need; checkpoint 0 is the start line. The first time over the
    // start line just starts the race; after that, crossing it (with all the others done) finishes a lap.
    if ((k.idx - CP_AT[k.cp] + N) % N < 12) {
      if (k.cp === 0) {
        if (k.go) { k.lap++; api.ev('lap', { i, lap: k.lap }); if (k.lap >= LAPS && !k.fin) k.fin = s.t; }
        k.go = true;
      }
      k.cp = (k.cp + 1) % CPS;
    }
  });
  // karts bump into each other
  const [a, b] = s.karts;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
  if (d < KR * 2) {
    const nx = dx / d, ny = dy / d, push = (KR * 2 - d) / 2 + 0.5;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const va = a.v, vb = b.v;
    a.v = va * 0.6 + vb * 0.3;
    b.v = vb * 0.6 + va * 0.3;
    if (Math.abs(va - vb) > 60) api.ev('bump', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  api.score(Math.min(LAPS, a.lap), Math.min(LAPS, b.lap));
  const fins = s.karts.map(k => k.fin);
  if (fins[0] || fins[1]) api.end(fins[0] && fins[1] ? (fins[0] <= fins[1] ? 0 : 1) : fins[0] ? 0 : 1, 'FINISH!');
  else if (s.t >= LIMIT) { const p = s.karts.map(progress); api.end(p[0] === p[1] ? -1 : p[0] > p[1] ? 0 : 1, 'TIME!'); }
}

// How far round the race a kart is (laps, checkpoints, and how far towards the next one).
function progress(k) {
  if (!k.go) return -1 + ((k.idx - (N - 20) + N) % N) / 40; // (still before the start line)
  const passed = k.lap * CPS + ((k.cp - 1 + CPS) % CPS);
  const target = CP_AT[k.cp], from = CP_AT[(k.cp - 1 + CPS) % CPS];
  const seg = (target - from + N) % N || N, got = (k.idx - from + N) % N;
  return passed + Math.min(1, got / seg);
}

function snap(s) {
  const p = s.karts.map(progress);
  return {
    t: Math.round(s.t * 10) / 10, lead: p[0] === p[1] ? -1 : p[0] > p[1] ? 0 : 1,
    k: s.karts.map(k => ({ x: Math.round(k.x * 10) / 10, y: Math.round(k.y * 10) / 10, h: Math.round(k.h * 100) / 100, v: Math.round(k.v), lap: k.lap, cp: k.cp, b: k.boost > 0 ? 1 : 0, w: Math.round(k.wait * 10) / 10 })),
  };
}

// The bot follows the road's middle line, looking ahead, slows for tight corners and boosts on straights.
function bot(s, i, dt, api) {
  const k = s.karts[i];
  const look = 5 + Math.round(Math.max(0, k.v) / 45);
  const [tx, ty] = PATH[(k.idx + look) % N], [fx, fy] = PATH[(k.idx + look + 10) % N];
  let want = Math.atan2(ty - k.y, tx - k.x) - k.h;
  while (want > Math.PI) want -= Math.PI * 2;
  while (want < -Math.PI) want += Math.PI * 2;
  const bend = Math.abs(Math.atan2(fy - ty, fx - tx) - Math.atan2(ty - k.y, tx - k.x));
  const sharp = Math.min(bend, Math.PI * 2 - bend);
  const slowFor = sharp > 0.7 ? 190 : sharp > 0.4 ? 240 : 999;
  const out = { mx: Math.max(-1, Math.min(1, want * 2.2)), my: k.v > slowFor ? 0.6 : -1, top: 0.86 + 0.14 * api.skill, hit: {} };
  if (sharp < 0.25 && k.wait <= 0 && k.v > 150 && Math.random() < 0.02 + 0.05 * api.skill) out.hit.a = true;
  return out;
}

function event(v, e) {
  if (e.type === 'boost') { v.burst(e.x, e.y, '#ffd23f', 10, 200); v.sound([[300, 0, 0.06], [600, 0.05, 0.1]]); }
  if (e.type === 'wall') v.sound([[140, 0, 0.05]]);
  if (e.type === 'bump') { v.burst(e.x, e.y, '#ffffff', 8, 180); v.sound([[200, 0, 0.05], [120, 0.04, 0.08]]); v.shake(4); }
  if (e.type === 'lap') {
    const k = e.i === v.me;
    v.note((k ? 'You' : v.names[e.i]) + (e.lap >= LAPS ? ' finished!' : ': lap ' + (e.lap + 1) + ' of ' + LAPS));
    if (k) v.sound(e.lap >= LAPS ? 'win' : 'point');
  }
}

let art = null;
function makeArt() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#5ea84a';
  b.fillRect(0, 0, W, H);
  for (let k = 0; k < 400; k++) { b.fillStyle = k % 2 ? 'rgba(0, 60, 0, .08)' : 'rgba(255, 255, 200, .06)'; b.fillRect((k * 97) % W, (k * 53) % H, 6, 3); }
  const loop = () => { b.beginPath(); PATH.forEach(([x, y], k) => (k ? b.lineTo(x, y) : b.moveTo(x, y))); b.closePath(); };
  b.lineJoin = 'round';
  loop(); b.strokeStyle = '#e8e8e8'; b.lineWidth = HW * 2 + 10; b.stroke();
  loop(); b.setLineDash([14, 14]); b.strokeStyle = '#e04040'; b.lineWidth = HW * 2 + 10; b.stroke(); b.setLineDash([]);
  loop(); b.strokeStyle = '#4b4f5c'; b.lineWidth = HW * 2; b.stroke();
  loop(); b.setLineDash([18, 22]); b.strokeStyle = 'rgba(255, 255, 255, .5)'; b.lineWidth = 2; b.stroke(); b.setLineDash([]);
  CP_AT.forEach((k, j) => { // checkpoints, and the checkered start line
    const [x, y] = PATH[k], [x2, y2] = PATH[(k + 1) % N], a = Math.atan2(y2 - y, x2 - x), nx = -Math.sin(a), ny = Math.cos(a);
    if (j === 0) {
      for (let s = -HW; s < HW; s += 9) for (let r = 0; r < 2; r++) {
        b.fillStyle = (Math.floor(s / 9) + r) % 2 ? '#111' : '#fff';
        b.save(); b.translate(x + nx * s, y + ny * s); b.rotate(a); b.fillRect(r * 9 - 9, 0, 9, 9); b.restore();
      }
    } else {
      b.strokeStyle = 'rgba(255, 220, 80, .35)'; b.lineWidth = 3;
      b.beginPath(); b.moveTo(x + nx * HW, y + ny * HW); b.lineTo(x - nx * HW, y - ny * HW); b.stroke();
    }
  });
  return c;
}

function draw(v, s) {
  const g = v.g;
  if (!art) art = makeArt();
  g.drawImage(art, 0, 0, W, H);
  s.k.forEach((k, i) => { // the next checkpoint for you, highlighted
    if (i !== v.me) return;
    const idx = CP_AT[k.cp % CPS], [x, y] = PATH[idx], [x2, y2] = PATH[(idx + 1) % N], a = Math.atan2(y2 - y, x2 - x), nx = -Math.sin(a), ny = Math.cos(a);
    g.strokeStyle = 'rgba(255, 235, 80, ' + (0.5 + 0.3 * Math.sin(v.now / 150)) + ')';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(x + nx * HW, y + ny * HW); g.lineTo(x - nx * HW, y - ny * HW); g.stroke();
  });
  s.k.forEach((k, i) => {
    g.save();
    g.translate(k.x, k.y);
    g.rotate(k.h);
    if (k.b) { g.fillStyle = 'rgba(255, 180, 40, .8)'; g.beginPath(); g.moveTo(-16, -6); g.lineTo(-34 - Math.random() * 10, 0); g.lineTo(-16, 6); g.fill(); }
    g.fillStyle = '#222';
    [[-10, -12], [8, -12], [-10, 9], [8, 9]].forEach(([x, y]) => g.fillRect(x, y, 8, 4));
    g.fillStyle = v.team[i].main;
    v.roundRect(-16, -10, 32, 20, 6); g.fill();
    g.fillStyle = v.team[i].light;
    g.fillRect(10, -7, 5, 14);
    g.restore();
    v.catTop(i, k.x, k.y - 6, 0.55, { ring: false, label: false, lookRight: Math.cos(k.h) >= 0 });
    v.label(i === v.me ? 'You' : v.names[i], k.x, k.y + 22, 11, i === v.me ? '#ffd23f' : '#ffffff');
  });
  const me = s.k[v.me];
  g.fillStyle = 'rgba(20, 20, 30, .78)';
  v.roundRect(W / 2 - 200, 6, 400, 30, 15); g.fill();
  const pos = s.lead < 0 ? '' : s.lead === v.me ? '1st 🥇' : '2nd';
  v.label('Lap ' + Math.min(LAPS, me.lap + 1) + '/' + LAPS + '  ·  ' + pos + '  ·  ⏱ ' + Math.floor(s.t) + 's', W / 2, 21, 16, '#ffffff');
  v.label(me.w > 0 ? '🚀 ' + me.w.toFixed(1) + 's' : '🚀 Boost ready (Space)', W / 2, 52, 13, me.w > 0 ? '#bbbbbb' : '#ffd23f');
}

})();
