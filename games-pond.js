/* Classic Games: Pond War. Two cats on opposite banks, one pond, and you can see the fish swimming. Aim, click to cast
   near a fish, and click when your bobber dips to hook it. Then hold the button to reel in: your line's tension goes up
   while you pull, and goes up fast when the fish makes a run, so let go when it does. Too much tension and the line snaps.
   - Cast onto a fish the other cat is reeling in and you both have it: a tug of war, and the winner takes the fish.
   - Throw a rock (E or right-click): it scares fish away, ruins a waiting cast, and jolts a line.
   - What you catch goes in your bucket. Bank it (B): it takes a moment, and only banked fish count in full. A snapped line
     spills half your bucket, and at the end whatever's still in it counts half.
   - 15 seconds before the end, a legendary golden fish appears.
   The host's app runs the pond (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const LENGTH = 60, GOLD_AT = LENGTH - 15;
const WATER = { x: W / 2, y: 330, rx: 300, ry: 125 };
const inWater = (x, y) => ((x - WATER.x) / WATER.rx) ** 2 + ((y - WATER.y) / WATER.ry) ** 2 < 1;
const BANK = [{ x: 118, y: 330 }, { x: 842, y: 330 }];        // where each cat sits
const SHORE = [{ x: 205, y: 330 }, { x: 755, y: 330 }];       // where a fish ends up when it's reeled in
const FISH = [
  { n: 'Minnow', i: '🐟', p: 1, w: 34, win: 0.7, d: 0.15, s: 11 }, // (d: how hard it fights on the line, 0 to 1; s: its size)
  { n: 'Trout', i: '🐠', p: 3, w: 30, win: 0.62, d: 0.35, s: 15 },
  { n: 'Pufferfish', i: '🐡', p: 5, w: 18, win: 0.55, d: 0.5, s: 18 },
  { n: 'Old boot', i: '👢', p: 0, w: 6, win: 0.7, d: 0.05, s: 14 },
  { n: 'Lobster', i: '🦞', p: 8, w: 8, win: 0.5, d: 0.68, s: 22 },
  { n: 'Electric eel', i: '⚡', p: 10, w: 4, win: 0.45, d: 0.82, s: 26 },
  { n: 'LEGENDARY golden fish', i: '✨', p: 20, w: 0, win: 0.6, d: 0.9, s: 36 },
];
const LEGEND = FISH.length - 1;
const POND_FISH = 6, LURE = 90, SNAG = 65;       // fish in the pond, how far a bobber attracts them, how near a hooked fish a cast snags it
const RISE = 0.3, RISE_FIGHT = 0.5, RISE_RUN = 1.6, RISE_TUG = 1.15, EASE = 1.2; // the line's tension: per second while pulling; and letting go
const SLACK = 4;                                 // a fish you stop pulling on for this long gets away
const ROCK_WAIT = 7, ROCK_FLY = 0.5, ROCK_R = 85, ROCK_JOLT = 0.32;
const BANK_TIME = 1.2;
const BEHIND = 6, BOOST = 0.85;                  // the comeback boost: tension rises slower for whoever's this far behind

CA.games.add('pond', {
  name: 'Pond War', icon: '🎣',
  blurb: 'One pond, one fish at a time! Cast near a fish, hook it, and hold to reel in, letting go when it runs. Cast onto their fish for a tug of war, throw rocks, and bank your bucket before it spills. A golden fish comes at the end!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'pond', mouse: true, keys: { KeyB: 'b', KeyE: 'e' }, letters: { b: 'b', e: 'e' },
      pad: { buttons: [{ k: 'e', label: '🪨 Rock' }, { k: 'b', label: '🪣 Bank' }, { k: 'fire', label: '🎣 Cast / Reel', main: true }] },
      help: 'Aim with the mouse · click to cast, click when it dips, hold to reel (let go when it runs!) · B banks your bucket · E or right-click throws a rock',
      helpTouch: 'Touch the pond to cast · tap when it dips · hold to reel, let go when it runs · Bank your bucket!',
      note: 'Most points in ' + LENGTH + ' seconds',
      init, step, snap, bot, draw, event, lerp,
    });
  },
});

function spawnFish(s, type) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.8;
  const f = {
    t: type, x: WATER.x + Math.cos(a) * WATER.rx * r, y: WATER.y + Math.sin(a) * WATER.ry * r,
    a: Math.random() * Math.PI * 2, st: 'swim', k: 0, on: [false, false], p: 0, hx: 0, hy: 0, run: false, runK: 1, fade: 0, by: -1,
  };
  s.fish.push(f);
  return f;
}
function randomType() {
  let r = Math.random() * FISH.reduce((a, f) => a + f.w, 0);
  for (let k = 0; k < FISH.length; k++) { r -= FISH[k].w; if (r <= 0 && FISH[k].w > 0) return k; }
  return 0;
}

function init() {
  const s = {
    t: 0, fish: [], rocks: [], gold: false, ended: false,
    cats: [0, 1].map(() => ({ ph: 'idle', k: 0, bx: 0, by: 0, tx: 0, ty: 0, fish: null, ten: 0, slack: 0, bk: 0, sc: 0, got: 0, rock: 0, ax: WATER.x, ay: WATER.y, big: 0, boost: false, last: -1 })),
  };
  for (let k = 0; k < POND_FISH; k++) spawnFish(s, randomType());
  return s;
}

const worth = c => c.sc + Math.floor(c.bk / 2);
function letGoFish(s, f, except) {
  f.on = [false, false];
  f.st = 'flee';
  f.k = 1.5;
  f.x = Math.max(WATER.x - WATER.rx + 20, Math.min(WATER.x + WATER.rx - 20, f.x));
  s.cats.forEach((c, i) => { if (c.fish === f && i !== except) { c.fish = null; c.ph = 'back'; c.k = 0.5; c.ten = 0; } });
}

function step(s, inp, dt, api) {
  s.t += dt;
  if (s.t >= GOLD_AT && !s.gold) { // the legend appears, in the middle
    s.gold = true;
    const f = spawnFish(s, LEGEND);
    f.x = WATER.x; f.y = WATER.y;
    api.ev('legend', {});
  }
  s.cats[0].boost = worth(s.cats[1]) - worth(s.cats[0]) >= BEHIND;
  s.cats[1].boost = worth(s.cats[0]) - worth(s.cats[1]) >= BEHIND;
  s.cats.forEach((c, i) => stepCat(s, c, i, inp[i], dt, api));
  stepRocks(s, dt, api);
  stepFish(s, dt, api);
  api.score(worth(s.cats[0]), worth(s.cats[1]));
  if (s.t >= LENGTH && !s.ended) {
    s.ended = true;
    api.ev('rec', { big: s.cats.map(c => c.big), got: s.cats.map(c => c.got), sc: s.cats.map(worth) });
    const [a, b] = s.cats.map(worth);
    api.end(a === b ? -1 : a > b ? 0 : 1, 'TIME!');
  }
}

function stepCat(s, c, i, n, dt, api) {
  c.rock = Math.max(0, c.rock - dt);
  c.k -= dt;
  const act = n.hit.fire || n.hit.a, hold = !!(n.held.fire || n.held.a);
  // aim: the nearest spot on the water
  let ax = n.ax, ay = n.ay;
  if (!inWater(ax, ay)) {
    const a = Math.atan2((ay - WATER.y) / WATER.ry, (ax - WATER.x) / WATER.rx);
    ax = WATER.x + Math.cos(a) * WATER.rx * 0.97;
    ay = WATER.y + Math.sin(a) * WATER.ry * 0.97;
  }
  c.ax = ax;
  c.ay = ay;
  const busy = c.ph === 'reel' || c.ph === 'bank' || c.ph === 'bite';
  if ((n.hit.e || n.hit.alt) && c.rock <= 0 && !busy) { // throw a rock
    c.rock = ROCK_WAIT;
    s.rocks.push({ i, x: ax, y: ay, k: ROCK_FLY });
    api.ev('throw', { i });
  }
  if (n.hit.b && c.bk > 0 && c.ph !== 'reel' && c.ph !== 'bank') { // bank your bucket: you have to leave your line
    if (c.fish) { c.fish.st = 'flee'; c.fish.k = 1; c.fish = null; }
    c.ph = 'bank';
    c.k = BANK_TIME;
    api.ev('banking', { i });
  }
  if (c.ph === 'idle') {
    if (act) { c.ph = 'cast'; c.k = 0.4; c.tx = ax; c.ty = ay; api.ev('cast', { i }); }
  } else if (c.ph === 'cast') {
    if (c.k <= 0) {
      c.ph = 'wait';
      c.bx = c.tx;
      c.by = c.ty;
      // onto a fish the other cat is reeling in? Then you both have it.
      const f = s.fish.find(o => o.st === 'hooked' && o.on[1 - i] && !o.on[i] && Math.hypot(o.x - c.bx, o.y - c.by) < SNAG);
      if (f) {
        f.on[i] = true;
        c.fish = f;
        c.ph = 'reel';
        c.ten = 0;
        c.slack = 0;
        api.ev('snag', { x: Math.round(f.x), y: Math.round(f.y), i });
      } else api.ev('plop', { x: Math.round(c.bx), y: Math.round(c.by) });
    }
  } else if (c.ph === 'wait') {
    if (act) { c.ph = 'back'; c.k = 0.35; } // (reeled in with nothing on it)
  } else if (c.ph === 'bite') {
    if (act) {
      const f = c.fish;
      c.ph = 'reel';
      c.ten = 0;
      c.slack = 0;
      f.st = 'hooked';
      f.on[i] = true;
      f.p = 0;
      f.hx = f.x;
      f.hy = f.y;
      f.run = false;
      f.runK = 1;
      api.ev('hook', { i, x: Math.round(f.x), y: Math.round(f.y) });
    } else if (c.k <= 0) {
      if (c.fish) { c.fish.st = 'flee'; c.fish.k = 1.5; c.fish = null; }
      c.ph = 'back';
      c.k = 0.6;
      api.ev('away', { i });
    }
  } else if (c.ph === 'reel') {
    const f = c.fish;
    if (!f) { c.ph = 'idle'; return; }
    const d = FISH[f.t].d, dir = i ? 1 : -1, tug = f.on[0] && f.on[1];
    if (hold) {
      c.slack = 0;
      const rise = (f.run ? RISE_RUN : RISE + RISE_FIGHT * d) * (tug ? RISE_TUG : 1) * (c.boost ? BOOST : 1);
      c.ten += rise * dt;
      if (!f.run) f.p += dir * (0.95 - 0.5 * d) * dt;
    } else {
      c.ten = Math.max(0, c.ten - EASE * dt);
      c.slack += dt;
      if (!tug) { // (it slips back a little)
        const back = 0.15 * dt;
        f.p = i ? Math.max(0, f.p - back) : Math.min(0, f.p + back);
      }
    }
    if (c.ten >= 1) { // the line snaps: you lose the fish, and half your bucket spills
      const spill = Math.ceil(c.bk / 2);
      c.bk -= spill;
      f.on[i] = false;
      c.fish = null;
      c.ph = 'snapped';
      c.k = 1.2;
      c.ten = 0;
      api.ev('snap', { i, spill });
      if (!f.on[1 - i]) letGoFish(s, f, i);
      return;
    }
    if (c.slack >= SLACK && !tug) {
      f.on[i] = false;
      c.fish = null;
      c.ph = 'back';
      c.k = 0.6;
      c.ten = 0;
      letGoFish(s, f, i);
      api.ev('away', { i });
      return;
    }
    if (f.p * dir >= 1) { // caught!
      const info = FISH[f.t];
      c.bk += info.p;
      c.got++;
      c.big = Math.max(c.big, info.p);
      c.last = f.t;
      c.ph = 'caught';
      c.k = 1;
      c.ten = 0;
      c.fish = null;
      s.fish = s.fish.filter(o => o !== f);
      if (f.on[1 - i]) { // the other cat loses the tug of war
        const o = s.cats[1 - i];
        o.fish = null;
        o.ph = 'back';
        o.k = 0.8;
        o.ten = 0;
      }
      api.ev('caught', { i, t: f.t, x: SHORE[i].x, y: SHORE[i].y, tug: tug ? 1 : 0 });
    }
  } else if (c.ph === 'bank') {
    if (c.k <= 0) {
      c.sc += c.bk;
      api.ev('banked', { i, n: c.bk });
      c.bk = 0;
      c.ph = 'idle';
    }
  } else if (c.k <= 0) c.ph = 'idle'; // (after a catch, a miss, or a snapped line)
}

function stepRocks(s, dt, api) {
  s.rocks = s.rocks.filter(r => {
    r.k -= dt;
    if (r.k > 0) return true;
    api.ev('splash', { x: Math.round(r.x), y: Math.round(r.y) });
    for (const f of s.fish) {
      if (Math.hypot(f.x - r.x, f.y - r.y) > ROCK_R) continue;
      if (f.st === 'swim' || f.st === 'come') { f.st = 'flee'; f.k = 1.2; f.a = Math.atan2(f.y - r.y, f.x - r.x); }
      if (f.st === 'hooked') {
        f.run = true;
        f.runK = 0.5;
      }
    }
    const o = s.cats[1 - r.i];
    if (o.ph === 'reel' && o.fish && Math.hypot(o.fish.x - r.x, o.fish.y - r.y) < ROCK_R) { o.ten = Math.min(0.97, o.ten + ROCK_JOLT); api.ev('jolt', { i: 1 - r.i }); }
    else if ((o.ph === 'wait' || o.ph === 'bite') && Math.hypot(o.bx - r.x, o.by - r.y) < ROCK_R * 0.7) {
      if (o.fish) { o.fish.st = 'flee'; o.fish.k = 1.2; o.fish = null; }
      o.ph = 'back';
      o.k = 0.8;
      api.ev('ruined', { i: 1 - r.i });
    }
    return false;
  });
}

function stepFish(s, dt, api) {
  const swimming = s.fish.filter(f => f.t !== LEGEND || f.st !== 'gone');
  if (swimming.filter(f => f.t !== LEGEND).length < POND_FISH && Math.random() < dt * 0.9) { const f = spawnFish(s, randomType()); f.fade = 1; }
  s.fish.forEach(f => {
    f.fade = Math.max(0, f.fade - dt);
    const info = FISH[f.t];
    if (f.st === 'hooked') {
      // it's pulled towards whoever's winning; it runs now and then
      const side = f.p < 0 ? SHORE[0] : SHORE[1], k = Math.min(1, Math.abs(f.p));
      f.x = f.hx + (side.x - f.hx) * k;
      f.y = f.hy + (side.y - f.hy) * k;
      f.runK -= dt;
      if (f.runK <= 0) {
        f.run = !f.run;
        f.runK = f.run ? 0.35 + 0.45 * info.d : Math.max(0.6, 1.5 - 0.8 * info.d) + Math.random() * 0.6;
      }
      if (f.t === LEGEND) f.p *= 1 - 0.05 * dt; // (it fights back all the time)
      if (!f.on[0] && !f.on[1]) letGoFish(s, f, -1);
      return;
    }
    if (f.st === 'bite') {
      const c = s.cats[f.by];
      if (!c || c.fish !== f || c.ph !== 'bite') { f.st = 'flee'; f.k = 1; }
      return;
    }
    if (f.st === 'flee') {
      f.k -= dt;
      if (f.k <= 0) f.st = 'swim';
    }
    if (f.st === 'swim') { // a bobber nearby? It comes for a look.
      let best = LURE + info.s, who = -1;
      s.cats.forEach((c, i) => {
        if (c.ph !== 'wait') return;
        const d = Math.hypot(c.bx - f.x, c.by - f.y);
        if (d < best) { best = d; who = i; }
      });
      if (who >= 0) { f.st = 'come'; f.by = who; }
      else f.a += (Math.random() - 0.5) * 3 * dt;
    }
    let sp = (f.st === 'flee' ? 110 : 32) * (1 + info.d * 0.5);
    if (f.st === 'come') {
      const c = s.cats[f.by];
      if (c.ph !== 'wait') { f.st = 'swim'; }
      else {
        f.a = Math.atan2(c.by - f.y, c.bx - f.x);
        sp = 62;
        if (Math.hypot(c.bx - f.x, c.by - f.y) < 10) { // a bite!
          f.st = 'bite';
          c.ph = 'bite';
          c.k = info.win;
          c.fish = f;
          api.ev('bite', { i: f.by });
          return;
        }
      }
    }
    const nx = f.x + Math.cos(f.a) * sp * dt, ny = f.y + Math.sin(f.a) * sp * dt;
    if (inWater(nx, ny)) { f.x = nx; f.y = ny; }
    else f.a = Math.atan2(WATER.y - f.y, WATER.x - f.x) + (Math.random() - 0.5);
  });
}

const r0 = v => Math.round(v);
function snap(s) {
  return {
    t: Math.round(s.t * 10) / 10,
    f: s.fish.map(f => [f.t, r0(f.x), r0(f.y), Math.round(f.a * 10) / 10, f.st === 'hooked' ? 1 : f.st === 'bite' ? 2 : 0, f.run ? 1 : 0, f.runK < 0.3 && !f.run ? 1 : 0, f.on[0] && f.on[1] ? 1 : 0, Math.round(f.p * 100) / 100, f.fade > 0 ? 1 : 0]),
    r: s.rocks.map(r => [r0(r.x), r0(r.y), Math.round(r.k * 100) / 100, r.i]),
    c: s.cats.map(c => ({ ph: c.ph, k: Math.round(Math.max(0, c.k) * 100) / 100, bx: r0(c.ph === 'cast' ? c.tx : c.bx), by: r0(c.ph === 'cast' ? c.ty : c.by), fx: c.fish ? r0(c.fish.x) : -1, fy: c.fish ? r0(c.fish.y) : -1, ten: Math.round(c.ten * 100) / 100, bk: c.bk, sc: c.sc, got: c.got, rk: Math.round(c.rock), ax: r0(c.ax), ay: r0(c.ay), cb: c.boost ? 1 : 0, l: c.last })),
  };
}
function lerp(a, b, f) {
  return Object.assign({}, b, {
    c: b.c.map((q, i) => { const o = a.c[i]; return Object.assign({}, q, { ten: o.ten + (q.ten - o.ten) * f, fx: q.fx >= 0 && o.fx >= 0 ? o.fx + (q.fx - o.fx) * f : q.fx, fy: q.fy >= 0 && o.fy >= 0 ? o.fy + (q.fy - o.fy) * f : q.fy }); }),
    f: b.f.map((q, k) => { const o = a.f[k]; if (!o || o[0] !== q[0] || Math.abs(o[1] - q[1]) > 60) return q; const r = q.slice(); r[1] = o[1] + (q[1] - o[1]) * f; r[2] = o[2] + (q[2] - o[2]) * f; return r; }),
  });
}

// The bot looks for the best fish it can reach, casts near it (better bots cast closer, and go for bigger fish), and reels
// in, letting go when the line gets tight or the fish runs. Good bots bank in time, snag your big fish and throw rocks.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.bs || (s.bs = {});
  const b = st[i] || (st[i] = { wait: 0.6, react: -1, hold: false, tx: WATER.x, ty: WATER.y, think: 0 });
  const out = { ax: b.tx, ay: b.ty, held: {}, hit: {} };
  b.wait -= dt;
  const skill = api.skill, gauss = CA.games.kit.gauss;
  const shouldBank = c.bk > 0 && (s.t > LENGTH - 5 - 5 * skill || c.bk >= 16 - 6 * skill);
  if ((c.ph === 'idle' || c.ph === 'wait') && shouldBank && b.wait <= 0) { out.hit.b = true; b.wait = 0.5; return out; }
  if (c.ph === 'idle' && b.wait <= 0) {
    // a fish the other cat has on the line, big enough to fight for?
    const theirs = s.fish.find(f => f.st === 'hooked' && f.on[1 - i] && !f.on[i] && FISH[f.t].p >= 5);
    if (theirs && Math.random() < 0.3 * skill) { b.tx = theirs.x; b.ty = theirs.y; }
    else {
      let best = -1e9, target = null;
      for (const f of s.fish) {
        if (f.st !== 'swim') continue;
        const score = FISH[f.t].p * (0.3 + skill) + (Math.random() - 0.5) * 6 * (1 - skill);
        if (score > best) { best = score; target = f; }
      }
      if (target) { b.tx = target.x + gauss(0, 10 + (1 - skill) * 40); b.ty = target.y + gauss(0, 10 + (1 - skill) * 40); }
    }
    out.ax = b.tx;
    out.ay = b.ty;
    out.hit.fire = true;
    b.wait = 0.3 + Math.random() * 0.5;
    b.waited = 0;
  }
  if (c.ph === 'wait') { // nothing coming? Reel in and try again.
    b.waited = (b.waited || 0) + dt;
    if (b.waited > 3.5) { out.hit.fire = true; b.waited = 0; b.wait = 0.3; }
    // a rock at their waiting bobber now and then
    if (o.ph === 'wait' && c.rock <= 0 && Math.random() < dt * 0.3 * skill) { out.ax = o.bx; out.ay = o.by; out.hit.e = true; }
  }
  if (c.ph === 'bite') {
    if (b.react < 0) b.react = Math.max(0.16, gauss(0.45 - 0.22 * skill, 0.09));
    b.react -= dt;
    if (b.react <= 0) { out.hit.fire = true; b.react = -1; }
  } else b.react = -1;
  if (c.ph === 'reel' && c.fish) {
    const careful = 0.45 + 0.4 * skill;
    const sees = c.fish.run && Math.random() < 0.6 + 0.4 * skill;
    if (sees || c.ten > careful) b.hold = false;
    else if (c.ten < careful * 0.45) b.hold = true;
    if (b.hold) out.held.fire = true;
  }
  return out;
}

function event(v, e) {
  const mine = e.i === v.me;
  if (e.type === 'cast' && mine) v.sound([[500, 0, 0.05], [700, 0.05, 0.05]]);
  if (e.type === 'plop') { v.ring(e.x, e.y, '#ffffff', 6); v.sound([[220, 0, 0.08]]); }
  if (e.type === 'bite' && mine) v.sound([[880, 0, 0.06], [880, 0.09, 0.06]]);
  if (e.type === 'hook' && mine) v.sound([[660, 0, 0.05], [990, 0.05, 0.06]]);
  if (e.type === 'away' && mine) v.sound('miss');
  if (e.type === 'snag') { v.ring(e.x, e.y, '#ffd23f', 18); v.pop(e.x, e.y - 34, '⚔️ TUG OF WAR!', '#ffd23f'); v.shake(5); v.sound('notify'); }
  if (e.type === 'snap') {
    v.pop(BANK[e.i].x, BANK[e.i].y - 110, '💥 SNAP!' + (e.spill ? ' -' + e.spill : ''), '#ff5a5a');
    if (mine) { v.shake(7); v.sound('miss'); }
  }
  if (e.type === 'caught') {
    const f = FISH[e.t];
    v.burst(e.x, e.y, '#ffd23f', e.t === LEGEND ? 40 : 12, 240);
    v.pop(e.x, e.y - 50, (e.tug ? '🏆 ' : '') + f.i + ' ' + f.n + (f.p ? ' +' + f.p : ' (no points!)'), f.p ? '#ffd23f' : '#cccccc');
    if (e.t === LEGEND) v.shake(12);
    v.sound(mine ? (f.p ? 'point' : 'draw') : 'miss');
  }
  if (e.type === 'banked') { v.pop(BANK[e.i].x, BANK[e.i].y - 110, '🪣 Banked +' + e.n, '#7dff8a'); if (mine) v.sound('point'); }
  if (e.type === 'banking' && mine) v.sound([[420, 0, 0.05]]);
  if (e.type === 'throw' && mine) v.sound([[400, 0, 0.04]]);
  if (e.type === 'splash') { v.burst(e.x, e.y, '#bfe9ff', 16, 220); v.ring(e.x, e.y, '#ffffff', 24); v.sound([[160, 0, 0.1]]); }
  if (e.type === 'jolt') v.pop(BANK[e.i].x, BANK[e.i].y - 110, '🪨 Jolted!', '#ff9a9a');
  if (e.type === 'ruined') { v.pop(BANK[e.i].x, BANK[e.i].y - 110, '🪨 Cast ruined!', '#ff9a9a'); if (mine) v.sound('miss'); }
  if (e.type === 'legend') { v.note('✨ The LEGENDARY golden fish has appeared!'); v.ring(WATER.x, WATER.y, '#ffd23f', 40); v.shake(6); v.sound('notify'); }
  if (e.type === 'rec') { v.record('big', 'Biggest fish (points)', e.big[v.me]); v.record('got', 'Most fish in a game', e.got[v.me]); v.record('sc', 'Best Pond War score', e.sc[v.me]); }
}

let scene = null;
function makeScene() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  const sky = b.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#8fd3ff');
  sky.addColorStop(1, '#d9f3ff');
  b.fillStyle = sky;
  b.fillRect(0, 0, W, 200);
  b.fillStyle = '#7ab86a';
  b.beginPath(); b.moveTo(0, 200); for (let x = 0; x <= W; x += 40) b.lineTo(x, 175 + Math.sin(x * 0.01) * 20); b.lineTo(W, 200); b.fill();
  b.fillStyle = '#6aaf58';
  b.fillRect(0, 195, W, H - 195);
  const water = b.createRadialGradient(W / 2, 330, 40, W / 2, 330, 330);
  water.addColorStop(0, '#4fb6e8');
  water.addColorStop(1, '#2a7bb8');
  b.fillStyle = '#4a8a3c';
  b.beginPath(); b.ellipse(W / 2, 335, WATER.rx + 15, WATER.ry + 12, 0, 0, Math.PI * 2); b.fill();
  b.fillStyle = water;
  b.beginPath(); b.ellipse(W / 2, 330, WATER.rx, WATER.ry, 0, 0, Math.PI * 2); b.fill();
  b.fillStyle = 'rgba(255, 255, 255, .28)';
  for (let k = 0; k < 12; k++) b.fillRect(260 + k * 37, 280 + (k % 3) * 40, 18, 2);
  return c;
}

function drawFish(v, f) {
  const g = v.g, [t, x, y, a, st, run, warn, tug, , fade] = f, info = FISH[t];
  const wob = st ? Math.sin(v.now / 40) * 3 : 0, size = info.s;
  g.save();
  g.translate(x + wob, y + (run ? Math.sin(v.now / 30) * 4 : 0));
  g.rotate(a);
  g.globalAlpha = fade ? 0.35 : 1;
  if (t === LEGEND) { // it glows
    g.fillStyle = 'rgba(255, 210, 63, ' + (0.3 + 0.2 * Math.sin(v.now / 120)) + ')';
    v.dot(0, 0, size * 1.6);
  }
  g.fillStyle = t === LEGEND ? '#ffc21a' : 'rgba(8, 40, 74, .62)';
  g.beginPath(); g.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2); g.fill();
  const tail = Math.sin(v.now / 90 + x) * 0.3;
  g.beginPath(); g.moveTo(-size * 0.8, 0); g.lineTo(-size * 1.4, -size * 0.4 + tail * size); g.lineTo(-size * 1.4, size * 0.4 + tail * size); g.closePath(); g.fill();
  g.restore();
  g.globalAlpha = 1;
  if (st === 1) v.label(info.i, x + wob, y - 4, Math.min(34, 16 + size * 0.7), '#ffffff'); // (on the line: you can see what it is)
  if (warn && st === 1) v.label('💨', x, y - 28, 16, '#ffffff');
  if (run && st === 1) { v.label('LET GO!', x, y - 30, 15, '#ff5a5a'); }
  if (tug) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, size + 8, 0, Math.PI * 2); g.stroke(); }
}

function draw(v, s) {
  const g = v.g;
  if (!scene) scene = makeScene();
  g.drawImage(scene, 0, 0, W, H);
  (s.f || []).forEach(f => drawFish(v, f));
  s.c.forEach((p, i) => {
    const bank = BANK[i], side = i ? -1 : 1;
    if (p.ph !== 'bank') v.catSide(i, bank.x, bank.y + 40, 0.9, { lookRight: i === 0 });
    else v.catSide(i, bank.x + side * -28, bank.y + 54, 0.9, { lookRight: i !== 0 });
    v.label(i === v.me ? 'You' : v.names[i], bank.x, bank.y + 60, 13, i === v.me ? '#ffd23f' : '#ffffff');
    const tipX = bank.x + side * 85, tipY = bank.y - 80;
    g.strokeStyle = '#6b3d1c'; // the rod
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(bank.x + side * 18, bank.y - 10); g.lineTo(tipX, tipY); g.stroke();
    // the line: tighter is redder
    let lx = -1, ly = -1, dip = 0;
    if (p.ph === 'reel' && p.fx >= 0) { lx = p.fx; ly = p.fy; }
    else if (p.ph === 'wait' || p.ph === 'bite') { lx = p.bx; ly = p.by; dip = p.ph === 'bite' ? 6 + Math.sin(v.now / 40) * 3 : Math.sin(v.now / 300 + i) * 2; }
    else if (p.ph === 'cast') { const f = 1 - p.k / 0.4; lx = tipX + (p.bx - tipX) * f; ly = tipY + (p.by - tipY) * f - Math.sin(f * Math.PI) * 80; }
    if (lx >= 0) {
      const t = p.ph === 'reel' ? p.ten : 0;
      g.strokeStyle = t > 0.7 ? 'rgba(255, 70, 70, .95)' : t > 0.4 ? 'rgba(255, 210, 90, .9)' : 'rgba(255, 255, 255, .8)';
      g.lineWidth = 1.2 + t;
      g.beginPath(); g.moveTo(tipX, tipY);
      if (p.ph === 'reel') g.lineTo(lx, ly); else g.quadraticCurveTo((tipX + lx) / 2, Math.max(tipY, ly) + 30, lx, ly + dip);
      g.stroke();
      if (p.ph !== 'reel') {
        if (p.ph === 'bite') { g.strokeStyle = 'rgba(255, 255, 255, .8)'; g.lineWidth = 2; for (let k = 0; k < 2; k++) { g.beginPath(); g.ellipse(lx, ly + 4, 12 + ((v.now / 6 + k * 15) % 30), 5 + ((v.now / 12 + k * 7) % 12), 0, 0, Math.PI * 2); g.stroke(); } }
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(lx, ly + dip, 7, 0, Math.PI); g.fill();
        g.fillStyle = i ? '#ff8a1f' : '#2f7bff';
        g.beginPath(); g.arc(lx, ly + dip, 7, Math.PI, Math.PI * 2); g.fill();
        if (p.ph === 'bite') v.label('!', lx, ly - 26, 34, '#ffd23f');
      }
    }
    if (p.ph === 'reel') { // the tension meter, by the cat
      const mx = bank.x - 40, my = bank.y + 74;
      g.fillStyle = 'rgba(10, 30, 50, .85)';
      v.roundRect(mx, my, 80, 12, 6); g.fill();
      g.fillStyle = p.ten > 0.7 ? '#ff5a5a' : p.ten > 0.4 ? '#ffd23f' : '#7dff8a';
      v.roundRect(mx + 2, my + 2, Math.max(4, 76 * Math.min(1, p.ten)), 8, 4); g.fill();
    }
    if (p.ph === 'bank') v.label('🪣 Banking…', bank.x, bank.y - 96, 14, '#ffffff');
    if (p.ph === 'snapped') v.label('Line snapped!', bank.x, bank.y - 96, 14, '#ff9a9a');
    // the scoreboard (between the camera walls in the top corners)
    const x = i ? W - 300 : 300;
    g.fillStyle = 'rgba(20, 30, 50, .78)';
    v.roundRect(x - 120, 16, 240, 56, 14); g.fill();
    v.label((i === v.me ? 'You' : v.names[i]) + ': ' + p.sc + ' banked', x, 33, 16, v.team[i].light);
    v.label('🪣 ' + p.bk + (p.bk ? ' (' + Math.floor(p.bk / 2) + ' if not banked)' : '') + (p.rk > 0 ? '  🪨 ' + p.rk + 's' : '  🪨'), x, 56, 12, p.bk >= 10 ? '#ffd23f' : '#ffffff');
    if (p.cb) v.label('🔥', x - 108, 33, 14, '#000000');
  });
  (s.r || []).forEach(([x, y, k, i]) => { // rocks in the air
    const bank = BANK[i], f = 1 - k / ROCK_FLY, rx = bank.x + (x - bank.x) * f, ry = bank.y - 40 + (y - bank.y + 40) * f - Math.sin(f * Math.PI) * 90;
    g.fillStyle = '#6b6b78';
    v.dot(rx, ry, 8);
  });
  const left = Math.max(0, Math.ceil(LENGTH - s.t));
  v.label('⏱ ' + left, W / 2, 40, left <= 15 ? 26 : 22, left <= 15 ? '#ff5a5a' : '#ffffff');
  const me = s.c[v.me];
  if (me.ph === 'idle' || me.ph === 'wait') { // where you're aiming
    g.strokeStyle = 'rgba(255, 255, 255, .7)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(me.ax, me.ay, 12, 0, Math.PI * 2); g.moveTo(me.ax - 16, me.ay); g.lineTo(me.ax + 16, me.ay); g.moveTo(me.ax, me.ay - 16); g.lineTo(me.ax, me.ay + 16); g.stroke();
  }
  if (me.ph === 'bite') v.msg('NOW! Click to hook it!', true);
  else if (me.ph === 'reel') {
    const mine = (s.f || []).find(f => Math.abs(f[1] - me.fx) < 3 && Math.abs(f[2] - me.fy) < 3);
    v.msg(mine && mine[5] ? 'It\'s running! Let go or the line snaps!' : me.ten > 0.7 ? 'The line is about to snap! Let go!' : 'Hold to reel it in · let go when it runs', !!(mine && mine[5]) || me.ten > 0.7);
  }
  else if (me.ph === 'wait') v.msg('Wait for it… click when the bobber dips · click now to reel back in');
  else if (me.ph === 'idle') v.msg(me.bk >= 8 ? 'Press B to bank your bucket before it spills!' : 'Click near a fish to cast · E or right-click throws a rock', me.bk >= 8 && left <= 15);
}

})();
