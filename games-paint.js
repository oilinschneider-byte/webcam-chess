/* Classic Games: Paint Wars. Two cats with paint sprayers. Hold the mouse button to spray a cone of paint where you
   aim; every patch of floor is the color of whoever painted it last. The sprayer runs out and refills when you let
   go. Whoever has painted more of the floor after 45 seconds wins. The floor is a grid of cells (that's what gets
   counted, not the picture), and the host's app does the painting (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const CS = 15, GC = W / CS, GR = H / CS;          // 64 × 36 cells
const R = 18, SPEED = 200, ACCEL = 1600;
const REACH = 150, CONE = 0.42;                  // how far the spray goes, and how wide (radians each side)
const DRAIN = 42, FILL = 26, FILL_WAIT = 0.35;   // the paint meter (out of 100), per second
const LENGTH = 45;
const HOME = [[120, H / 2], [W - 120, H / 2]];
// The floor under the camera walls (top corners: see cam-walls.js) is wall (3): it can't be painted, and isn't counted.
const WALLED = [];
for (let gy = 0; gy < GR; gy++) for (let gx = 0; gx < GC; gx++) if (CA.camWalls.inWall((gx + 0.5) * CS, (gy + 0.5) * CS)) WALLED.push(gy * GC + gx);
const FLOOR = GC * GR - WALLED.length;

CA.games.add('paint', {
  name: 'Paint Wars', icon: '🎨',
  blurb: 'Hold the mouse button to spray paint where you aim! Cover more of the floor in your color than the other cat. Your sprayer runs out, so let go to refill. 45 seconds.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'paint', mouse: true, sendMs: 66,
      pad: { stick: true, buttons: [{ k: 'a', label: '💣 Throw bomb' }, { k: 'fire', label: '🎨 Spray', main: true }] },
      help: 'WASD move · aim with the mouse · hold the button to spray · pick up 💣 (Space throws it), 🛡️ (your paint is locked for a while) and 🪣 (a big splash)',
      helpTouch: 'Stick moves · touch the floor to spray there',
      note: 'Most floor after ' + LENGTH + ' seconds',
      init, step, snap, bot, draw, event,
    });
  },
});

function init() {
  return {
    t: 0, grid: new Uint8Array(GC * GR).map((v, k) => (WALLED.includes(k) ? 3 : 0)), count: [0, 0],
    lock: new Float32Array(GC * GR), pu: [], bombs: [], nextPu: 4,
    cats: HOME.map(([x, y], i) => ({ x, y, vx: 0, vy: 0, ax: i ? -1 : 1, ay: 0, ink: 100, spray: false, rest: 0, sh: 0, bomb: 0, inf: 0 })),
  };
}

function paintCone(s, i, c) {
  const sh = c.sh > 0 ? c.sh : 0;
  const own = i + 1;
  const x0 = Math.max(0, Math.floor((c.x - REACH) / CS)), x1 = Math.min(GC - 1, Math.floor((c.x + REACH) / CS));
  const y0 = Math.max(0, Math.floor((c.y - REACH) / CS)), y1 = Math.min(GR - 1, Math.floor((c.y + REACH) / CS));
  const cos = Math.cos(CONE);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const dx = (gx + 0.5) * CS - c.x, dy = (gy + 0.5) * CS - c.y, d = Math.hypot(dx, dy);
      if (d > REACH || (d > CS && (dx * c.ax + dy * c.ay) / d < cos)) continue;
      const k = gy * GC + gx, was = s.grid[k];
      if (was === 3) continue;
      if (was === own) { if (sh) s.lock[k] = s.t + sh + 2; continue; }
      if (was && s.lock[k] > s.t) continue; // (shielded paint can't be painted over)
      if (was) s.count[was - 1]--;
      s.grid[k] = own;
      s.count[i]++;
      if (sh) s.lock[k] = s.t + sh + 2;
    }
  }
}

// A round splash of paint (a bomb, or a bucket): it paints over the other cat's color, but not shielded paint.
function paintCircle(s, i, x, y, r) {
  const own = i + 1, sh = s.cats[i].sh > 0 ? s.cats[i].sh : 0;
  for (let gy = Math.max(0, Math.floor((y - r) / CS)); gy <= Math.min(GR - 1, Math.floor((y + r) / CS)); gy++) {
    for (let gx = Math.max(0, Math.floor((x - r) / CS)); gx <= Math.min(GC - 1, Math.floor((x + r) / CS)); gx++) {
      if (Math.hypot((gx + 0.5) * CS - x, (gy + 0.5) * CS - y) > r) continue;
      const k = gy * GC + gx, was = s.grid[k];
      if (was === 3 || was === own) continue;
      if (was && s.lock[k] > s.t) continue;
      if (was) s.count[was - 1]--;
      s.grid[k] = own;
      s.count[i]++;
      if (sh) s.lock[k] = s.t + sh + 2;
    }
  }
}

const PICKS = ['bomb', 'shield', 'bucket'];

function step(s, inp, dt, api) {
  s.t += dt;
  // pickups appear now and then (never more than 3 at once): a bomb to throw, a shield for your paint, a bucket splash
  s.nextPu -= dt;
  if (s.nextPu <= 0) {
    s.nextPu = 5 + Math.random() * 3;
    if (s.pu.length < 3) {
      let x = 0, y = 0, tries = 0;
      do { x = 90 + Math.random() * (W - 180); y = 70 + Math.random() * (H - 140); } while (CA.camWalls.inWall(x, y, 40) && ++tries < 20);
      s.pu.push({ x, y, type: PICKS[Math.floor(Math.random() * PICKS.length)] });
    }
  }
  s.bombs = s.bombs.filter(b => {
    b.t -= dt;
    if (b.t > 0) return true;
    paintCircle(s, b.i, b.x, b.y, 88);
    api.ev('boom', { x: b.x, y: b.y, i: b.i });
    return false;
  });
  s.cats.forEach((c, i) => {
    const n = inp[i];
    const tx = n.mx * SPEED, ty = n.my * SPEED;
    const dx = tx - c.vx, dy = ty - c.vy, d = Math.hypot(dx, dy), a = ACCEL * dt;
    if (d <= a) { c.vx = tx; c.vy = ty; } else { c.vx += dx / d * a; c.vy += dy / d * a; }
    c.x = Math.max(R, Math.min(W - R, c.x + c.vx * dt));
    c.y = Math.max(R, Math.min(H - R, c.y + c.vy * dt));
    CA.camWalls.bounce(c, R, 0);
    let ax = n.ax - c.x, ay = n.ay - c.y;
    const al = Math.hypot(ax, ay);
    if (al > 4) { c.ax = ax / al; c.ay = ay / al; }
    c.sh = Math.max(0, c.sh - dt);
    c.inf = Math.max(0, c.inf - dt);
    s.pu = s.pu.filter(p => {
      if (Math.hypot(p.x - c.x, p.y - c.y) > 30) return true;
      if (p.type === 'bomb') c.bomb = 1;
      else if (p.type === 'shield') c.sh = 7;
      else { paintCircle(s, i, p.x, p.y, 120); c.ink = 100; c.inf = 4; }
      api.ev('pick', { x: p.x, y: p.y, t: p.type, i });
      return false;
    });
    if (n.hit.a && c.bomb) { // throw it where you're aiming (up to 280 away); it goes off after a moment
      let bx = n.ax - c.x, by = n.ay - c.y;
      const bl = Math.hypot(bx, by) || 1, bd = Math.min(280, bl);
      s.bombs.push({ x: c.x + bx / bl * bd, y: c.y + by / bl * bd, t: 0.7, i });
      c.bomb = 0;
      api.ev('throw', { x: c.x, y: c.y });
    }
    c.spray = !!n.held.fire && (c.ink > 0 || c.inf > 0);
    if (c.spray) {
      if (c.inf <= 0) c.ink = Math.max(0, c.ink - DRAIN * dt);
      c.rest = FILL_WAIT;
      paintCone(s, i, c);
    } else {
      c.rest -= dt;
      if (c.rest <= 0) c.ink = Math.min(100, c.ink + FILL * dt);
    }
  });
  const pct = s.count.map(n => Math.round(n / FLOOR * 100));
  api.score(pct[0], pct[1]);
  if (s.t >= LENGTH) api.end(s.count[0] === s.count[1] ? -1 : s.count[0] > s.count[1] ? 0 : 1, 'TIME!');
}

function snap(s) {
  return {
    t: Math.round(s.t * 10) / 10, g: Array.prototype.join.call(s.grid, ''), n: s.count,
    c: s.cats.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), ax: Math.round(c.ax * 100) / 100, ay: Math.round(c.ay * 100) / 100, i: Math.round(c.ink), s: c.spray ? 1 : 0, sh: c.sh > 0 ? 1 : 0, bb: c.bomb, inf: c.inf > 0 ? 1 : 0 })),
    pu: s.pu.map(p => [Math.round(p.x), Math.round(p.y), PICKS.indexOf(p.type)]), bm: s.bombs.map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.t * 100) / 100]),
  };
}

// The bot goes to the nearby patch with the most floor that isn't its color yet, spraying ahead of itself, and
// (if it's good) keeps a little paint back so it never runs completely dry.
function bot(s, i, dt, api) {
  const c = s.cats[i];
  const st = s.bs || (s.bs = { think: 0, gx: c.x, gy: c.y, spray: false });
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.25 + (1 - api.skill) * 0.4;
    let best = -1;
    for (let k = 0; k < 10; k++) {
      const x = 60 + Math.random() * (W - 120), y = 60 + Math.random() * (H - 120);
      let sc = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const gx = Math.floor(x / CS) + dx, gy = Math.floor(y / CS) + dy;
        if (gx < 0 || gy < 0 || gx >= GC || gy >= GR) continue;
        const v = s.grid[gy * GC + gx];
        sc += v === i + 1 || v === 3 ? 0 : v ? 1.5 * api.skill + 0.5 : 1; // (good bots go for the other cat's paint; 3 is wall)
      }
      sc -= Math.hypot(x - c.x, y - c.y) * 0.02;
      if (sc > best) { best = sc; st.gx = x; st.gy = y; }
    }
    if (s.pu.length && Math.random() < 0.35 + 0.4 * api.skill) { const p = s.pu[0]; st.gx = p.x; st.gy = p.y; } // (go and get a pickup)
  }
  const dx = st.gx - c.x, dy = st.gy - c.y, d = Math.hypot(dx, dy) || 1;
  const keep = 8 + 25 * api.skill;
  if (c.ink < 3) st.spray = false;
  else if (c.ink > keep + 30) st.spray = true;
  else if (c.ink < keep && api.skill > 0.4) st.spray = false;
  const out = { mx: d > 20 ? dx / d : 0, my: d > 20 ? dy / d : 0, ax: c.x + dx / d * 100, ay: c.y + dy / d * 100, held: st.spray ? { fire: true } : {}, hit: {} };
  if (c.bomb && d > 140 && Math.random() < 0.03) { out.hit.a = true; out.ax = st.gx; out.ay = st.gy; } // (a bomb, on the patch it is heading for)
  return out;
}

function event(v, e) {
  if (e.type === 'pick') { v.ring(e.x, e.y, v.team[e.i].main, 14); v.burst(e.x, e.y, v.team[e.i].light, 10, 200); v.pop(e.x, e.y - 24, e.t === 'bomb' ? '💣 Bomb!' : e.t === 'shield' ? '🛡️ Shield!' : '🪣 Splash!', '#ffffff'); v.sound('point'); }
  if (e.type === 'throw') v.sound([[500, 0, 0.05], [300, 0.05, 0.08]]);
  if (e.type === 'boom') { v.burst(e.x, e.y, v.team[e.i].main, 28, 380); v.ring(e.x, e.y, v.team[e.i].light, 30); v.shake(7); v.sound('boom'); }
}

const off = { c: null, img: null };
const COLOR = [[232, 236, 244], [47, 123, 255], [255, 138, 31], [36, 28, 74]];

function draw(v, s) {
  const g = v.g;
  if (!off.c) { off.c = document.createElement('canvas'); off.c.width = GC; off.c.height = GR; off.img = off.c.getContext('2d').createImageData(GC, GR); }
  const d = off.img.data;
  for (let k = 0; k < GC * GR; k++) {
    const col = COLOR[+s.g[k] || 0];
    d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = 255;
  }
  off.c.getContext('2d').putImageData(off.img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(off.c, 0, 0, W, H);
  g.strokeStyle = 'rgba(0, 0, 0, .05)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 60) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 60) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
  g.stroke();
  (s.pu || []).forEach(([x, y, t]) => { // pickups
    const bob = Math.sin(v.now / 220 + x) * 3;
    g.fillStyle = 'rgba(255, 255, 255, .85)';
    v.dot(x, y + bob, 19);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 3;
    g.beginPath(); g.arc(x, y + bob, 19 + Math.sin(v.now / 160) * 1.5, 0, Math.PI * 2); g.stroke();
    v.label(['💣', '🛡️', '🪣'][t] || '?', x, y + bob + 1, 22, '#000000');
  });
  (s.bm || []).forEach(([x, y, t]) => { // a bomb about to go off
    g.fillStyle = 'rgba(0, 0, 0, .2)';
    v.dot(x, y, 88 * (1 - t / 0.7) + 6);
    g.strokeStyle = 'rgba(255, 60, 60, .8)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 88, 0, Math.PI * 2); g.setLineDash([6, 6]); g.stroke(); g.setLineDash([]);
    v.label('💣', x, y, 24 + Math.sin(v.now / 40) * 3, '#000000');
  });
  s.c.forEach((c, i) => {
    if (c.sh) { g.strokeStyle = 'rgba(120, 220, 255, .85)'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, 28 + Math.sin(v.now / 120) * 2, 0, Math.PI * 2); g.stroke(); }
    if (c.s) { // flying paint
      g.fillStyle = v.team[i].main;
      for (let k = 0; k < 10; k++) {
        const a = Math.atan2(c.ay, c.ax) + (Math.random() - 0.5) * CONE * 2, r = 24 + Math.random() * (REACH - 24);
        g.globalAlpha = 0.7;
        v.dot(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 2 + Math.random() * 3);
      }
      g.globalAlpha = 1;
    }
    // the sprayer
    g.strokeStyle = '#333';
    g.lineWidth = 6;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(c.x + c.ax * 30, c.y + c.ay * 30); g.stroke();
    g.strokeStyle = v.team[i].main;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(c.x + c.ax * 20, c.y + c.ay * 20); g.lineTo(c.x + c.ax * 31, c.y + c.ay * 31); g.stroke();
    v.catTop(i, c.x, c.y, 1, { lookRight: c.ax >= 0 });
    if (c.bb) v.label('💣', c.x + 22, c.y - 22, 18, '#000000');
    g.fillStyle = 'rgba(0, 0, 0, .55)'; // the paint meter
    v.roundRect(c.x - 22, c.y - 40, 44, 7, 3.5); g.fill();
    g.fillStyle = c.i > 25 ? v.team[i].light : '#ff6b6b';
    v.roundRect(c.x - 21, c.y - 39, Math.max(3, 42 * c.i / 100), 5, 2.5); g.fill();
  });
  const total = GC * GR, p0 = Math.round(s.n[0] / total * 100), p1 = Math.round(s.n[1] / total * 100);
  g.fillStyle = 'rgba(20, 20, 40, .75)';
  v.roundRect(W / 2 - 150, 10, 300, 22, 11); g.fill();
  g.fillStyle = v.team[0].main;
  v.roundRect(W / 2 - 148, 12, Math.max(4, 296 * s.n[0] / total), 18, 9); g.fill();
  g.fillStyle = v.team[1].main;
  const w1 = Math.max(4, 296 * s.n[1] / total);
  v.roundRect(W / 2 + 148 - w1, 12, w1, 18, 9); g.fill();
  v.label(p0 + '%', W / 2 - 180, 21, 16, v.team[0].main);
  v.label(p1 + '%', W / 2 + 180, 21, 16, v.team[1].main);
  v.label('⏱ ' + Math.max(0, Math.ceil(LENGTH - s.t)), W / 2, 48, 16, '#333');
  const me = s.c[v.me];
  if (me && me.i < 5 && !me.s) v.msg('Out of paint! Let go to refill', true);
}

})();
