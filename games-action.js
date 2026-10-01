/* Classic Games: Perfect Timing, Dodge, Mini Maze Race, Stack Tower, Snake Sprint, Remember the Sequence, Cup Shuffle,
   Penalty Shootout. Both players always get the same timings, rocks, mazes and sequences (from the shared seed). */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, startTimer, stopTimer, resetTimer, roundMatch, scoreRace, L, skillOf } = CA.games.kit;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const KEYS = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', w: 'u', s: 'd', a: 'l', d: 'r', W: 'u', S: 'd', A: 'l', D: 'r' };

// Arrow buttons for phones and tablets; the arrow keys, WASD and swipes work too.
function padHTML(id) {
  return '<div class="pad" id="' + id + '"><button data-d="u" aria-label="Up">▲</button><button data-d="l" aria-label="Left">◀</button>' +
    '<button data-d="d" aria-label="Down">▼</button><button data-d="r" aria-label="Right">▶</button></div>';
}
function onDirections(ctx, padId, surface, fn) {
  ctx.listen(document, 'keydown', e => { const d = KEYS[e.key]; if (d) { e.preventDefault(); fn(d); } });
  ctx.listen($(padId), 'pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); fn(b.dataset.d); } });
  let sx = 0, sy = 0, on = false;
  ctx.listen(surface, 'pointerdown', e => { on = true; sx = e.clientX; sy = e.clientY; });
  ctx.listen(surface, 'pointerup', e => {
    if (!on) return;
    on = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u'));
  });
}

/* ================= PERFECT TIMING ================= */

CA.games.add('timing', {
  name: 'Perfect Timing', icon: '⏱️', blurb: 'Stop the moving needle as close to the gold line as you can. Closest wins the round. First to 2!',
  start(ctx) {
    const ROUND = L(6000);
    const rounds = [0, 1, 2].map(i => ({ target: 12 + ctx.rng() * 76, speed: 60 + i * 35 + ctx.rng() * 20, phase: ctx.rng() * 200 }));
    ctx.stage.innerHTML =
      '<div class="g-timing"><div class="pt-bar"><i class="pt-target" id="ptTarget"></i><i class="pt-needle" id="ptNeedle"></i><i class="pt-needle them hidden" id="ptThem"></i></div>' +
      '<button class="btn go big pt-stop" id="ptStop" disabled>STOP <kbd>Space</kbd></button>' +
      '<div class="timer"><i id="ptTimer"></i></div><p class="g-msg" id="ptMsg"></p></div>';
    const bounce = v => { const m = ((v % 200) + 200) % 200; return m <= 100 ? m : 200 - m; }; // goes 0 → 100 → 0 …
    const posAt = (rd, ms) => bounce(rd.phase + rd.speed * ms / 1000);
    let onStop = null;
    ctx.listen($('ptStop'), 'click', () => { if (onStop) onStop(); });
    ctx.listen(document, 'keydown', e => { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat && onStop) { e.preventDefault(); onStop(); } });
    const distOf = v => (v && Number.isFinite(v.d) ? v.d : 100);
    roundMatch(ctx, {
      target: 2,
      maxRounds: 3,
      revealMs: 2200,
      play(r, submit) {
        const rd = rounds[r - 1];
        ctx.note('Round ' + r + ' · first to 2');
        $('ptTarget').style.left = rd.target + '%';
        $('ptThem').classList.add('hidden');
        setMsg('ptMsg', 'Press STOP when the needle is on the gold line!');
        const needle = $('ptNeedle');
        const t0 = performance.now();
        let done = false;
        const frame = () => {
          if (done || !ctx.alive()) return;
          needle.style.left = posAt(rd, performance.now() - t0) + '%';
          requestAnimationFrame(frame);
        };
        frame();
        $('ptStop').disabled = false;
        startTimer('ptTimer', ROUND);
        onStop = timedOut => {
          if (done) return;
          done = true;
          onStop = null;
          $('ptStop').disabled = true;
          stopTimer('ptTimer');
          if (timedOut === true) { setMsg('ptMsg', "Too slow! You didn't stop it."); submit({ d: 100 }); return; }
          const p = posAt(rd, performance.now() - t0);
          needle.style.left = p + '%';
          const d = Math.abs(p - rd.target);
          setMsg('ptMsg', d.toFixed(1) + ' away. Waiting for ' + ctx.oppName + '…');
          sound('tick');
          submit({ d: +d.toFixed(2), p: +p.toFixed(2) });
        };
        ctx.later(() => { if (onStop) onStop(true); }, ROUND);
      },
      compare(a, b) {
        const da = distOf(a), db = distOf(b);
        return Math.abs(da - db) < 0.05 ? 0 : da < db ? 1 : -1;
      },
      reveal(r, a, b, w) {
        if (b && Number.isFinite(b.p)) { $('ptThem').style.left = b.p + '%'; $('ptThem').classList.remove('hidden'); }
        const say = v => (distOf(v) >= 100 ? 'no stop' : distOf(v).toFixed(1) + ' away');
        setMsg('ptMsg', 'You: ' + say(a) + ' · ' + ctx.oppName + ': ' + say(b) + (w > 0 ? ' · Point for you!' : w < 0 ? ' · Point for ' + ctx.oppName + '.' : ' · Tie!'));
      },
      botValue(r) {
        const rd = rounds[r - 1];
        const d = Math.min(60, Math.abs(gauss(0, 14 - skillOf(ctx) * 11)));
        const p = clamp(rd.target + (Math.random() < 0.5 ? -d : d), 0, 100);
        return { d: +Math.abs(p - rd.target).toFixed(2), p: +p.toFixed(2) };
      },
      botDelay() { return 1200 + Math.random() * 3500; },
    });
  },
});

/* ================= DODGE ================= */

CA.games.add('dodge', {
  name: 'Dodge', icon: '☄️', blurb: 'Move left and right to dodge the falling rocks. You have 3 lives. Whoever lasts longest wins!',
  start(ctx) {
    const LEN = L(25000);
    const ROCKS = ['☄️', '🪨', '💣', '🌵'];
    const falls = [];
    for (let t = 700; t < LEN + 1500;) {
      const k = t / LEN;
      falls.push({ at: t, x: 0.05 + ctx.rng() * 0.9, r: 0.035 + ctx.rng() * 0.03, v: 0.45 + k * 0.6 + ctx.rng() * 0.3, e: ROCKS[Math.floor(ctx.rng() * ROCKS.length)] });
      t += Math.max(150, 560 - k * 380) * (0.55 + ctx.rng() * 0.9);
    }
    const full = LEN / 100; // scores are tenths of a second; lasting the whole time adds 100 for each life left
    let finalize = null;
    scoreRace(ctx, {
      len: LEN,
      note: 'Last ' + Math.round(LEN / 1000) + ' seconds',
      timerId: 'dgTimer',
      barMax: full,
      barValue: n => Math.min(n, full),
      fmt: n => (n > full ? '🏁 ' + '❤️'.repeat(Math.round((n - full) / 100)) : (Math.min(n, full) / 10).toFixed(1) + 's'),
      html: bars => bars +
        '<div class="dg-wrap"><canvas class="dg-canvas" id="dgCanvas" width="600" height="360"></canvas><div class="dg-lives" id="dgLives">❤️❤️❤️</div></div>' +
        '<div class="timer"><i id="dgTimer"></i></div><p class="g-msg" id="dgMsg">Move with your mouse or finger, or the ← → keys.</p>',
      start(api) {
        const cv = $('dgCanvas');
        const g = cv.getContext('2d');
        const W = cv.width, H = cv.height, PY = H * 0.86, PR = W * 0.035;
        let x = 0.5, lives = 3, safeUntil = 0, left = false, right = false, dead = false, last = performance.now();
        const moveTo = e => { const r = cv.getBoundingClientRect(); x = clamp((e.clientX - r.left) / r.width, 0.04, 0.96); };
        ctx.listen(cv, 'pointermove', moveTo);
        ctx.listen(cv, 'pointerdown', e => { moveTo(e); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
        ctx.listen(document, 'keydown', e => {
          if (e.key === 'ArrowLeft' || e.key === 'a') { left = true; e.preventDefault(); }
          if (e.key === 'ArrowRight' || e.key === 'd') { right = true; e.preventDefault(); }
        });
        ctx.listen(document, 'keyup', e => {
          if (e.key === 'ArrowLeft' || e.key === 'a') left = false;
          if (e.key === 'ArrowRight' || e.key === 'd') right = false;
        });
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const frame = () => {
          if (!ctx.alive() || !api.running()) return;
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          if (left) x = clamp(x - 0.9 * dt, 0.04, 0.96);
          if (right) x = clamp(x + 0.9 * dt, 0.04, 0.96);
          const t = api.elapsed();
          g.clearRect(0, 0, W, H);
          g.fillStyle = 'rgba(255,255,255,.06)';
          g.fillRect(0, PY + PR + 6, W, H);
          g.fillStyle = '#fff'; // (emoji are drawn with this color's see-through-ness)
          for (const f of falls) {
            if (f.at > t) break;
            const y = (t - f.at) / 1000 * f.v * H - f.r * W;
            if (y > H + 40) continue;
            const fx = f.x * W, fr = f.r * W;
            g.font = Math.round(fr * 2.1) + 'px ' + EMOJI_FONT;
            g.fillText(f.e, fx, y);
            if (!f.hit && now > safeUntil && Math.hypot(fx - x * W, y - PY) < fr + PR * 0.8) {
              f.hit = true;
              lives--;
              safeUntil = now + 1000;
              sound('miss');
              setMsg('dgLives', '❤️'.repeat(lives) + '🖤'.repeat(3 - lives));
              if (lives <= 0) {
                dead = true;
                setMsg('dgMsg', 'Out of lives! You lasted ' + (t / 1000).toFixed(1) + 's.');
                api.set(Math.max(1, Math.floor(t / 100)));
                api.done();
                return;
              }
            }
          }
          if (!(now < safeUntil && Math.floor(now / 100) % 2)) {
            g.font = Math.round(PR * 2.2) + 'px ' + EMOJI_FONT;
            g.fillText('🐱', x * W, PY);
          }
          api.set(Math.max(1, Math.floor(t / 100)));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        finalize = () => {
          if (dead) return;
          api.set(full + lives * 100);
          setMsg('dgMsg', 'You made it with ' + lives + (lives === 1 ? ' life' : ' lives') + ' left! 🎉');
        };
      },
      stop: () => { if (finalize) finalize(); },
      bot(skill) {
        const dieAt = gauss(12000 + skill * 16000, 4000) * (LEN / 25000);
        if (dieAt >= LEN) return { final: full + (1 + Math.floor(skill * 2 + Math.random())) * 100, at: LEN, dieAt: LEN };
        return { final: Math.max(10, Math.floor(dieAt / 100)), at: Math.max(1000, dieAt), dieAt };
      },
      botCurve: (bot, ms) => Math.min(ms, bot.dieAt) / 100,
      botNow: (bot, ms) => Math.max(1, Math.floor(Math.min(ms, bot.dieAt) / 100)),
    });
  },
});

/* ================= MINI MAZE RACE ================= */

function makeMaze(n, rng) { // walls[cell] = [up, right, down, left], 1 = wall
  const walls = Array.from({ length: n * n }, () => [1, 1, 1, 1]);
  const seen = new Array(n * n).fill(false);
  const stack = [0];
  seen[0] = true;
  const MOVES = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const cx = c % n, cy = Math.floor(c / n);
    const opts = MOVES.filter(([dx, dy]) => { const x = cx + dx, y = cy + dy; return x >= 0 && y >= 0 && x < n && y < n && !seen[y * n + x]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy, w, o] = opts[Math.floor(rng() * opts.length)];
    const nb = (cy + dy) * n + cx + dx;
    walls[c][w] = 0;
    walls[nb][o] = 0;
    seen[nb] = true;
    stack.push(nb);
  }
  return walls;
}

CA.games.add('maze', {
  name: 'Mini Maze Race', icon: '🌀', blurb: 'You both get the same maze. Guide your cat to the 🏁 first!',
  start(ctx) {
    const LEN = L(30000);
    const N = 9;
    const walls = makeMaze(N, ctx.rng);
    const EXIT = N * N - 1;
    const DIRS = { u: [0, -1, 0], r: [1, 0, 1], d: [0, 1, 2], l: [-1, 0, 3] };
    const dist = new Array(N * N).fill(-1);
    dist[EXIT] = 0;
    for (const q = [EXIT]; q.length;) {
      const c = q.shift();
      for (const k in DIRS) {
        const [dx, dy, w] = DIRS[k];
        if (walls[c][w]) continue;
        const nb = c + dx + dy * N;
        if (dist[nb] < 0) { dist[nb] = dist[c] + 1; q.push(nb); }
      }
    }
    let path = 'M0,0H' + N + 'M0,0V' + N;
    for (let c = 0; c < N * N; c++) {
      const x = c % N, y = Math.floor(c / N);
      if (walls[c][1]) path += 'M' + (x + 1) + ',' + y + 'V' + (y + 1);
      if (walls[c][2]) path += 'M' + x + ',' + (y + 1) + 'H' + (x + 1);
    }
    const progress = c => Math.round((1 - dist[c] / dist[0]) * 1000) / 1000;
    scoreRace(ctx, {
      len: LEN,
      note: 'First to the 🏁 wins',
      timerId: 'mzTimer',
      barMax: 1,
      endsRace: true,
      fmt: n => Math.round(n * 100) + '%',
      html: bars => bars +
        '<div class="mz-wrap"><svg class="mz-svg" id="mzSvg" viewBox="-0.15 -0.15 ' + (N + 0.3) + ' ' + (N + 0.3) + '">' +
        '<text class="mz-flag" x="' + (N - 0.5) + '" y="' + (N - 0.45) + '">🏁</text>' +
        '<path class="mz-walls" d="' + path + '"/><circle class="mz-me" id="mzMe" cx="0.5" cy="0.5" r="0.3"/></svg>' + padHTML('mzPad') + '</div>' +
        '<div class="timer"><i id="mzTimer"></i></div><p class="g-msg" id="mzMsg">Use the arrow keys, WASD, swipes or the buttons.</p>',
      start(api) {
        let pos = 0;
        const me = $('mzMe');
        onDirections(ctx, 'mzPad', $('mzSvg'), d => {
          if (!api.running()) return;
          const [dx, dy, w] = DIRS[d];
          if (walls[pos][w]) { sound('miss'); return; }
          pos += dx + dy * N;
          me.setAttribute('cx', pos % N + 0.5);
          me.setAttribute('cy', Math.floor(pos / N) + 0.5);
          sound('tick');
          api.set(progress(pos));
          if (pos === EXIT) { setMsg('mzMsg', 'You made it out! 🎉'); api.done(); }
        });
        if (window.__testHooks) window.__peek = { maze: { walls, dist, N, pos: () => pos } };
      },
      bot(skill) {
        const T = Math.max(6000, gauss(21000 - skill * 9000, 3500)) * (LEN / 30000);
        return T < LEN ? { final: 1, at: T } : { final: Math.round(LEN / T * 100) / 100, at: LEN };
      },
      botNow: (bot, ms) => Math.min(0.99, Math.round(bot.final * Math.min(1, ms / bot.at) * 100) / 100),
      reveal: (a, b, w) => setMsg('mzMsg', w > 0 ? (a >= 1 ? 'You got out first! 🎉' : 'You got closer to the exit!') : w < 0 ? (b >= 1 ? ctx.oppName + ' got out first.' : ctx.oppName + ' got closer to the exit.') : 'Tie!'),
    });
  },
});

/* ================= STACK TOWER ================= */

// No clock: the blocks speed up as the tower grows, so everyone misses sooner or later. Once the other player is out,
// you keep stacking until you pass their tower (or miss first).
CA.games.add('stack', {
  name: 'Stack Tower', icon: '🧱', blurb: 'Drop each sliding block onto the tower. It speeds up as it grows! Miss the tower and you are out. No clock: the taller tower wins, so keep going until you beat the other player.',
  start(ctx) {
    const LIMIT = L(150000); // (only a safety limit: the blocks get so fast that someone misses long before this)
    const speeds = [];
    for (let i = 0; i < 300; i++) speeds.push(0.5 + Math.min(i, 70) * 0.04 + ctx.rng() * 0.15); // screen widths per second
    scoreRace(ctx, {
      len: LIMIT,
      untilBeaten: true,
      note: 'Taller tower wins · no time limit',
      passNote: n => ctx.oppName + "'s tower stopped at " + n + '. Beat it to win!',
      barMax: 25,
      html: bars => bars + '<canvas class="st-canvas" id="stCanvas" width="420" height="440"></canvas>' +
        '<p class="g-msg" id="stMsg">Tap, click or press Space to drop the block.</p>',
      start(api) {
        const cv = $('stCanvas');
        const g = cv.getContext('2d');
        const W = cv.width, H = cv.height, BH = 26;
        const tower = [{ x: W * 0.2, w: W * 0.6 }];
        const color = i => 'hsl(' + ((i * 29) % 360) + ' 75% 60%)';
        let cur = null;
        let over = false;
        let idle = null;
        const out = why => {
          over = true;
          sound('miss');
          const h = tower.length - 1;
          setMsg('stMsg', why + ' Your tower is ' + h + (h === 1 ? ' block' : ' blocks') + ' tall.' + (api.theirs === null ? ' Can ' + ctx.oppName + ' beat it?' : ''));
          api.done();
        };
        const next = () => {
          const i = tower.length - 1;
          const w = tower[i].w;
          cur = { w, dir: i % 2 ? -1 : 1, speed: speeds[Math.min(i, speeds.length - 1)] * W, x: i % 2 ? W - w : 0 };
          if (idle) ctx.cancel(idle);
          idle = ctx.later(() => { if (!over && api.running()) out('Too slow! (15 seconds without a drop)'); }, L(15000)); // (so nobody waits forever)
        };
        next();
        const drop = () => {
          if (!api.running() || over || !cur) return;
          const top = tower[tower.length - 1];
          const l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w);
          if (r - l < 3) { out('Missed!'); return; }
          tower.push({ x: l, w: r - l });
          sound(r - l > cur.w - 3 ? 'correct' : 'tick');
          next();
          api.set(tower.length - 1); // (passing the other player's tower wins right away)
          if (!api.running()) setMsg('stMsg', 'You beat ' + ctx.oppName + "'s tower! 🎉");
        };
        ctx.listen(cv, 'pointerdown', e => { e.preventDefault(); drop(); });
        ctx.listen(document, 'keydown', e => { if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); drop(); } });
        let last = performance.now();
        const frame = () => {
          if (!ctx.alive()) return;
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const live = cur && !over && api.running();
          if (live) {
            cur.x += cur.dir * cur.speed * dt;
            if (cur.x < 0) { cur.x = 0; cur.dir = 1; }
            if (cur.x + cur.w > W) { cur.x = W - cur.w; cur.dir = -1; }
          }
          const shift = Math.max(0, (tower.length + 2) * BH - H * 0.75);
          g.clearRect(0, 0, W, H);
          tower.forEach((b, i) => { g.fillStyle = color(i); g.fillRect(b.x, H - (i + 1) * BH + shift, b.w, BH - 2); });
          if (live) { g.fillStyle = color(tower.length); g.fillRect(cur.x, H - (tower.length + 1) * BH + shift, cur.w, BH - 2); }
          const beat = api.theirs; // once they're out: a line at their height
          if (beat !== null && beat >= 0) {
            const y = H - (beat + 1) * BH + shift - 1;
            if (y > 0 && y < H) {
              g.strokeStyle = '#ffb938';
              g.lineWidth = 2;
              g.setLineDash([8, 6]);
              g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
              g.setLineDash([]);
              g.fillStyle = '#ffb938';
              g.font = 'bold 15px sans-serif';
              g.textAlign = 'left';
              g.fillText(ctx.oppName + ': ' + beat, 8, y - 6);
            }
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        if (window.__testHooks) window.__peek = { stack: () => ({ cur, top: tower[tower.length - 1], over }), drop };
      },
      reveal: (a, b, w) => setMsg('stMsg', w > 0 ? (a > b ? 'Your tower is taller! 🎉' : 'Same height, but you got there first! 🎉')
        : w < 0 ? (b > a ? ctx.oppName + "'s tower is taller." : 'Same height, but ' + ctx.oppName + ' got there first.') : 'Same height! It is a tie.'),
      bot(skill) {
        const final = Math.max(3, Math.round(gauss(9 + skill * 13, 3)));
        return { final, at: final * (1500 - skill * 400) * (0.85 + Math.random() * 0.3) };
      },
    });
  },
});

/* ================= SNAKE SPRINT ================= */

CA.games.add('snake', {
  name: 'Snake Sprint', icon: '🐍', blurb: 'Eat as many apples as you can in 30 seconds. Crashing into a wall or your tail makes you start small again!',
  start(ctx) {
    const LEN = L(30000);
    const C = 18, R = 12;
    const foods = [];
    for (let i = 0; i < 400; i++) foods.push(Math.floor(ctx.rng() * C * R));
    scoreRace(ctx, {
      len: LEN,
      note: 'Most apples wins',
      timerId: 'snTimer',
      barMax: 15,
      html: bars => bars + '<div class="sn-wrap"><canvas class="sn-canvas" id="snCanvas" width="540" height="360"></canvas>' + padHTML('snPad') + '</div>' +
        '<div class="timer"><i id="snTimer"></i></div><p class="g-msg" id="snMsg">Steer with the arrow keys, WASD, swipes or the buttons.</p>',
      start(api) {
        const cv = $('snCanvas');
        const g = cv.getContext('2d');
        const S = cv.width / C;
        const D = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
        const BACK = { u: 'd', d: 'u', l: 'r', r: 'l' };
        const START = () => [{ x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }];
        let snake = START();
        let dir = 'r', nextDir = 'r', fi = 0, food = null, dead = false;
        let waitUntil = performance.now() + 900; // a moment to get ready (and after each crash)
        const placeFood = () => {
          food = null;
          while (fi < foods.length && !food) {
            const c = foods[fi++];
            const p = { x: c % C, y: Math.floor(c / C) };
            if (!snake.some(s => s.x === p.x && s.y === p.y)) food = p;
          }
        };
        const mid = v => v * S + S / 2;
        const drawApple = (x, y) => {
          const r = S * 0.36;
          const skin = g.createRadialGradient(x - r * 0.4, y - r * 0.2, r * 0.1, x, y + r * 0.15, r * 1.15);
          skin.addColorStop(0, '#ff8f8f');
          skin.addColorStop(0.45, '#ec2a3d');
          skin.addColorStop(1, '#a30f22');
          g.fillStyle = skin;
          g.beginPath();
          g.arc(x - r * 0.3, y + r * 0.12, r * 0.8, 0, Math.PI * 2);
          g.arc(x + r * 0.3, y + r * 0.12, r * 0.8, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#6b3e1e';
          g.lineWidth = Math.max(2, S * 0.08);
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(x, y - r * 0.5); g.quadraticCurveTo(x + r * 0.05, y - r * 0.95, x + r * 0.3, y - r * 1.15); g.stroke();
          g.fillStyle = '#3ddc84';
          g.beginPath(); g.ellipse(x + r * 0.62, y - r * 0.92, r * 0.44, r * 0.2, -0.45, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255, 255, 255, .6)';
          g.beginPath(); g.ellipse(x - r * 0.5, y - r * 0.12, r * 0.13, r * 0.24, 0.5, 0, Math.PI * 2); g.fill();
        };
        const drawSnake = () => {
          const n = snake.length;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          for (let i = n - 1; i > 0; i--) { // the body, getting thicker from the tail to the head
            const a = snake[i], b = snake[i - 1];
            g.strokeStyle = dead ? '#8b90a8' : i % 2 ? '#169c55' : '#22bd6c';
            g.lineWidth = S * (0.46 + 0.3 * (1 - i / n));
            g.beginPath(); g.moveTo(mid(a.x), mid(a.y)); g.lineTo(mid(b.x), mid(b.y)); g.stroke();
          }
          const h = snake[0];
          const [dx, dy] = D[dir];
          const hx = mid(h.x), hy = mid(h.y);
          if (!dead && Math.floor(performance.now() / 250) % 3 === 0) { // the tongue flicks now and then
            const tx = hx + dx * S * 0.72, ty = hy + dy * S * 0.72;
            g.strokeStyle = '#ff4d6d';
            g.lineWidth = Math.max(1.5, S * 0.06);
            g.beginPath();
            g.moveTo(hx + dx * S * 0.4, hy + dy * S * 0.4); g.lineTo(tx, ty);
            g.lineTo(tx + (dx - dy) * S * 0.12, ty + (dy + dx) * S * 0.12);
            g.moveTo(tx, ty); g.lineTo(tx + (dx + dy) * S * 0.12, ty + (dy - dx) * S * 0.12);
            g.stroke();
          }
          g.fillStyle = dead ? '#9aa0b8' : '#2ad07a';
          g.beginPath(); g.ellipse(hx + dx * S * 0.06, hy + dy * S * 0.06, S * 0.47, S * 0.47, 0, 0, Math.PI * 2); g.fill();
          for (const side of [-1, 1]) { // eyes, looking the way it's going
            const ex = hx + dx * S * 0.14 - dy * side * S * 0.21, ey = hy + dy * S * 0.14 + dx * side * S * 0.21;
            g.fillStyle = '#fff';
            g.beginPath(); g.arc(ex, ey, S * 0.14, 0, Math.PI * 2); g.fill();
            if (dead) {
              g.strokeStyle = '#333';
              g.lineWidth = 2;
              g.beginPath();
              g.moveTo(ex - S * 0.07, ey - S * 0.07); g.lineTo(ex + S * 0.07, ey + S * 0.07);
              g.moveTo(ex + S * 0.07, ey - S * 0.07); g.lineTo(ex - S * 0.07, ey + S * 0.07);
              g.stroke();
            } else {
              g.fillStyle = '#111';
              g.beginPath(); g.arc(ex + dx * S * 0.05, ey + dy * S * 0.05, S * 0.075, 0, Math.PI * 2); g.fill();
            }
          }
        };
        const draw = () => {
          g.clearRect(0, 0, cv.width, cv.height);
          for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { if ((x + y) % 2) { g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(x * S, y * S, S, S); } }
          if (food) drawApple(mid(food.x), mid(food.y));
          drawSnake();
          if (dead) { g.fillStyle = 'rgba(255,90,120,.25)'; g.fillRect(0, 0, cv.width, cv.height); }
        };
        placeFood();
        onDirections(ctx, 'snPad', cv, d => { if (d !== BACK[dir]) nextDir = d; });
        const step = () => {
          if (!api.running()) return;
          if (performance.now() < waitUntil) return;
          if (dead) { dead = false; snake = START(); dir = nextDir = 'r'; draw(); setMsg('snMsg', 'Go again!'); return; }
          dir = nextDir;
          const head = { x: snake[0].x + D[dir][0], y: snake[0].y + D[dir][1] };
          if (head.x < 0 || head.y < 0 || head.x >= C || head.y >= R || snake.some(s => s.x === head.x && s.y === head.y)) {
            dead = true;
            waitUntil = performance.now() + 1000;
            sound('miss');
            draw();
            setMsg('snMsg', 'Crash! You keep your apples, but start small again…');
            return;
          }
          snake.unshift(head);
          if (food && head.x === food.x && head.y === food.y) { api.add(1); sound('correct'); placeFood(); } else snake.pop();
          draw();
        };
        draw();
        ctx.every(step, 125);
        if (window.__testHooks) window.__peek = { snake: () => ({ snake, food, dir, C, R }) };
      },
      bot(skill) { return { final: Math.max(0, Math.round(gauss(5 + skill * 9, 2) * (LEN / 30000))), at: LEN * 0.95 }; },
    });
  },
});

/* ================= REMEMBER THE SEQUENCE ================= */

const SEQ_COLORS = ['#ff5d73', '#ff9f43', '#ffd93b', '#3ddc84', '#1ec8c8', '#4ea8ff', '#7c6cff', '#c56cf0', '#ff6fb5'];
const SEQ_NOTES = [262, 294, 330, 349, 392, 440, 494, 523, 587]; // each tile plays its own note

// Both players watch the same sequence and tap it back. Every round adds one more tile, and it goes on until
// someone slips: if you both slip in the same round, whoever got further wins (the same spot: that round again).
CA.games.add('sequence', {
  name: 'Remember the Sequence', icon: '🔁', blurb: 'Tiles light up one after another. Tap them back in the same order! Every round adds one more. The first to make a mistake loses.',
  start(ctx) {
    const skill = skillOf(ctx);
    const botMax = Math.max(3, Math.round(gauss(5 + skill * 5, 1.2))); // the longest sequence the bot can remember
    let len = 3;
    ctx.stage.innerHTML = '<div class="g-seq"><div class="sq-grid" id="sqGrid">' +
      SEQ_COLORS.map((c, i) => '<button class="sq-tile" data-i="' + i + '" style="--c:' + c + '" disabled></button>').join('') +
      '</div><div class="timer"><i id="sqTimer"></i></div><p class="g-msg" id="sqMsg"></p><p class="muted small center" id="sqThem"></p></div>';
    const tiles = [...ctx.stage.querySelectorAll('.sq-tile')];
    const flash = (k, cls, ms) => { tiles[k].classList.add(cls); ctx.later(() => tiles[k].classList.remove(cls), ms); };
    let onTap = null;
    ctx.listen($('sqGrid'), 'pointerdown', e => { const b = e.target.closest('.sq-tile'); if (b && onTap) { e.preventDefault(); onTap(+b.dataset.i); } });
    ctx.listen(document, 'keydown', e => { const k = '123456789'.indexOf(e.key); if (k >= 0 && onTap) onTap(k); });
    const okOf = v => !!(v && v.ok);
    const stepsOf = v => (v && Number.isFinite(v.steps) ? v.steps : 0);
    const onMs = n => Math.max(280, 560 - n * 30);
    const GAP = 150;
    const showMs = n => 700 + n * (onMs(n) + GAP);
    roundMatch(ctx, {
      revealMs: 2000,
      compare(a, b) {
        if (okOf(a) !== okOf(b)) return okOf(a) ? 1 : -1;
        if (okOf(a)) return 0; // you both got it: one more tile
        const sa = stepsOf(a), sb = stepsOf(b);
        return sa === sb ? 0 : sa > sb ? 1 : -1;
      },
      over: (my, op, r) => my !== op || r >= 40,
      play(r, submit) {
        const n = len;
        const seq = [];
        for (let i = 0; i < n; i++) { let k; do { k = Math.floor(ctx.rng() * 9); } while (k === seq[i - 1]); seq.push(k); }
        let pos = 0;
        if (window.__testHooks) window.__peek = { seq, pos: () => pos, taking: () => !!onTap };
        ctx.note('Round ' + r + ' · ' + n + ' tiles · first mistake loses');
        tiles.forEach(t => { t.disabled = true; t.className = 'sq-tile'; });
        setMsg('sqMsg', 'Watch carefully… 👀');
        setMsg('sqThem', '');
        resetTimer('sqTimer');
        seq.forEach((k, i) => ctx.later(() => { flash(k, 'lit', onMs(n)); sound([[SEQ_NOTES[k], 0, onMs(n) / 1000 * 0.9]]); }, 700 + i * (onMs(n) + GAP)));
        ctx.later(() => {
          const T = 2500 + n * 900;
          tiles.forEach(t => { t.disabled = false; });
          setMsg('sqMsg', 'Your turn! Tap the ' + n + ' tiles in the same order.');
          startTimer('sqTimer', T);
          const t0 = performance.now();
          let done = false;
          const end = ok => {
            if (done) return;
            done = true;
            onTap = null;
            tiles.forEach(t => { t.disabled = true; });
            stopTimer('sqTimer');
            submit({ ok, steps: pos, ms: Math.round(performance.now() - t0) });
          };
          onTap = k => {
            if (k === seq[pos]) {
              flash(k, 'lit', 180);
              sound([[SEQ_NOTES[k], 0, 0.15]]);
              pos++;
              if (pos === n) { setMsg('sqMsg', 'Perfect! Waiting for ' + ctx.oppName + '…'); end(true); }
              return;
            }
            flash(k, 'bad', 900);
            flash(seq[pos], 'hint', 900);
            sound('miss');
            setMsg('sqMsg', 'Oops! Tile ' + (pos + 1) + ' of ' + n + ' was that one.');
            end(false);
          };
          ctx.later(() => { if (!done) { setMsg('sqMsg', "Time's up!"); end(false); } }, T);
        }, showMs(n));
      },
      onTheirs() { setMsg('sqThem', ctx.oppName + ' is done'); },
      reveal(r, a, b, w) {
        const say = v => (okOf(v) ? '✅ all ' + len : '❌ ' + stepsOf(v) + ' of ' + len);
        let text = 'You ' + say(a) + ' · ' + ctx.oppName + ' ' + say(b);
        if (okOf(a) && okOf(b)) { len++; text += ' · Next: ' + len + ' tiles!'; }
        else if (w === 0) text += ' · You both slipped at the same spot. That round again!';
        else text += w > 0 ? ' · You win!' : ' · ' + ctx.oppName + ' wins.';
        setMsg('sqMsg', text);
        setMsg('sqThem', '');
      },
      botValue() {
        if (len < botMax || (len === botMax && Math.random() < 0.6)) return { ok: true, steps: len };
        return { ok: false, steps: Math.floor(Math.random() * len) };
      },
      botDelay() { return showMs(len) + len * (420 + (1 - skill) * 350) + 300; },
    });
  },
});

/* ================= CUP SHUFFLE ================= */

CA.games.add('cups', {
  name: 'Cup Shuffle', icon: '🥤', blurb: 'Watch which cup hides the ball, follow it through the shuffle, then pick it. It gets faster every round!',
  start(ctx) {
    const PICK = L(5000);
    const rounds = [5, 7, 9].map((count, i) => {
      const swaps = [];
      for (let s = 0; s < count; s++) {
        const a = Math.floor(ctx.rng() * 3);
        swaps.push([a, (a + 1 + Math.floor(ctx.rng() * 2)) % 3]);
      }
      return { ball: Math.floor(ctx.rng() * 3), swaps, ms: [430, 320, 240][i] };
    });
    const showMs = rd => 1300 + rd.swaps.length * (rd.ms + 60);
    ctx.stage.innerHTML = '<div class="g-cups"><div class="cp-table" id="cpTable">' +
      [0, 1, 2].map(k => '<button class="cp-cup" data-k="' + k + '" disabled><span class="cp-ball">⚽</span><span class="cp-mug"></span></button>').join('') +
      '</div><div class="timer"><i id="cpTimer"></i></div><p class="g-msg" id="cpMsg"></p></div>';
    const cups = [...ctx.stage.querySelectorAll('.cp-cup')];
    let slot = [0, 1, 2];
    let onPick = null;
    const place = ms => cups.forEach((c, k) => { c.style.transitionDuration = ms + 'ms'; c.style.left = slot[k] * 33.333 + '%'; });
    ctx.listen($('cpTable'), 'click', e => { const b = e.target.closest('.cp-cup'); if (b && onPick) onPick(+b.dataset.k); });
    const kOf = v => (v && Number.isInteger(v.k) ? v.k : -1);
    roundMatch(ctx, {
      revealMs: 2300,
      points(a, b, r) { const ball = rounds[r - 1].ball; return [kOf(a) === ball ? 1 : 0, kOf(b) === ball ? 1 : 0]; },
      over: (my, op, r) => r >= 3,
      play(r, submit) {
        const rd = rounds[r - 1];
        ctx.note('Round ' + r + ' of 3');
        slot = [0, 1, 2];
        place(0);
        cups.forEach(c => { c.disabled = true; c.className = 'cp-cup'; c.querySelector('.cp-ball').style.visibility = 'hidden'; });
        cups[rd.ball].querySelector('.cp-ball').style.visibility = 'visible';
        cups[rd.ball].classList.add('lift');
        setMsg('cpMsg', 'Watch the ball! 👀');
        if (window.__testHooks) window.__peek = { ball: rd.ball };
        ctx.later(() => cups[rd.ball].classList.remove('lift'), 1000);
        rd.swaps.forEach(([a, b], i) => ctx.later(() => {
          const ka = slot.indexOf(a), kb = slot.indexOf(b);
          slot[ka] = b;
          slot[kb] = a;
          place(rd.ms);
          sound('tick');
        }, 1300 + i * (rd.ms + 60)));
        ctx.later(() => {
          cups.forEach(c => { c.disabled = false; });
          setMsg('cpMsg', 'Which cup has the ball?');
          startTimer('cpTimer', PICK);
          let picked = false;
          onPick = k => {
            if (picked) return;
            picked = true;
            onPick = null;
            cups.forEach(c => { c.disabled = true; });
            if (k >= 0) cups[k].classList.add('picked');
            stopTimer('cpTimer');
            setMsg('cpMsg', k < 0 ? "Time's up!" : 'Locked in! Waiting for ' + ctx.oppName + '…');
            submit({ k });
          };
          ctx.later(() => { if (onPick) onPick(-1); }, PICK);
        }, showMs(rd));
      },
      onTheirs() { /* (their pick stays secret until the reveal) */ },
      reveal(r, a, b) {
        const ball = rounds[r - 1].ball;
        cups[ball].classList.add('lift');
        if (kOf(a) >= 0 && kOf(a) !== ball) cups[kOf(a)].classList.add('wrong');
        const ok = v => (kOf(v) === ball ? '✅' : '❌');
        setMsg('cpMsg', 'The ball was here! You ' + ok(a) + ' · ' + ctx.oppName + ' ' + ok(b));
      },
      botValue(r) {
        const ball = rounds[r - 1].ball;
        const right = Math.random() < clamp(0.55 + skillOf(ctx) * 0.4 - (r - 1) * 0.12, 0.2, 0.95);
        const others = [0, 1, 2].filter(k => k !== ball);
        return { k: right ? ball : others[Math.floor(Math.random() * 2)] };
      },
      botDelay(r) { return showMs(rounds[r - 1]) + 700 + Math.random() * 1800; },
    });
  },
});

/* ================= PENALTY SHOOTOUT ================= */

// Swipes (or mouse drags, or the arrow keys) pick a direction: 0 = left, 1 = the middle (up), 2 = right.
function onSwipe(ctx, surface, fn, aim) {
  let sx = 0, sy = 0, on = false;
  const dirOf = (dx, dy) => (Math.hypot(dx, dy) < 30 ? null : Math.abs(dx) > Math.abs(dy) * 0.7 ? (dx < 0 ? 0 : 2) : 1);
  ctx.listen(surface, 'pointerdown', e => {
    on = true;
    sx = e.clientX;
    sy = e.clientY;
    try { surface.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });
  ctx.listen(surface, 'pointermove', e => { if (on && aim) aim(dirOf(e.clientX - sx, e.clientY - sy)); });
  ctx.listen(surface, 'pointerup', e => {
    if (!on) return;
    on = false;
    fn(dirOf(e.clientX - sx, e.clientY - sy)); // (null: a tap, not a swipe)
  });
  ctx.listen(surface, 'pointercancel', () => { on = false; if (aim) aim(null); });
  ctx.listen(document, 'keydown', e => {
    const d = { ArrowLeft: 0, a: 0, A: 0, ArrowUp: 1, w: 1, W: 1, ArrowDown: 1, s: 1, S: 1, ArrowRight: 2, d: 2, D: 2 }[e.key];
    if (d !== undefined) { e.preventDefault(); fn(d); }
  });
}

// Kicks are stored in the shooter's directions (0 = the shooter's left). The goalie faces the other way, like on a
// real pitch: a shot to the shooter's left comes at the goalie's right, so the goalie's screen shows it mirrored.
CA.games.add('penalty', {
  name: 'Penalty Shootout', icon: '⚽', blurb: 'Swipe to shoot left, middle or right. Then swap: you are the goalie, and you swipe to dive! 3 kicks each, most goals wins.',
  start(ctx) {
    const PICK = L(5000);
    const iShoot = r => (r % 2 === 1) === ctx.isHost; // the host takes the first kick
    const ARROWS = ['⬅️', '⬆️', '➡️'];
    ctx.stage.innerHTML =
      '<div class="g-pen"><div class="pn-field" id="pnField">' +
      '<div class="pn-goal"><div class="pn-keeper" id="pnKeeper"><span class="pn-glove">🧤</span><span class="pn-body">🧍</span><span class="pn-glove">🧤</span>' +
      '<small class="pn-name">' + esc(ctx.oppName) + '</small></div></div>' +
      '<div class="pn-frame"></div><div class="pn-kicker">🧍<small class="pn-name">' + esc(ctx.oppName) + '</small></div>' +
      '<div class="pn-ball" id="pnBall">⚽</div>' +
      '<div class="pn-gloves" id="pnGloves"><span>🧤</span><span>🧤</span></div>' +
      '<div class="pn-aim hidden" id="pnAim"></div><div class="pn-big hidden" id="pnBig"></div></div>' +
      '<p class="pn-role" id="pnRole"></p><div class="timer"><i id="pnTimer"></i></div><p class="g-msg" id="pnMsg"></p></div>';
    const field = $('pnField');
    const ball = $('pnBall');
    const aim = d => {
      const el = $('pnAim');
      el.classList.toggle('hidden', d === null);
      if (d !== null) { el.textContent = ARROWS[d]; el.className = 'pn-aim a' + d; }
    };
    let onPick = null;
    onSwipe(ctx, field, d => {
      if (!onPick) return;
      if (d === null) { setMsg('pnMsg', 'Swipe it! Drag left, up or right.'); aim(null); return; }
      onPick(d);
    }, d => { if (onPick) aim(d); });
    const zOf = v => (v && Number.isInteger(v.z) && v.z >= 0 && v.z <= 2 ? v.z : 1);
    const kicksBy = (r, mine) => { let n = 0; for (let i = 1; i <= r; i++) if (iShoot(i) === mine) n++; return n; };
    roundMatch(ctx, {
      revealMs: 2600,
      points(a, b, r) {
        const shot = iShoot(r) ? zOf(a) : zOf(b);
        const dive = iShoot(r) ? zOf(b) : zOf(a);
        const goal = shot !== dive ? 1 : 0;
        return iShoot(r) ? [goal, 0] : [0, goal];
      },
      over(my, op, r) {
        if (r < 6) return my > op + (3 - kicksBy(r, false)) || op > my + (3 - kicksBy(r, true)); // nobody can catch up
        return (r % 2 === 0 && my !== op) || r >= 12;
      },
      play(r, submit) {
        const shoot = iShoot(r);
        ctx.note(r <= 6 ? 'Kick ' + Math.ceil(r / 2) + ' of 3' : 'Sudden death!');
        field.className = 'pn-field ' + (shoot ? 'shoot' : 'keep') + ' reset';
        ball.className = 'pn-ball';
        $('pnKeeper').className = 'pn-keeper';
        $('pnGloves').className = 'pn-gloves';
        $('pnBig').className = 'pn-big hidden';
        void field.offsetWidth; // (put everything back without animating)
        field.classList.remove('reset');
        aim(null);
        field.dataset.pick = '1';
        setMsg('pnRole', shoot ? '⚽ Your kick! Swipe left, up (middle) or right.' : "🧤 You're in goal! Swipe to dive left, up (stay in the middle) or right.");
        setMsg('pnMsg', 'On a computer: drag with the mouse, or use the arrow keys.');
        startTimer('pnTimer', PICK);
        let picked = false;
        onPick = d => { // d: the direction on your own screen
          if (picked) return;
          picked = true;
          onPick = null;
          delete field.dataset.pick;
          aim(d);
          stopTimer('pnTimer');
          setMsg('pnMsg', (shoot ? 'Shooting ' : 'Diving ') + ['left', 'up the middle', 'right'][d] + '! Waiting for ' + ctx.oppName + '…');
          sound('tick');
          submit({ z: shoot ? d : 2 - d });
        };
        ctx.later(() => { if (onPick) { onPick(Math.floor(Math.random() * 3)); setMsg('pnMsg', 'Too slow! We picked for you.'); } }, PICK);
      },
      onTheirs() { /* (secret until the kick) */ },
      reveal(r, a, b) {
        const shoot = iShoot(r);
        const shot = shoot ? zOf(a) : zOf(b), dive = shoot ? zOf(b) : zOf(a);
        const goal = shot !== dive;
        delete field.dataset.pick;
        aim(null);
        if (shoot) { ball.className = 'pn-ball to' + shot; $('pnKeeper').className = 'pn-keeper d' + dive; }
        else { ball.className = 'pn-ball at' + (2 - shot); $('pnGloves').className = 'pn-gloves d' + (2 - dive); }
        ctx.later(() => {
          const big = $('pnBig');
          big.textContent = goal ? 'GOAL! ⚽' : 'SAVED! 🧤';
          big.className = 'pn-big ' + (goal === shoot ? 'good' : 'bad');
          sound(goal === shoot ? 'point' : 'miss');
        }, 550);
        setMsg('pnMsg', shoot ? (goal ? 'You scored! ⚽' : ctx.oppName + ' saved it.') : (goal ? ctx.oppName + ' scored.' : 'Great save! 🧤'));
      },
      botValue() { return { z: Math.floor(Math.random() * 3) }; },
      botDelay() { return 800 + Math.random() * 2400; },
    });
  },
});

})();
