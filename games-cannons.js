/* Classic Games: Cat Cannons. Each cat hides inside its own fort: a pile of wood and stone blocks built at random every
   round. At the start of a round you pick which room of your fort to hide in (click it), or you get a random one; the
   first one to pick gets the first shot. Then you take turns: aim your cannon with the mouse, hold the button to charge,
   let go to fire. A cannonball blows up whatever it hits: wood breaks at once, stone takes two hits, and blocks with
   nothing under them fall. Blow up the other cat (the blast has to reach it) and it gets one REDEMPTION shot: if that
   gets you back, you BOTH lose a life; if not, only it does. Then everything is built again for the next round.
   3 lives each. (The host's app runs it all: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, GY = 452;                // the ground
const CELL = 20, COLS = 13, ROWS = 12;           // a fort: a grid of blocks
const FORT_X = [22, W - 22 - COLS * CELL];       // where each fort's grid starts (left edge)
const CANNON = [330, W - 330];                   // the cannons stand in front of the forts
const GRAV = 520, POWER_MIN = 260, POWER_MAX = 920, CHARGE = 1.3;
const BLAST = 38, KILL = 34, BALL = 8;
const LIVES = 3, PICK_T = 7, AIM_T = 15, SETTLE = 0.5;
const HILL_X = W / 2, HILL_W = 150, HILL_H = 78; // a hill in the middle (shots have to go over it)
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

CA.games.add('cannons', {
  name: 'Cat Cannons', icon: '💥',
  blurb: 'Hide your cat in your fort, then take turns firing cannons at each other\'s forts! Wood breaks, stone takes two hits, blocks fall. Hit the other cat and it gets one REDEMPTION shot: if it gets you back, you both lose a life. 3 lives each.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'cannons', mouse: true, angles: ['a'], heavy: ['f'], heavyMs: 100,
      pad: { buttons: [{ k: 'fire', label: '💥 Hold to charge', main: true }] },
      help: 'Click a room in your fort to hide in · on your turn: aim with the mouse, hold the button to charge, let go to fire',
      helpTouch: 'Tap a room to hide in · on your turn, touch to aim, hold to charge, let go to fire',
      note: LIVES + ' lives each · take turns',
      init, step, snap, bot, draw, event,
    });
  },
});

/* ---------- the forts ---------- */

// A fort: ROWS × COLS cells, row 0 at the top. '.' empty, 'w' wood, 's' stone, 'c' cracked stone. A solid building 7 to
// 9 blocks tall, with towers sticking up, stone at the bottom and mostly wood above. Three rooms (3 wide, 4 tall) are
// hollowed out of it for the cat to hide in, side by side, each at its own height, each with walls, a floor and a ceiling.
function buildFort(side) {
  const g = [];
  for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill('.'));
  const body = 7 + Math.floor(Math.random() * 3);
  for (let c = 0; c < COLS; c++) {
    const h = Math.min(ROWS, body + (c % 4 === 0 || c === COLS - 1 ? 1 + Math.floor(Math.random() * 3) : 0)); // (towers)
    for (let r = ROWS - h; r < ROWS; r++) g[r][c] = r >= ROWS - 2 || Math.random() < 0.22 ? 's' : 'w';
  }
  const rooms = [1, 5, 9].map(c => {
    const r = ROWS - body + 1 + Math.floor(Math.random() * (body - 4)); // (from just under the roof down to the ground)
    for (let k = 0; k < 4; k++) for (let d = 0; d < 3; d++) g[r + k][c + d] = '.';
    return { c, r };
  });
  return { g, rooms: rooms.map(m => roomSpot(side, m)) };
}
// Where a cat stands in a room (its feet).
const roomSpot = (side, m) => ({ x: FORT_X[side] + (m.c + 1.5) * CELL, y: GY - (ROWS - m.r - 4) * CELL });
const fortTop = side => GY - ROWS * CELL;
const cellAt = (s, x, y) => { // which fort cell (x, y) is in, if any: { f, r, c }
  for (let f = 0; f < 2; f++) {
    const c = Math.floor((x - FORT_X[f]) / CELL), r = Math.floor((y - fortTop(f)) / CELL);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) return { f, r, c };
  }
  return null;
};
const solid = (s, x, y) => { const k = cellAt(s, x, y); return !!k && s.forts[k.f].g[k.r][k.c] !== '.'; };

// The ground: flat, with a hill in the middle.
function groundAt(x) {
  const d = Math.abs(x - HILL_X) / HILL_W;
  return d < 1 ? GY - HILL_H * (1 - d * d) * (1 - d * d) : GY;
}
const pivot = i => ({ x: CANNON[i], y: GY - 22 });

/* ---------- the game ---------- */

function init(api) {
  const s = { lives: [LIVES, LIVES], round: 0, balls: [], wind: 0, a: [-0.7, -Math.PI + 0.7], power: [0, 0], charging: [false, false] };
  newRound(s, api);
  return s;
}

function newRound(s, api) {
  s.round++;
  s.forts = [buildFort(0), buildFort(1)];
  s.cats = [0, 1].map(() => ({ x: 0, y: 0, room: -1, doomed: false, dead: false, vy: 0 }));
  s.phase = 'pick';
  s.t = PICK_T;
  s.first = -1;         // (whoever picked first: they shoot first)
  s.turn = -1;
  s.redeem = false;     // (this shot is a redemption shot)
  s.doomed = -1;        // (who's waiting to lose a life, unless the redemption shot gets the other one too)
  s.balls = [];
  s.settle = 0;
  s.fall = 0;
  s.wind = Math.round((Math.random() - 0.5) * 70);
  api.ev('round', { n: s.round });
}

function place(s, i, room, api) {
  const c = s.cats[i];
  if (c.room >= 0) return;
  const spot = s.forts[i].rooms[room];
  c.room = room;
  c.x = spot.x;
  c.y = spot.y;
  if (s.first < 0) s.first = i;
  api.ev('placed', { i, first: s.first === i ? 1 : 0 });
}

function startTurn(s, i, api) {
  s.phase = 'aim';
  s.turn = i;
  s.t = AIM_T;
  s.charging = [false, false];
  s.power = [0, 0];
  api.ev('turn', { i, redeem: s.redeem ? 1 : 0 });
}

function aimAngle(i, ax, ay) {
  const p = pivot(i);
  let a = Math.atan2(ay - p.y, ax - p.x);
  if (a > 0) a = ax < p.x ? -Math.PI + 0.1 : -0.1; // (always upwards)
  return Math.max(-Math.PI + 0.1, Math.min(-0.1, a));
}

function step(s, inp, dt, api) {
  if (s.phase === 'over') return;
  s.t -= dt;
  for (let i = 0; i < 2; i++) s.a[i] = aimAngle(i, inp[i].ax, inp[i].ay);
  if (s.phase === 'pick') {
    for (let i = 0; i < 2; i++) {
      const n = inp[i];
      if (!n.hit.fire || s.cats[i].room >= 0) continue;
      let best = -1, bd = 46;
      s.forts[i].rooms.forEach((m, k) => { const d = Math.hypot(n.ax - m.x, n.ay - (m.y - CELL * 2)); if (d < bd) { bd = d; best = k; } });
      if (best >= 0) place(s, i, best, api);
    }
    if (s.t <= 0 || (s.cats[0].room >= 0 && s.cats[1].room >= 0)) {
      for (let i = 0; i < 2; i++) if (s.cats[i].room < 0) place(s, i, Math.floor(Math.random() * s.forts[i].rooms.length), api);
      startTurn(s, s.first >= 0 ? s.first : Math.floor(Math.random() * 2), api);
    }
  } else if (s.phase === 'aim') {
    const i = s.turn, n = inp[i];
    if (!s.charging[i] && (n.hit.fire || n.held.fire)) { s.charging[i] = true; s.power[i] = 0; }
    if (s.charging[i] && n.held.fire) s.power[i] = Math.min(1, s.power[i] + dt / CHARGE);
    if (s.charging[i] && !n.held.fire) fire(s, i, api);
    else if (s.t <= 0) { api.ev('skip', { i }); afterShot(s, api, false); } // (too slow: the turn is gone)
  } else if (s.phase === 'fly') {
    flyBalls(s, dt, api);
    if (!s.balls.length) { s.phase = 'settle'; s.settle = SETTLE; }
  } else if (s.phase === 'settle') {
    s.settle -= dt;
    if (s.settle <= 0 && !s.moving) afterShot(s, api, true);
  } else if (s.phase === 'ko') { // (lives lost: a moment to see it, then the next round)
    if (s.t <= 0) {
      if (s.lives[0] <= 0 || s.lives[1] <= 0) { s.phase = 'over'; api.end(s.lives[0] <= 0 && s.lives[1] <= 0 ? -1 : s.lives[0] <= 0 ? 1 : 0, 'KABOOM!'); }
      else newRound(s, api);
    }
  }
  stepFalling(s, dt, api);
}

function fire(s, i, api) {
  const p = pivot(i), a = s.a[i], v = POWER_MIN + (POWER_MAX - POWER_MIN) * s.power[i];
  s.balls.push({ x: p.x + Math.cos(a) * 34, y: p.y + Math.sin(a) * 34, vx: Math.cos(a) * v, vy: Math.sin(a) * v, o: i, tr: [] });
  s.charging[i] = false;
  s.power[i] = 0;
  s.phase = 'fly';
  api.ev('fire', { x: p.x + Math.cos(a) * 40, y: p.y + Math.sin(a) * 40, i });
}

// After a shot has landed and the blocks have stopped falling: did it get the other cat (or its own)?
function afterShot(s, api) {
  const i = s.turn, o = 1 - i;
  const hit = s.cats[o].doomed && s.doomed !== o;  // (the other cat was blown up just now)
  const self = s.cats[i].doomed && s.doomed !== i; // (it blew up its own cat)
  const lose = who => {
    who.forEach(k => { s.lives[k] = Math.max(0, s.lives[k] - 1); s.cats[k].dead = true; });
    api.score(LIVES - s.lives[1], LIVES - s.lives[0]);
    api.ev('lost', { who, both: who.length > 1 ? 1 : 0, self: self && !hit ? 1 : 0 });
    s.phase = 'ko';
    s.t = 3.2;
  };
  if (s.redeem) { lose(hit ? [i, o] : [i]); return; } // a redemption shot: it got them back (both lose a life), or it didn't
  if (self) { lose(hit ? [i, o] : [i]); return; }       // (oops)
  if (hit) { // a hit! the other cat gets one redemption shot
    s.doomed = o;
    s.redeem = true;
    api.ev('doomed', { i: o });
    startTurn(s, o, api);
    return;
  }
  startTurn(s, o, api);
}

function flyBalls(s, dt, api) {
  for (let n = 0; n < 4; n++) {
    const h = dt / 4;
    for (const b of s.balls) if (!b.dead) moveBall(s, b, h, api);
    s.balls = s.balls.filter(b => !b.dead);
  }
}

function moveBall(s, b, h, api) {
  b.vx += s.wind * h;
  b.vy += GRAV * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  if (b.x < -60 || b.x > W + 60 || b.y > H + 40) { b.dead = true; api.ev('miss', { x: b.x }); return; }
  for (const c of s.cats) if (c.room >= 0 && !c.dead && Math.hypot(b.x - c.x, b.y - (c.y - 34)) < 26) { explode(s, b, api); return; }
  if (solid(s, b.x, b.y) || b.y >= groundAt(b.x) || CA.camWalls.inWall(b.x, b.y, BALL)) { explode(s, b, api); return; }
  const t = b.tr;
  if (t.length === 0 || Math.hypot(b.x - t[t.length - 2], b.y - t[t.length - 1]) > 14) { t.push(Math.round(b.x), Math.round(b.y)); if (t.length > 60) t.splice(0, 2); }
}

function explode(s, b, api) {
  b.dead = true;
  let broke = 0;
  for (let f = 0; f < 2; f++) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = FORT_X[f] + (c + 0.5) * CELL, y = fortTop(f) + (r + 0.5) * CELL, d = Math.hypot(x - b.x, y - b.y), g = s.forts[f].g;
    if (d > BLAST || g[r][c] === '.') continue;
    if (g[r][c] === 's' && d > BLAST * 0.55) g[r][c] = 'c'; // (stone cracks; a close blast, or a second one, breaks it)
    else { g[r][c] = '.'; broke++; }
  }
  const hit = [];
  s.cats.forEach((c, k) => {
    if (c.room < 0 || c.dead || c.doomed) return;
    if (Math.hypot(c.x - b.x, c.y - 34 - b.y) < KILL) { c.doomed = true; hit.push(k); }
  });
  api.ev('boom', { x: Math.round(b.x), y: Math.round(b.y), n: broke, hit: hit.length ? hit[0] : -1 });
}

// Blocks that are no longer joined to the ground (through other blocks, up, down or sideways) fall a cell at a time,
// and so does a cat whose floor is gone. (So a room's ceiling stays up while its walls do.)
function stepFalling(s, dt) {
  s.fall += dt;
  s.moving = false;
  while (s.fall >= 0.06) {
    s.fall -= 0.06;
    for (let f = 0; f < 2; f++) {
      const g = s.forts[f].g, held = [];
      for (let r = 0; r < ROWS; r++) held.push(new Array(COLS).fill(false));
      const todo = [];
      for (let c = 0; c < COLS; c++) if (g[ROWS - 1][c] !== '.') { held[ROWS - 1][c] = true; todo.push([ROWS - 1, c]); }
      while (todo.length) {
        const [r, c] = todo.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && !held[rr][cc] && g[rr][cc] !== '.') { held[rr][cc] = true; todo.push([rr, cc]); }
        }
      }
      for (let r = ROWS - 2; r >= 0; r--) for (let c = 0; c < COLS; c++) {
        if (g[r][c] !== '.' && !held[r][c] && g[r + 1][c] === '.') { g[r + 1][c] = g[r][c]; g[r][c] = '.'; s.moving = true; }
      }
    }
  }
  for (const c of s.cats) {
    if (c.room < 0 || c.dead) continue;
    const floor = solid(s, c.x - 6, c.y + 2) || solid(s, c.x + 6, c.y + 2) || c.y >= GY;
    if (!floor) { c.vy += GRAV * dt; c.y = Math.min(GY, c.y + c.vy * dt); s.moving = true; } else c.vy = 0;
  }
}

function snap(s) {
  return {
    ph: s.phase, t: r1(Math.max(0, s.t)), tn: s.turn, rd: s.redeem ? 1 : 0, rn: s.round, fi: s.first,
    f: s.forts.map(f => f.g.map(row => row.join('')).join('')),
    rm: s.forts.map(f => f.rooms.map(m => [m.x, m.y])),
    c: s.cats.map(c => [Math.round(c.x), Math.round(c.y), c.room, c.doomed ? 1 : 0, c.dead ? 1 : 0]),
    a: s.a.map(r2), pw: s.power.map(r2), ch: s.charging.map(v => (v ? 1 : 0)), lv: s.lives, wd: s.wind,
    b: s.balls.map(b => ({ x: Math.round(b.x), y: Math.round(b.y) })), tr: s.balls.length ? s.balls[0].tr.slice() : [],
  };
}

/* ---------- the bot ---------- */

// Picks a room after a moment. On its turn it tries lots of angles and powers in its head (with the wind, the hill and
// the blocks) and picks the shot that blows up closest to the other cat; easier bots aim worse.
function bot(s, i, dt, api) {
  const st = (s.bs || (s.bs = {}))[i] || (s.bs[i] = { plan: null, think: 0, wait: 0 });
  const out = { ax: CANNON[1 - i], ay: 200, held: {}, hit: {} };
  if (s.phase === 'pick') {
    st.plan = null;
    st.wait += dt;
    if (s.cats[i].room < 0 && st.wait > 1 + Math.random() * 2) {
      const m = s.forts[i].rooms[Math.floor(Math.random() * s.forts[i].rooms.length)];
      Object.assign(out, { ax: m.x, ay: m.y - CELL * 2, hit: { fire: true } });
    }
    return out;
  }
  st.wait = 0;
  if (s.phase !== 'aim' || s.turn !== i) { st.plan = null; return out; }
  const target = s.cats[1 - i], p = pivot(i);
  if (!st.plan) {
    let best = null, bestD = Infinity;
    for (let a = -Math.PI + 0.12; a < -0.12; a += 0.04) {
      if ((i === 0 && Math.cos(a) < 0) || (i === 1 && Math.cos(a) > 0)) continue;
      for (let pw = 0.04; pw <= 1.0001; pw += 0.04) {
        const v = POWER_MIN + (POWER_MAX - POWER_MIN) * pw;
        let x = p.x + Math.cos(a) * 34, y = p.y + Math.sin(a) * 34, vx = Math.cos(a) * v, vy = Math.sin(a) * v;
        for (let k = 0; k < 500; k++) {
          vx += s.wind / 60; vy += GRAV / 60; x += vx / 60; y += vy / 60;
          if (x < -60 || x > W + 60 || y > H || solid(s, x, y) || y >= groundAt(x) || CA.camWalls.inWall(x, y, BALL)) break;
        }
        const d = Math.hypot(x - target.x, y - (target.y - 34));
        if (d < bestD) { bestD = d; best = { a, pw }; }
      }
    }
    const err = 1 - api.skill;
    st.plan = { a: best.a + CA.games.kit.gauss(0, 0.01 + 0.05 * err), pw: Math.max(0.04, Math.min(1, best.pw + CA.games.kit.gauss(0, 0.01 + 0.07 * err))) };
    st.think = 0.8 + (1 - api.skill) * 1.2 + Math.random() * 0.8;
  }
  out.ax = p.x + Math.cos(st.plan.a) * 200;
  out.ay = p.y + Math.sin(st.plan.a) * 200;
  st.think -= dt;
  if (st.think > 0) return out;
  if (!s.charging[i]) { out.hit.fire = true; out.held.fire = true; return out; }
  if (s.power[i] < st.plan.pw) out.held.fire = true;
  return out;
}

/* ---------- drawing ---------- */

const heads = [null, null];   // a head that came off: { t0, x, y, vx, vy, spin } (just for show, on each screen)
const debris = [];

function event(v, e) {
  if (e.type === 'round') { heads[0] = heads[1] = null; debris.length = 0; v.note('Round ' + e.n + ' · hide your cat!'); v.banner('ROUND ' + e.n, '#ffffff'); }
  if (e.type === 'placed') { v.sound('pop'); if (e.first) v.pop(FORT_X[e.i] + COLS * CELL / 2, fortTop(e.i) - 20, 'FIRST SHOT!', '#ffd23f'); }
  if (e.type === 'turn') {
    v.sound(e.redeem ? 'whoosh' : 'tick');
    v.mood(e.i, e.redeem ? 'dizzy' : 'angry', 2.5);
  }
  if (e.type === 'fire') { v.burst(e.x, e.y, '#fff3b0', 12, 220); v.sound([[120, 0, 0.12], [80, 0.05, 0.2], [600, 0, 0.18, { w: 'noise', to: 120, g: 1 }]]); v.shake(6); v.mood(e.i, 'smug', 1.2); v.mood(1 - e.i, 'shock', 1.6); }
  if (e.type === 'boom') {
    v.burst(e.x, e.y, '#ff9a3c', 26, 360);
    v.burst(e.x, e.y, '#c98b4a', 10 + e.n * 2, 300);
    v.ring(e.x, e.y, '#ffd23f', 18);
    v.shake(e.hit >= 0 ? 20 : 10);
    v.sound('boom');
    if (e.n) v.pop(e.x, e.y - 30, e.n > 6 ? 'CRUNCH!' : 'CRACK!', '#ffd23f');
    if (e.hit >= 0) v.pop(e.x, e.y - 60, 'DIRECT HIT!', '#ff5a5a');
  }
  if (e.type === 'doomed') {
    v.banner('REDEMPTION SHOT!', '#ff5a5a');
    v.sound('fanfare');
    v.flash('#ff3b3b', 0.25);
    v.mood(e.i, 'dizzy', 30);
  }
  if (e.type === 'skip') v.pop(CANNON[e.i], GY - 90, 'TOO SLOW!', '#ffffff');
  if (e.type === 'miss') v.sound([[300, 0, 0.1]]);
  if (e.type === 'lost') {
    v.banner(e.both ? 'DOUBLE KO! 💀💀' : e.self ? 'OOPS! 💀' : 'NO REDEMPTION! 💀', e.both ? '#ffd23f' : '#ff5a5a');
    v.shake(22);
    v.flash('#ffffff', 0.35);
    v.sound('boom');
    (e.who || []).forEach(k => { heads[k] = { t0: performance.now(), vx: (k ? 1 : -1) * (80 + Math.random() * 120), vy: -420 - Math.random() * 120, spin: (Math.random() - 0.5) * 16 }; v.mood(k, 'ko', 30); });
  }
}

function catPic(v, i, face, look) {
  const P = v.looks[i].pics;
  return (P.face && P.face(face, look, 0)) || P[look][0] || P[look][1];
}

// A cat in its room. Doomed (waiting on the redemption shot): it shakes. Dead: its head pops off and flies.
function drawCat(v, s, i, c) {
  const g = v.g, [x0, y0, room, doomed, dead] = c;
  if (room < 0) return;
  const k = 0.4, look = i === 0 ? 1 : -1;
  const shake = doomed && !dead ? Math.sin(v.now / 22) * 2.5 : 0;
  const face = dead ? 'ko' : doomed ? 'dizzy' : s.tn === i && s.ph === 'aim' ? (s.ch[i] ? 'squint' : 'angry') : s.ph === 'fly' && s.tn !== i ? 'shock' : 'normal';
  // (waiting in its room, it blinks now and then, and breathes: its head rises and falls a little)
  const blink = face === 'normal' && (v.now + i * 1700) % 3900 < 130;
  const pic = catPic(v, i, blink ? 'blink' : face === 'normal' ? 'smug' : face, look);
  const x = x0 + shake, y = y0, breath = dead ? 0 : Math.sin(v.now / 420 + i * 2) * 0.9;
  const w = 200 * 0.4 * k * 2, hgt = 240 * 0.4 * k * 2; // (the picture is 200 × 240; drawn 80 × 96 at size 1)
  if (!pic) { v.catSide(i, x, y, k, { lookRight: look > 0 }); return; }
  const SPLIT = 138 / 240; // (where the head meets the body, in the picture)
  // the body
  g.drawImage(pic, 0, 240 * SPLIT, 200, 240 * (1 - SPLIT), x - w / 2, y - hgt * (1 - SPLIT) - 2, w, hgt * (1 - SPLIT));
  // the head: on its shoulders, or flying off
  const hd = heads[i];
  let hx = x, hy = y - hgt * (1 - SPLIT) - 2 + breath, rot = 0;
  if (dead && hd) {
    const t = (v.now - hd.t0) / 1000;
    hx = x + hd.vx * t;
    hy = Math.min(GY - hgt * SPLIT * 0.6, hy + hd.vy * t + 700 * t * t);
    rot = hd.spin * Math.min(t, 1.2);
  }
  g.save();
  g.translate(hx, hy - hgt * SPLIT / 2);
  g.rotate(rot);
  g.drawImage(pic, 0, 0, 200, 240 * SPLIT, -w / 2, -hgt * SPLIT / 2, w, hgt * SPLIT);
  g.restore();
  if (doomed && !dead) { g.fillStyle = '#ffe14d'; for (let n = 0; n < 3; n++) { const a = v.now / 150 + n * 2.1; v.star(x + Math.cos(a) * 16, y - hgt + 4 + Math.sin(a) * 5, 4); } }
}

function drawFort(v, s, f) {
  const g = v.g, str = s.f[f], x0 = FORT_X[f], y0 = fortTop(f);
  if (!str) return;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = str[r * COLS + c];
    if (ch === '.') continue;
    const x = x0 + c * CELL, y = y0 + r * CELL;
    if (ch === 'w') {
      g.fillStyle = '#c98b4a'; g.fillRect(x, y, CELL, CELL);
      g.fillStyle = '#a86f35'; g.fillRect(x, y + 5, CELL, 1.5); g.fillRect(x, y + 12, CELL, 1.5);
    } else {
      g.fillStyle = ch === 's' ? '#8e95a3' : '#7a808c'; g.fillRect(x, y, CELL, CELL);
      g.fillStyle = 'rgba(255, 255, 255, .15)'; g.fillRect(x + 2, y + 2, CELL - 8, 3);
      if (ch === 'c') { g.strokeStyle = '#3a3e48'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 3, y + 4); g.lineTo(x + 9, y + 9); g.lineTo(x + 6, y + 15); g.moveTo(x + 9, y + 9); g.lineTo(x + 15, y + 7); g.stroke(); }
    }
    g.strokeStyle = 'rgba(0, 0, 0, .35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
  }
}

function draw(v, s) {
  const g = v.g;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5aa8ff'); sky.addColorStop(1, '#cfe9ff');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255, 255, 255, .8)';
  [[300, 90, 1], [560, 60, 1.3], [700, 120, 0.9]].forEach(([x, y, k]) => { const X = ((x + v.now / 60 * Math.sign(s.wd || 1)) % 1100 + 1100) % 1100 - 70; [[0, 0, 26], [24, -10, 22], [48, 0, 24]].forEach(([a, b, r]) => v.dot(X + a * k, y + b * k, r * k)); });
  // the ground and the hill
  g.fillStyle = '#6aa84f';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, groundAt(x));
  g.lineTo(W, H); g.fill();
  g.fillStyle = '#7a5434'; g.fillRect(0, GY + 10, W, H - GY);
  // the forts, the cats in them, the cannons
  drawFort(v, s, 0);
  drawFort(v, s, 1);
  if (s.ph === 'pick') { // where you can hide (and where you did)
    const mine = s.c[v.me];
    (s.rm[v.me] || []).forEach(([x, y], k) => {
      if (mine[2] >= 0 && mine[2] !== k) return;
      const pulse = 1 + Math.sin(v.now / 160 + k) * 0.08;
      g.strokeStyle = mine[2] === k ? '#7dff8a' : '#ffd23f';
      g.lineWidth = 3;
      g.setLineDash([5, 4]);
      g.strokeRect(x - CELL * 1.5 * pulse, y - CELL * 4 * pulse, CELL * 3 * pulse, CELL * 4 * pulse);
      g.setLineDash([]);
    });
  }
  s.c.forEach((c, i) => { if (i === v.me || s.ph !== 'pick') drawCat(v, s, i, c); }); // (where they hide stays secret until both have picked)
  [0, 1].forEach(i => {
    const p = pivot(i);
    g.save(); g.translate(p.x, p.y); g.rotate(s.a[i]);
    g.fillStyle = '#2b2b38'; v.roundRect(-6, -10, 48, 20, 8); g.fill();
    g.fillStyle = v.team[i].main; g.fillRect(32, -11, 8, 22);
    g.restore();
    g.fillStyle = '#5a3b22'; v.dot(p.x, GY - 10, 14);
    g.fillStyle = '#c99a63'; v.dot(p.x, GY - 10, 5);
    if (s.tn === i && s.ph === 'aim' && s.ch[i]) { // the power bar while charging
      g.fillStyle = 'rgba(0, 0, 0, .55)'; v.roundRect(p.x - 40, GY - 96, 80, 10, 5); g.fill();
      g.fillStyle = s.pw[i] < 0.5 ? '#7dff8a' : s.pw[i] < 0.85 ? '#ffd23f' : '#ff5a5a';
      v.roundRect(p.x - 39, GY - 95, Math.max(6, 78 * s.pw[i]), 8, 4); g.fill();
    }
  });
  // the cannonball and its trail
  g.fillStyle = 'rgba(40, 40, 60, .35)';
  for (let k = 0; k < s.tr.length; k += 2) v.dot(s.tr[k], s.tr[k + 1], 2.5);
  s.b.forEach(p => { g.fillStyle = '#1b1b24'; v.dot(p.x, p.y, BALL); g.fillStyle = 'rgba(255, 255, 255, .4)'; v.dot(p.x - 2, p.y - 3, 2.5); });
  // lives, wind, whose turn
  [0, 1].forEach(i => {
    const x = i === 0 ? 260 : W - 260;
    for (let k = 0; k < LIVES; k++) v.heart(x + (k - 1) * 20, 26, k < s.lv[i]);
    v.label(i === v.me ? 'You' : v.names[i], x, 48, 13, i === v.me ? '#ffd23f' : '#ffffff');
  });
  g.fillStyle = 'rgba(20, 30, 60, .7)';
  v.roundRect(W / 2 - 80, 12, 160, 30, 15); g.fill();
  v.label('🌬️ ' + (s.wd === 0 ? 'No wind' : 'Wind ' + (s.wd > 0 ? '→' : '←').repeat(1 + Math.min(2, Math.floor(Math.abs(s.wd) / 22)))), W / 2, 28, 14, '#ffffff');
  if (s.ph === 'pick' || s.ph === 'aim') { // the time left
    const full = s.ph === 'pick' ? PICK_T : AIM_T, f = Math.max(0, Math.min(1, s.t / full));
    g.fillStyle = 'rgba(0, 0, 0, .35)'; v.roundRect(W / 2 - 80, 48, 160, 6, 3); g.fill();
    g.fillStyle = f < 0.3 ? '#ff5a5a' : '#ffd23f'; v.roundRect(W / 2 - 80, 48, 160 * f, 6, 3); g.fill();
  }
  const mine = s.c[v.me];
  v.msg(s.ph === 'pick' ? (mine[2] < 0 ? 'Click a glowing room in your fort to hide your cat there (first to pick shoots first)' : 'Hidden! Waiting for ' + v.names[1 - v.me] + '…')
    : s.ph === 'aim' ? (s.tn === v.me ? (s.rd ? '💀 REDEMPTION SHOT: get them back! ' : 'Your turn! ') + 'Aim with the mouse, hold the button to charge, let go to fire' : v.names[s.tn] + (s.rd ? ' has a REDEMPTION shot!' : ' is aiming…'))
      : s.ph === 'ko' ? '' : '', s.ph === 'aim' && s.rd && s.tn === v.me);
}

})();
