/* Classic Games: Sumo Cats. Two round cats in a ring, pushing. They don't bounce off each other: touching, they lean
   in and shove, so whoever pushes harder slowly drives the other one back. Space charges forward (a small shove, and
   then you need a moment to recover, so the other cat can dodge and push back). After a few seconds the ring starts
   to shrink. Push the other cat out to win the round; first to 3 rounds. (The host's app runs the pushing: see
   games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, CX = W / 2, CY = H / 2 + 10;
const R = 30;                                       // a cat's size
const RING0 = 225, RING1 = 105, SHRINK_AT = 6, SHRUNK_AT = 36;
const SPEED = 230, ACCEL = 900;
const CHARGE_SPEED = 480, CHARGE_TIME = 0.22, RECOVER = 0.38, CHARGE_WAIT = 1.4, KNOCK = 150;
const SHOVE = 150;                                 // the fastest two cats leaning on each other move (pushing is slow, heavy work)
const WIN = 3;

CA.games.add('sumo', {
  name: 'Sumo Cats', icon: '🤼',
  blurb: 'Lean in and shove the other cat out of the ring! WASD to push, Space to charge (then you need a moment to recover). The ring shrinks as the round goes on. First to 3!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'sumo',
      pad: { stick: true, buttons: [{ k: 'a', label: '💨 Charge', main: true }] },
      help: 'WASD move · Space charge · push them out of the ring · first to 3 rounds',
      helpTouch: 'Stick moves · Charge rams them · push them out of the ring',
      note: 'First to ' + WIN + ' rounds',
      init, step, snap, bot, draw, event,
    });
  },
});

function init(api) {
  const s = { wins: [0, 0], round: 0, phase: 'fight', pause: 0, t: 0, rw: -1, cats: [] };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.t = 0;
  s.phase = 'fight';
  s.rw = -1;
  s.cats = [-1, 1].map(side => ({ x: CX + side * 110, y: CY, vx: 0, vy: 0, fx: -side, fy: 0, charge: 0, rec: 0, wait: 0.6, out: false }));
  if (api) api.note('Round ' + s.round + ' · first to ' + WIN);
}

const ringR = t => RING0 + (RING1 - RING0) * Math.max(0, Math.min(1, (t - SHRINK_AT) / (SHRUNK_AT - SHRINK_AT)));

function step(s, inp, dt, api) {
  if (s.phase === 'pause') {
    s.pause -= dt;
    s.cats.forEach(c => { c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.9; c.vy *= 0.9; CA.camWalls.bounce(c, R, 0.5); });
    if (s.pause <= 0) newRound(s, api);
    return;
  }
  s.t += dt;
  s.cats.forEach((c, i) => {
    const n = inp[i], o = s.cats[1 - i];
    c.wait = Math.max(0, c.wait - dt);
    c.rec = Math.max(0, c.rec - dt);
    if (n.mx || n.my) { const l = Math.hypot(n.mx, n.my); c.fx = n.mx / l; c.fy = n.my / l; }
    if (n.hit.a && c.wait <= 0 && c.rec <= 0 && c.charge <= 0) {
      if (!n.mx && !n.my) { const dx = o.x - c.x, dy = o.y - c.y, l = Math.hypot(dx, dy) || 1; c.fx = dx / l; c.fy = dy / l; }
      c.charge = CHARGE_TIME;
      c.wait = CHARGE_WAIT;
      api.ev('charge', { x: c.x, y: c.y });
    }
    if (c.charge > 0) {
      c.charge -= dt;
      c.vx = c.fx * CHARGE_SPEED;
      c.vy = c.fy * CHARGE_SPEED;
      if (c.charge <= 0) c.rec = RECOVER;
    } else {
      const k = c.rec > 0 ? 0.25 : 1; // (tired after a charge: slow to move)
      c.vx += n.mx * ACCEL * k * dt;
      c.vy += n.my * ACCEL * k * dt;
      const sp = Math.hypot(c.vx, c.vy), top = SPEED * (c.rec > 0 ? 0.6 : 1);
      if (sp > top) { c.vx *= Math.max(top / sp, Math.pow(0.05, dt)); c.vy *= Math.max(top / sp, Math.pow(0.05, dt)); }
      const fr = Math.pow(n.mx || n.my ? 0.45 : 0.2, dt); // (feet planted: you slow down fast when you stop pushing)
      c.vx *= fr;
      c.vy *= fr;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    CA.camWalls.bounce(c, R, 0.5); // (the camera walls in the top corners)
  });
  // Touching: no bouncing. They lean on each other, and along the line between them both move at the same speed, so
  // whoever pushes harder slowly drives the other back (and pushing against each other is a standoff). A charge
  // that lands gives a small shove on top.
  const [a, b] = s.cats;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
  if (d < R * 2) {
    const nx = dx / d, ny = dy / d, push = (R * 2 - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
    if (va - vb > 0) {
      const charging = a.charge > 0 || b.charge > 0;
      const together = charging ? (va + vb) / 2 : Math.max(-SHOVE, Math.min(SHOVE, (va + vb) / 2));
      a.vx += (together - va) * nx; a.vy += (together - va) * ny;
      b.vx += (together - vb) * nx; b.vy += (together - vb) * ny;
      if (a.charge > 0) { b.vx += nx * KNOCK; b.vy += ny * KNOCK; a.charge = 0; a.rec = RECOVER; }
      if (b.charge > 0) { a.vx -= nx * KNOCK; a.vy -= ny * KNOCK; b.charge = 0; b.rec = RECOVER; }
      if (Math.abs(va - vb) > 260) api.ev('thump', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, big: charging ? 1 : 0 });
    }
  }
  const rr = ringR(s.t);
  const out = s.cats.map(c => Math.hypot(c.x - CX, c.y - CY) > rr);
  if (out[0] || out[1]) {
    const w = out[0] && out[1] ? -1 : out[0] ? 1 : 0;
    s.cats.forEach((c, i) => { if (out[i]) api.ev('out', { x: c.x, y: c.y, i }); });
    if (w >= 0) s.wins[w]++;
    api.score(s.wins[0], s.wins[1]);
    s.rw = w;
    if (s.wins[0] >= WIN || s.wins[1] >= WIN) { api.end(s.wins[0] >= WIN ? 0 : 1, 'YOKOZUNA!'); return; }
    s.phase = 'pause';
    s.pause = 1.7;
  }
}

function snap(s) {
  return {
    w: s.wins, rd: s.round, ph: s.phase, rw: s.rw, rr: Math.round(ringR(s.t) * 10) / 10,
    c: s.cats.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), f: c.fx >= 0 ? 1 : -1, ch: c.charge > 0 ? 1 : 0, rc: c.rec > 0 ? 1 : 0 })),
  };
}

function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = { think: 0, mx: 0, my: 0, go: false, side: 1 });
  if (s.phase !== 'fight') return { hit: {} };
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.08 + (1 - api.skill) * 0.25;
    const rr = ringR(s.t + 0.5);
    const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy) || 1;
    const fromC = Math.hypot(c.x - CX, c.y - CY);
    let mx = dx / d, my = dy / d;
    // Get between the other cat and the edge's far side: aim to push it outwards, from the middle.
    const ox = o.x - CX, oy = o.y - CY, ol = Math.hypot(ox, oy) || 1;
    const behind = { x: o.x - ox / ol * 60, y: o.y - oy / ol * 60 };
    if (api.skill > 0.3 && d > 90) { const bx = behind.x - c.x, by = behind.y - c.y, bl = Math.hypot(bx, by) || 1; mx = bx / bl; my = by / bl; }
    if (fromC > rr - 55) { const cx = CX - c.x, cy = CY - c.y, cl = Math.hypot(cx, cy) || 1; mx = cx / cl; my = cy / cl; } // (too near the edge)
    if (o.charge > 0 && d < 200 && Math.random() < api.skill * 0.8) { mx = -dy / d * st.side; my = dx / d * st.side; } // sidestep their charge
    if (Math.random() < 0.05) st.side = -st.side;
    st.mx = mx;
    st.my = my;
    st.go = d < 130 + 60 * api.skill && c.wait <= 0 && fromC < rr - 40 && Math.random() < 0.25 + 0.55 * api.skill;
    if (st.go) { st.mx = dx / d; st.my = dy / d; }
  }
  const out = { mx: st.mx, my: st.my, hit: {} };
  if (st.go) { out.hit.a = true; st.go = false; }
  return out;
}

function event(v, e) {
  if (e.type === 'thump') { v.burst(e.x, e.y, '#fff3b0', e.big ? 16 : 8, 260); v.shake(e.big ? 10 : 4); v.sound([[150, 0, 0.08], [100, 0.05, 0.12]]); if (e.big) v.pop(e.x, e.y - 40, 'OOF!'); }
  if (e.type === 'charge') v.sound([[520, 0, 0.05], [360, 0.04, 0.08]]);
  if (e.type === 'out') { v.burst(e.x, e.y, '#e8c99a', 22, 300); v.pop(e.x, e.y - 50, 'OUT!', '#ff5a5a'); v.sound('boom'); v.shake(12); }
}

let floor = null;
function makeFloor() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#3a2418';
  b.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 60) { b.fillStyle = (x / 60) % 2 ? '#43291b' : '#3d261a'; b.fillRect(x, 0, 60, H); }
  // the raised clay platform
  b.fillStyle = '#b98a55';
  b.beginPath(); b.arc(CX, CY, RING0 + 50, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#d6b07a';
  b.beginPath(); b.arc(CX, CY, RING0 + 38, 0, Math.PI * 2); b.fill();
  b.fillStyle = 'rgba(255, 255, 255, .08)';
  for (let k = 0; k < 120; k++) { const a = k * 2.4, r = (k * 37) % (RING0 + 30); b.fillRect(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 3, 2); }
  b.strokeStyle = '#fff';
  b.lineWidth = 4;
  [-1, 1].forEach(sd => { b.beginPath(); b.moveTo(CX + sd * 40, CY - 14); b.lineTo(CX + sd * 40, CY + 14); b.stroke(); });
  return c;
}

function draw(v, s) {
  const g = v.g;
  if (!floor) floor = makeFloor();
  g.drawImage(floor, 0, 0, W, H);
  // the straw rope ring (it shrinks)
  g.lineWidth = 12;
  g.strokeStyle = '#c2a35a';
  g.beginPath(); g.arc(CX, CY, s.rr, 0, Math.PI * 2); g.stroke();
  g.setLineDash([6, 8]);
  g.lineWidth = 12;
  g.strokeStyle = '#8f7438';
  g.beginPath(); g.arc(CX, CY, s.rr, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  if (s.rr < RING0 - 1) { g.strokeStyle = 'rgba(255, 80, 80, .5)'; g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, s.rr + 9, 0, Math.PI * 2); g.stroke(); }
  s.c.forEach((c, i) => {
    g.fillStyle = 'rgba(0, 0, 0, .25)';
    g.beginPath(); g.ellipse(c.x, c.y + 26, 30, 9, 0, 0, Math.PI * 2); g.fill();
    if (c.ch) { g.globalAlpha = 0.45; g.fillStyle = v.team[i].light; v.dot(c.x - c.f * 20, c.y, 24); g.globalAlpha = 1; }
    g.fillStyle = v.team[i].main; // a round belly, for a sumo cat
    v.dot(c.x, c.y + 4, R);
    g.fillStyle = 'rgba(255, 255, 255, .25)';
    v.dot(c.x - 8, c.y - 6, 10);
    v.catTop(i, c.x, c.y - 12, 1.15, { ring: false, lookRight: c.f > 0, tilt: c.rc ? Math.sin(v.now / 60) * 0.15 : 0, label: false });
    v.label(i === v.me ? 'You' : v.names[i], c.x, c.y + 44, 12, i === v.me ? '#ffd23f' : '#ffffff');
  });
  v.label('🤼 ' + v.names[0] + ' ' + s.w[0] + ' – ' + s.w[1] + ' ' + v.names[1] + '  ·  Round ' + s.rd, W / 2, 24, 16, '#ffffff');
  if (s.ph === 'pause') v.bigText(s.rw < 0 ? 'Both out! Again' : s.rw === v.me ? 'You win the round!' : v.names[s.rw] + ' wins the round!', 96, 34, '#ffd23f', 1);
  else if (s.rr < RING0 - 1) v.label('The ring is shrinking!', W / 2, H - 18, 14, '#ff9a9a');
}

})();
