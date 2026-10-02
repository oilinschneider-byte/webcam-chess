/* The floppy cats, shared by Barrel Brawl and Cat Hoops: each player's cat picture (drawn without its arms), its
   very long, floppy arms, the keyboard and touch controls (tap left or right twice, fast, to dash), smoothing out the
   other player's moves, and a few drawing helpers. */
(() => {
'use strict';

const IMG_W = 80, IMG_H = 96, IMG_FEET = 92.8; // a cat picture's size, and how far down its feet are
const SHOULDER_X = 12.4, SHOULDER_Y = 33;
const ARM_N = 8, ARM_SEG = 11;                // each arm is 8 floppy pieces: longer than the whole cat is tall
const DOUBLE_TAP = 280;                       // ms between two taps of left or right for a dash
const FONT = 'Nunito, "Segoe UI", sans-serif';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, d) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d));

/* ---------- the cat pictures ---------- */

function fur(eq) {
  const skin = eq && CA.ITEM[eq.skin] && CA.ITEM[eq.skin].slot === 'skin' ? CA.ITEM[eq.skin] : CA.ITEM['skin-orange'];
  const shirt = eq && CA.ITEM[eq.shirt] && CA.ITEM[eq.shirt].slot === 'shirt' ? CA.ITEM[eq.shirt] : null;
  return { light: skin.c[0], mid: skin.c[1], dark: skin.c[2], sleeve: shirt ? shirt.sleeve : null };
}

// A cat's picture (without its arms: those are drawn separately, nice and long), looking right or left, with its
// mouth closed or open (it opens when that player talks): pics[1 or -1][0 or 1].
function pictures(eq) {
  const pics = { 1: [null, null], '-1': [null, null] };
  [1, -1].forEach(look => [0, 1].forEach(open => {
    const svg = CA.catSVG(eq, { bg: false, anim: false, arms: false, mouth: open ? 'open' : 'closed', look: look * 6 })
      .replace('<svg ', '<svg width="200" height="240" ');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(IMG_W * 2.5);
      c.height = Math.round(IMG_H * 2.5);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      pics[look][open] = c;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }));
  return pics;
}

// How wide open a cat's mouth is right now (cls: 'talk-me' or 'talk-opp').
function mouth(cls) {
  const el = document.getElementsByClassName(cls)[0];
  return el ? parseFloat(el.style.getPropertyValue('--mouth')) || 0 : 0;
}

// Draws a cat's picture with its feet at (x, y). o: { tilt, squash (0 to 1), lookRight, open (mouth), alpha }.
function drawBody(g, c, x, y, o) {
  const pics = c.pics[o.lookRight ? 1 : -1];
  const pic = pics[o.open ? 1 : 0] || pics[0];
  const sq = 1 - (o.squash || 0) * 0.16;
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  g.save();
  g.translate(x, y);
  g.rotate(o.tilt || 0);
  g.scale(2 - sq, sq);
  if (pic) g.drawImage(pic, -IMG_W / 2, -IMG_FEET, IMG_W, IMG_H);
  else { // (while the picture loads)
    g.fillStyle = c.fur.mid;
    g.beginPath(); g.arc(0, -55, 30, 0, Math.PI * 2); g.fill();
    g.fillRect(-16, -30, 32, 30);
  }
  g.restore();
  g.globalAlpha = 1;
}

/* ---------- the long, floppy arms ---------- */

// Each arm is a chain of points that swings with gravity, drags on the ground and can hold on to things. (Holding
// something close, the arms pull in like a tape measure; let go and they flop back out.)
function makeArm(s, side) {
  const pts = [];
  for (let i = 0; i <= ARM_N; i++) { const x = s[0] + side * i * 3, y = s[1] + i * ARM_SEG * 0.8; pts.push({ x, y, px: x, py: y }); }
  pts.seg = ARM_SEG;
  return pts;
}

// Moves a cat's arms, from where the cat is drawn (v). o.pins: where each paw holds on ([[x, y], [x, y]], or null
// for a free paw), o.wild: flailing, o.hidden: not drawn just now, o.ground(p): keeps a point out of the ground and
// walls, and is true if the point is lying on the ground.
function stepArms(c, v, dt, o) {
  const sh = [[v.x - SHOULDER_X, v.y - SHOULDER_Y], [v.x + SHOULDER_X, v.y - SHOULDER_Y]];
  if (!c.arms || Math.hypot(c.arms[0][0].x - sh[0][0], c.arms[0][0].y - sh[0][1]) > 120) c.arms = [makeArm(sh[0], -1), makeArm(sh[1], 1)];
  if (o.hidden) return;
  const pins = o.pins || [null, null];
  for (let k = 0; k < 2; k++) {
    const pts = c.arms[k];
    const pin = pins[k];
    const reach = pin ? Math.hypot(pin[0] - sh[k][0], pin[1] - sh[k][1]) * 1.1 / ARM_N : ARM_SEG;
    pts.seg = approach(pts.seg, clamp(reach, 3.2, ARM_SEG), 60 * dt);
    const seg = pts.seg;
    for (let i = 1; i <= ARM_N; i++) {
      const p = pts[i];
      let mx = (p.x - p.px) * 0.985, my = (p.y - p.py) * 0.985;
      if (o.wild) { mx += (Math.random() - 0.5) * 2.4; my += (Math.random() - 0.5) * 2.4; }
      p.px = p.x;
      p.py = p.y;
      p.x += mx;
      p.y += my + 1600 * dt * dt;
    }
    pts[0].x = sh[k][0];
    pts[0].y = sh[k][1];
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < ARM_N; i++) {
        const a = pts[i], q = pts[i + 1];
        const dx = q.x - a.x, dy = q.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        const f = (d - seg) / d;
        if (i === 0) { q.x -= dx * f; q.y -= dy * f; } else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; q.x -= dx * f * 0.5; q.y -= dy * f * 0.5; }
      }
      if (pin) { pts[ARM_N].x = pin[0]; pts[ARM_N].y = pin[1]; }
      for (let i = 1; i <= ARM_N; i++) o.ground(pts[i]);
    }
    for (let i = 1; i <= ARM_N; i++) { const p = pts[i]; if (o.ground(p)) p.px += (p.x - p.px) * 0.3; } // (the ground is rough)
  }
}

// (Just for show:) fling a cat's arms that way (dir 1 or -1), and up (or down, with a negative up).
function whip(c, dir, up = 1) {
  if (!c.arms) return;
  for (const pts of c.arms) {
    for (let i = 1; i <= ARM_N; i++) {
      const k = i / ARM_N;
      pts[i].px = pts[i].x - dir * 9 * k;
      pts[i].py = pts[i].y + 4 * up * k;
    }
  }
}

// sx: the screen x for a world x (the arena is mirrored for one of the players).
function drawArms(g, c, sx) {
  if (!c.arms) return;
  for (const pts of c.arms) {
    const path = () => {
      g.beginPath();
      g.moveTo(sx(pts[0].x), pts[0].y);
      for (let i = 1; i < ARM_N; i++) {
        g.quadraticCurveTo(sx(pts[i].x), pts[i].y, sx((pts[i].x + pts[i + 1].x) / 2), (pts[i].y + pts[i + 1].y) / 2);
      }
      g.lineTo(sx(pts[ARM_N].x), pts[ARM_N].y);
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    path();
    g.strokeStyle = c.fur.dark;
    g.lineWidth = 11;
    g.stroke();
    path();
    g.strokeStyle = c.fur.mid;
    g.lineWidth = 7.5;
    g.stroke();
    if (c.fur.sleeve) {
      g.beginPath();
      g.moveTo(sx(pts[0].x), pts[0].y);
      g.lineTo(sx(pts[1].x), pts[1].y);
      g.strokeStyle = c.fur.sleeve;
      g.lineWidth = 12;
      g.stroke();
    }
    const e = pts[ARM_N];
    g.beginPath();
    g.arc(sx(e.x), e.y, 6.5, 0, Math.PI * 2);
    g.fillStyle = c.fur.light;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = c.fur.dark;
    g.stroke();
  }
}

/* ---------- controls ---------- */

// Keyboard and touch buttons. codes maps KeyboardEvent.code to a control name, letters maps the typed key (for
// other keyboards) to one, and pad holds the touch buttons (data-k="name"). Tapping 'l' or 'r' twice, fast, asks
// for a dash: takeDash() gives -1 or 1 (on your screen) once, then 0.
function controls(ctx, codes, letters, pad) {
  const keys = {};
  for (const k of Object.values(codes).concat(Object.values(letters))) keys[k] = false;
  const keyOf = e => codes[e.code] || letters[(e.key || '').toLowerCase()];
  const lastTap = { l: -1e9, r: -1e9 };
  let dash = 0;
  function press(k) {
    if ((k === 'l' || k === 'r') && !keys[k]) {
      const now = performance.now();
      if (now - lastTap[k] < DOUBLE_TAP) { dash = k === 'l' ? -1 : 1; lastTap[k] = -1e9; } else lastTap[k] = now;
    }
    keys[k] = true;
  }
  ctx.listen(document, 'keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    if (!e.repeat) press(k);
  });
  ctx.listen(document, 'keyup', e => { const k = keyOf(e); if (k) keys[k] = false; });
  ctx.listen(window, 'blur', () => { for (const k in keys) keys[k] = false; });
  if (pad) {
    pad.querySelectorAll('[data-k]').forEach(btn => {
      const k = btn.dataset.k;
      const up = () => { keys[k] = false; btn.classList.remove('on'); };
      ctx.listen(btn, 'pointerdown', e => {
        e.preventDefault();
        press(k);
        btn.classList.add('on');
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => ctx.listen(btn, type, up));
      ctx.listen(btn, 'contextmenu', e => e.preventDefault());
    });
  }
  return { keys, takeDash() { const d = dash; dash = 0; return d; } };
}

/* ---------- online ---------- */

// The state at time rt from a list of timed states ({ at, x, y, vx, vy, … }): between two of them, or a little past
// the newest one. keys are smoothed in between; the optional ones only while both states have them (0 or more).
function sample(buf, rt, keys, optional) {
  let k = buf.length - 1;
  while (k > 0 && buf[k].at > rt) k--;
  const a = buf[k], b = buf[k + 1];
  if (!b) {
    const e = clamp((rt - a.at) / 1000, 0, 0.1);
    return Object.assign({}, a, { x: a.x + a.vx * e, y: a.y + a.vy * e });
  }
  const f = clamp((rt - a.at) / Math.max(1, b.at - a.at), 0, 1);
  const o = Object.assign({}, f < 0.5 ? a : b);
  if (Math.abs(b.x - a.x) < 200 && Math.abs(b.y - a.y) < 200) { // (not across a jump, like a cat coming back from the lava)
    for (const key of keys) o[key] = a[key] + (b[key] - a[key]) * f;
    for (const key of optional || []) if (a[key] >= 0 && b[key] >= 0) o[key] = a[key] + (b[key] - a[key]) * f;
  }
  return o;
}

/* ---------- drawing helpers ---------- */

// Little drawing helpers for a canvas context g (w: the canvas width, for centered text).
function painter(g, w) {
  const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  function star(x, y, r) {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    g.closePath();
    g.fill();
  }
  function heart(x, y, full) {
    g.beginPath();
    g.moveTo(x, y + 5);
    g.bezierCurveTo(x - 9, y - 1, x - 5, y - 9, x, y - 4);
    g.bezierCurveTo(x + 5, y - 9, x + 9, y - 1, x, y + 5);
    g.fillStyle = full ? '#ff4d6d' : 'rgba(30, 20, 40, .7)';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = full ? '#7a0f24' : 'rgba(255, 255, 255, .5)';
    g.stroke();
  }
  function roundRect(x, y, rw, rh, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + rw, y, x + rw, y + rh, r);
    g.arcTo(x + rw, y + rh, x, y + rh, r);
    g.arcTo(x, y + rh, x, y, r);
    g.arcTo(x, y, x + rw, y, r);
    g.closePath();
  }
  function label(text, x, y, size, color, alpha) {
    g.save();
    if (alpha !== undefined) g.globalAlpha = alpha;
    g.font = '900 ' + Math.round(size) + 'px ' + FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size / 5);
    g.strokeStyle = 'rgba(20, 10, 30, .9)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
    g.restore();
  }
  const bigText = (text, y, size, color, alpha) => label(text, w / 2, y, size, color, clamp(alpha, 0, 1));
  // Red speed lines behind a dashing cat (x, y: its feet on the screen).
  function speedLines(x, y, lookRight) {
    const back = lookRight ? -1 : 1;
    g.strokeStyle = 'rgba(255, 80, 80, .85)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    for (const [dy, len] of [[-70, 34], [-48, 48], [-26, 30]]) {
      g.moveTo(x + back * 34, y + dy);
      g.lineTo(x + back * (34 + len), y + dy);
    }
    g.stroke();
  }
  // Stars around a dizzy cat's head.
  function dizzy(x, y, now) {
    g.fillStyle = '#ffe66b';
    for (let k = 0; k < 3; k++) {
      const a = now / 160 + k * 2.1;
      star(x + Math.cos(a) * 24, y - 92 + Math.sin(a) * 7, 5);
    }
  }
  return { dot, star, heart, roundRect, label, bigText, speedLines, dizzy };
}

CA.floppy = { IMG_W, IMG_H, IMG_FEET, ARM_N, FONT, fur, pictures, mouth, drawBody, stepArms, whip, drawArms, controls, sample, painter };

})();
