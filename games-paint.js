/* Classic Games: Turf War. Two cats with paint sprayers fight over the floor. Hold the mouse button to spray a cone of
   paint where you aim; every patch of floor is the color of whoever painted it last.
   - Your paint is your power: you run faster and refill faster on your own color, and slower on theirs.
   - Spray the other cat and they burst (a big splash of your color), and come back 2 seconds later.
   - Paint a closed loop and the land inside becomes yours in one go (unless the other cat is standing in it).
   - In the last 10 seconds, the middle of the floor counts triple.
   The floor is a grid of cells (that's what gets counted, not the picture), and the host's app does the painting (see
   games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const CS = 15, GC = W / CS, GR = H / CS;          // 64 × 36 cells
const R = 18, SPEED = 200, ACCEL = 1600;
const ON_OWN = 1.25, ON_THEIRS = 0.68;            // how fast you run on your own paint, and on theirs
const REACH = 150, CONE = 0.42;                  // how far the spray goes, and how wide (radians each side)
const DRAIN = 42, FILL = 26, FILL_WAIT = 0.35;   // the paint meter (out of 100), per second
const FILL_OWN = 2.2, FILL_THEIRS = 0.4;
const HIT = 95, HEAL = 30, HEAL_WAIT = 1.2;      // being sprayed: health lost a second; and getting it back
const SPLAT_R = 105, RESPAWN = 2, SAFE = 1.5;    // the splash when a cat bursts, how long it's gone, and safe when it's back
const CLAIM_EVERY = 0.25, CLAIM_MIN = 8;         // how often closed loops are looked for, and the smallest land worth claiming
const LENGTH = 45, GOLD_AT = LENGTH - 10, GOLD_R = 120;
const BEHIND = 0.12, BOOST_SPEED = 1.06, BOOST_FILL = 1.3; // the comeback boost: for whoever's this far behind (of the whole floor)
const HOME = [[120, H / 2], [W - 120, H / 2]];
// The floor under the camera walls (top corners: see cam-walls.js) is wall (3): it can't be painted, and isn't counted.
const WALLED = [];
for (let gy = 0; gy < GR; gy++) for (let gx = 0; gx < GC; gx++) if (CA.camWalls.inWall((gx + 0.5) * CS, (gy + 0.5) * CS)) WALLED.push(gy * GC + gx);
const FLOOR = GC * GR - WALLED.length;
const CLAIM_MAX = Math.round(FLOOR * 0.14);       // (so one line across the whole floor can't win the game by itself)
// The cells in the middle, which count triple at the end.
const GOLD = [];
for (let gy = 0; gy < GR; gy++) for (let gx = 0; gx < GC; gx++) if (Math.hypot((gx + 0.5) * CS - W / 2, (gy + 0.5) * CS - H / 2) <= GOLD_R) GOLD.push(gy * GC + gx);

CA.games.add('paint', {
  name: 'Turf War', icon: '🎨',
  blurb: 'Hold the mouse button to spray! You run faster on your own color. Spray the other cat to burst them, and paint a closed loop to claim all the land inside. In the last 10 seconds the middle counts triple. 45 seconds.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'paint', mouse: true, sendMs: 66,
      pad: { stick: true, buttons: [{ k: 'a', label: '💣 Throw bomb' }, { k: 'fire', label: '🎨 Spray', main: true }] },
      help: 'WASD move · aim with the mouse · hold the button to spray: floor and the other cat · paint a closed loop to claim the land inside · 💣 (Space throws it), 🛡️ and 🪣 help',
      helpTouch: 'Stick moves · touch the floor to spray there · spray the other cat to burst them',
      note: 'Most floor after ' + LENGTH + ' seconds',
      init, step, snap, bot, draw, event,
    });
  },
});

function init() {
  return {
    t: 0, grid: new Uint8Array(GC * GR).map((v, k) => (WALLED.includes(k) ? 3 : 0)), count: [0, 0], sc: [0, 0],
    lock: new Float32Array(GC * GR), pu: [], bombs: [], nextPu: 4, nextClaim: CLAIM_EVERY, claimer: 0, seen: new Uint8Array(GC * GR),
    best: [0, 0], splats: [0, 0], ended: false,
    cats: HOME.map(([x, y], i) => ({ x, y, vx: 0, vy: 0, ax: i ? -1 : 1, ay: 0, ink: 100, spray: false, rest: 0, sh: 0, bomb: 0, inf: 0, hp: 100, hurt: 0, dead: 0, safe: 0, boost: false })),
  };
}

function paintCell(s, i, k, sh) {
  const own = i + 1, was = s.grid[k];
  if (was === 3 || was === own) return false;
  if (was && s.lock[k] > s.t) return false; // (shielded paint can't be painted over)
  if (was) s.count[was - 1]--;
  s.grid[k] = own;
  s.count[i]++;
  if (sh) s.lock[k] = s.t + sh + 2;
  return true;
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
      const k = gy * GC + gx;
      if (s.grid[k] === own) { if (sh) s.lock[k] = s.t + sh + 2; continue; }
      paintCell(s, i, k, sh);
    }
  }
}

// A round splash of paint (a bomb, a bucket, a cat bursting): it paints over the other cat's color, but not shielded paint.
function paintCircle(s, i, x, y, r) {
  const sh = s.cats[i].sh > 0 ? s.cats[i].sh : 0;
  for (let gy = Math.max(0, Math.floor((y - r) / CS)); gy <= Math.min(GR - 1, Math.floor((y + r) / CS)); gy++) {
    for (let gx = Math.max(0, Math.floor((x - r) / CS)); gx <= Math.min(GC - 1, Math.floor((x + r) / CS)); gx++) {
      if (Math.hypot((gx + 0.5) * CS - x, (gy + 0.5) * CS - y) <= r) paintCell(s, i, gy * GC + gx, sh);
    }
  }
}

// Claiming land: any patch of floor that cat i's paint has cut off from the other cat becomes cat i's. (Going by patches
// the other cat isn't in means a loop against the edge of the floor counts too.)
const queue = new Int16Array(GC * GR);
function flood(s, start, own, keep) {
  let head = 0, tail = 0;
  queue[tail++] = start;
  s.seen[start] = 1;
  while (head < tail) {
    const k = queue[head++], gx = k % GC;
    if (keep) keep.push(k);
    const nb = [gx > 0 ? k - 1 : -1, gx < GC - 1 ? k + 1 : -1, k >= GC ? k - GC : -1, k < GC * (GR - 1) ? k + GC : -1];
    for (const n of nb) {
      if (n < 0 || s.seen[n] || s.grid[n] === own || s.grid[n] === 3) continue;
      s.seen[n] = 1;
      queue[tail++] = n;
    }
  }
}
function claimLand(s, i, api) {
  const own = i + 1, o = s.cats[1 - i];
  s.seen.fill(0);
  const ok = o.dead <= 0 ? Math.floor(o.y / CS) * GC + Math.floor(o.x / CS) : -1;
  if (ok >= 0 && s.grid[ok] !== own && s.grid[ok] !== 3) flood(s, ok, own, null); // (the patch they're in stays open)
  let total = 0, sx = 0, sy = 0;
  for (let k = 0; k < GC * GR; k++) {
    if (s.seen[k] || s.grid[k] === own || s.grid[k] === 3) continue;
    const land = [];
    flood(s, k, own, land);
    if (land.length < CLAIM_MIN || land.length > CLAIM_MAX) continue;
    for (const c of land) {
      if (paintCell(s, i, c, 0)) { total++; sx += (c % GC + 0.5) * CS; sy += (Math.floor(c / GC) + 0.5) * CS; }
    }
  }
  if (total >= CLAIM_MIN) {
    s.best[i] = Math.max(s.best[i], total);
    api.ev('claim', { x: Math.round(sx / total), y: Math.round(sy / total), n: total, i });
  }
}

function inCone(c, x, y) {
  const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
  return d <= REACH + R && (d < R || (dx * c.ax + dy * c.ay) / d >= Math.cos(CONE));
}

const PICKS = ['bomb', 'shield', 'bucket'];

function goldCount(s, i) {
  let n = 0;
  for (const k of GOLD) if (s.grid[k] === i + 1) n++;
  return n;
}

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
    c.sh = Math.max(0, c.sh - dt);
    c.inf = Math.max(0, c.inf - dt);
    c.safe = Math.max(0, c.safe - dt);
    if (c.dead > 0) { // burst: back at home in a moment
      c.dead -= dt;
      c.spray = false;
      if (c.dead <= 0) {
        [c.x, c.y] = HOME[i];
        Object.assign(c, { dead: 0, hp: 100, safe: SAFE, ink: 100, vx: 0, vy: 0, rest: 0 });
        api.ev('back', { x: c.x, y: c.y, i });
      }
      return;
    }
    const under = s.grid[Math.max(0, Math.min(GR - 1, Math.floor(c.y / CS))) * GC + Math.max(0, Math.min(GC - 1, Math.floor(c.x / CS)))];
    const onOwn = under === i + 1, onTheirs = under === 2 - i;
    const sp = SPEED * (onOwn ? ON_OWN : onTheirs ? ON_THEIRS : 1) * (c.boost ? BOOST_SPEED : 1);
    const tx = n.mx * sp, ty = n.my * sp;
    const dx = tx - c.vx, dy = ty - c.vy, d = Math.hypot(dx, dy), a = ACCEL * dt;
    if (d <= a) { c.vx = tx; c.vy = ty; } else { c.vx += dx / d * a; c.vy += dy / d * a; }
    c.x = Math.max(R, Math.min(W - R, c.x + c.vx * dt));
    c.y = Math.max(R, Math.min(H - R, c.y + c.vy * dt));
    CA.camWalls.bounce(c, R, 0);
    let ax = n.ax - c.x, ay = n.ay - c.y;
    const al = Math.hypot(ax, ay);
    if (al > 4) { c.ax = ax / al; c.ay = ay / al; }
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
      if (c.rest <= 0) c.ink = Math.min(100, c.ink + FILL * (onOwn ? FILL_OWN : onTheirs ? FILL_THEIRS : 1) * (c.boost ? BOOST_FILL : 1) * dt);
    }
    // being sprayed
    const o = s.cats[1 - i];
    if (o.spray && o.dead <= 0 && c.safe <= 0 && inCone(o, c.x, c.y)) {
      c.hp -= HIT * dt;
      c.hurt = HEAL_WAIT;
      if (c.hp <= 0) {
        c.hp = 0;
        c.dead = RESPAWN;
        c.bomb = 0;
        c.spray = false;
        s.splats[1 - i]++;
        paintCircle(s, 1 - i, c.x, c.y, SPLAT_R);
        api.ev('splat', { x: Math.round(c.x), y: Math.round(c.y), i: 1 - i, v: i });
      }
    } else {
      c.hurt -= dt;
      if (c.hurt <= 0) c.hp = Math.min(100, c.hp + HEAL * dt);
    }
  });
  // one cat's loops at a time, taking turns
  s.nextClaim -= dt;
  if (s.nextClaim <= 0) {
    s.nextClaim = CLAIM_EVERY / 2;
    s.claimer = 1 - s.claimer;
    if (s.cats[s.claimer].dead <= 0) claimLand(s, s.claimer, api);
  }
  const gold = s.t >= GOLD_AT;
  if (gold && !s.goldOn) { s.goldOn = true; api.ev('gold', {}); }
  for (let i = 0; i < 2; i++) s.sc[i] = s.count[i] + (gold ? goldCount(s, i) * 2 : 0);
  const whole = FLOOR + (gold ? GOLD.length * 2 : 0);
  s.cats[0].boost = (s.sc[1] - s.sc[0]) / whole > BEHIND;
  s.cats[1].boost = (s.sc[0] - s.sc[1]) / whole > BEHIND;
  api.score(Math.round(s.sc[0] / whole * 100), Math.round(s.sc[1] / whole * 100));
  if (s.t >= LENGTH && !s.ended) {
    s.ended = true;
    api.ev('rec', { claim: s.best, splat: s.splats });
    api.end(s.sc[0] === s.sc[1] ? -1 : s.sc[0] > s.sc[1] ? 0 : 1, 'TIME!');
  }
}

function snap(s) {
  return {
    t: Math.round(s.t * 10) / 10, g: Array.prototype.join.call(s.grid, ''), n: s.sc,
    c: s.cats.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), ax: Math.round(c.ax * 100) / 100, ay: Math.round(c.ay * 100) / 100, i: Math.round(c.ink), s: c.spray ? 1 : 0, sh: c.sh > 0 ? 1 : 0, bb: c.bomb, inf: c.inf > 0 ? 1 : 0,
      hp: Math.round(c.hp), dd: c.dead > 0 ? 1 : 0, sf: c.safe > 0 ? 1 : 0, cb: c.boost ? 1 : 0 })),
    pu: s.pu.map(p => [Math.round(p.x), Math.round(p.y), PICKS.indexOf(p.type)]), bm: s.bombs.map(b => [Math.round(b.x), Math.round(b.y), Math.round(b.t * 100) / 100]),
  };
}

// The bot goes to the nearby patch with the most floor that isn't its color yet, spraying ahead of itself, and (if it's
// good) keeps a little paint back so it never runs completely dry. When the other cat comes close, it goes for them.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = { think: 0, gx: c.x, gy: c.y, spray: false, hunt: false });
  if (c.dead > 0) return { hit: {}, held: {} };
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
      if (s.t >= GOLD_AT - 3 && Math.hypot(x - W / 2, y - H / 2) < GOLD_R) sc *= 1 + api.skill; // (good bots head for the middle at the end)
      if (sc > best) { best = sc; st.gx = x; st.gy = y; }
    }
    if (s.pu.length && Math.random() < 0.35 + 0.4 * api.skill) { const p = s.pu[0]; st.gx = p.x; st.gy = p.y; } // (go and get a pickup)
    st.hunt = o.dead <= 0 && o.safe <= 0 && Math.hypot(o.x - c.x, o.y - c.y) < REACH + 50 && Math.random() < 0.3 + 0.6 * api.skill;
  }
  const hunting = st.hunt && o.dead <= 0;
  const tx = hunting ? o.x : st.gx, ty = hunting ? o.y : st.gy;
  const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
  const keep = 8 + 25 * api.skill;
  if (c.ink < 3) st.spray = false;
  else if (c.ink > keep + 30 || (hunting && c.ink > 8)) st.spray = true;
  else if (c.ink < keep && api.skill > 0.4) st.spray = false;
  const go = hunting ? d > REACH * 0.7 : d > 20;
  const out = { mx: go ? dx / d : 0, my: go ? dy / d : 0, ax: c.x + dx / d * 100, ay: c.y + dy / d * 100, held: st.spray ? { fire: true } : {}, hit: {} };
  if (c.bomb && d > 140 && Math.random() < 0.03) { out.hit.a = true; out.ax = st.gx; out.ay = st.gy; } // (a bomb, on the patch it is heading for)
  return out;
}

function event(v, e) {
  if (e.type === 'pick') { v.ring(e.x, e.y, v.team[e.i].main, 14); v.burst(e.x, e.y, v.team[e.i].light, 10, 200); v.pop(e.x, e.y - 24, e.t === 'bomb' ? '💣 Bomb!' : e.t === 'shield' ? '🛡️ Shield!' : '🪣 Splash!', '#ffffff'); v.sound('point'); }
  if (e.type === 'throw') v.sound([[500, 0, 0.05], [300, 0.05, 0.08]]);
  if (e.type === 'boom') { v.burst(e.x, e.y, v.team[e.i].main, 28, 380); v.ring(e.x, e.y, v.team[e.i].light, 30); v.shake(7); v.sound('boom'); }
  if (e.type === 'claim') {
    v.ring(e.x, e.y, v.team[e.i].light, 40);
    v.burst(e.x, e.y, v.team[e.i].main, Math.min(40, 8 + e.n / 4), 300);
    v.pop(e.x, e.y, (e.i === v.me ? 'CLAIMED +' : 'THEY CLAIMED +') + e.n + '!', e.i === v.me ? '#ffd23f' : '#ff9a9a');
    v.sound(e.i === v.me ? 'point' : 'miss');
    if (e.n > 60) v.shake(5);
  }
  if (e.type === 'splat') {
    v.burst(e.x, e.y, v.team[e.i].main, 40, 460);
    v.ring(e.x, e.y, v.team[e.i].light, SPLAT_R / 2);
    v.pop(e.x, e.y - 20, e.v === v.me ? 'SPLAT! 💀' : 'SPLAT! 🎯', e.v === v.me ? '#ff5a5a' : '#ffd23f');
    v.shake(11);
    v.sound('boom');
  }
  if (e.type === 'back') v.ring(e.x, e.y, v.team[e.i].light, 20);
  if (e.type === 'gold') { v.note('The middle counts TRIPLE now!'); v.sound('notify'); v.shake(4); v.ring(W / 2, H / 2, '#ffd23f', GOLD_R - 24); }
  if (e.type === 'rec') { v.record('claim', 'Biggest land claim', e.claim[v.me]); v.record('splat', 'Most splats in a game', e.splat[v.me]); }
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
  // the middle: counts triple at the end
  const toGold = GOLD_AT - s.t;
  if (toGold <= 5) {
    g.save();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = toGold > 0 ? 3 : 5;
    if (toGold > 0) g.setLineDash([12, 10]);
    g.beginPath(); g.arc(W / 2, H / 2, GOLD_R + (toGold > 0 ? 0 : Math.sin(v.now / 140) * 3), 0, Math.PI * 2); g.stroke();
    g.restore();
    if (toGold <= 0) { g.fillStyle = 'rgba(255, 210, 63, .14)'; v.dot(W / 2, H / 2, GOLD_R); }
    v.label(toGold > 0 ? '×3 in ' + Math.ceil(toGold) : '×3', W / 2, H / 2 - GOLD_R - 14, 18, '#b8860b');
  }
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
    if (c.dd) return;
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
    v.catTop(i, c.x, c.y, 1, { lookRight: c.ax >= 0, alpha: c.sf ? 0.45 + 0.35 * Math.abs(Math.sin(v.now / 90)) : 1 });
    if (c.bb) v.label('💣', c.x + 22, c.y - 22, 18, '#000000');
    g.fillStyle = 'rgba(0, 0, 0, .55)'; // health, and the paint meter
    v.roundRect(c.x - 22, c.y - 49, 44, 14, 4); g.fill();
    g.fillStyle = c.hp > 35 ? '#7dff8a' : '#ff5a5a';
    v.roundRect(c.x - 21, c.y - 48, Math.max(2, 42 * c.hp / 100), 5, 2); g.fill();
    g.fillStyle = c.i > 25 ? v.team[i].light : '#ff6b6b';
    v.roundRect(c.x - 21, c.y - 41, Math.max(2, 42 * c.i / 100), 5, 2); g.fill();
    if (c.cb) v.label('🔥', c.x - 28, c.y - 42, 13, '#000000');
  });
  const total = (s.n[0] + s.n[1]) || 1, whole = FLOOR + (s.t >= GOLD_AT ? GOLD.length * 2 : 0);
  // the tug of war: who has how much of the painted floor
  g.fillStyle = 'rgba(20, 20, 40, .8)';
  v.roundRect(W / 2 - 150, 8, 300, 24, 12); g.fill();
  const split = 296 * s.n[0] / total;
  g.fillStyle = s.n[0] + s.n[1] ? v.team[0].main : '#666';
  v.roundRect(W / 2 - 148, 10, Math.max(4, split), 20, 10); g.fill();
  if (s.n[1]) {
    g.fillStyle = v.team[1].main;
    v.roundRect(W / 2 - 148 + split, 10, Math.max(4, 296 - split), 20, 10); g.fill();
  }
  v.label(Math.round(s.n[0] / whole * 100) + '%', W / 2 - 180, 21, 16, v.team[0].main);
  v.label(Math.round(s.n[1] / whole * 100) + '%', W / 2 + 180, 21, 16, v.team[1].main);
  const left = Math.max(0, Math.ceil(LENGTH - s.t));
  v.label('⏱ ' + left, W / 2, 48, left <= 10 ? 22 : 16, left <= 10 ? '#d4141e' : '#333');
  const me = s.c[v.me];
  if (me && me.dd) v.msg('You burst! Back in a moment…', true);
  else if (me && me.i < 5 && !me.s) v.msg('Out of paint! Let go to refill (faster on your own color)', true);
  else if (me && me.cb) v.msg('🔥 Comeback boost: you run and refill faster while you’re behind');
}

})();
