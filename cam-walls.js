/* The cameras are walls. While you play, the two camera blocks sit over the top-left and top-right corners of the
   arcade games' arenas (see "PLAYING" in style.css, and fitCams in solos.js), and in the games those corners are
   solid: nothing can go behind a camera. Every arcade arena is 960 × 540, and each corner wall is CAM_W × CAM_H.
   On a phone held upright the cameras sit above the game instead, so the games also draw the walls themselves. */
(() => {
'use strict';

const W = 960, H = 540, CAM_W = 164, CAM_H = 162;
const RECTS = [{ x: 0, y: 0, w: CAM_W, h: CAM_H }, { x: W - CAM_W, y: 0, w: CAM_W, h: CAM_H }];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Is the point inside a camera wall (or within r of one)?
const inWall = (x, y, r = 0) => y < CAM_H + r && (x < CAM_W + r || x > W - CAM_W - r);

// Pushes a circle (x, y, radius r) out of the camera walls. Returns null if it's clear, or { x, y, nx, ny }: where it
// goes, and which way the wall faces there (for bouncing off it).
function push(x, y, r) {
  for (const b of RECTS) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d > 1e-6) return { x: cx + dx / d * r, y: cy + dy / d * r, nx: dx / d, ny: dy / d };
    // (its middle is inside: out through the nearest open side, the bottom or the side facing the arena)
    const left = b.x === 0, side = left ? b.x + b.w - x : x - b.x, down = b.y + b.h - y;
    if (down < side) return { x, y: b.y + b.h + r, nx: 0, ny: 1 };
    return { x: left ? b.x + b.w + r : b.x - r, y, nx: left ? 1 : -1, ny: 0 };
  }
  return null;
}

// Keeps a moving circle ({ x, y, vx, vy }) out of the walls, bouncing it off them (k: how bouncy, 0 to 1). True if it hit.
function bounce(o, r, k = 0.8) {
  const p = push(o.x, o.y, r);
  if (!p) return false;
  o.x = p.x;
  o.y = p.y;
  const vn = o.vx * p.nx + o.vy * p.ny;
  if (vn < 0) { o.vx -= (1 + k) * vn * p.nx; o.vy -= (1 + k) * vn * p.ny; }
  return true;
}

// Draws the walls on a game's canvas (g, in arena units): brick, with a light edge facing the arena.
function draw(g) {
  g.save();
  for (const b of RECTS) {
    const left = b.x === 0, rx = left ? [0, 18, 18, 0] : [18, 0, 0, 18];
    g.beginPath();
    g.roundRect(b.x, b.y - 20, b.w, b.h + 20, rx);
    g.fillStyle = '#241c4a';
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(0, 0, 0, .35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let y = 0, row = 0; y < b.h; y += 12, row++) {
      g.moveTo(b.x, y + 0.5); g.lineTo(b.x + b.w, y + 0.5);
      for (let x = b.x + (row % 2 ? 12 : 0); x < b.x + b.w; x += 24) { g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 12); }
    }
    g.stroke();
    g.restore();
    g.strokeStyle = '#4a3a8c';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(b.x, b.y - 20, b.w, b.h + 20, rx);
    g.stroke();
  }
  g.restore();
}

CA.camWalls = { W, H, CAM_W, CAM_H, RECTS, inWall, push, bounce, draw };

})();
