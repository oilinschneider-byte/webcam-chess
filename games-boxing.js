/* Classic Games: Shadow Boxing. Punch the targets on your own camera, as fast as you can. Targets pop up on your
   (mirrored) camera picture: blue ones for your left fist, red ones for your right, and now and then a pair at once
   for both. The moment you hit one, the next one appears; a target you're too slow for disappears. They start slow
   and get faster and faster. In the ring in the middle your cat boxes theirs: every hit is a punch, the cat that's
   been hit more gets more bruised, and when the time is up the one with the most hits knocks the other one down (a
   tie goes to whoever punched faster on average).

   Your camera is only checked on your own computer, with Google's MediaPipe pose detector (it finds your wrists): no
   video goes anywhere for this. No camera? Click the targets instead. Each app runs its own targets, so a punch counts
   the moment you throw it, and both players get exactly the same targets in the same places, in the same order (from
   the match's seed): whoever punches faster gets further. The host's app keeps the official score (see games-duel.js). */
(() => {
'use strict';

const W = 960, H = 540;
const LENGTH = 40;
const LIFE0 = 2.8, LIFE1 = 0.8;                  // how long a target lasts: slow at the start, fast by the end
const GAP0 = 0.6, GAP1 = 0.1, R = 0.12;          // the pause before the next target (start, end); a target's size (part of the picture's width)
const DOUBLE = 0.3, DOUBLE_FROM = 10;            // how often both fists get a target at once (from 10 seconds in)
const PANEL = [{ x: 16, y: 120 }, { x: 584, y: 120 }], PW = 360, PH = 270; // your camera (left) and theirs (right), as you see them
const RING = { l: 382, r: 578, floor: 468 };     // the little boxing ring in the middle
const COL = { l: '#3d8bff', r: '#ff4d4d' };

// The same "random" numbers for both players: where target number n goes.
function hash(seed, n, k) {
  let x = (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

CA.games.add('boxing', {
  name: 'Shadow Boxing', icon: '🥊',
  blurb: 'Targets pop up on your camera: punch them as fast as you can! Blue for your left fist, red for your right, sometimes both at once. Slow at first, then faster and faster. Your cat boxes theirs in the ring: most hits in 40 seconds knocks the other one down! (No camera? Click them.)',
  prepare() { if (CA.games.pose) CA.games.pose.loadDetector().catch(() => {}); },
  start(ctx) {
    const seed = Math.floor(ctx.rng() * 4294967296) >>> 0;
    const sound = CA.games.kit.sound;
    const video = document.createElement('video'), their = document.createElement('video');
    [video, their].forEach(el => { el.muted = true; el.playsInline = true; });
    ctx.onEnd(() => { video.srcObject = null; their.srcObject = null; });
    let detector = null, status = 'off';
    if (CA.games.pose && CA.voice.cameraOn()) {
      status = 'loading';
      CA.games.pose.loadDetector().then(d => { detector = d; status = 'ready'; }, () => { status = 'failed'; });
    }
    // Your fists, as the camera sees them: [{ x, y, k: 'l' or 'r' }], in the mirrored picture (0 to 1).
    let fists = [], lastLook = 0;
    function look(now) {
      if (!detector || !CA.voice.cameraOn()) { fists = []; return; }
      const cam = CA.voice.camera;
      if (cam && video.srcObject !== cam) { video.srcObject = cam; video.play().catch(() => {}); }
      if (now - lastLook < 33 || video.readyState < 2) return;
      lastLook = now;
      let p = null;
      try { const res = detector.detectForVideo(video, now); p = res.landmarks && res.landmarks[0]; } catch (e) { p = null; }
      if (!p) { fists = []; return; }
      // each fist: the middle of the wrist, the knuckles and the thumb that the camera can see
      fists = [[[15, 17, 19, 21], 'l'], [[16, 18, 20, 22], 'r']].map(([pts, k]) => {
        const seen = pts.map(n => p[n]).filter(q => q && (q.visibility == null || q.visibility > 0.3));
        if (!seen.length) return null;
        return { x: 1 - seen.reduce((a, q) => a + q.x, 0) / seen.length, y: seen.reduce((a, q) => a + q.y, 0) / seen.length, k };
      }).filter(Boolean);
    }

    // The little ring in the middle: your cat (on the left) and theirs box. Every hit throws a punch, each cat gets
    // more bruised the more it's been hit, and when the time is up the winner knocks the other one down.
    const glide = [];
    const ring = { sc: [0, 0], at: [-1e9, -1e9], end: 0, w: -1 };
    const BRUISES = [[-10, -6], [12, -2], [-4, 8], [9, 10], [-15, 3], [3, -13], [15, -12], [-9, -15]];
    function drawRing(v, ps) {
      const g = v.g, now = v.now, F = RING.floor, mid = (RING.l + RING.r) / 2, S = 1.2;
      const order = [v.me, v.them];
      order.forEach(i => { const p = ps[i]; if (p && p.sc > ring.sc[i]) { ring.sc[i] = p.sc; ring.at[i] = now; } });
      // time up (both): the winner throws one last punch, and the other one goes down
      if (!ring.end && ps[0] && ps[1] && ps[0].ph === 'done' && ps[1].ph === 'done') {
        ring.end = now;
        const [a, b] = ps;
        ring.w = a.sc !== b.sc ? (a.sc > b.sc ? 0 : 1) : a.rt === b.rt ? -1 : (a.rt && a.rt < b.rt) || !b.rt ? 0 : 1;
        if (ring.w >= 0) { ring.at[ring.w] = now; v.sound([[160, 0.12, 0.2], [90, 0.2, 0.3]]); v.shake(12); }
      }
      // the mat, the corner posts and the ropes
      g.fillStyle = '#4a3480';
      v.roundRect(RING.l, F - 6, RING.r - RING.l, 34, 8); g.fill();
      g.fillStyle = '#c94a4a';
      [RING.l + 2, RING.r - 8].forEach(px => g.fillRect(px, F - 150, 6, 146));
      g.strokeStyle = 'rgba(255, 255, 255, .8)';
      g.lineWidth = 2;
      [F - 128, F - 100, F - 72].forEach(ry => { g.beginPath(); g.moveTo(RING.l + 6, ry); g.lineTo(RING.r - 6, ry); g.stroke(); });
      order.forEach((i, side) => {
        const face = side === 0 ? 1 : -1, o = order[1 - side], p = ps[i];
        const punch = Math.max(0, 1 - (now - ring.at[i]) / 180), recoil = Math.max(0, 1 - (now - ring.at[o]) / 220);
        const down = ring.end && ring.w === o ? Math.min(1, Math.max(0, (now - ring.end - 150) / 350)) : 0;
        const x = mid - face * (34 + recoil * 8 - down * 50), bob = down ? 0 : Math.sin(now / 180 + side * 2) * 2; // (falls inside the ring)
        g.save();
        g.translate(x, F + bob);
        g.rotate(-face * down * 1.45); // (knocked down: falls back, away from the other cat)
        v.catSide(i, 0, 0, S, { lookRight: face > 0 });
        g.fillStyle = 'rgba(110, 50, 160, .55)'; // bruises: one for every 4 hits taken
        const n = Math.min(BRUISES.length, Math.floor((ps[o] ? ps[o].sc : 0) / 4));
        for (let k = 0; k < n; k++) { g.beginPath(); g.ellipse(BRUISES[k][0] * S, (-58 + BRUISES[k][1]) * S, 6, 4, 0.4, 0, Math.PI * 2); g.fill(); }
        if (down) v.label('💫', 0, -100 * S, 22, '#ffffff');
        const won = ring.end && ring.w === i && now - ring.end > 600;
        const gx = won ? 0 : face * (26 + Math.sin(punch * Math.PI) * 30) * S, gy = won ? -112 * S : -42 * S;
        v.label('🥊', gx, gy + (won ? Math.sin(now / 120) * 4 : 0), 24, '#ffffff');
        g.restore();
        if (p && !ring.end) v.label(String(p.sc), x, F - 140, 16, v.team[i].light);
      });
      if (ring.end && ring.w >= 0 && now - ring.end > 500) v.label('K.O.!', mid, F - 175, 30, '#ff5a5a');
      return ring.end ? ring.w : -1;
    }

    function spawn(p) {
      const n = p.n++, prog = Math.min(1, p.t / LENGTH), side = hash(seed, n, 2) < 0.5 ? 'l' : 'r';
      const both = p.t >= DOUBLE_FROM && hash(seed, n, 1) < DOUBLE;
      const life = LIFE0 + (LIFE1 - LIFE0) * prog;
      const at = k => ({ k, x: (k === 'l' ? 0.13 : 0.57) + hash(seed, n, k === 'l' ? 3 : 5) * 0.3, y: 0.2 + hash(seed, n, k === 'l' ? 4 : 6) * 0.58, age: 0, life });
      p.tg = both ? [at('l'), at('r')] : [at(side)];
    }

    CA.duel.run(ctx, {
      id: 'boxing', mode: 'own', mouse: true, bigCams: true,
      help: 'Punch the targets on your camera: blue with your left fist, red with your right · as fast as you can! (No camera? Click them.)',
      helpTouch: 'Tap the targets as fast as you can (or punch them with your camera on)',
      note: 'Most hits in ' + LENGTH + ' seconds',
      initMine(api, i) { return { i, t: 0, ph: 'go', n: 0, sc: 0, miss: 0, react: 0, tg: [], wait: 0.6, hands: [], bot: { t: 0 } }; },
      stepMine(p, inp, dt, api) {
        p.t += dt;
        if (p.t >= LENGTH) { p.ph = 'done'; p.tg = []; return; }
        const me = api.self;
        // the fists: from the camera (yours), the bot, or a click on your panel (no camera)
        let hands = me ? fists : inp.hands || [];
        if (me && !fists.length && inp.hit && inp.hit.fire) hands = [{ x: (inp.ax - PANEL[0].x) / PW, y: (inp.ay - PANEL[0].y) / PH, k: 'any' }];
        p.hands = (me ? fists : inp.hands || []).map(h => ({ x: h.x, y: h.y, k: h.k }));
        if (!p.tg.length) {
          p.wait -= dt;
          if (p.wait <= 0) spawn(p);
          return;
        }
        p.tg.forEach(t => {
          t.age += dt;
          if (t.hit) return;
          if (hands.some(h => (h.k === t.k || h.k === 'any') && Math.hypot((h.x - t.x) * PW, (h.y - t.y) * PH) < R * PW * 1.5)) {
            t.hit = true;
            p.sc++;
            p.react += t.age;
            if (me) sound([[1200, 0, 0.03], [500, 0.02, 0.06]]);
          }
        });
        const left = p.tg.filter(t => !t.hit);
        if (!left.length || left.some(t => t.age >= t.life)) { // all hit (or too slow): the next one
          if (left.length) { p.miss += left.length; if (me) sound([[180, 0, 0.08]]); }
          p.tg = [];
          p.wait = GAP0 + (GAP1 - GAP0) * Math.min(1, p.t / LENGTH);
        }
      },
      snapMine(p) {
        const r = v => Math.round(v * 1000) / 1000;
        return {
          ph: p.ph, t: Math.round(p.t * 10) / 10, sc: p.sc, miss: p.miss, rt: p.sc ? Math.round(p.react / p.sc * 1000) : 0,
          tg: p.tg.map(t => [r(t.x), r(t.y), t.k, t.hit ? 1 : 0, Math.round(Math.max(0, 1 - t.age / t.life) * 100) / 100]),
          h: p.hands.map(h => [r(h.x), r(h.y), h.k]),
        };
      },
      referee(sn, api) {
        api.score(sn[0].sc, sn[1].sc);
        // (a moment after the time is up, so the knockdown in the ring can be seen)
        if (api.t < LENGTH + 2.2) return;
        const [a, b] = sn;
        api.end(a.sc !== b.sc ? (a.sc > b.sc ? 0 : 1) : a.rt === b.rt ? -1 : (a.rt && a.rt < b.rt) || !b.rt ? 0 : 1, 'TIME!');
      },
      // The bot punches each target after a reaction time (good bots are quicker), and now and then is too slow.
      bot(p, i, dt, api) {
        const b = p.bot, out = { hit: {}, hands: [] };
        if (!p.tg.length) { b.react = undefined; return out; }
        if (b.react === undefined) b.react = Math.max(0.25, CA.games.kit.gauss(0.85 - 0.4 * api.skill, 0.15));
        const age = p.tg[0].age;
        if (age >= b.react) out.hands = p.tg.map(t => ({ x: t.x, y: t.y, k: t.k }));
        return out;
      },
      draw(v, mine, theirs) {
        const g = v.g;
        look(performance.now());
        const bgr = g.createLinearGradient(0, 0, 0, H);
        bgr.addColorStop(0, '#2a1838');
        bgr.addColorStop(1, '#120b1c');
        g.fillStyle = bgr;
        g.fillRect(0, 0, W, H);
        const ps = [];
        ps[v.me] = mine;
        ps[v.them] = theirs;
        [v.me, v.them].forEach((i, side) => {
          const { x, y } = PANEL[side], p = ps[i];
          g.save();
          v.roundRect(x, y, PW, PH, 22);
          g.clip();
          g.fillStyle = '#2a2050';
          g.fillRect(x, y, PW, PH);
          const vid = i === v.me ? (CA.voice.cameraOn() ? video : null) : their;
          if (i !== v.me) {
            const src = ctx.theirCam && ctx.theirCam();
            if (src && their.srcObject !== src) { their.srcObject = src; their.play().catch(() => {}); }
            if (!src) their.srcObject = null;
          } else if (CA.voice.cameraOn() && CA.voice.camera && video.srcObject !== CA.voice.camera) { video.srcObject = CA.voice.camera; video.play().catch(() => {}); }
          if (vid && vid.srcObject && vid.readyState >= 2) { // (both pictures mirrored, like a mirror)
            const k = Math.max(PW / vid.videoWidth, PH / vid.videoHeight);
            g.save();
            g.translate(x + PW, y); g.scale(-1, 1);
            g.drawImage(vid, (PW - vid.videoWidth * k) / 2, (PH - vid.videoHeight * k) / 2, vid.videoWidth * k, vid.videoHeight * k);
            g.restore();
            g.fillStyle = 'rgba(20, 10, 40, .25)';
            g.fillRect(x, y, PW, PH);
          } else v.catSide(i, x + PW / 2, y + PH - 10, 2.4, { lookRight: side === 0 });
          if (p) {
            p.tg.forEach(([tx, ty, k, hit, left]) => { // a target: a ring that runs out
              const cx = x + tx * PW, cy = y + ty * PH, rr = R * PW;
              if (hit) { g.globalAlpha = 0.5; g.fillStyle = '#7dff8a'; v.dot(cx, cy, rr * 1.2); g.globalAlpha = 1; return; }
              g.fillStyle = COL[k]; g.globalAlpha = 0.85; v.dot(cx, cy, rr); g.globalAlpha = 1;
              g.fillStyle = '#ffffff'; v.dot(cx, cy, rr * 0.55);
              g.fillStyle = COL[k]; v.dot(cx, cy, rr * 0.3);
              g.strokeStyle = '#ffffff'; g.lineWidth = 4;
              g.beginPath(); g.arc(cx, cy, rr + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); g.stroke();
              v.label(k === 'l' ? 'L' : 'R', cx, cy - rr - 14, 13, COL[k]);
            });
            // the gloves glide to where the fists are (yours straight from the camera, theirs from their app)
            const live = i === v.me && fists.length ? fists.map(f => [f.x, f.y, f.k]) : p.h;
            const gl = glide[side] || (glide[side] = {});
            live.forEach(([hx, hy, k]) => {
              const s = gl[k] || (gl[k] = { x: hx, y: hy });
              s.x += (hx - s.x) * Math.min(1, v.dt * 22);
              s.y += (hy - s.y) * Math.min(1, v.dt * 22);
              s.seen = v.now;
              v.label('🥊', x + s.x * PW, y + s.y * PH, 40, COL[k] || '#ffffff');
            });
          }
          g.restore();
          g.strokeStyle = v.team[i].main;
          g.lineWidth = 4;
          v.roundRect(x, y, PW, PH, 22); g.stroke();
          v.label((i === v.me ? 'You' : v.names[i]) + (p ? ': ' + p.sc + ' hits' : ''), x + PW / 2, y - 18, 18, v.team[i].light);
          if (p && p.rt) v.label('avg ' + p.rt + ' ms', x + PW / 2, y + PH + 22, 13, '#cccccc');
        });
        const t = mine ? mine.t : 0;
        v.label('⏱ ' + Math.max(0, Math.ceil(LENGTH - t)), W / 2, 40, 24, '#ffffff');
        const w = drawRing(v, ps);
        if (!mine) return;
        if (mine.ph === 'done') v.msg(w < 0 ? 'Time! Waiting for the result…' : w === v.me ? 'K.O.! You knocked them down! 🥊' : 'K.O.! They knocked you down…', w >= 0 && w !== v.me);
        else if (!CA.voice.cameraOn()) v.msg('No camera: click the targets! (Turn your camera on to punch them for real.)');
        else if (status === 'loading') v.msg('Getting the pose detector ready… (click the targets meanwhile)');
        else if (status === 'failed') v.msg("The pose detector couldn't load (it needs the internet the first time): click the targets.", true);
        else if (!fists.length) v.msg('Step back so the camera can see your fists!');
      },
    });
  },
});

})();
