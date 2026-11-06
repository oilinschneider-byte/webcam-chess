/* Classic Games: Gator Bars. Two cats race across monkey bars over a pit of alligators, each in its own lane (the
   host's on top). Your cat hangs from a bar by one very long, dangly arm and swings. Pump the swing by pushing the
   way you're swinging (left / right), let go at the right moment (Space or click), and your free paw grabs the next bar
   it can reach. Miss, and the alligators get you: you start again from the last bar you held. First to the golden bar
   wins (after 2 minutes, whoever got further). (The host's app runs it: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, LANE = 270;
const G = 1300;              // gravity (and the swing's)
const RMAX = 128, RMIN = 70;  // how far the long arms reach
const PUMP = 7.5, DAMP = 0.12;
const WATER = 238;           // in a lane: fall below this and the alligators get you
const N_BARS = 16, LIMIT = 120, CHOMP = 1.3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

CA.games.add('gator', {
  name: 'Gator Bars', icon: '🐊',
  blurb: 'Swing across the monkey bars over a pit of alligators! Push the way you\'re swinging (A/D or the arrows) to swing higher, and let go (Space or click) to fly to the next bar. Miss and the gators get you. First to the golden bar wins!',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'gator', mouse: true,
      help: 'A / D (or ← →): swing higher · Space or click: let go and grab the next bar · don\'t fall in!',
      helpTouch: 'Move the stick the way you\'re swinging · tap Let go to fly to the next bar',
      pad: { stick: true, buttons: [{ k: 'a', label: '🙌 Let go', main: true }] },
      note: 'First to the golden bar',
      init, step, snap, bot, draw, event,
      lerp: (a, b, f) => ({ bars: b.bars, t: b.t, c: b.c.map((q, i) => { const o = a.c[i]; if (!o || o.d !== q.d || o.f !== q.f && Math.hypot(o.x - q.x, o.y - q.y) > 60) return q; const m = k => o[k] + (q[k] - o[k]) * f; return Object.assign({}, q, { x: m('x'), y: m('y'), hx: m('hx'), hy: m('hy') }); }) }),
    });
  },
});

function init(api) {
  const bars = [{ x: 110, y: 60 }];
  for (let k = 1; k < N_BARS; k++) {
    const p = bars[k - 1];
    bars.push({ x: p.x + 135 + api.rng() * 85 + k * 2, y: clamp(p.y + (api.rng() - 0.5) * 50, 40, 92) });
  }
  return { t: 0, bars, cats: [0, 1].map(() => hang(bars, 0)) };
}

function hang(bars, k) {
  const b = bars[k];
  return { bar: k, last: k, R: RMAX - 20, th: 0, w: 0, fly: false, x: b.x, y: b.y + RMAX - 20, vx: 0, vy: 0, dead: 0, done: false, from: -1, fromT: 0 };
}

function place(c, bars) {
  const b = bars[c.bar];
  c.x = b.x + c.R * Math.sin(c.th);
  c.y = b.y + c.R * Math.cos(c.th);
}

function step(s, inp, dt, api) {
  s.t += dt;
  for (let i = 0; i < 2; i++) {
    const c = s.cats[i], ip = inp[i];
    if (c.done) continue;
    if (c.dead > 0) {
      c.dead -= dt;
      if (c.dead <= 0) Object.assign(c, hang(s.bars, c.last), { last: c.last });
      continue;
    }
    const letGo = (ip.hit && (ip.hit.a || ip.hit.fire));
    if (!c.fly) {
      // a pendulum: gravity pulls it back down, and pushing the way it swings pumps it higher
      const pump = clamp(ip.mx || 0, -1, 1);
      c.w += (-(G / c.R) * Math.sin(c.th) + pump * PUMP - DAMP * c.w) * dt;
      c.th += c.w * dt;
      if (c.th > 2.3) { c.th = 2.3; c.w = Math.min(0, c.w); }
      if (c.th < -2.3) { c.th = -2.3; c.w = Math.max(0, c.w); }
      place(c, s.bars);
      // your arm slowly reaches out to its full length while you hang
      c.R = Math.min(RMAX - 20, c.R + 40 * dt);
      if (letGo) {
        c.fly = true;
        c.vx = c.R * c.w * Math.cos(c.th);
        c.vy = -c.R * c.w * Math.sin(c.th);
        c.from = c.bar;
        c.fromT = 0.35;
        api.ev('let', { i });
      }
    } else {
      c.fromT -= dt;
      c.vy += G * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      // the free paw grabs any bar it can reach above the cat (not the one it just let go of, for a moment)
      let best = -1, bd = 1e9;
      s.bars.forEach((b, k) => {
        if (k === c.from && c.fromT > 0) return;
        const d = Math.hypot(c.x - b.x, c.y - b.y);
        if (d <= RMAX && b.y < c.y - 20 && d < bd) { bd = d; best = k; }
      });
      if (best >= 0 && (best !== c.from || c.fromT <= 0)) {
        const b = s.bars[best];
        c.fly = false;
        c.bar = best;
        c.R = clamp(bd, RMIN, RMAX);
        c.th = Math.atan2(c.x - b.x, c.y - b.y);
        c.w = (c.vx * Math.cos(c.th) - c.vy * Math.sin(c.th)) / c.R;
        if (best > c.last) c.last = best;
        place(c, s.bars);
        api.ev('grab', { i, k: best, x: b.x, y: b.y });
        if (best === N_BARS - 1) {
          c.done = true;
          api.end(i, 'Made it across!');
          return;
        }
      }
      if (c.y > WATER || c.x < 0) {
        c.dead = CHOMP;
        c.fly = false;
        api.ev('chomp', { i, x: Math.round(c.x) });
      }
    }
  }
  if (s.t >= LIMIT) {
    const far = c => c.last * 10000 + c.x;
    const a = far(s.cats[0]), b = far(s.cats[1]);
    api.end(a === b ? -1 : a > b ? 0 : 1, "Time's up!");
  }
}

function snap(s) {
  return {
    bars: s.bars.map(b => [Math.round(b.x), Math.round(b.y)]),
    t: Math.max(0, Math.ceil(LIMIT - s.t)),
    c: s.cats.map(c => {
      const b = s.bars[c.bar];
      const hand = c.fly ? { x: c.x + c.vx * 0.03, y: c.y - RMAX * 0.75 } : b;
      return { x: Math.round(c.x), y: Math.round(c.y), hx: Math.round(hand.x), hy: Math.round(hand.y), f: c.fly ? 1 : 0, d: c.dead > 0 ? 1 : 0, l: c.last, w: Math.round(c.w * 10) / 10 };
    }),
  };
}

// The bot pumps the way it swings, and lets go on the forward swing once it's going fast enough (a worse bot judges
// it worse, and sometimes ends up with the gators).
function bot(s, i, dt, api) {
  const c = s.cats[i];
  const st = s.bs || (s.bs = {});
  const me = st[i] || (st[i] = { rel: 0.5 + (Math.random() - 0.5) * 0.3, need: 0 });
  if (c.fly || c.dead > 0 || c.done) return { mx: 0 };
  const next = s.bars[c.bar + 1];
  const gap = next ? next.x - s.bars[c.bar].x : 150;
  const needW = 2.2 + gap / 120 + (Math.random() - 0.5) * 0.4 * (1 - api.skill);
  const hit = {};
  if (c.w > needW && c.th > me.rel && c.th < me.rel + 0.35 && (me.go || (me.go = Math.random() < 0.3 + 0.6 * api.skill ? 1 : -1)) > 0) {
    hit.a = true;
    me.rel = 0.45 + (Math.random() - 0.5) * 0.5 * (1.2 - api.skill);
    me.go = 0;
  }
  if (c.th < 0) me.go = 0; // (a new chance to let go on every forward swing)
  return { mx: c.w >= 0 ? 1 : -1, hit, held: {} };
}

function event(v, e) {
  if (e.type === 'grab') { v.sound(e.i === v.me ? [[520, 0, 0.04], [780, 0.04, 0.05]] : [[300, 0, 0.03]]); }
  if (e.type === 'let') { if (e.i === v.me) v.sound([[340, 0, 0.04]]); }
  if (e.type === 'chomp') {
    v.shake(e.i === v.me ? 10 : 3);
    v.sound(e.i === v.me ? [[160, 0, 0.12], [110, 0.1, 0.18]] : [[220, 0, 0.06]]);
    (v.chomps || (v.chomps = [])).push({ i: e.i, x: e.x, at: v.now });
  }
}

let jungle = null;
function makeJungle() {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = LANE;
  const b = c.getContext('2d');
  const sky = b.createLinearGradient(0, 0, 0, LANE);
  sky.addColorStop(0, '#173a2c');
  sky.addColorStop(0.7, '#0f2a20');
  sky.addColorStop(1, '#0b1d17');
  b.fillStyle = sky;
  b.fillRect(0, 0, 1600, LANE);
  for (let k = 0; k < 26; k++) { // hanging vines and leaves in the back
    const x = (k * 137) % 1600;
    b.strokeStyle = 'rgba(70, 140, 80, .35)';
    b.lineWidth = 3;
    b.beginPath(); b.moveTo(x, 0); b.quadraticCurveTo(x + 14, 50, x - 6, 90 + (k % 4) * 18); b.stroke();
  }
  return c;
}

function drawGator(g, x, y, open, t) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#2f6b2a';
  g.beginPath(); g.ellipse(0, 6, 44, 11, 0, 0, Math.PI * 2); g.fill();
  // the snout, with the jaw opening when it bites
  g.save();
  g.translate(-36, 2);
  g.rotate(-open * 0.6);
  g.fillStyle = '#3b8233';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-38, -4); g.lineTo(-36, 4); g.lineTo(0, 6); g.fill();
  if (open > 0.1) { g.fillStyle = '#f4f1e6'; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-6 - k * 7, 4); g.lineTo(-9 - k * 7, 9); g.lineTo(-12 - k * 7, 4); g.fill(); } }
  g.restore();
  g.fillStyle = '#3b8233';
  g.beginPath(); g.moveTo(-36, 6); g.lineTo(-72, 8); g.lineTo(-36, 14); g.fill();
  // bumpy back and yellow eyes
  g.fillStyle = '#245520';
  for (let k = -2; k <= 3; k++) { g.beginPath(); g.arc(k * 11, -3, 4, Math.PI, 0); g.fill(); }
  g.fillStyle = '#e8d34a';
  g.beginPath(); g.arc(-30, -4, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.fillRect(-31, -7, 2, 6);
  g.restore();
}

function draw(v, s) {
  const g = v.g;
  if (!jungle) jungle = makeJungle();
  const end = s.bars[s.bars.length - 1][0] + 200;
  for (let lane = 0; lane < 2; lane++) {
    const c = s.c[lane];
    const cam = Math.min(c.x - 420, Math.max(0, end - W)); // (your cat stays near the middle, clear of the cameras in the corners)
    g.save();
    g.beginPath(); g.rect(0, lane * LANE, W, LANE); g.clip();
    g.translate(0, lane * LANE);
    const bgx = (((-cam * 0.4) % 1600) + 1600) % 1600 - 1600;
    g.drawImage(jungle, bgx, 0);
    g.drawImage(jungle, bgx + 1600, 0);
    g.translate(-cam, 0);
    // the water and the alligators, bobbing
    const wy = WATER + 6;
    g.fillStyle = '#123f4a';
    g.fillRect(cam, wy, W, LANE - wy);
    g.fillStyle = 'rgba(120, 200, 220, .25)';
    for (let x = Math.floor(cam / 40) * 40; x < cam + W; x += 40) g.fillRect(x + Math.sin(v.now / 400 + x) * 6, wy + 4, 18, 2);
    const chomp = (v.chomps || []).filter(q => q.i === lane && v.now - q.at < 900);
    for (let x = 160; x < end; x += 210) {
      const near = chomp.find(q => Math.abs(q.x - x) < 160);
      const open = near ? Math.max(0, 1 - (v.now - near.at) / 600) : (Math.sin(v.now / 700 + x) > 0.85 ? 0.3 : 0);
      drawGator(g, x + Math.sin(v.now / 900 + x) * 8, wy + 4 + Math.sin(v.now / 500 + x) * 2, open, v.now);
    }
    // the start ledge, the bars (the last one golden) and the frame they hang from
    g.fillStyle = '#5b4632';
    g.fillRect(-70, 175, 140, 95);
    s.bars.forEach(([x, y], k) => {
      const gold = k === s.bars.length - 1;
      g.strokeStyle = '#4a3a2a';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y); g.stroke();
      g.fillStyle = gold ? '#ffd23f' : '#c9ced8';
      g.fillRect(x - 26, y - 6, 52, 12);
      if (gold) { g.fillStyle = 'rgba(255, 210, 63, .3)'; v.dot(x, y, 26); }
    });
    // the cat: body, the long arm up to its paw on the bar, and the other arm dangling
    if (!c.d) {
      const sx = c.x, sy = c.y - 8, sway = Math.sin(v.now / 160) * 10;
      g.strokeStyle = v.team[lane].dark;
      g.lineCap = 'round';
      g.lineWidth = 9;
      g.beginPath(); g.moveTo(sx - 8, sy); g.quadraticCurveTo(sx - 30 - c.w * 6, sy + 40, sx - 16 + sway, sy + 52); g.stroke(); // dangling arm
      g.lineWidth = 10;
      g.beginPath(); g.moveTo(sx + 6, sy); g.quadraticCurveTo((sx + c.hx) / 2 - c.w * 8, (sy + c.hy) / 2 + 10, c.hx, c.hy); g.stroke(); // the long arm
      g.fillStyle = v.team[lane].light;
      v.dot(c.hx, c.hy, 7);
      v.dot(sx - 16 + sway, sy + 52, 6);
      v.catSide(lane, c.x, c.y + 34, 1, { tilt: clamp(c.w * 0.06, -0.4, 0.4) });
    } else {
      g.fillStyle = 'rgba(255, 255, 255, .5)';
      v.dot(c.x, WATER + 10, 16 + (Math.random() * 6));
    }
    g.restore();
    // the lane's name, and how far each cat got (a little map along the bottom of the lane)
    v.label((lane === v.me ? 'You' : v.names[lane]) + (c.d ? ' · CHOMP! 🐊' : ''), W / 2, lane * LANE + 40, 15, lane === v.me ? '#ffd23f' : '#ffffff');
    g.fillStyle = 'rgba(0, 0, 0, .35)';
    g.fillRect(W / 2 - 120, lane * LANE + 14, 240, 8);
    s.c.forEach((q, i) => { g.fillStyle = v.team[i].main; v.dot(W / 2 - 120 + 240 * clamp(q.x / end, 0, 1), lane * LANE + 18, i === lane ? 6 : 4); });
  }
  g.fillStyle = 'rgba(0, 0, 0, .6)';
  g.fillRect(0, LANE - 2, W, 4);
  v.label(String(s.t), W / 2, LANE, 18, '#ffffff');
}

})();
