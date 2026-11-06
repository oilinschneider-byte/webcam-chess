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
// Cheese drops from a hole in the ceiling onto one spot in the middle of the kitchen. Your cat walks where you point.
// Hold the mouse button: your cat reaches out its arms and grabs the nearest cheese in reach, and keeps holding it while
// you hold the button. Carry it back to your pot (yours is on your side) and let go over the pot to score. Let go
// anywhere else and it drops on the floor. Grab a cat that's carrying cheese and you steal it! Golden cheese is worth 5.

const CHEESE_LEN = 45, CR = 14, GOLD_P = 0.1, REACH = 62, POT_R = 58, MAX_FLOOR = 7;
const SPOT = { x: W / 2, y: 330 };                      // where the cheese lands
const POTS = [{ x: 110, y: 430 }, { x: W - 110, y: 430 }];
const WALK = 430, WALK_CARRY = 360;

CA.games.add('cheese', {
  name: 'Cheese Grab', icon: '🧀',
  blurb: 'Cheese drops from the ceiling into the middle of the kitchen! Walk over, hold the mouse button to reach out and grab a piece, carry it back and let go over your pot. Steal cheese from the other cat by grabbing them! Golden cheese is worth 5. Most cheese in 45 seconds wins.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'cheese', mouse: true,
      help: 'Move the mouse to walk · hold the mouse button to grab cheese · carry it to your pot and let go · grab the other cat to steal!',
      helpTouch: 'Drag your finger to walk and grab · lift your finger over your pot to drop the cheese in',
      note: '45 seconds · most cheese in your pot wins',
      init: () => ({
        t: 0, sc: [0, 0], drop: 0.5, id: 0, ch: [],
        cats: [0, 1].map(i => ({ x: POTS[i].x + (i ? -70 : 70), y: 400, vx: 0, vy: 0, held: false, carry: null, reach: 0, safe: 0 })),
      }),
      step: cheeseStep,
      snap: s => ({
        sc: s.sc, r: Math.max(0, Math.ceil(CHEESE_LEN - s.t)),
        p: s.cats.map(c => [Math.round(c.x), Math.round(c.y), c.held ? 1 : 0, c.carry ? (c.carry.g ? 2 : 1) : 0, Math.round(c.reach * 10)]),
        c: s.ch.map(c => [c.id, Math.round(c.x), Math.round(c.y), c.g, Math.round(c.a * 10)]),
      }),
      lerp: cheeseLerp,
      bot: cheeseBot,
      draw: cheeseDraw,
      event: cheeseEvent,
    });
  },
});

function cheeseStep(s, inp, dt, api) {
  s.t += dt;
  // a new piece falls from the ceiling now and then (but the pile doesn't grow forever)
  s.drop -= dt;
  if (s.drop <= 0 && s.t < CHEESE_LEN - 1) {
    s.drop = 0.7 + api.rng() * 0.5;
    if (s.ch.length < MAX_FLOOR) {
      s.ch.push({ id: s.id++, x: SPOT.x + (api.rng() - 0.5) * 30, y: 70, vx: (api.rng() - 0.5) * 140, vy: 0, g: api.rng() < GOLD_P ? 1 : 0, a: (api.rng() - 0.5) * 6, land: 0 });
      api.ev('drop', {});
    }
  }
  for (const c of s.ch) {
    if (c.land) continue;
    c.vy += 1100 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.a += dt * 6;
    if (c.y >= SPOT.y + (c.id % 3) * 14 - 10) { c.land = 1; c.vx = c.vy = 0; api.ev('land', { x: Math.round(c.x), y: Math.round(c.y), g: c.g }); }
  }
  for (let i = 0; i < 2; i++) {
    const p = s.cats[i], ip = inp[i], o = s.cats[1 - i];
    const top = (ip.top || 1) * (p.carry ? WALK_CARRY : WALK);
    movePaw(p, ip.ax, ip.ay, dt, top, 5200);
    p.y = Math.max(p.y, 225); // (cats stay on the floor)
    p.safe = Math.max(0, p.safe - dt);
    const held = !!(ip.held && ip.held.fire);
    p.reach = held ? Math.min(1, p.reach + dt * 7) : Math.max(0, p.reach - dt * 7);
    if (held && !p.carry && p.reach > 0.5) {
      // steal from the other cat first, if it's carrying and in reach
      if (o.carry && o.safe <= 0 && Math.hypot(o.x - p.x, o.y - p.y) < REACH + 20) {
        p.carry = o.carry;
        o.carry = null;
        p.safe = 0.8;
        api.ev('steal', { i, x: Math.round(o.x), y: Math.round(o.y) });
      } else {
        let best = -1, bd = REACH;
        s.ch.forEach((c, k) => { const d = Math.hypot(c.x - p.x, c.y - p.y); if (c.land && d < bd) { bd = d; best = k; } });
        if (best >= 0) {
          p.carry = { g: s.ch[best].g };
          s.ch.splice(best, 1);
          p.safe = 0.5;
          api.ev('grab', { i, x: Math.round(p.x), y: Math.round(p.y) });
        }
      }
    }
    if (!held && p.carry) {
      if (Math.hypot(p.x - POTS[i].x, p.y - POTS[i].y) < POT_R + 10) {
        s.sc[i] += p.carry.g ? 5 : 1;
        api.score(s.sc[0], s.sc[1]);
        api.ev('score', { i, g: p.carry.g });
      } else {
        s.ch.push({ id: s.id++, x: p.x, y: p.y + 10, vx: 0, vy: 0, g: p.carry.g, a: 0, land: 1 });
        api.ev('dropped', { i });
      }
      p.carry = null;
    }
    p.held = held;
  }
  if (s.t >= CHEESE_LEN) api.end(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, "Time's up!");
}

// Smooth the cats, and each piece of cheese that was there in both snaps (new ones just appear).
function cheeseLerp(a, b, f) {
  const m = (p, q) => p + (q - p) * f;
  const old = {};
  a.c.forEach(c => { old[c[0]] = c; });
  return {
    sc: b.sc, r: b.r,
    p: b.p.map((q, i) => (a.p[i] ? [m(a.p[i][0], q[0]), m(a.p[i][1], q[1]), q[2], q[3], q[4]] : q)),
    c: b.c.map(c => { const o = old[c[0]]; return o ? [c[0], m(o[1], c[1]), m(o[2], c[2]), c[3], c[4]] : c; }),
  };
}

// The bot walks to the nearest cheese (golden first), grabs it, carries it home and drops it in. A better bot also
// steals when you walk past it carrying cheese.
function cheeseBot(s, i, dt, api) {
  const st = s.bs || (s.bs = {});
  const me = st[i] || (st[i] = { think: 0, tx: s.cats[i].x, ty: s.cats[i].y, hold: false, wait: 0 });
  const p = s.cats[i], o = s.cats[1 - i];
  me.think -= dt;
  if (me.think <= 0) {
    me.think = 0.08 + (1 - api.skill) * 0.25;
    if (p.carry) {
      me.tx = POTS[i].x; me.ty = POTS[i].y;
      me.hold = Math.hypot(p.x - POTS[i].x, p.y - POTS[i].y) > POT_R - 10;
    } else if (o.carry && api.skill > 0.3 && Math.hypot(o.x - p.x, o.y - p.y) < 160) {
      me.tx = o.x; me.ty = o.y;
      me.hold = Math.hypot(o.x - p.x, o.y - p.y) < REACH + 10;
    } else {
      let best = null, bd = 1e9;
      for (const c of s.ch) { if (!c.land) continue; const d = Math.hypot(c.x - p.x, c.y - p.y) - (c.g ? 150 : 0); if (d < bd) { bd = d; best = c; } }
      if (best) { me.tx = best.x; me.ty = best.y; me.hold = Math.hypot(best.x - p.x, best.y - p.y) < REACH; } else { me.tx = SPOT.x + (i ? 90 : -90); me.ty = SPOT.y; me.hold = false; }
    }
  }
  return { ax: me.tx, ay: me.ty, held: me.hold ? { fire: true } : {}, top: 0.7 + 0.3 * api.skill };
}

function cheeseEvent(v, e) {
  if (e.type === 'drop') v.sound([[700, 0, 0.03], [500, 0.04, 0.04]]);
  if (e.type === 'land') { v.burst(e.x, e.y, e.g ? '#fff3a0' : '#ffcf3d', e.g ? 14 : 5, 120); if (e.g) v.pop(e.x, e.y - 24, 'GOLDEN!', '#fff3a0'); }
  if (e.type === 'grab') v.sound(e.i === v.me ? [[520, 0, 0.04], [700, 0.04, 0.04]] : [[300, 0, 0.03]]);
  if (e.type === 'steal') {
    v.burst(e.x, e.y, v.team[e.i].main, 18, 260);
    v.pop(e.x, e.y - 40, e.i === v.me ? 'STOLEN! 😼' : 'THIEF!', e.i === v.me ? '#7dffb0' : '#ff6b6b');
    v.shake(e.i === v.me ? 4 : 8);
    v.sound(e.i === v.me ? [[600, 0, 0.05], [900, 0.05, 0.08]] : [[220, 0, 0.1], [160, 0.08, 0.14]]);
  }
  if (e.type === 'score') {
    const pot = POTS[e.i];
    v.burst(pot.x, pot.y - 20, e.g ? '#fff3a0' : '#ffcf3d', e.g ? 30 : 14, e.g ? 320 : 200);
    v.pop(pot.x, pot.y - 70, e.g ? '+5!' : '+1', e.g ? '#fff3a0' : v.team[e.i].light);
    if (e.g) v.shake(6);
    v.sound(e.i === v.me ? (e.g ? [[880, 0, 0.06], [1175, 0.06, 0.06], [1568, 0.12, 0.12]] : [[784, 0, 0.05], [1046, 0.05, 0.08]]) : [[330, 0, 0.05]]);
  }
  if (e.type === 'dropped') v.sound([[260, 0, 0.05]]);
}

let kitchen = null;
function makeKitchen() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const wall = b.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#2b2238');
  wall.addColorStop(1, '#1b1526');
  b.fillStyle = wall;
  b.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 60) for (let y = 200; y < H; y += 60) { // checkered kitchen floor
    b.fillStyle = ((x + y) / 60) % 2 ? '#e9e2f0' : '#cfc3dc';
    b.fillRect(x, y, 60, 60);
  }
  b.fillStyle = 'rgba(0, 0, 0, .25)';
  b.fillRect(0, 200, W, 6);
  // the hole in the ceiling the cheese falls from, with a beam of light under it
  const beam = b.createLinearGradient(0, 0, 0, SPOT.y + 20);
  beam.addColorStop(0, 'rgba(255, 230, 140, .35)');
  beam.addColorStop(1, 'rgba(255, 230, 140, 0)');
  b.fillStyle = beam;
  b.beginPath(); b.moveTo(W / 2 - 34, 40); b.lineTo(W / 2 + 34, 40); b.lineTo(W / 2 + 90, SPOT.y + 30); b.lineTo(W / 2 - 90, SPOT.y + 30); b.closePath(); b.fill();
  b.fillStyle = '#0d0a12';
  b.beginPath(); b.ellipse(W / 2, 40, 40, 12, 0, 0, Math.PI * 2); b.fill();
  // the spot where the cheese lands
  b.fillStyle = 'rgba(255, 207, 61, .18)';
  b.beginPath(); b.ellipse(SPOT.x, SPOT.y + 16, 90, 30, 0, 0, Math.PI * 2); b.fill();
  return c;
}

function drawCheese(v, x, y, gold, rot, k) {
  const g = v.g;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(k || 1, k || 1);
  if (gold) { g.globalAlpha = 0.4; g.fillStyle = '#fff3a0'; v.dot(0, 0, 26); g.globalAlpha = 1; }
  g.fillStyle = gold ? '#ffe066' : '#ffcf3d';
  g.strokeStyle = gold ? '#fff8d0' : '#c98f00';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-16, 11); g.lineTo(16, 11); g.lineTo(-12, -14); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = gold ? '#f2b500' : '#d99a00';
  v.dot(-4, 4, 3);
  v.dot(-9, -4, 2);
  g.restore();
}

function drawPot(v, i, n) {
  const g = v.g, p = POTS[i];
  g.fillStyle = 'rgba(0, 0, 0, .25)';
  g.beginPath(); g.ellipse(p.x, p.y + 44, 64, 14, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = v.team[i].dark;
  g.beginPath(); g.moveTo(p.x - 58, p.y - 20); g.lineTo(p.x + 58, p.y - 20); g.lineTo(p.x + 46, p.y + 44); g.lineTo(p.x - 46, p.y + 44); g.closePath(); g.fill();
  g.fillStyle = v.team[i].main;
  g.beginPath(); g.ellipse(p.x, p.y - 20, 60, 16, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = n ? '#ffcf3d' : '#1a1422';
  g.beginPath(); g.ellipse(p.x, p.y - 20, 50, 11, 0, 0, Math.PI * 2); g.fill();
  v.label(String(n), p.x, p.y + 14, 30, '#ffffff');
  v.label(i === v.me ? 'Your pot' : v.names[i] + '\'s pot', p.x, p.y + 64, 13, i === v.me ? '#ffd23f' : v.team[i].light);
}

function cheeseDraw(v, s) {
  const g = v.g;
  if (!kitchen) kitchen = makeKitchen();
  g.drawImage(kitchen, 0, 0, W, H);
  drawPot(v, 0, s.sc[0]);
  drawPot(v, 1, s.sc[1]);
  s.c.forEach(([id, x, y, gold, a]) => drawCheese(v, x, y, gold, a / 10));
  s.p.forEach(([x, y, held, carry, reach], i) => {
    const q = i === v.me && !v.host && v.aim.seen ? { x, y } : { x, y };
    const r = reach / 10;
    // the arms: they reach out (toward where you're pointing) while you hold the button
    const goal = carry ? POTS[i] : SPOT; // (the other cat reaches the way it's going: to the cheese, or home to its pot)
    const ax = i === v.me && v.aim.seen ? v.aim.x : goal.x, ay = i === v.me && v.aim.seen ? v.aim.y : goal.y;
    const d = Math.hypot(ax - q.x, ay - q.y) || 1, ux = (ax - q.x) / d, uy = (ay - q.y) / d;
    const len = 26 + r * (REACH - 14);
    g.strokeStyle = v.team[i].main;
    g.lineCap = 'round';
    g.lineWidth = 11;
    [-1, 1].forEach(side => {
      const sx = q.x - uy * 16 * side, sy = q.y + 4 + ux * 16 * side;
      const hx = q.x + ux * len - uy * 7 * side * (1 - r * 0.6), hy = q.y + 4 + uy * len + ux * 7 * side * (1 - r * 0.6);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = v.team[i].light;
      v.dot(hx, hy, held ? 6 : 7);
    });
    v.catTop(i, q.x, q.y - 10, 1.5, { lookRight: ux >= 0 });
    if (carry) drawCheese(v, q.x + ux * (len + 4), q.y + 4 + uy * (len + 4), carry === 2, 0, 0.9);
  });
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
