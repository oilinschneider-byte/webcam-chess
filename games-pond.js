/* Classic Games: Pond Duel. Two cats fish on opposite banks of a pond. Click to cast, then click the moment your
   bobber dips to hook the fish (too early and you have to cast again; too late and it gets away). Then reel it in:
   the fish swims up and down the reel bar, and you move a green zone with W/S (or the arrows, or the mouse) to keep
   the fish in the green until the catch meter is full. Bigger fish dart about faster and are worth more. Most points
   in 75 seconds. Each app runs its own fishing, so a click counts the moment you make it, and both players get
   exactly the same fish, in the same order, with the same waits and the same moves (from the match's seed): nobody
   wins just by having a faster connection. The host's app keeps the official score (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const LENGTH = 75;
// Reeling in: the fish swims up and down the reel bar (0 at the bottom, 1 at the top), and you keep the green zone
// on it: W/S or the up and down arrows move the zone, or it follows the mouse up and down the bar (only so fast, so a
// darting fish can still slip out). Keep the fish inside it to fill the catch meter; empty, it gets away.
const ZONE = 0.36, ZONE_SPEED = 1.7, FILL = 0.42, START = 0.35;
const REEL = { top: 140, h: 310, w: 40 };       // where the reel bars go (each player's beside their bobber)
const reelX = i => (i ? 642 : 278);
const FISH = [
  { n: 'Minnow', i: '🐟', p: 1, w: 34, win: 0.62, d: 0.25 }, // (d: how hard it fights on the line, 0 to 1)
  { n: 'Trout', i: '🐠', p: 3, w: 28, win: 0.55, d: 0.45 },
  { n: 'Pufferfish', i: '🐡', p: 5, w: 16, win: 0.5, d: 0.6 },
  { n: 'Old boot', i: '👢', p: 0, w: 9, win: 0.6, d: 0.05 },
  { n: 'Lobster', i: '🦞', p: 8, w: 9, win: 0.45, d: 0.78 },
  { n: 'Golden fish', i: '✨', p: 15, w: 4, win: 0.38, d: 0.95 },
];
const BANK = [{ x: 150, y: 330 }, { x: 810, y: 330 }];        // where each cat sits
const SPOT = [{ x: 380, y: 300 }, { x: 580, y: 300 }];        // where each bobber lands

// The same "random" numbers for both players: the wait and the fish for cast number n.
function hash(seed, n, k) {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
function fishFor(seed, n) {
  let r = hash(seed, n, 1) * FISH.reduce((a, f) => a + f.w, 0);
  for (let k = 0; k < FISH.length; k++) { r -= FISH[k].w; if (r <= 0) return k; }
  return 0;
}

CA.games.add('pond', {
  name: 'Pond Duel', icon: '🎣',
  blurb: 'Click to cast, click the moment your bobber dips, then reel it in: move the green bar with W/S, the arrows or the mouse to keep the fish inside it until the meter fills. Bigger fish fight harder and are worth more. Most points in 75 seconds.',
  start(ctx) {
    const seed = Math.floor(ctx.rng() * 4294967296) >>> 0;
    const sound = CA.games.kit.sound;
    CA.duel.run(ctx, {
      id: 'pond', mode: 'own', mouse: true,
      pad: { buttons: [{ k: 'a', label: '🎣 Cast / Reel', main: true }] },
      help: 'Click (or Space) to cast · click when the bobber dips · then keep the fish in the green bar with W/S, the arrows or the mouse',
      helpTouch: 'Tap Cast, tap when the bobber dips, then drag up and down to keep the fish in the green bar',
      note: 'Most points in ' + LENGTH + ' seconds',
      initMine(api, i) { return { i, t: 0, ph: 'idle', k: 0, n: 0, sc: 0, got: 0, last: -1, fish: 0, bot: { wait: 0.6 } }; },
      stepMine(p, inp, dt, api) {
        p.t += dt;
        if (p.t >= LENGTH) { p.ph = 'done'; return; }
        const act = inp.hit.fire || inp.hit.a;
        const me = api.self;
        p.k -= dt;
        if (p.ph === 'idle') {
          if (act) { p.ph = 'cast'; p.k = 0.5; p.n++; if (me) sound([[500, 0, 0.05], [700, 0.05, 0.05]]); }
        } else if (p.ph === 'cast') {
          if (p.k <= 0) { p.ph = 'wait'; p.k = 1.4 + hash(seed, p.n, 2) * 3.8; p.fish = fishFor(seed, p.n); if (me) sound([[220, 0, 0.08]]); }
        } else if (p.ph === 'wait') {
          if (act) { p.ph = 'early'; p.k = 1.1; if (me) sound('miss'); }
          else if (p.k <= 0) { p.ph = 'bite'; p.k = FISH[p.fish].win; if (me) sound([[880, 0, 0.06], [880, 0.09, 0.06]]); }
        } else if (p.ph === 'bite') {
          if (act) { p.ph = 'reel'; Object.assign(p, { z: 0.3, fy: 0.5, m: START, rk: 0, rt: 0 }); if (me) sound([[660, 0, 0.05], [990, 0.05, 0.06]]); }
          else if (p.k <= 0) { p.ph = 'away'; p.k = 1; if (me) sound('miss'); }
        } else if (p.ph === 'reel') {
          const d = FISH[p.fish].d;
          // the fish darts to a new spot now and then (the same spots for both players), faster for a bigger fish
          p.rt -= dt;
          if (p.rt <= 0) { p.rk++; p.rt = 1 - d * 0.6; p.ft = 0.08 + 0.84 * hash(seed, p.n, 20 + p.rk); }
          const sp = (0.3 + d * 1.2) * dt;
          p.fy += Math.max(-sp, Math.min(sp, p.ft - p.fy));
          // the green zone: W/S or the arrows move it, or it follows the mouse up and down the bar (the bot says where it wants it)
          const keys = -(inp.my || 0);
          if (keys) p.mouse = false;
          if (inp.ay !== undefined && inp.ay !== p.lay) { if (p.lay !== undefined) p.mouse = true; p.lay = inp.ay; }
          const want = keys ? p.z + keys : p.mouse ? (REEL.top + REEL.h - inp.ay) / REEL.h : inp.want != null ? inp.want : p.z;
          p.z += Math.max(-ZONE_SPEED * dt, Math.min(ZONE_SPEED * dt, want - p.z));
          p.z = Math.max(ZONE / 2, Math.min(1 - ZONE / 2, p.z));
          p.m += Math.abs(p.fy - p.z) < ZONE / 2 ? FILL * dt : -(0.28 + 0.22 * d) * dt;
          if (p.m >= 1) { p.ph = 'caught'; p.k = 1.3; p.sc += FISH[p.fish].p; p.got++; p.last = p.fish; if (me) sound(FISH[p.fish].p ? 'point' : 'draw'); }
          else if (p.m <= 0) { p.ph = 'away'; p.k = 1; if (me) sound('miss'); }
        } else if (p.k <= 0) p.ph = 'idle'; // (after a catch, a miss, or casting too early)
      },
      snapMine(p) {
        const r = v => Math.round(v * 1000) / 1000;
        return { ph: p.ph, k: Math.round(Math.max(0, p.k) * 100) / 100, sc: p.sc, got: p.got, last: p.last, f: p.fish, t: Math.round(p.t * 10) / 10,
          z: r(p.z || 0), fy: r(p.fy || 0), m: r(p.m || 0) };
      },
      referee(sn, api) {
        api.score(sn[0].sc, sn[1].sc);
        if (api.t >= LENGTH + 0.3) api.end(sn[0].sc === sn[1].sc ? -1 : sn[0].sc > sn[1].sc ? 0 : 1, 'TIME!');
      },
      bot(p, i, dt, api) {
        const b = p.bot, out = { hit: {} };
        b.wait -= dt;
        if (p.ph === 'idle' && b.wait <= 0) { out.hit.a = true; b.wait = 0.3 + Math.random() * 0.7; }
        if (p.ph === 'wait' && b.early === undefined) b.early = Math.random() < 0.12 * (1 - api.skill) ? 0.4 + Math.random() : -1;
        if (p.ph === 'wait' && b.early > 0 && (b.early -= dt) <= 0) out.hit.a = true;
        if (p.ph === 'bite') {
          if (b.react === undefined) b.react = Math.max(0.16, CA.games.kit.gauss(0.5 - 0.26 * api.skill, 0.1));
          if ((b.react -= dt) <= 0) out.hit.a = true;
        }
        if (p.ph !== 'bite') b.react = undefined;
        if (p.ph !== 'wait') b.early = undefined;
        if (p.ph === 'reel') { // keep the zone on the fish: it looks a little ahead, and slips more if it's easy
          b.look = (b.look || 0) - dt;
          if (b.look <= 0) { b.look = 0.06 + (1 - api.skill) * 0.18; b.aim = p.fy + CA.games.kit.gauss(0, 0.04 + (1 - api.skill) * 0.12); }
          out.want = b.aim;
        }
        return out;
      },
      draw,
    });
  },
});

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
  b.beginPath(); b.ellipse(W / 2, 335, 330, 150, 0, 0, Math.PI * 2); b.fill();
  b.fillStyle = water;
  b.beginPath(); b.ellipse(W / 2, 330, 315, 138, 0, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#3f9a4a'; // lily pads
  [[300, 380, 16], [640, 250, 14], [690, 400, 18], [470, 420, 12]].forEach(([x, y, r]) => { b.beginPath(); b.arc(x, y, r, 0.3, Math.PI * 2); b.lineTo(x, y); b.fill(); });
  b.fillStyle = '#ff9ed2';
  b.beginPath(); b.arc(694, 396, 5, 0, Math.PI * 2); b.fill();
  b.fillStyle = 'rgba(255, 255, 255, .35)';
  for (let k = 0; k < 12; k++) b.fillRect(260 + k * 37, 280 + (k % 3) * 40, 18, 2);
  return c;
}

function draw(v, mine, theirs) {
  const g = v.g;
  if (!scene) scene = makeScene();
  g.drawImage(scene, 0, 0, W, H);
  const ps = [];
  ps[v.me] = mine;
  ps[v.them] = theirs;
  ps.forEach((p, i) => {
    const bank = BANK[i], spot = SPOT[i], side = i ? -1 : 1;
    v.catSide(i, bank.x, bank.y + 40, 0.9, { lookRight: i === 0 });
    v.label(i === v.me ? 'You' : v.names[i], bank.x, bank.y + 60, 13, i === v.me ? '#ffd23f' : '#ffffff');
    const tipX = bank.x + side * 95, tipY = bank.y - 90;
    g.strokeStyle = '#6b3d1c'; // the rod
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(bank.x + side * 18, bank.y - 10); g.lineTo(tipX, tipY); g.stroke();
    if (!p) return;
    let bx = spot.x, by = spot.y, show = true;
    if (p.ph === 'idle' || p.ph === 'early' || p.ph === 'done') show = false;
    if (p.ph === 'reel') by += Math.sin(v.now / 50) * 4; // (tugging)
    if (p.ph === 'cast') { const f = 1 - p.k / 0.5; bx = tipX + (spot.x - tipX) * f; by = tipY + (spot.y - tipY) * f - Math.sin(f * Math.PI) * 80; }
    const bite = p.ph === 'bite';
    if (bite) by += 6 + Math.sin(v.now / 40) * 3;
    else if (p.ph === 'wait') by += Math.sin(v.now / 300 + i) * 2;
    g.strokeStyle = 'rgba(255, 255, 255, .8)';
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(tipX, tipY);
    if (show) g.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + 30, bx, by); else g.lineTo(tipX, tipY + 60);
    g.stroke();
    if (show && p.ph !== 'caught' && p.ph !== 'away') {
      if (bite) { g.strokeStyle = 'rgba(255, 255, 255, .8)'; g.lineWidth = 2; for (let k = 0; k < 2; k++) { g.beginPath(); g.ellipse(bx, by + 4, 12 + ((v.now / 6 + k * 15) % 30), 5 + ((v.now / 12 + k * 7) % 12), 0, 0, Math.PI * 2); g.stroke(); } }
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(bx, by, 7, 0, Math.PI); g.fill();
      g.fillStyle = '#ff3b3b';
      g.beginPath(); g.arc(bx, by, 7, Math.PI, Math.PI * 2); g.fill();
      if (bite) v.label('!', bx, by - 26, 34, '#ffd23f');
    }
    if (p.ph === 'caught' && p.last >= 0) {
      const f = FISH[p.last], up = (1.3 - p.k) * 60;
      v.label(f.i, spot.x, spot.y - 20 - up, 40, '#ffffff');
      v.label(f.n + (f.p ? ' +' + f.p : ' (no points!)'), spot.x, spot.y - 60 - up, 16, f.p ? '#ffd23f' : '#cccccc');
    }
    if (p.ph === 'reel') { // the reel bar: the fish, the green zone, and the catch meter beside them
      const rx = reelX(i), top = REEL.top, h = REEL.h, bw = REEL.w, y = f => top + h - f * h;
      g.fillStyle = 'rgba(10, 30, 50, .82)';
      v.roundRect(rx, top - 6, bw, h + 12, 12); g.fill();
      g.fillStyle = 'rgba(80, 230, 120, .55)';
      v.roundRect(rx + 4, y(p.z + ZONE / 2), bw - 8, ZONE * h, 8); g.fill();
      g.strokeStyle = '#7dff8a'; g.lineWidth = 2;
      v.roundRect(rx + 4, y(p.z + ZONE / 2), bw - 8, ZONE * h, 8); g.stroke();
      v.label(FISH[p.f].i, rx + bw / 2, y(p.fy), 28, '#ffffff');
      const mx = i ? rx + bw + 6 : rx - 16;
      g.fillStyle = 'rgba(10, 30, 50, .82)';
      v.roundRect(mx, top - 6, 10, h + 12, 5); g.fill();
      g.fillStyle = p.m > 0.3 ? '#ffd23f' : '#ff5a5a';
      v.roundRect(mx + 2, top + h - p.m * h, 6, Math.max(4, p.m * h), 3); g.fill();
    }
    if (p.ph === 'away') v.label('It got away!', spot.x, spot.y - 40, 16, '#ff9a9a');
    if (p.ph === 'early') v.label('Too early! Cast again', spot.x, spot.y - 30, 16, '#ff9a9a');
    const x = i ? W - 300 : 300; // (between the camera walls in the top corners)
    g.fillStyle = 'rgba(20, 30, 50, .75)';
    v.roundRect(x - 120, 18, 240, 52, 14); g.fill();
    v.label((i === v.me ? 'You' : v.names[i]) + ': ' + p.sc + ' pts', x, 36, 17, v.team[i].light);
    v.label('🐟 × ' + p.got, x, 58, 13, '#ffffff');
  });
  const left = Math.max(0, LENGTH - (mine ? mine.t : 0));
  v.label('⏱ ' + Math.ceil(left), W / 2, 40, 22, '#ffffff');
  if (mine) {
    if (mine.ph === 'bite') v.msg('NOW! Click to hook it!', true);
    else if (mine.ph === 'reel') v.msg('Move the green bar with W/S, the arrows or the mouse · keep the fish inside it until the meter is full!');
    else if (mine.ph === 'wait') v.msg('Wait for it… click the moment the bobber dips');
    else if (mine.ph === 'idle') v.msg('Click (or Space) to cast');
  }
}

})();
