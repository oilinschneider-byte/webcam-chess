/* Classic Games: Box King. A cardboard box sits in the middle of the room. Standing in it alone earns you time; when
   both cats are in it, nobody scores until one gets knocked out. Space throws your boomerang the way you're facing
   (or at the other cat, if you're standing still): it flies out slowly in a curve, so it can be dodged, and comes
   back to you. If it hits the other cat, they're knocked back and dazed for a moment. One boomerang each: you can
   throw again once it's back in your paws. First to 20 seconds in the box, or the most after 75 seconds. (The host's
   app runs the boomerangs and decides who's in the box: see games-duel.js.) */
(() => {
'use strict';

const W = 960, H = 540, WALL = 22;
const R = 20;                                    // a cat's size
const SPEED = 215, ACCEL = 1500;
const BOOM_SPEED = 260, BOOM_OUT = 1.1, BOOM_BACK = 320, BOOM_TURN = 1.3, BOOM_R = 14, BOOM_MAX = 4;
const KNOCK = 520, STUN = 0.45;
const BOX = { x: W / 2 - 75, y: H / 2 - 75, w: 150, h: 150 };
const GOAL = 20, LENGTH = 75;
const HOME = [[150, H / 2], [W - 150, H / 2]];
const inBox = c => c.x > BOX.x && c.x < BOX.x + BOX.w && c.y > BOX.y && c.y < BOX.y + BOX.h;

CA.games.add('box', {
  name: 'Box King', icon: '📦',
  blurb: 'Get in the cardboard box and stay there! You only score while you\'re in it alone. Space throws your boomerang: it\'s slow, but if it hits, it knocks the other cat back. First to 20 seconds wins.',
  start(ctx) {
    CA.duel.run(ctx, {
      id: 'box',
      pad: { stick: true, buttons: [{ k: 'a', label: '🪃 Throw', main: true }] },
      help: 'WASD move · Space throws your boomerang (it comes back) · stay in the box alone to score · first to 20 seconds',
      helpTouch: 'Stick moves · Throw sends your boomerang · stay in the box alone to score',
      note: 'First to ' + GOAL + ' seconds in the box',
      init, step, snap, bot, draw, event,
    });
  },
});

function init() {
  return {
    t: 0, score: [0, 0], owner: -1,
    cats: HOME.map(([x, y], i) => ({ x, y, vx: 0, vy: 0, fx: i ? -1 : 1, fy: 0, stun: 0, boom: null })),
  };
}

// A boomerang: out it goes, curving, for BOOM_OUT seconds (or until it hits something), then it heads back to its
// cat, turning towards it, and is caught when it gets there.
function stepBoom(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i], b = c.boom;
  b.t += dt;
  b.spin += dt * 18;
  if (b.out) {
    const a = Math.atan2(b.vy, b.vx) + BOOM_TURN * b.curve * dt;
    b.vx = Math.cos(a) * BOOM_SPEED;
    b.vy = Math.sin(a) * BOOM_SPEED;
    if (b.t >= BOOM_OUT) b.out = false;
  } else {
    const dx = c.x - b.x, dy = c.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < R + BOOM_R) { c.boom = null; api.ev('catch', { x: c.x, y: c.y }); return; }
    b.vx += (dx / d * BOOM_BACK - b.vx) * Math.min(1, 4 * dt); // (it swings round towards its cat)
    b.vy += (dy / d * BOOM_BACK - b.vy) * Math.min(1, 4 * dt);
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // the walls (and the camera walls in the top corners) turn it back
  const hitWall = b.x < WALL + BOOM_R || b.x > W - WALL - BOOM_R || b.y < WALL + BOOM_R || b.y > H - WALL - BOOM_R || CA.camWalls.bounce(b, BOOM_R, 0.6);
  b.x = Math.max(WALL + BOOM_R, Math.min(W - WALL - BOOM_R, b.x));
  b.y = Math.max(WALL + BOOM_R, Math.min(H - WALL - BOOM_R, b.y));
  if (hitWall && b.out) { b.out = false; api.ev('tink', { x: b.x, y: b.y }); }
  // the other cat: knocked back the way it was flying, and dazed (once a throw)
  if (!b.hit && Math.hypot(o.x - b.x, o.y - b.y) < R + BOOM_R) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    o.vx = b.vx / sp * KNOCK;
    o.vy = b.vy / sp * KNOCK;
    o.stun = STUN;
    b.hit = true;
    b.out = false;
    api.ev('bonk', { x: o.x, y: o.y });
  }
  if (b.t > BOOM_MAX) c.boom = null; // (lost somewhere: a new one)
}

function step(s, inp, dt, api) {
  s.t += dt;
  s.cats.forEach((c, i) => {
    const o = s.cats[1 - i], n = inp[i];
    c.stun = Math.max(0, c.stun - dt);
    if (n.mx || n.my) { const l = Math.hypot(n.mx, n.my); c.fx = n.mx / l; c.fy = n.my / l; }
    if (n.hit.a && !c.boom && c.stun <= 0) {
      let fx = c.fx, fy = c.fy;
      if (!n.mx && !n.my) { const dx = o.x - c.x, dy = o.y - c.y, l = Math.hypot(dx, dy) || 1; fx = dx / l; fy = dy / l; }
      // (it curves, so it leaves a little to one side of where you aim: it bends back onto the line)
      const curve = i ? -1 : 1, a = Math.atan2(fy, fx) - curve * BOOM_TURN * BOOM_OUT * 0.35;
      c.boom = { x: c.x + fx * (R + 8), y: c.y + fy * (R + 8), vx: Math.cos(a) * BOOM_SPEED, vy: Math.sin(a) * BOOM_SPEED, t: 0, out: true, hit: false, spin: 0, curve };
      api.ev('whoosh', { x: c.x, y: c.y });
    }
    const k = c.stun > 0 ? 0 : 1;
    const tx = n.mx * SPEED * k, ty = n.my * SPEED * k;
    const dx = tx - c.vx, dy = ty - c.vy, d = Math.hypot(dx, dy), a = ACCEL * dt * (c.stun > 0 ? 0.25 : 1);
    if (d <= a) { c.vx = tx; c.vy = ty; } else { c.vx += dx / d * a; c.vy += dy / d * a; }
    c.x = Math.max(WALL + R, Math.min(W - WALL - R, c.x + c.vx * dt));
    c.y = Math.max(WALL + R, Math.min(H - WALL - R, c.y + c.vy * dt));
    CA.camWalls.bounce(c, R, 0.3); // (the camera walls in the top corners)
  });
  s.cats.forEach((c, i) => { if (c.boom) stepBoom(s, i, dt, api); });
  // The cats push each other apart.
  const [a, b] = s.cats;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
  if (d < R * 2) {
    const nx = dx / d, ny = dy / d, push = (R * 2 - d) / 2;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
  }
  // Who has the box: only a cat that's in it alone scores.
  const inside = s.cats.map(inBox);
  const owner = inside[0] && inside[1] ? 2 : inside[0] ? 0 : inside[1] ? 1 : -1;
  if (owner !== s.owner && owner === 2) api.ev('contest', {});
  s.owner = owner;
  if (owner === 0 || owner === 1) s.score[owner] += dt;
  api.score(Math.floor(s.score[0]), Math.floor(s.score[1]));
  if (s.score[0] >= GOAL || s.score[1] >= GOAL) api.end(s.score[0] >= GOAL ? 0 : 1, 'BOX KING!');
  else if (s.t >= LENGTH) {
    const diff = s.score[0] - s.score[1];
    api.end(Math.abs(diff) < 0.05 ? -1 : diff > 0 ? 0 : 1, 'TIME!');
  }
}

function snap(s) {
  return {
    t: Math.round(s.t * 10) / 10, o: s.owner, sc: s.score.map(v => Math.round(v * 10) / 10),
    c: s.cats.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), f: c.fx >= 0 ? 1 : -1, st: c.stun > 0 ? 1 : 0,
      b: c.boom ? [Math.round(c.boom.x), Math.round(c.boom.y), Math.round(c.boom.spin * 10) / 10] : 0 })),
  };
}

// The bot heads for the box. When the other cat has it (or is closing in), it throws its boomerang at them, aimed a
// little ahead of where they're going (better bots lead the throw more), and steps aside from boomerangs coming at it.
function bot(s, i, dt, api) {
  const c = s.cats[i], o = s.cats[1 - i];
  const st = s.botState || (s.botState = { think: 0, mx: 0, my: 0, throw: false, jitter: [0, 0] });
  st.think -= dt;
  if (st.think <= 0) {
    st.think = 0.12 + (1 - api.skill) * 0.3;
    const cx = BOX.x + BOX.w / 2, cy = BOX.y + BOX.h / 2;
    if (Math.random() < 0.3) st.jitter = [(Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80];
    const tx = cx + st.jitter[0] * 0.5, ty = cy + st.jitter[1] * 0.5;
    const dx = tx - c.x, dy = ty - c.y, l = Math.hypot(dx, dy);
    st.mx = l > 12 ? dx / l : 0;
    st.my = l > 12 ? dy / l : 0;
    const ob = o.boom; // a boomerang coming this way: step aside
    if (ob && Math.hypot(ob.x - c.x, ob.y - c.y) < 140 && Math.random() < api.skill) {
      const bl = Math.hypot(ob.vx, ob.vy) || 1;
      st.mx = -ob.vy / bl; st.my = ob.vx / bl;
    }
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    st.throw = !c.boom && d < 340 && (inBox(o) || Math.random() < 0.15) && Math.random() < 0.3 + 0.5 * api.skill;
    if (st.throw) { // (stand still for a moment: a still cat throws straight at the other one)
      const lead = 0.4 * api.skill;
      st.aim = [o.x + o.vx * lead - c.x, o.y + o.vy * lead - c.y];
    }
  }
  const out = { mx: st.mx, my: st.my, hit: {} };
  if (st.throw) {
    const al = Math.hypot(st.aim[0], st.aim[1]) || 1;
    out.mx = st.aim[0] / al * 0.01; // (barely moving: just turning to face them)
    out.my = st.aim[1] / al * 0.01;
    out.hit.a = true;
    st.throw = false;
  }
  return out;
}

function event(v, e) {
  if (e.type === 'bonk') { v.burst(e.x, e.y, '#ffd23f', 14, 260); v.pop(e.x, e.y - 30, 'BONK!'); v.shake(8); v.sound([[220, 0, 0.06], [140, 0.05, 0.12]]); }
  if (e.type === 'whoosh') v.sound([[700, 0, 0.04], [480, 0.03, 0.06]]);
  if (e.type === 'catch') v.sound([[900, 0, 0.03]]);
  if (e.type === 'tink') v.sound([[1400, 0, 0.03]]);
  if (e.type === 'contest') v.sound([[440, 0, 0.05]]);
}

let floor = null;
function makeFloor() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const b = c.getContext('2d');
  b.fillStyle = '#c99a63';
  b.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 36) { // wooden planks
    b.fillStyle = (y / 36) % 2 ? 'rgba(0, 0, 0, .05)' : 'rgba(255, 255, 255, .05)';
    b.fillRect(0, y, W, 36);
    b.fillStyle = 'rgba(80, 45, 20, .35)';
    b.fillRect(0, y, W, 2);
    for (let x = ((y / 36) % 3) * 110; x < W; x += 330) b.fillRect(x, y, 2, 36);
  }
  b.fillStyle = '#6b4a2f';
  b.fillRect(0, 0, W, WALL); b.fillRect(0, H - WALL, W, WALL); b.fillRect(0, 0, WALL, H); b.fillRect(W - WALL, 0, WALL, H);
  b.fillStyle = 'rgba(255, 255, 255, .12)';
  b.fillRect(WALL, WALL, W - WALL * 2, 3);
  return c;
}

// A boomerang: a spinning V in the thrower's color.
function drawBoom(v, x, y, spin, i) {
  const g = v.g;
  g.save();
  g.translate(x, y);
  g.rotate(spin);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40, 20, 5, .8)';
  g.lineWidth = 9;
  g.beginPath(); g.moveTo(-14, 10); g.lineTo(0, -8); g.lineTo(14, 10); g.stroke();
  g.strokeStyle = v.team[i].light;
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(-14, 10); g.lineTo(0, -8); g.lineTo(14, 10); g.stroke();
  g.restore();
}

function draw(v, s) {
  const g = v.g;
  if (!floor) floor = makeFloor();
  g.drawImage(floor, 0, 0, W, H);
  // the box: glows in the color of whoever has it
  const glow = s.o === 0 || s.o === 1 ? v.team[s.o].main : s.o === 2 ? '#ff5a5a' : null;
  if (glow) {
    g.globalAlpha = 0.35 + 0.15 * Math.sin(v.now / 150);
    g.fillStyle = glow;
    v.roundRect(BOX.x - 10, BOX.y - 10, BOX.w + 20, BOX.h + 20, 14);
    g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = '#8a5a2b';
  g.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
  g.fillStyle = '#b07a42';
  g.fillRect(BOX.x + 8, BOX.y + 8, BOX.w - 16, BOX.h - 16);
  g.fillStyle = '#d9a566'; // the flaps, folded out
  g.beginPath(); g.moveTo(BOX.x, BOX.y); g.lineTo(BOX.x + BOX.w, BOX.y); g.lineTo(BOX.x + BOX.w - 18, BOX.y - 24); g.lineTo(BOX.x + 18, BOX.y - 24); g.fill();
  g.beginPath(); g.moveTo(BOX.x, BOX.y + BOX.h); g.lineTo(BOX.x + BOX.w, BOX.y + BOX.h); g.lineTo(BOX.x + BOX.w - 18, BOX.y + BOX.h + 24); g.lineTo(BOX.x + 18, BOX.y + BOX.h + 24); g.fill();
  g.strokeStyle = 'rgba(60, 35, 10, .5)';
  g.lineWidth = 2;
  g.strokeRect(BOX.x + 8, BOX.y + 8, BOX.w - 16, BOX.h - 16);
  v.label('📦', BOX.x + BOX.w / 2, BOX.y + BOX.h / 2, 30, '#ffffff', 0.35);
  s.c.forEach((c, i) => {
    v.catTop(i, c.x, c.y, 1, { lookRight: c.f > 0, tilt: c.st ? Math.sin(v.now / 50) * 0.3 : 0 });
    if (c.st) v.star(c.x, c.y - 34, 6);
    if (!c.b) drawBoom(v, c.x + c.f * 18, c.y + 10, c.f > 0 ? 0.5 : -0.5, i); // (in its paws, ready)
  });
  s.c.forEach((c, i) => { if (c.b) drawBoom(v, c.b[0], c.b[1], c.b[2], i); });
  // how long each has had the box (between the camera walls in the top corners)
  for (let i = 0; i < 2; i++) {
    const w = 250, x = i ? W - 176 - w : 176, k = Math.min(1, s.sc[i] / GOAL);
    g.fillStyle = 'rgba(20, 12, 4, .7)';
    v.roundRect(x, 30, w, 16, 8); g.fill();
    g.fillStyle = v.team[i].main;
    v.roundRect(x + 2, 32, Math.max(10, (w - 4) * k), 12, 6); g.fill();
    v.label((i === v.me ? 'You' : v.names[i]) + ' ' + s.sc[i].toFixed(1) + 's', x + w / 2, 60, 13, '#ffffff');
  }
  v.label('⏱ ' + Math.max(0, Math.ceil(LENGTH - s.t)), W / 2, 38, 16, '#ffffff');
  const me = s.c[v.me];
  if (s.o === 2) v.msg('Both in the box: nobody scores! Knock them out with your boomerang (Space)');
  else if (me && me.b) v.msg('Your boomerang is on its way back…');
}

})();
