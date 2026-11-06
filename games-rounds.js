/* Three round games:
   Yarn Unravel: a tangle of yarn; trace your strand from the yarn ball to the end, faster than the other cat. Best of 3.
   Rock Paper Claw: rock paper scissors, but you also bet 1 to 3 claws on each round. The winner gets both bets. First to 10.
   Hot Potato Bomb: the cat holding the bomb has to answer a quick question to pass it. Whoever holds it when it blows up
   loses the round. First to 2. (The host's app keeps the bomb's time.) */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, startTimer, stopTimer, roundMatch, raceBars, skillOf } = CA.games.kit;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ================= YARN UNRAVEL ================= */

const YW = 960, YH = 540, YARN_MS = 25000, TOL = 30, AHEAD = 14;
const YARN_COLORS = ['#ff4d6d', '#37b4ff', '#ffd23f'];

// A smooth strand through some points (Catmull-Rom), as many small steps about 4px apart.
function strand(points) {
  const out = [];
  for (let k = 0; k < points.length - 1; k++) {
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1], p3 = points[Math.min(points.length - 1, k + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(4, Math.ceil(len / 4));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function tangle(rng, r) {
  const pts = n => { const a = []; for (let k = 0; k < n; k++) a.push([90 + rng() * (YW - 180), 110 + rng() * (YH - 170)]); return a; };
  const n = 6 + r; // (later rounds are more tangled)
  const strands = [0, 1, 2].map(() => strand(pts(n)));
  return { strands, mine: Math.floor(rng() * 3) };
}

CA.games.add('yarn', {
  name: 'Yarn Unravel', icon: '🧶',
  blurb: 'A tangle of yarn! Start at the glowing yarn ball and trace your strand all the way to the end. Stay on the yarn: go off it and you have to come back. Faster wins the round. Best of 3!',
  start(ctx) {
    const bars = raceBars(ctx, 100);
    ctx.stage.innerHTML =
      '<div class="g-yarn">' + bars.html +
      '<canvas class="yarn-cv" id="yarnCv" width="' + YW + '" height="' + YH + '"></canvas>' +
      '<div class="timer"><i id="yarnTimer"></i></div><p class="g-msg" id="yarnMsg">Get ready…</p></div>';
    const cv = $('yarnCv'), g = cv.getContext('2d');
    let botEvery = 0, tg = null, idx = 0, active = false, t0 = 0, ptr = null, off = false, raf = 0, sent = 0;
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * YW, (e.clientY - r.top) / r.height * YH]; };
    let onDone = null;

    function follow(p) {
      if (!active || !tg) return;
      const path = tg.strands[tg.mine];
      let best = -1;
      for (let k = idx; k < Math.min(path.length, idx + AHEAD + 1); k++) if (Math.hypot(path[k][0] - p[0], path[k][1] - p[1]) < TOL) best = k;
      off = best < 0;
      if (best > idx) {
        idx = best;
        const pct = Math.round(idx / (path.length - 1) * 100);
        bars.set('me', pct, pct + '%');
        if (performance.now() - sent > 150) { sent = performance.now(); ctx.send({ t: 'yp', p: pct }); }
        if (idx >= path.length - 1 && onDone) onDone();
      }
    }
    ctx.listen(cv, 'pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } ptr = pos(e); follow(ptr); });
    ctx.listen(cv, 'pointermove', e => { ptr = pos(e); follow(ptr); });
    ctx.on(m => { if (m && m.t === 'yp' && Number.isFinite(m.p)) bars.set('them', m.p, m.p + '%'); });

    function paint() {
      raf = requestAnimationFrame(paint);
      g.fillStyle = '#2b2033';
      g.fillRect(0, 0, YW, YH);
      g.fillStyle = 'rgba(255, 255, 255, .03)';
      for (let x = 0; x < YW; x += 48) g.fillRect(x, 0, 2, YH);
      if (!tg) return;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      tg.strands.forEach((s, k) => {
        g.strokeStyle = YARN_COLORS[k];
        g.globalAlpha = 0.9;
        g.lineWidth = 9;
        g.beginPath(); s.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        g.globalAlpha = 0.35;
        g.strokeStyle = '#000';
        g.lineWidth = 2;
        g.stroke();
        g.globalAlpha = 1;
      });
      const path = tg.strands[tg.mine];
      if (idx > 0) { // the part you've traced, glowing
        g.strokeStyle = '#ffffff';
        g.shadowColor = YARN_COLORS[tg.mine];
        g.shadowBlur = 16;
        g.lineWidth = 6;
        g.beginPath(); for (let j = 0; j <= idx; j++) (j ? g.lineTo(path[j][0], path[j][1]) : g.moveTo(path[j][0], path[j][1])); g.stroke();
        g.shadowBlur = 0;
      }
      // the yarn ball at the start (pulsing), and a fish at the end
      const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
      const [sx, sy] = path[0], [ex, ey] = path[path.length - 1];
      g.fillStyle = YARN_COLORS[tg.mine];
      g.globalAlpha = 0.3; g.beginPath(); g.arc(sx, sy, 30 * pulse, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.beginPath(); g.arc(sx, sy, 18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0, 0, 0, .35)'; g.lineWidth = 2;
      g.beginPath(); g.arc(sx - 4, sy - 2, 10, 0.3, 2.4); g.stroke();
      g.beginPath(); g.arc(sx + 5, sy + 3, 9, 3.5, 5.6); g.stroke();
      g.font = '34px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🐟', ex, ey);
      if (active && ptr) { // your paw, red when you're off the yarn
        g.fillStyle = off ? 'rgba(255, 70, 70, .8)' : 'rgba(255, 255, 255, .85)';
        g.beginPath(); g.arc(ptr[0], ptr[1], 9, 0, Math.PI * 2); g.fill();
      }
      const [cx, cy] = path[idx];
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.stroke();
    }
    paint();
    ctx.onEnd(() => cancelAnimationFrame(raf));

    const rate = ctx.bot ? 260 + skillOf(ctx) * 330 : 0; // the bot traces this many px a second
    const lenOf = p => { let L = 0; for (let k = 1; k < p.length; k++) L += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return L; };
    const timeOf = v => (Number.isFinite(v) ? v : YARN_MS * 2);
    roundMatch(ctx, {
      target: 2, maxRounds: 3, revealMs: 2400,
      play(r, submit) {
        ctx.note('Round ' + r + ' · best of 3');
        if (botEvery) { ctx.stopEvery(botEvery); botEvery = 0; }
        tg = tangle(ctx.rng, r);
        idx = 0; active = false; off = false;
        bars.set('me', 0, '0%');
        bars.set('them', 0, '0%');
        setMsg('yarnMsg', 'Find the glowing yarn ball…');
        ctx.later(() => {
          active = true;
          t0 = performance.now();
          sound('go');
          setMsg('yarnMsg', 'Trace your strand from the yarn ball to the 🐟!');
          startTimer('yarnTimer', YARN_MS);
          let done = false;
          onDone = () => {
            if (done) return;
            done = true; active = false; onDone = null;
            const ms = Math.round(performance.now() - t0);
            stopTimer('yarnTimer');
            sound('point');
            setMsg('yarnMsg', 'Done in ' + (ms / 1000).toFixed(2) + 's! Waiting for ' + ctx.oppName + '…');
            submit(ms);
          };
          ctx.later(() => {
            if (done) return;
            done = true; active = false; onDone = null;
            const path = tg.strands[tg.mine];
            setMsg('yarnMsg', 'Out of time!');
            submit(YARN_MS + Math.round((1 - idx / (path.length - 1)) * 10000)); // (not finished: the further you got, the better)
          }, YARN_MS);
          if (ctx.bot) {
            const total = lenOf(tg.strands[tg.mine]) / rate * 1000;
            botEvery = ctx.every(() => { const p = clamp(Math.round((performance.now() - t0) / total * 100), 0, 100); bars.set('them', p, p + '%'); }, 200);
          }
        }, 1400);
      },
      botValue() { return Math.round(lenOf(tg.strands[tg.mine]) / rate * 1000 * Math.max(0.8, gauss(1.1, 0.12))); }, // (play() has just made the tangle)
      botDelay(r, v) { return 1400 + v; },
      compare(a, b) { const ta = timeOf(a), tb = timeOf(b); return ta === tb ? 0 : ta < tb ? 1 : -1; },
      reveal(r, a, b, w) {
        const f = v => (timeOf(v) > YARN_MS ? 'didn\'t finish' : (timeOf(v) / 1000).toFixed(2) + 's');
        setMsg('yarnMsg', (w > 0 ? 'You win the round! ' : w < 0 ? ctx.oppName + ' wins the round. ' : 'Tie! ') + 'You: ' + f(a) + ' · ' + ctx.oppName + ': ' + f(b));
      },
    });
  },
});

/* ================= ROCK PAPER CLAW ================= */

const HANDS = { r: ['🪨', 'Rock'], p: ['📄', 'Paper'], s: ['✂️', 'Scissors'] };
const BEATS = { r: 's', p: 'r', s: 'p' };
const CLAW_WIN = 10, CLAW_MS = 9000;

CA.games.add('claw', {
  name: 'Rock Paper Claw', icon: '🐾',
  blurb: 'Rock paper scissors with a twist: bet 1, 2 or 3 claws on every round. The winner of the round takes both bets. Read the other cat\'s face! First to 10.',
  start(ctx) {
    ctx.stage.innerHTML =
      '<div class="g-rps g-claw">' +
      '<div class="rps-arena"><div class="rps-hand" id="clMe">❔</div><div class="rps-vs" id="clVs">VS</div><div class="rps-hand them" id="clThem">❔</div></div>' +
      '<div class="claw-bets"><span id="clMyBet"></span><span id="clTheirBet"></span></div>' +
      '<div class="timer"><i id="clTimer"></i></div>' +
      '<div class="rps-picks">' + Object.keys(HANDS).map((k, i) =>
        '<button class="rps-pick" data-c="' + k + '"><span>' + HANDS[k][0] + '</span>' + HANDS[k][1] + '<kbd>' + (i + 1) + '</kbd></button>').join('') + '</div>' +
      '<div class="claw-pick" id="clBet"><b>Bet:</b>' + [1, 2, 3].map(n => '<button data-b="' + n + '">' + '🐾'.repeat(n) + '<kbd>' + ['Q', 'W', 'E'][n - 1] + '</kbd></button>').join('') + '</div>' +
      '<p class="g-msg" id="clMsg"></p></div>';
    const picks = [...ctx.stage.querySelectorAll('.rps-pick')];
    const betBtns = [...ctx.stage.querySelectorAll('#clBet [data-b]')];
    let bet = 1, onPick = null;
    const showBet = () => betBtns.forEach(b => b.classList.toggle('on', Number(b.dataset.b) === bet));
    betBtns.forEach(b => ctx.listen(b, 'click', () => { bet = Number(b.dataset.b); showBet(); sound('tick'); }));
    picks.forEach(b => ctx.listen(b, 'click', () => { if (onPick) onPick(b.dataset.c); }));
    ctx.listen(document, 'keydown', e => {
      const k = { 1: 'r', 2: 'p', 3: 's' }[e.key];
      if (k && onPick) onPick(k);
      const b = { q: 1, w: 2, e: 3 }[e.key.toLowerCase()];
      if (b && onPick) { bet = b; showBet(); }
    });
    const valid = v => v && HANDS[v.h] && [1, 2, 3].includes(v.b);
    roundMatch(ctx, {
      revealMs: 2600,
      over: (my, op, r) => my >= CLAW_WIN || op >= CLAW_WIN || r >= 12,
      play(r, submit) {
        ctx.note('Round ' + r + ' · first to ' + CLAW_WIN + ' claws');
        setMsg('clMe', '❔'); setMsg('clThem', '❔'); setMsg('clMyBet', ''); setMsg('clTheirBet', ''); setMsg('clVs', 'VS');
        $('clMe').className = 'rps-hand';
        $('clThem').className = 'rps-hand them';
        picks.forEach(b => { b.disabled = false; b.classList.remove('picked'); });
        bet = 1; showBet();
        setMsg('clMsg', 'Pick your bet, then your hand!');
        startTimer('clTimer', CLAW_MS);
        let picked = false;
        onPick = c => {
          if (picked) return;
          picked = true;
          onPick = null;
          picks.forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.c === c); });
          setMsg('clMe', HANDS[c][0]);
          setMsg('clMyBet', 'Your bet: ' + '🐾'.repeat(bet));
          $('clMe').classList.add('locked');
          setMsg('clMsg', 'Locked in! Waiting for ' + ctx.oppName + '…');
          stopTimer('clTimer');
          sound('tick');
          submit({ h: c, b: bet });
        };
        ctx.later(() => { if (!picked) { onPick('rps'[Math.floor(Math.random() * 3)]); setMsg('clMsg', 'Too slow! We picked for you.'); } }, CLAW_MS);
      },
      onTheirs() { setMsg('clThem', '✅'); },
      points(a, b) {
        if (!valid(b)) return [a.b, 0];
        if (a.h === b.h) return [0, 0];
        return BEATS[a.h] === b.h ? [a.b + b.b, 0] : [0, a.b + b.b];
      },
      reveal(r, a, b, w) {
        setMsg('clMe', HANDS[a.h][0]);
        setMsg('clThem', valid(b) ? HANDS[b.h][0] : '❔');
        setMsg('clMyBet', 'You bet ' + '🐾'.repeat(a.b));
        setMsg('clTheirBet', valid(b) ? ctx.oppName + ' bet ' + '🐾'.repeat(b.b) : '');
        $('clMe').classList.add(w > 0 ? 'won' : w < 0 ? 'lost' : 'tied');
        $('clThem').classList.add(w < 0 ? 'won' : w > 0 ? 'lost' : 'tied');
        const pot = a.b + (valid(b) ? b.b : 0);
        setMsg('clVs', w ? '+' + pot : '=');
        setMsg('clMsg', w > 0 ? 'You take ' + pot + ' claws! 🐾' : w < 0 ? ctx.oppName + ' takes ' + pot + ' claws.' : 'Same hand: nobody scores.');
      },
      botValue() {
        const lv = skillOf(ctx);
        return { h: 'rps'[Math.floor(Math.random() * 3)], b: Math.random() < 0.2 + lv * 0.2 ? 3 : Math.random() < 0.5 ? 2 : 1 };
      },
      botDelay() { return 1200 + Math.random() * 3500; },
    });
  },
});

/* ================= HOT POTATO BOMB ================= */

const BOMB_WIN = 2;

function newTask() {
  const kind = Math.floor(Math.random() * 3);
  let q, ans, wrong = [];
  if (kind === 0) {
    const a = 2 + Math.floor(Math.random() * 9), b = 2 + Math.floor(Math.random() * 9);
    q = a + ' + ' + b; ans = a + b; wrong = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10];
  } else if (kind === 1) {
    const a = 2 + Math.floor(Math.random() * 8), b = 2 + Math.floor(Math.random() * 5);
    q = a + ' × ' + b; ans = a * b; wrong = [ans + a, ans - b, ans + 1, ans - 1];
  } else {
    const a = 10 + Math.floor(Math.random() * 20), b = 2 + Math.floor(Math.random() * 9);
    q = a + ' − ' + b; ans = a - b; wrong = [ans + 1, ans - 1, ans + 2, ans - 10];
  }
  wrong = [...new Set(wrong.filter(n => n !== ans && n >= 0))].sort(() => Math.random() - 0.5).slice(0, 2);
  const choices = [ans, ...wrong].sort(() => Math.random() - 0.5);
  return { q, ans, choices };
}

CA.games.add('potato', {
  name: 'Hot Potato Bomb', icon: '💣',
  blurb: 'Pass the bomb! When you\'re holding it, answer the quick question to throw it to the other cat. Nobody knows when it blows up. Whoever holds it when it goes BOOM loses the round. First to 2!',
  start(ctx) {
    ctx.stage.innerHTML =
      '<div class="g-potato">' +
      '<div class="pot-row"><div class="pot-cat" id="potMe">You</div><div class="pot-bomb" id="potBomb">💣</div><div class="pot-cat them" id="potThem">' + esc(ctx.oppName) + '</div></div>' +
      '<p class="pot-who" id="potWho">Get ready…</p>' +
      '<div class="pot-task" id="potTask"><b id="potQ"></b><div class="pot-choices" id="potChoices"></div></div>' +
      '<p class="g-msg" id="potMsg"></p></div>';
    const host = ctx.isHost || !!ctx.bot;
    const me = host ? 0 : 1, them = 1 - me;
    const sc = [0, 0];
    let round = 0, holder = -1, live = false, task = null, locked = 0, fuse = 0, roundAt = 0, passes = 0, tickT = null, botT = null;

    function show() {
      const mine = holder === me;
      $('potBomb').className = 'pot-bomb ' + (holder < 0 ? '' : mine ? 'at-me' : 'at-them');
      $('potMe').classList.toggle('hot', mine);
      $('potThem').classList.toggle('hot', holder === them);
      setMsg('potWho', !live ? '' : mine ? '🔥 YOU HAVE THE BOMB! Answer to pass it!' : ctx.oppName + ' has the bomb…');
      $('potWho').classList.toggle('hot', live && mine);
      $('potTask').classList.toggle('hidden', !(live && mine));
      if (live && mine) {
        task = newTask();
        setMsg('potQ', task.q + ' = ?');
        $('potChoices').innerHTML = task.choices.map((c, k) => '<button data-v="' + c + '">' + c + '<kbd>' + (k + 1) + '</kbd></button>').join('');
      }
    }
    function answer(v) {
      if (!live || holder !== me || !task || performance.now() < locked) return;
      if (Number(v) === task.ans) {
        sound('point');
        if (host) passTo(them); else ctx.send({ t: 'pp', r: round });
      } else {
        sound('miss');
        locked = performance.now() + 1100;
        setMsg('potMsg', '❌ Wrong! Frozen for a second…');
        ctx.later(() => setMsg('potMsg', ''), 1100);
      }
    }
    ctx.listen($('potChoices'), 'click', e => { const b = e.target.closest('[data-v]'); if (b) answer(b.dataset.v); });
    ctx.listen(document, 'keydown', e => {
      const k = Number(e.key);
      if (k >= 1 && k <= 3 && task && holder === me) answer(task.choices[k - 1]);
    });

    // ticking that speeds up the longer the bomb has been lit (it doesn't tell you when it'll go off)
    function tick() {
      if (!live) return;
      const el = (performance.now() - roundAt) / 1000;
      sound([[holder === me ? 900 : 600, 0, 0.03]]);
      $('potBomb').classList.remove('pulse'); void $('potBomb').offsetWidth; $('potBomb').classList.add('pulse');
      tickT = ctx.later(tick, Math.max(140, 700 - el * 35));
    }

    function setHolder(h) {
      holder = h;
      passes++;
      setMsg('potMsg', '');
      show();
      if (ctx.bot && holder === them) {
        if (botT) ctx.cancel(botT);
        const lv = skillOf(ctx);
        const ms = Math.max(600, gauss(2300 - lv * 1100, 400)) + (Math.random() < 0.15 - lv * 0.1 ? 1100 : 0);
        botT = ctx.later(() => { if (live && holder === them) passTo(me); }, ms);
      }
    }
    // (host) the bomb goes to player h, and the other app is told
    function passTo(h) {
      setHolder(h);
      if (!ctx.bot) ctx.send({ t: 'ph', r: round, h });
    }
    function boom(loser) {
      live = false;
      if (tickT) ctx.cancel(tickT);
      sc[1 - loser]++;
      ctx.score(sc[me], sc[them]);
      $('potBomb').className = 'pot-bomb boom';
      setMsg('potBomb', '💥');
      $('potTask').classList.add('hidden');
      setMsg('potWho', loser === me ? '💥 BOOM! It blew up in your paws!' : '💥 BOOM! ' + ctx.oppName + ' was holding it!');
      $('potWho').classList.remove('hot');
      sound(loser === me ? 'miss' : 'win');
      if (loser === me) ctx.oppCheer();
      ctx.later(() => {
        setMsg('potBomb', '💣');
        if (sc[0] >= BOMB_WIN || sc[1] >= BOMB_WIN) ctx.finish(sc[me] > sc[them] ? 'win' : 'lose');
        else if (host) nextRound();
      }, 2600);
    }
    function begin(r, h) {
      round = r;
      passes = 0;
      ctx.note('Round ' + r + ' · first to ' + BOMB_WIN);
      setMsg('potWho', '3…');
      ['2…', '1…'].forEach((s, k) => ctx.later(() => setMsg('potWho', s), (k + 1) * 600));
      ctx.later(() => {
        live = true;
        roundAt = performance.now();
        setHolder(h);
        tick();
        if (host) ctx.later(() => { if (live && round === r) { if (!ctx.bot) ctx.send({ t: 'pb', r, l: holder }); boom(holder); } }, fuse);
      }, 1800);
    }
    function nextRound() {
      const r = round + 1;
      fuse = Math.round(9000 + ctx.rng() * 13000);
      const h = r % 2 ? 0 : 1;
      if (!ctx.bot) ctx.send({ t: 'pr', r, h });
      begin(r, h);
    }
    ctx.on(m => {
      if (!m || typeof m !== 'object') return;
      if (!host) {
        if (m.t === 'pr') begin(m.r, m.h);
        if (m.t === 'ph' && m.r === round && live) setHolder(m.h);
        if (m.t === 'pb' && m.r === round && live) boom(m.l);
      } else if (m.t === 'pp' && m.r === round && live && holder === them) {
        passTo(me);
      }
    });
    ctx.score(0, 0);
    $('potTask').classList.add('hidden');
    if (host) ctx.later(nextRound, 600);
  },
});

})();
