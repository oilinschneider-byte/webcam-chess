/* Classic Games: random 1v1 matchmaking over PeerJS, five mini-games, talking cats, streaks and fish.
   Also runs Practice mode: the same games against a bot, with nothing counted. */
(() => {
'use strict';

const playRoot = document.getElementById('scr-play');
const practiceRoot = document.getElementById('scr-practice');
const $ = id => playRoot.querySelector('#' + id) || practiceRoot.querySelector('#' + id);

// Matchmaking without a server of our own: waiting players hold one of these PeerJS ids ("slots"),
// and searching players knock on the lower-numbered slots until someone answers.
const SLOT_PREFIX = 'camarcade-solos-v2-';
const SLOT_COUNT = 10;
const PEER_OPTS = { debug: 0 }; // probing slots causes expected "taken"/"unavailable" errors; we handle them ourselves
const CONN_OPTS = { reliable: true, serialization: 'json' };
const BOT_NAMES = ['Whiskers', 'Mittens', 'Biscuit', 'Pumpkin', 'Noodle', 'Pickles', 'Muffin', 'Nugget', 'Tofu', 'Waffles'];
const BOT_LEVEL = { easy: 1, medium: 5, hard: 9 };
const DEFAULT_MATH = {
  duration: 120,
  ops: [
    { kind: 'add', on: true, a1: 2, a2: 100, b1: 2, b2: 100 },
    { kind: 'sub', on: true, a1: 2, a2: 100, b1: 2, b2: 100 },
    { kind: 'mul', on: true, a1: 2, a2: 12, b1: 2, b2: 100 },
    { kind: 'div', on: true, a1: 2, a2: 12, b1: 2, b2: 100 },
  ],
};

let mode = 'solos';      // 'solos' = real players, 'practice' = bots
let practiceGame = null;
let mathSettings = DEFAULT_MATH;

let peer = null;
let mySlot = -1;
let searching = false;
let busySlots = {};      // slot -> time until which we won't knock there again
let reserved = null;
let reservedInfo = null;
let reserveTimer = null;
let searchStarted = 0;
let searchTick = null;
let conn = null;
let isHost = false;
let opp = null;
let outCall = null;
let inCall = null;
let lastSeen = 0;
let pingTimer = null;
let recentDevice = '';
let recentUntil = 0;
let talkOff = null;
let lastTalk = -1;
let lastTalkAt = 0;
let oppTalkTimer = null;
let muteThem = false;
let hideThem = false;
let remoteHasVideo = false;
let lastCallSig = '';     // which of mic ('a') / camera ('v') the call to the opponent carries

let match = null;        // { ctx, gameId, started, over }
let lastGame = null;
let againMine = false;
let againTheirs = false;

/* ================= SMALL HELPERS ================= */

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randSeed() { return (Math.random() * 4294967296) >>> 0; }
function gauss(mean, sd) {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function setMsg(id, text) { const el = $(id); if (el) el.textContent = text; }
function esc(s) { return CA.esc(s); }
function sound(kind) { CA.sound(kind); }
function practiceLevel() { try { return localStorage.getItem('camarcade-practice-level') || 'medium'; } catch (e) { return 'medium'; } }

function startTimer(id, ms) {
  const bar = $(id);
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '100%';
  bar.getBoundingClientRect();
  bar.style.transition = 'width ' + ms + 'ms linear';
  bar.style.width = '0%';
}
function stopTimer(id) {
  const bar = $(id);
  if (!bar) return;
  const w = bar.getBoundingClientRect().width;
  bar.style.transition = 'none';
  bar.style.width = w + 'px';
}
function resetTimer(id) {
  const bar = $(id);
  if (!bar) return;
  bar.style.transition = 'none';
  bar.style.width = '100%';
}

/* ================= THE MINI-GAMES ================= */

// Shared flow for games where both players act at once each round (then both answers are revealed).
function roundMatch(ctx, cfg) {
  const theirs = {};
  let round = 0;
  let my = 0;
  let op = 0;
  let mine = null;
  let resolvedRound = 0;
  let afkTimer = null;

  ctx.on(msg => {
    if (!msg || msg.t !== 'v' || !Number.isInteger(msg.r)) return;
    theirs[msg.r] = msg.v;
    if (msg.r === round) {
      if (cfg.onTheirs && mine === null) cfg.onTheirs(round);
      resolve();
    }
  });

  function start() {
    round++;
    mine = null;
    const r = round;
    cfg.play(r, value => {
      if (r !== round || mine !== null || !ctx.alive()) return;
      mine = value;
      ctx.send({ t: 'v', r, v: value });
      resolve();
    });
    if (ctx.bot) {
      const v = cfg.botValue(r);
      ctx.later(() => {
        theirs[r] = v;
        if (r !== round) return;
        if (cfg.onTheirs && mine === null) cfg.onTheirs(r);
        resolve();
      }, cfg.botDelay(r, v));
    } else if (r in theirs && cfg.onTheirs) {
      cfg.onTheirs(r);
    }
  }

  function resolve() {
    if (resolvedRound === round || mine === null) return;
    if (!(round in theirs)) {
      if (!ctx.bot && !afkTimer) {
        const r = round;
        afkTimer = ctx.later(() => { afkTimer = null; if (round === r && !(r in theirs)) ctx.afk(); }, 45000);
      }
      return;
    }
    if (afkTimer) { ctx.cancel(afkTimer); afkTimer = null; }
    resolvedRound = round;
    const t = theirs[round];
    const w = cfg.compare(mine, t);
    if (w > 0) my++;
    else if (w < 0) { op++; ctx.oppCheer(); }
    ctx.score(my, op);
    cfg.reveal(round, mine, t, w);
    sound(w > 0 ? 'point' : w < 0 ? 'miss' : 'tick');
    const r = round;
    ctx.later(() => {
      if (my >= cfg.target || op >= cfg.target || r >= cfg.maxRounds) ctx.finish(my > op ? 'win' : my < op ? 'lose' : 'draw');
      else start();
    }, cfg.revealMs || 2100);
  }

  ctx.score(0, 0);
  start();
}

const GAMES = {};

GAMES.rps = {
  name: 'Rock Paper Scissors', icon: '✊', blurb: 'Pick at the same time. First to 3 round wins.',
  start(ctx) {
    const CH = { r: ['🪨', 'Rock'], p: ['📄', 'Paper'], s: ['✂️', 'Scissors'] };
    const BEATS = { r: 's', p: 'r', s: 'p' };
    ctx.stage.innerHTML =
      '<div class="g-rps">' +
      '<div class="rps-arena"><div class="rps-hand" id="rpsMe">❔</div><div class="rps-vs">VS</div><div class="rps-hand them" id="rpsThem">❔</div></div>' +
      '<div class="timer"><i id="rpsTimer"></i></div>' +
      '<div class="rps-picks">' + Object.keys(CH).map((k, i) =>
        '<button class="rps-pick" data-c="' + k + '"><span>' + CH[k][0] + '</span>' + CH[k][1] + '<kbd>' + (i + 1) + '</kbd></button>').join('') + '</div>' +
      '<p class="g-msg" id="rpsMsg"></p></div>';
    const picks = [...ctx.stage.querySelectorAll('.rps-pick')];
    let onPick = null;
    picks.forEach(b => ctx.listen(b, 'click', () => { if (onPick) onPick(b.dataset.c); }));
    ctx.listen(document, 'keydown', e => {
      const k = { 1: 'r', 2: 'p', 3: 's' }[e.key];
      if (k && onPick) onPick(k);
    });
    roundMatch(ctx, {
      target: 3,
      maxRounds: 9,
      play(r, submit) {
        ctx.note('Round ' + r + ' · first to 3');
        setMsg('rpsMe', '❔');
        setMsg('rpsThem', '❔');
        $('rpsMe').className = 'rps-hand';
        $('rpsThem').className = 'rps-hand them';
        picks.forEach(b => { b.disabled = false; b.classList.remove('picked'); });
        setMsg('rpsMsg', 'Pick one!');
        startTimer('rpsTimer', 6000);
        let picked = false;
        onPick = c => {
          if (picked) return;
          picked = true;
          onPick = null;
          picks.forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.c === c); });
          setMsg('rpsMe', CH[c][0]);
          $('rpsMe').classList.add('locked');
          setMsg('rpsMsg', 'Locked in! Waiting for ' + ctx.oppName + '…');
          stopTimer('rpsTimer');
          sound('tick');
          submit(c);
        };
        ctx.later(() => {
          if (picked) return;
          const c = 'rps'[Math.floor(Math.random() * 3)];
          onPick(c);
          setMsg('rpsMsg', 'Too slow! We picked ' + CH[c][1] + ' for you.');
        }, 6000);
      },
      onTheirs() { setMsg('rpsThem', '✅'); },
      compare(a, b) {
        if (!CH[b]) return 1;
        return a === b ? 0 : BEATS[a] === b ? 1 : -1;
      },
      reveal(r, a, b, w) {
        setMsg('rpsMe', CH[a][0]);
        setMsg('rpsThem', CH[b] ? CH[b][0] : '❔');
        $('rpsMe').classList.add(w > 0 ? 'won' : w < 0 ? 'lost' : 'tied');
        $('rpsThem').classList.add(w < 0 ? 'won' : w > 0 ? 'lost' : 'tied');
        setMsg('rpsMsg',
          w > 0 ? CH[a][1] + ' beats ' + CH[b][1] + '. Point for you!'
          : w < 0 ? CH[b][1] + ' beats ' + CH[a][1] + '. Point for ' + ctx.oppName + '.'
          : 'You both picked ' + CH[a][1] + '. Tie!');
      },
      botValue() { return 'rps'[Math.floor(Math.random() * 3)]; },
      botDelay() { return 600 + Math.random() * 2400; },
    });
  },
};

GAMES.draw = {
  name: 'Quick Draw', icon: '⚡', blurb: 'Wait for GO, then click as fast as you can. Clicking too early loses the round!',
  start(ctx) {
    const delays = [];
    for (let i = 0; i < 9; i++) delays.push(1600 + Math.floor(ctx.rng() * 3000));
    ctx.stage.innerHTML =
      '<div class="g-draw"><button class="draw-pad" id="drawPad"><span class="draw-big" id="drawBig">Get ready…</span>' +
      '<span class="draw-sub" id="drawSub">Click here or press Space when it turns green</span></button>' +
      '<p class="g-msg" id="drawMsg"></p></div>';
    const pad = $('drawPad');
    let hit = null;
    ctx.listen(pad, 'pointerdown', e => { e.preventDefault(); if (hit) hit(); });
    ctx.listen(document, 'keydown', e => {
      if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); if (hit) hit(); }
    });
    roundMatch(ctx, {
      target: 3,
      maxRounds: 7,
      play(r, submit) {
        ctx.note('Round ' + r + ' · first to 3');
        let state = 'wait';
        let goAt = 0;
        pad.className = 'draw-pad wait';
        setMsg('drawBig', 'Wait for it…');
        setMsg('drawSub', "Don't click yet!");
        setMsg('drawMsg', '');
        const goTimer = ctx.later(() => {
          state = 'go';
          goAt = performance.now();
          pad.className = 'draw-pad go';
          setMsg('drawBig', 'GO!');
          setMsg('drawSub', 'Click!');
          sound('go');
          ctx.later(() => {
            if (state !== 'go') return;
            state = 'done';
            hit = null;
            pad.className = 'draw-pad done';
            setMsg('drawBig', 'Too slow!');
            submit({ ms: 3000 });
          }, 3000);
        }, delays[r - 1]);
        hit = () => {
          if (state === 'wait') {
            state = 'done';
            hit = null;
            ctx.cancel(goTimer);
            pad.className = 'draw-pad foul';
            setMsg('drawBig', 'Too early!');
            setMsg('drawSub', 'You clicked before GO');
            submit({ foul: true });
          } else if (state === 'go') {
            state = 'done';
            hit = null;
            const ms = Math.round(performance.now() - goAt);
            pad.className = 'draw-pad done';
            setMsg('drawBig', ms + ' ms');
            setMsg('drawSub', 'Waiting for ' + ctx.oppName + '…');
            submit({ ms });
          }
        };
      },
      compare(a, b) {
        const fa = !!a.foul;
        const fb = !b || !!b.foul || !Number.isFinite(b.ms);
        if (fa && fb) return 0;
        if (fa) return -1;
        if (fb) return 1;
        return a.ms === b.ms ? 0 : a.ms < b.ms ? 1 : -1;
      },
      reveal(r, a, b, w) {
        const f = v => (!v || v.foul ? 'too early' : v.ms >= 3000 ? 'too slow' : v.ms + ' ms');
        setMsg('drawSub', '');
        setMsg('drawMsg', 'You: ' + f(a) + ' · ' + ctx.oppName + ': ' + f(b) + ' · ' +
          (w > 0 ? 'point for you!' : w < 0 ? 'point for ' + ctx.oppName + '.' : 'tie!'));
      },
      botValue() {
        if (Math.random() < 0.05) return { foul: true };
        return { ms: Math.max(165, Math.round(gauss(410 - ctx.bot.level * 16, 45))) };
      },
      botDelay(r, v) { return v.foul ? delays[r - 1] * 0.6 : delays[r - 1] + v.ms; },
    });
  },
};

GAMES.tap = {
  name: 'Tap Race', icon: '👆', blurb: 'Tap the button (or press Space) as fast as you can for 5 seconds. Best of 3.',
  start(ctx) {
    const LEN = 5000;
    ctx.stage.innerHTML =
      '<div class="g-tap">' +
      '<div class="tap-bars">' +
      '<div class="tap-row"><span>You</span><div class="tap-bar"><i id="tapMeBar"></i></div><b id="tapMe">0</b></div>' +
      '<div class="tap-row them"><span id="tapThemName"></span><div class="tap-bar"><i id="tapThemBar"></i></div><b id="tapThem">0</b></div>' +
      '</div>' +
      '<button class="tap-btn" id="tapBtn" disabled>Get ready…</button>' +
      '<div class="timer"><i id="tapTimer"></i></div>' +
      '<p class="g-msg" id="tapMsg"></p></div>';
    setMsg('tapThemName', ctx.oppName);
    const btn = $('tapBtn');
    let tap = null;
    let liveRound = 0;
    const botCounts = {};
    const botCount = r => botCounts[r] || (botCounts[r] =
      Math.max(8, Math.round((5.4 + ctx.bot.level * 0.4 + (Math.random() - 0.5) * 1.6) * LEN / 1000)));
    const setBar = (who, n) => {
      $(who === 'me' ? 'tapMeBar' : 'tapThemBar').style.width = Math.min(100, n / 60 * 100) + '%';
      setMsg(who === 'me' ? 'tapMe' : 'tapThem', n);
    };
    ctx.listen(btn, 'pointerdown', e => { e.preventDefault(); if (tap) tap(); });
    ctx.listen(document, 'keydown', e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (tap) tap(); } });
    ctx.on(msg => { if (msg && msg.t === 'live' && msg.r === liveRound && Number.isFinite(msg.n)) setBar('them', msg.n); });
    roundMatch(ctx, {
      target: 2,
      maxRounds: 3,
      revealMs: 2400,
      play(r, submit) {
        ctx.note('Round ' + r + ' of 3');
        liveRound = r;
        let n = 0;
        setBar('me', 0);
        setBar('them', 0);
        btn.disabled = true;
        btn.className = 'tap-btn';
        resetTimer('tapTimer');
        setMsg('tapMsg', '');
        ['3', '2', '1'].forEach((s, i) => ctx.later(() => { btn.textContent = s; sound('tick'); }, i * 700));
        ctx.later(() => {
          btn.disabled = false;
          btn.classList.add('live');
          btn.textContent = 'TAP!';
          sound('go');
          startTimer('tapTimer', LEN);
          tap = () => {
            n++;
            setBar('me', n);
            btn.classList.remove('bump');
            void btn.offsetWidth;
            btn.classList.add('bump');
          };
          const live = ctx.every(() => ctx.send({ t: 'live', r, n }), 250);
          let botLive = null;
          if (ctx.bot) {
            const total = botCount(r);
            const t0 = performance.now();
            botLive = ctx.every(() => setBar('them', Math.min(total, Math.round(total * (performance.now() - t0) / LEN))), 120);
          }
          ctx.later(() => {
            tap = null;
            ctx.stopEvery(live);
            if (botLive) ctx.stopEvery(botLive);
            btn.disabled = true;
            btn.classList.remove('live');
            btn.textContent = "Time's up!";
            setMsg('tapMsg', 'Waiting for ' + ctx.oppName + '…');
            submit(n);
          }, LEN);
        }, 2100);
      },
      compare(a, b) {
        if (!Number.isFinite(b)) return 1;
        return a === b ? 0 : a > b ? 1 : -1;
      },
      reveal(r, a, b, w) {
        setBar('me', a);
        setBar('them', Number.isFinite(b) ? b : 0);
        setMsg('tapMsg', 'You: ' + a + ' taps · ' + ctx.oppName + ': ' + b + ' taps · ' +
          (w > 0 ? 'you win the round!' : w < 0 ? ctx.oppName + ' wins the round.' : 'tie!'));
      },
      botValue(r) { return botCount(r); },
      botDelay() { return 2100 + LEN + 200; },
    });
  },
};

// Math Sprint problems work like the "Napkin" setup: subtraction is addition in reverse, division is multiplication in reverse.
function makeProblem(settings, rng) {
  const ops = settings.ops.filter(o => o.on);
  const op = ops[Math.floor(rng() * ops.length)];
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const a = int(op.a1, op.a2);
  const b = int(op.b1, op.b2);
  if (op.kind === 'add') return { text: a + ' + ' + b, answer: a + b };
  if (op.kind === 'sub') return { text: (a + b) + ' − ' + a, answer: b };
  if (op.kind === 'mul') return { text: a + ' × ' + b, answer: a * b };
  return { text: (a * b) + ' ÷ ' + a, answer: b };
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

GAMES.math = {
  name: 'Math Sprint', icon: '🧮', blurb: 'Answer as many sums as you can in 2 minutes. Most right answers wins!',
  start(ctx) {
    const settings = ctx.math || (window.__mathSeconds ? Object.assign({}, DEFAULT_MATH, { duration: window.__mathSeconds }) : DEFAULT_MATH);
    const LEN = settings.duration * 1000;
    const problems = [];
    const problem = i => { while (problems.length <= i) problems.push(makeProblem(settings, ctx.rng)); return problems[i]; };
    ctx.stage.innerHTML =
      '<div class="g-math sprint">' +
      '<div class="sprint-top"><span class="sprint-time" id="spTime">' + fmtTime(LEN) + '</span>' +
      '<span class="sprint-score">You <b id="spMe">0</b></span>' +
      (ctx.solo ? '' : '<span class="sprint-score them"><span id="spThemName"></span> <b id="spThem">0</b></span>') + '</div>' +
      '<div class="math-q" id="mathQ">Get ready…</div>' +
      '<input class="math-in" id="mathIn" inputmode="numeric" autocomplete="off" placeholder="?" maxlength="5" aria-label="Your answer" disabled>' +
      '<div class="timer"><i id="mathTimer"></i></div><p class="g-msg" id="mathMsg">Type the answer. The next one comes as soon as you get it right.</p></div>';
    if (!ctx.solo) setMsg('spThemName', ctx.oppName);
    const input = $('mathIn');
    let check = null;
    ctx.listen(input, 'input', () => {
      const clean = input.value.replace(/[^0-9]/g, '');
      if (clean !== input.value) input.value = clean;
      if (check) check();
    });
    ctx.on(msg => { if (msg && msg.t === 'ms' && Number.isFinite(msg.n)) setMsg('spThem', msg.n); });

    const run = submit => {
      let i = 0;
      let score = 0;
      const t0 = performance.now();
      const show = () => { setMsg('mathQ', problem(i).text + ' ='); input.value = ''; };
      input.disabled = false;
      input.focus();
      show();
      startTimer('mathTimer', LEN);
      sound('go');
      check = () => {
        const want = String(problem(i).answer);
        const v = input.value;
        if (v === want) {
          score++;
          i++;
          setMsg('spMe', score);
          sound('correct');
          ctx.send({ t: 'ms', n: score });
          show();
        } else if (v.length >= want.length) {
          input.classList.remove('wrong');
          void input.offsetWidth;
          input.classList.add('wrong');
          const typed = v;
          ctx.later(() => { if (check && input.value === typed) input.value = ''; }, 260);
        }
      };
      const tick = ctx.every(() => setMsg('spTime', fmtTime(LEN - (performance.now() - t0))), 200);
      if (ctx.bot) {
        let botScore = 0;
        const next = () => ctx.later(() => { botScore++; setMsg('spThem', botScore); next(); }, Math.max(900, gauss(5200 - ctx.bot.level * 330, 900)));
        next();
      }
      ctx.later(() => {
        check = null;
        ctx.stopEvery(tick);
        setMsg('spTime', '0:00');
        input.disabled = true;
        setMsg('mathQ', "Time's up!");
        setMsg('mathMsg', 'You got ' + score + ' right.' + (ctx.solo ? '' : ' Waiting for ' + ctx.oppName + '…'));
        submit(score);
      }, LEN);
    };

    if (ctx.solo) { run(score => ctx.finishSolo(score)); return; }
    roundMatch(ctx, {
      target: 1,
      maxRounds: 1,
      revealMs: 2600,
      play(r, submit) { ctx.note(Math.round(LEN / 1000) + ' seconds · most right answers wins'); run(submit); },
      compare(a, b) {
        if (!Number.isFinite(b)) return 1;
        return a === b ? 0 : a > b ? 1 : -1;
      },
      reveal(r, a, b, w) {
        setMsg('spThem', b);
        setMsg('mathMsg', 'You: ' + a + ' right · ' + ctx.oppName + ': ' + b + ' right · ' +
          (w > 0 ? 'you win!' : w < 0 ? ctx.oppName + ' wins.' : "it's a tie!"));
      },
      botValue() { return 0; }, // the bot's live score above is what counts
      botDelay() { return LEN + 400; },
    });
  },
};

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function lineWinner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]];
  return null;
}
function minimax(b, turn, me) {
  const w = lineWinner(b);
  if (w) return w === me ? 10 : -10;
  if (b.every(Boolean)) return 0;
  let best = turn === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const s = minimax(b, turn === 'X' ? 'O' : 'X', me);
    b[i] = null;
    best = turn === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}
function bestMove(b, me) {
  let best = -Infinity;
  let picks = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = me;
    const s = minimax(b, me === 'X' ? 'O' : 'X', me);
    b[i] = null;
    if (s > best) { best = s; picks = [i]; } else if (s === best) picks.push(i);
  }
  return picks[Math.floor(Math.random() * picks.length)];
}

GAMES.ttt = {
  name: 'Tic-Tac-Toe', icon: '⭕', blurb: 'Get three in a row. First to win 2 games takes the match.',
  start(ctx) {
    const hostFirst = ctx.rng() < 0.5;
    ctx.stage.innerHTML =
      '<div class="g-ttt"><div class="ttt-board">' +
      Array.from({ length: 9 }, (_, i) => '<button class="ttt-cell" data-i="' + i + '"></button>').join('') +
      '</div><div class="timer"><i id="tttTimer"></i></div><p class="g-msg" id="tttMsg"></p></div>';
    const cells = [...ctx.stage.querySelectorAll('.ttt-cell')];
    const pending = [];
    let g = 0;
    let my = 0;
    let op = 0;
    let board = [];
    let myMark = 'X';
    let turnMine = false;
    let moves = 0;
    let locked = true;
    let turnTimer = null;
    const theirMark = () => (myMark === 'X' ? 'O' : 'X');
    const empties = () => board.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
    const randomEmpty = () => { const e = empties(); return e[Math.floor(Math.random() * e.length)]; };

    cells.forEach(c => ctx.listen(c, 'click', () => myMove(+c.dataset.i)));
    ctx.on(msg => {
      if (!msg || msg.t !== 'm' || !Number.isInteger(msg.i)) return;
      if (msg.g === g) theirMove(msg.i, msg.n);
      else if (msg.g > g) pending.push(msg);
    });

    function render() {
      cells.forEach((c, i) => {
        c.textContent = board[i] || '';
        c.className = 'ttt-cell' + (board[i] ? ' ' + board[i].toLowerCase() : '') + (!locked && turnMine && !board[i] ? ' open' : '');
      });
    }

    function newGame() {
      g++;
      board = Array(9).fill(null);
      moves = 0;
      locked = false;
      const hostStarts = g % 2 === 1 ? hostFirst : !hostFirst;
      const iStart = hostStarts === ctx.isHost;
      myMark = iStart ? 'X' : 'O';
      turnMine = iStart;
      ctx.note('Game ' + g + ' · you are ' + myMark + ' · first to 2 wins');
      render();
      nextTurn();
      const now = pending.filter(m => m.g === g);
      const later = pending.filter(m => m.g > g);
      pending.length = 0;
      pending.push(...later);
      now.forEach(m => theirMove(m.i, m.n));
    }

    function nextTurn() {
      if (turnTimer) ctx.cancel(turnTimer);
      startTimer('tttTimer', 10000);
      const m = moves;
      if (turnMine) {
        setMsg('tttMsg', 'Your turn! You are ' + myMark + '.');
        turnTimer = ctx.later(() => { if (turnMine && moves === m && !locked) myMove(randomEmpty()); }, 10000);
      } else {
        setMsg('tttMsg', ctx.oppName + ' is thinking…');
        turnTimer = ctx.bot
          ? ctx.later(() => { if (!turnMine && moves === m && !locked) place(botPick(), theirMark()); }, 500 + Math.random() * 900)
          : ctx.later(() => { if (!turnMine && moves === m && !locked) ctx.afk(); }, 40000);
      }
      render();
    }

    function botPick() {
      if (Math.random() < 0.3 + ctx.bot.level * 0.065) return bestMove(board.slice(), theirMark());
      return randomEmpty();
    }

    function myMove(i) {
      if (locked || !turnMine || board[i] || i == null) return;
      ctx.send({ t: 'm', g, i, n: moves });
      place(i, myMark);
    }

    function theirMove(i, n) {
      if (locked || turnMine || board[i] || i < 0 || i > 8 || n !== moves) return;
      place(i, theirMark());
    }

    function place(i, mark) {
      board[i] = mark;
      moves++;
      sound('tick');
      const w = lineWinner(board);
      if (w || moves === 9) { endGame(w); return; }
      turnMine = !turnMine;
      nextTurn();
    }

    function endGame(w) {
      locked = true;
      if (turnTimer) ctx.cancel(turnTimer);
      stopTimer('tttTimer');
      render();
      if (w) {
        const line = LINES.find(l => l.every(k => board[k] === w));
        line.forEach(k => cells[k].classList.add('win'));
        if (w === myMark) my++; else { op++; ctx.oppCheer(); }
      }
      ctx.score(my, op);
      setMsg('tttMsg', !w ? "It's a tie game!" : w === myMark ? 'Three in a row. You win this game!' : ctx.oppName + ' got three in a row.');
      sound(!w ? 'tick' : w === myMark ? 'point' : 'miss');
      ctx.later(() => {
        if (my >= 2 || op >= 2 || g >= 5) ctx.finish(my > op ? 'win' : my < op ? 'lose' : 'draw');
        else newGame();
      }, 1900);
    }

    ctx.score(0, 0);
    newGame();
  },
};

const GAME_IDS = Object.keys(GAMES);

function pickGame() {
  const forced = window.__forceGame; // lets the automated tests pick a game
  if (forced && GAMES[forced]) return forced;
  const pool = GAME_IDS.filter(g => g !== lastGame);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ================= MATCH FLOW ================= */

function makeCtx(gameId, seed, extra) {
  const timers = new Set();
  const intervals = new Set();
  const listeners = [];
  const handlers = [];
  const queue = [];
  const ctx = Object.assign({
    stage: $('stage'),
    rng: mulberry32(seed),
    isHost,
    bot: opp && opp.bot ? { level: opp.level } : null,
    oppName: opp ? opp.name : '',
    started: false,
    alive: () => !!match && match.ctx === ctx && !match.over,
    send(msg) { if (opp && !opp.bot) send({ t: 'g', m: msg }); },
    on(fn) { handlers.push(fn); },
    deliver(msg) {
      if (!ctx.alive()) return;
      if (!ctx.started) { queue.push(msg); return; }
      handlers.forEach(h => h(msg));
    },
    flush() { ctx.started = true; queue.splice(0).forEach(m => handlers.forEach(h => h(m))); },
    later(fn, ms) {
      const id = setTimeout(() => { timers.delete(id); if (ctx.alive()) fn(); }, ms);
      timers.add(id);
      return id;
    },
    cancel(id) { clearTimeout(id); timers.delete(id); },
    every(fn, ms) {
      const id = setInterval(() => { if (ctx.alive()) fn(); }, ms);
      intervals.add(id);
      return id;
    },
    stopEvery(id) { clearInterval(id); intervals.delete(id); },
    listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); },
    score(a, b) { setMsg('scMe', a); setMsg('scThem', b); },
    note(text) { setMsg('scNote', text || ''); },
    oppCheer() { if (opp && opp.bot) botTalk(700); },
    finish(outcome) { if (ctx.alive()) endMatch(outcome); },
    finishSolo(score) { if (ctx.alive()) endSolo(score); },
    afk() { if (ctx.alive()) endMatch('win', 'afk'); },
    cleanup() {
      timers.forEach(clearTimeout);
      timers.clear();
      intervals.forEach(clearInterval);
      intervals.clear();
      listeners.splice(0).forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o));
    },
  }, extra || {});
  return ctx;
}

function beginMatch(gameId, seed, extra) {
  if (match) { match.over = true; match.ctx.cleanup(); }
  lastGame = gameId;
  againMine = againTheirs = false;
  const ctx = makeCtx(gameId, seed, extra);
  const solo = !!(extra && extra.solo);
  match = { ctx, gameId, started: false, over: false, solo };
  const g = GAMES[gameId];
  CA.voice.setInGame(true); // your camera turns on for every game (if you allowed it)
  CA.showScreen('scr-play');
  $('matchView').classList.toggle('solo-run', solo);
  renderPlayers();
  setMsg('scMode', mode === 'practice' ? '🎯 Practice' + (solo ? '' : ' · ' + practiceLevel()) : '⚡ Classic Games');
  setMsg('scGame', g.icon + ' ' + g.name);
  ctx.score(0, 0);
  ctx.note('');
  $('stage').innerHTML = '<div class="stage-wait">Get ready…</div>';
  const go = () => {
    match.started = true;
    g.start(ctx);
    ctx.flush();
  };
  if (solo) countdown(ctx, go); else playVs(ctx, g, go);
}

function countdown(ctx, then) {
  let n = 3;
  const step = () => {
    if (n === 0) { then(); return; }
    $('stage').innerHTML = '<div class="stage-count">' + n + '</div>';
    sound('tick');
    n--;
    ctx.later(step, 800);
  };
  step();
}

function playVs(ctx, g, then) {
  const p = CA.profile;
  $('vsMeCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  $('vsThemCat').innerHTML = CA.catSVG(opp.equip, { label: opp.name, talker: 'opp' });
  setMsg('vsMeName', p.name);
  setMsg('vsThemName', opp.name);
  setMsg('vsMeTag', mode === 'practice' ? '🎯 Practice' : '🔥 ' + p.streak + ' streak');
  setMsg('vsThemTag', opp.bot ? '🤖 Bot · ' + practiceLevel() : '🔥 ' + opp.streak + ' streak');
  setMsg('vsIcon', g.icon);
  setMsg('vsGame', g.name);
  setMsg('vsBlurb', g.blurb);
  let n = 3;
  setMsg('vsCount', n);
  $('vs').classList.remove('hidden');
  sound('match');
  if (opp.bot) botTalk(900);
  const step = () => {
    n--;
    if (n > 0) { setMsg('vsCount', n); sound('tick'); ctx.later(step, 850); return; }
    $('vs').classList.add('hidden');
    then();
  };
  ctx.later(step, 1500);
}

function endMatch(outcome, reason) {
  if (!match || match.over) return;
  match.over = true;
  match.ctx.cleanup();
  $('vs').classList.add('hidden');
  if (!match.started) {
    showNoContest(opp.name + ' left before the game started. Nothing was counted.');
    return;
  }
  const counted = mode === 'solos' && !opp.bot && !(opp.device && opp.device === CA.deviceId());
  const res = counted ? CA.applyResult(outcome) : null;
  send({ t: 'card', card: myCard() });
  showResult(outcome, reason, res);
  sound(outcome === 'win' ? 'win' : outcome === 'lose' ? 'lose' : 'draw');
  if (opp.bot && outcome === 'lose') botTalk(1400);
}

function endSolo(score) {
  match.over = true;
  match.ctx.cleanup();
  const best = CA.setMathBest(score);
  sound(best ? 'win' : 'draw');
  $('stage').innerHTML =
    '<div class="result"><div class="result-badge">' + (best ? '🏆' : '🧮') + '</div><h2>' + score + ' right!</h2>' +
    '<p class="muted">' + (best ? 'New personal best!' : 'Your best is ' + CA.profile.mathBest + '.') + '</p>' +
    '<div class="row center result-btns"><button class="btn go big" data-act="again">↻ Try again</button>' +
    '<button class="btn big" data-act="settings">⚙️ Change settings</button><button class="btn ghost" data-act="menu">Menu</button></div></div>';
  wireResultButtons();
}

function showNoContest(text) {
  $('stage').innerHTML =
    '<div class="result"><div class="result-badge">👋</div><h2>Match cancelled</h2><p class="muted">' + esc(text) + '</p>' +
    '<div class="row center result-btns"><button class="btn solos-btn big" data-act="next">⚡ Find another player</button>' +
    '<button class="btn ghost" data-act="menu">Menu</button></div></div>';
  wireResultButtons();
}

function showResult(outcome, reason, res) {
  const g = GAMES[match.gameId];
  const title = outcome === 'win' ? 'You win!' : outcome === 'lose' ? 'You lost' : "It's a draw";
  const badge = outcome === 'win' ? '🏆' : outcome === 'lose' ? '😿' : '🤝';
  const text =
    reason === 'left' ? opp.name + ' left the match, so the win is yours.'
    : reason === 'afk' ? opp.name + ' stopped playing, so the win is yours.'
    : (outcome === 'win' ? 'You beat ' : outcome === 'lose' ? 'You lost to ' : 'You tied with ') + opp.name + ' at ' + g.name + '.';
  let body;
  if (mode === 'practice') {
    body = '<div class="streak-change">🎯 Practice game: your streak and fish stay the same.</div>';
  } else if (!res) {
    body = '<div class="streak-change">🧪 Practice match against your own other window, so nothing is counted.</div>';
  } else {
    let streakLine;
    if (outcome === 'win') {
      streakLine = '<div class="streak-change up">🔥 ' + res.before.streak + ' → <b>' + res.after.streak + '</b>' +
        (res.newBest ? ' <span class="best-tag">New best!</span>' : '') + '</div>';
    } else if (outcome === 'lose') {
      streakLine = res.before.streak > 0
        ? '<div class="streak-change down">Streak lost 😿 🔥 ' + res.before.streak + ' → <b>0</b></div>'
        : '<div class="streak-change">🔥 Streak: 0. Win the next one to start a streak!</div>';
    } else {
      streakLine = '<div class="streak-change">🔥 ' + res.after.streak + ' (a draw keeps your streak)</div>';
    }
    const tier = res.after.tier;
    const maxed = tier >= CA.PASS.length;
    const into = maxed ? CA.TIER_XP : res.after.xp - tier * CA.TIER_XP;
    body = streakLine +
      '<div class="rewards">' + (res.fish ? '<span class="reward fish">+' + res.fish + ' 🐟</span>' : '') + '<span class="reward xp">+' + res.xp + ' XP</span></div>' +
      '<div class="pass-mini"><div class="pass-mini-top"><span>🎟️ Streak Pass · Tier ' + tier + '</span><span>' +
      (maxed ? 'All tiers unlocked!' : into + ' / ' + CA.TIER_XP + ' XP') + '</span></div>' +
      '<div class="bar"><i style="width:' + Math.round(into / CA.TIER_XP * 100) + '%"></i></div>' +
      (res.after.tier > res.before.tier ? '<a class="tier-up" href="#/pass">🎁 You reached tier ' + tier + '! Claim your reward</a>' : '') +
      '</div>';
  }
  const buttons = mode === 'practice'
    ? '<button class="btn go big" data-act="again">↻ Play again</button><button class="btn ghost" data-act="menu">Menu</button>'
    : '<button class="btn solos-btn big" data-act="next">⚡ Next game</button>' +
      '<button class="btn big" data-act="again" id="againBtn">↻ Play again</button><button class="btn ghost" data-act="menu">Menu</button>';
  $('stage').innerHTML =
    '<div class="result ' + outcome + '"><div class="result-badge">' + badge + '</div><h2>' + title + '</h2>' +
    '<p class="muted">' + esc(text) + '</p>' + body +
    '<div class="row center result-btns">' + buttons + '</div><p class="muted small center" id="againNote"></p></div>';
  wireResultButtons();
  updateAgainButton();
}

function wireResultButtons() {
  $('stage').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'next') nextOpponent();
    else if (act === 'again') playAgain();
    else if (act === 'settings') CA.go('practice', { game: 'math' });
    else CA.go('menu');
  }));
}

function updateAgainButton() {
  const btn = $('againBtn');
  if (!btn || !opp || opp.bot) return;
  const note = $('againNote');
  if (opp.gone || !conn || !conn.open) {
    btn.disabled = true;
    if (note) note.textContent = opp.name + ' has left.';
    return;
  }
  btn.disabled = againMine;
  btn.textContent = againMine ? '⏳ Waiting for ' + opp.name + '…' : '↻ Play again';
  btn.classList.toggle('primary', againTheirs && !againMine);
  if (note) note.textContent = againTheirs && !againMine ? opp.name + ' wants to play again!' : '';
}

function playAgain() {
  if (match && match.solo) { startSolo(); return; }
  if (opp && opp.bot) { beginMatch(practiceGame, randSeed()); return; }
  if (!opp || opp.gone || !conn || !conn.open) { CA.toast('Your opponent has left.'); return; }
  againMine = true;
  send({ t: 'again' });
  updateAgainButton();
  maybeRestart();
}

function maybeRestart() {
  if (!againMine || !againTheirs || !isHost) return;
  const game = pickGame();
  const seed = randSeed();
  send({ t: 'start', game, seed });
  beginMatch(game, seed);
}

function skipPressed() {
  if (mode === 'practice') { CA.go('menu'); return; }
  if (match && match.started && !match.over) {
    CA.confirmBox('Skip this match?', 'Leaving in the middle of a game counts as a loss and resets your streak.', 'Skip', () => {
      forfeitIfPlaying();
      nextOpponent();
    });
    return;
  }
  nextOpponent();
}

function forfeitIfPlaying() {
  if (!match || !match.started || match.over) return;
  match.over = true;
  match.ctx.cleanup();
  if (mode === 'solos' && opp && !opp.bot && !(opp.device && opp.device === CA.deviceId())) {
    CA.applyResult('lose');
    CA.toast('You left the match, so it counted as a loss.');
  }
}

function nextOpponent() {
  rememberOpponent();
  mode = 'solos';
  startSearch();
}

function rememberOpponent() {
  if (opp && !opp.bot && opp.device) { recentDevice = opp.device; recentUntil = Date.now() + 20000; }
}

/* ================= PLAYERS ON SCREEN ================= */

function renderPlayers() {
  const p = CA.profile;
  $('meCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  $('themCat').innerHTML = opp ? CA.catSVG(opp.equip, { label: opp.name, talker: 'opp' }) : '';
  setMsg('scThemName', opp ? opp.name : '');
  updateTiles();
}

function updateTiles() {
  const human = !!opp && !opp.bot;
  if (opp) {
    setMsg('themName', opp.name + (opp.bot ? ' 🤖' : ''));
    setMsg('themMic', human && !opp.gone && !opp.mic ? ' 🔇' : '');
    setMsg('themStreak', opp.bot ? '🤖 ' + practiceLevel() : '🔥 ' + opp.streak);
    $('oppDot').className = 'dot ' + (opp.bot ? 'on' : opp.gone ? 'off' : 'on');
  }
  setMsg('meStreak', mode === 'practice' ? '🎯' : '🔥 ' + CA.profile.streak);
  setMsg('meMic', CA.voice.micOn() ? '' : ' 🔇');
  $('muteThemBtn').classList.toggle('hidden', !human);
  setMsg('muteThemBtn', muteThem ? '🔊 Unmute them' : '🔈 Mute them');
  if ($('unmuteBtn').classList.contains('hidden')) $('themVideo').muted = muteThem; // (stays muted until "Tap to hear them")
  setMsg('skipBtn', mode === 'practice' ? '✕ Quit' : '⏭ Skip');
  const mic = $('micBtn');
  mic.textContent = CA.voice.micOn() ? '🎤 Mic on' : CA.voice.hasMic() ? '🔇 Mic off' : '🎤 Turn on mic';
  mic.classList.toggle('off', CA.voice.hasMic() && !CA.voice.micOn());

  // Your camera (while it's on) and theirs (while they show it and you haven't hidden it); otherwise the cats.
  const meVideo = $('meVideo');
  const myCam = CA.voice.cameraOn();
  if (myCam && meVideo.srcObject !== CA.voice.camera) { meVideo.srcObject = CA.voice.camera; meVideo.play().catch(() => {}); }
  if (!myCam) meVideo.srcObject = null;
  meVideo.classList.toggle('hidden', !myCam);
  setMsg('faceBtn', myCam || CA.voice.camPending ? '🐱 Show my cat' : '📷 Show my face');
  const showThem = human && !opp.gone && opp.face && remoteHasVideo && !hideThem;
  $('themVideo').classList.toggle('hidden', !showThem);
  $('hideThemBtn').classList.toggle('hidden', !human || !opp.face);
  setMsg('hideThemBtn', hideThem ? '👀 Show their camera' : '🙈 Hide their camera');
}

// The bot "meows" (moves its mouth) now and then.
let botTalkTimer = null;
function botTalk(ms) {
  clearInterval(botTalkTimer);
  const end = Date.now() + ms;
  botTalkTimer = setInterval(() => {
    const done = Date.now() > end;
    CA.setMouths('talk-opp', done ? 0 : 0.3 + Math.random() * 0.7);
    if (done) clearInterval(botTalkTimer);
  }, 110);
}

function setOppMouth(v) {
  CA.setMouths('talk-opp', v);
  clearTimeout(oppTalkTimer);
  if (v > 0) oppTalkTimer = setTimeout(() => CA.setMouths('talk-opp', 0), 600);
}

/* ================= SEARCHING ================= */

function showSearch() {
  $('searchCat').innerHTML = CA.catSVG(CA.profile.equip, { bg: false, label: 'You', talker: 'me' });
  setMsg('searchTitle', 'Looking for a player…');
  setMsg('searchSub', 'Searching…');
  $('searchTip').classList.add('hidden');
  $('retryBtn').classList.add('hidden');
  $('searchView').classList.remove('hidden');
  searchStarted = Date.now();
  clearInterval(searchTick);
  searchTick = setInterval(updateSearch, 500);
}

function updateSearch() {
  const s = Math.floor((Date.now() - searchStarted) / 1000);
  setMsg('searchSub', 'Searching for ' + s + 's');
  if (s >= 10) $('searchTip').classList.remove('hidden');
}

function hideSearch() {
  clearInterval(searchTick);
  $('searchView').classList.add('hidden');
}

function searchFailed(text) {
  searching = false;
  clearInterval(searchTick);
  releasePeer();
  setMsg('searchTitle', "Can't find players right now");
  setMsg('searchSub', text);
  $('searchTip').classList.add('hidden');
  $('retryBtn').classList.remove('hidden');
}

/* ================= MATCHMAKING ================= */

function myCard() {
  const p = CA.profile;
  return { name: p.name, streak: p.streak, equip: p.equip, device: CA.deviceId(), mic: CA.voice.micOn(), face: CA.voice.cameraOn() };
}

function readCard(c) {
  const card = c && typeof c === 'object' ? c : {};
  const equip = {};
  if (card.equip && typeof card.equip === 'object') {
    for (const s of CA.SLOTS) {
      const id = card.equip[s.id];
      if (typeof id === 'string' && CA.ITEM[id] && CA.ITEM[id].slot === s.id) equip[s.id] = id;
    }
  }
  return {
    name: CA.cleanName(card.name) || 'Player', streak: Math.max(0, Math.floor(Number(card.streak) || 0)), equip,
    device: String(card.device || '').slice(0, 20), mic: !!card.mic, face: !!card.face, bot: false, gone: false,
  };
}

function isRecent(device) { return !!device && device === recentDevice && Date.now() < recentUntil; }

function startSearch() {
  hangUp();
  opp = null;
  mode = 'solos';
  searching = true;
  CA.voice.setInGame(true); // start the camera now so it's ready when someone is found
  CA.showScreen('scr-play');
  $('matchView').classList.remove('solo-run');
  $('stage').innerHTML = '';
  showSearch();
  claimSlot()
    .then(() => { if (searching) scanLoop(); })
    .catch(err => {
      if (!searching) return;
      console.warn('Matchmaking failed:', err);
      searchFailed("Can't reach the matchmaking server. Check your internet connection.");
    });
}

// Take the lowest free slot so other searchers can find us. Waiting players pile up at the
// bottom, so a newcomer's first knock (on the slot just below) usually lands on someone waiting.
function claimSlot() {
  return new Promise((resolve, reject) => {
    let slot = 0;
    const tryNext = () => {
      if (!searching) { reject(new Error('cancelled')); return; }
      if (slot >= SLOT_COUNT) { // every slot is busy: wait a moment and try again
        slot = 0;
        setTimeout(tryNext, 2000);
        return;
      }
      const mine = slot++;
      const p = new Peer(SLOT_PREFIX + mine, PEER_OPTS);
      let settled = false;
      p.on('open', () => {
        if (settled) return;
        settled = true;
        if (!searching) { p.destroy(); reject(new Error('cancelled')); return; }
        peer = p;
        mySlot = mine;
        wirePeer(p);
        resolve();
      });
      p.on('error', err => {
        if (settled) return;
        settled = true;
        try { p.destroy(); } catch (e) { /* ignore */ }
        if (err.type === 'unavailable-id') tryNext();
        else reject(err);
      });
    };
    tryNext();
  });
}

function wirePeer(p) {
  p.on('connection', onIncoming);
  p.on('call', onIncomingCall);
  p.on('error', err => {
    if (peer !== p || err.type === 'peer-unavailable') return; // empty slots are expected while searching
    console.warn('PeerJS error:', err.type, err);
    if (searching && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
      searchFailed('Lost the connection to the matchmaking server.');
    }
  });
  p.on('disconnected', () => {
    setTimeout(() => { if (peer === p && !p.destroyed && p.disconnected) p.reconnect(); }, 1000);
  });
}

// Knock on the lower-numbered slots. (Only the higher slot knocks, so two waiting players never both knock at once.)
async function scanLoop() {
  while (searching && !conn) {
    for (let s = mySlot - 1; s >= 0; s--) {
      if (!searching || conn) return;
      if (reserved) break;
      if ((busySlots[s] || 0) > Date.now()) continue; // they're mid-game; don't bother them for a bit
      if (await tryMatch(s)) return;
    }
    await sleep(900 + Math.random() * 900);
  }
}

function tryMatch(slot) {
  return new Promise(resolve => {
    const p = peer;
    if (!p || p.destroyed || p.disconnected) { resolve(false); return; }
    const target = SLOT_PREFIX + slot;
    let finished = false;
    let c = null;
    const onErr = err => {
      if (err.type === 'peer-unavailable' && String(err.message || '').includes(target)) done(false);
    };
    // No answer at all usually means a stale slot from a closed tab: skip it for a while.
    const timer = setTimeout(() => { busySlots[slot] = Date.now() + 30000; done(false); }, 7000);
    function done(ok) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      p.off('error', onErr);
      if (!ok && c && conn !== c) { try { c.close(); } catch (e) { /* ignore */ } }
      resolve(ok);
    }
    p.on('error', onErr);
    try { c = p.connect(target, CONN_OPTS); } catch (e) { done(false); return; }
    if (!c) { done(false); return; }
    c.on('open', () => { if (!finished) c.send({ t: 'hi', card: myCard() }); });
    c.on('data', msg => {
      if (conn === c) { onNet(msg); return; }
      if (finished || !msg) return;
      if (msg.t === 'busy') { busySlots[slot] = Date.now() + 30000; done(false); return; }
      if (msg.t === 'welcome') {
        const card = readCard(msg.card);
        if (!searching || conn || reserved || isRecent(card.device) || !GAMES[msg.game]) {
          try { c.send({ t: 'cancel' }); } catch (e) { /* ignore */ }
          setTimeout(() => done(false), 200);
          return;
        }
        c.send({ t: 'go' });
        done(true);
        commit(c, false, card, msg.game, msg.seed >>> 0);
      }
    });
    c.on('close', () => { if (conn === c) onConnClosed(); else done(false); });
    c.on('error', () => done(false));
  });
}

function onIncoming(c) {
  let greeted = false;
  c.on('data', msg => {
    if (conn === c) { onNet(msg); return; }
    if (!msg) return;
    if (!greeted) {
      if (msg.t !== 'hi') return;
      greeted = true;
      const card = readCard(msg.card);
      // (Being mid-knock ourselves is fine: if that knock also gets a welcome, we cancel it because we're reserved.)
      if (!searching || conn || reserved || isRecent(card.device)) {
        try { c.send({ t: 'busy' }); } catch (e) { /* ignore */ }
        setTimeout(() => { try { c.close(); } catch (e) { /* ignore */ } }, 400);
        return;
      }
      reserved = c;
      reservedInfo = { card, game: pickGame(), seed: randSeed() };
      c.send({ t: 'welcome', card: myCard(), game: reservedInfo.game, seed: reservedInfo.seed });
      clearTimeout(reserveTimer);
      reserveTimer = setTimeout(() => {
        if (reserved !== c) return;
        reserved = null;
        try { c.close(); } catch (e) { /* ignore */ }
      }, 10000);
      return;
    }
    if (reserved !== c) return;
    if (msg.t === 'go') {
      const info = reservedInfo;
      clearTimeout(reserveTimer);
      reserved = null;
      if (!searching || conn) { try { c.send({ t: 'bye' }); c.close(); } catch (e) { /* ignore */ } return; }
      commit(c, true, info.card, info.game, info.seed);
    } else if (msg.t === 'cancel') {
      clearTimeout(reserveTimer);
      reserved = null;
      try { c.close(); } catch (e) { /* ignore */ }
    }
  });
  c.on('close', () => {
    if (reserved === c) { clearTimeout(reserveTimer); reserved = null; }
    if (conn === c) onConnClosed();
  });
  c.on('error', err => console.warn('Connection error:', err));
}

function commit(c, asHost, card, game, seed) {
  searching = false;
  hideSearch();
  conn = c;
  isHost = asHost;
  opp = card;
  muteThem = false;
  hideThem = false;
  lastSeen = Date.now();
  startHeartbeat();
  startTalking();
  callOpponent();
  sendMediaState(); // the camera may have finished starting while we were matching
  sound('found');
  beginMatch(game, seed);
}

function sendMediaState() { send({ t: 'media', mic: CA.voice.micOn(), face: CA.voice.cameraOn() }); }

function send(msg) {
  if (conn && conn.open) {
    try { conn.send(msg); } catch (e) { console.warn('Send failed:', e); }
  }
}

function onNet(msg) {
  lastSeen = Date.now();
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'ping':
      return;
    case 'talk':
      if (Number.isFinite(msg.v)) setOppMouth(Math.max(0, Math.min(1, msg.v)));
      return;
    case 'g':
      if (match && !match.over) match.ctx.deliver(msg.m);
      return;
    case 'media':
      if (opp) { opp.mic = !!msg.mic; opp.face = !!msg.face; updateTiles(); }
      return;
    case 'card':
      if (opp) {
        const c = readCard(msg.card);
        opp.name = c.name;
        opp.streak = c.streak;
        opp.equip = c.equip;
        updateTiles();
      }
      return;
    case 'again':
      againTheirs = true;
      updateAgainButton();
      if (!againMine) sound('notify');
      maybeRestart();
      return;
    case 'start':
      if (!isHost && GAMES[msg.game]) beginMatch(msg.game, msg.seed >>> 0);
      return;
    case 'bye':
      onConnClosed();
      return;
  }
}

function startHeartbeat() {
  clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (!conn || !conn.open) return;
    send({ t: 'ping' });
    if (Date.now() - lastSeen > 45000) onConnClosed();
  }, 3000);
}

// Send how loud you are (a few times a second) so your cat's mouth moves on their screen too.
function startTalking() {
  stopTalking();
  talkOff = CA.voice.onLevel(v => {
    const q = Math.round(v * 10) / 10;
    const now = performance.now();
    if (q === lastTalk || (now - lastTalkAt < 70 && q !== 0)) return;
    lastTalk = q;
    lastTalkAt = now;
    send({ t: 'talk', v: q });
  });
}

function stopTalking() {
  if (talkOff) { talkOff(); talkOff = null; }
  lastTalk = -1;
}

function onConnClosed() {
  if (!conn && (!opp || opp.gone)) return;
  const c = conn;
  conn = null;
  clearInterval(pingTimer);
  stopTalking();
  closeCalls();
  setOppMouth(0);
  try { if (c) c.close(); } catch (e) { /* ignore */ }
  if (!opp || opp.bot || opp.gone) return;
  opp.gone = true;
  updateTiles();
  if (match && !match.over) endMatch('win', 'left');
  else updateAgainButton();
}

// Leave the current opponent and free our slot.
function hangUp() {
  searching = false;
  clearTimeout(reserveTimer);
  reserved = null;
  clearInterval(pingTimer);
  stopTalking();
  if (match) { match.over = true; match.ctx.cleanup(); }
  $('vs').classList.add('hidden');
  if (conn && conn.open) { try { conn.send({ t: 'bye' }); } catch (e) { /* ignore */ } }
  const c = conn;
  conn = null;
  if (opp) opp.gone = true;
  closeCalls();
  releasePeer(c);
}

function releasePeer(c) {
  const p = peer;
  peer = null;
  mySlot = -1;
  setTimeout(() => {
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  }, 250);
}

/* ================= VOICE + CAMERA ================= */

function callSig() { return (CA.voice.hasMic() ? 'a' : '') + (CA.voice.cameraOn() ? 'v' : ''); }

// Sends your microphone (and camera, if it's on). Called again whenever either one starts or stops.
function callOpponent() {
  const stream = CA.voice.outgoing();
  if (outCall) { const o = outCall; outCall = null; o.close(); }
  lastCallSig = callSig();
  if (!peer || !conn || !conn.open || !stream || !opp || opp.bot) return;
  const call = peer.call(conn.peer, stream);
  if (!call) return;
  outCall = call;
  call.on('close', () => { if (outCall === call) outCall = null; });
  call.on('error', err => console.warn('Outgoing call error:', err));
}

function onIncomingCall(call) {
  if (!conn || call.peer !== conn.peer) { call.close(); return; }
  if (inCall) { const o = inCall; inCall = null; o.close(); }
  inCall = call;
  call.on('stream', stream => {
    if (inCall !== call) return;
    remoteHasVideo = stream.getVideoTracks().length > 0;
    const v = $('themVideo');
    v.srcObject = stream;
    v.muted = muteThem;
    const p = v.play();
    if (p && p.catch) {
      p.then(() => $('unmuteBtn').classList.add('hidden')).catch(() => {
        // the browser blocked sound until the page is clicked: play muted and offer a button
        v.muted = true;
        v.play().catch(() => {});
        $('unmuteBtn').classList.remove('hidden');
      });
    }
    updateTiles();
  });
  call.on('close', () => {
    if (inCall !== call) return;
    inCall = null;
    remoteHasVideo = false;
    $('themVideo').srcObject = null;
    updateTiles();
  });
  call.on('error', err => console.warn('Incoming call error:', err));
  call.answer(); // receive only: my own voice and camera go out on my own call
}

function closeCalls() {
  for (const c of [outCall, inCall]) if (c) { try { c.close(); } catch (e) { /* ignore */ } }
  outCall = inCall = null;
  remoteHasVideo = false;
  $('themVideo').srcObject = null;
  $('unmuteBtn').classList.add('hidden');
}

/* ================= PRACTICE ================= */

function startPractice(game) {
  hangUp();
  mode = 'practice';
  practiceGame = game;
  const lvl = practiceLevel();
  opp = {
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], bot: true, level: BOT_LEVEL[lvl] || 5,
    equip: randomOutfit(), streak: 0, mic: true, device: '', gone: false,
  };
  isHost = true;
  beginMatch(game, randSeed());
}

function startSolo() {
  hangUp();
  mode = 'practice';
  practiceGame = 'math';
  opp = null;
  beginMatch('math', randSeed(), { solo: true, math: mathSettings });
}

function randomOutfit() {
  const pick = slot => { const list = CA.ITEMS.filter(i => i.slot === slot); return list[Math.floor(Math.random() * list.length)].id; };
  const eq = { skin: pick('skin'), bg: pick('bg') };
  if (Math.random() < 0.6) eq.hat = pick('hat');
  if (Math.random() < 0.45) eq.eyes = pick('eyes');
  if (Math.random() < 0.6) eq.shirt = pick('shirt');
  if (Math.random() < 0.3) eq.neck = pick('neck');
  if (Math.random() < 0.25) eq.hand = pick('hand');
  return eq;
}

const NK = ['Add', 'Sub', 'Mul', 'Div'];

function showMathSettings() {
  hangUp();
  mode = 'practice';
  CA.voice.setInGame(false); // not playing yet: the camera waits for Start
  CA.showScreen('scr-practice');
  setMsg('nkBest', CA.profile.mathBest);
  setMsg('nkMsg', '');
}

function readMathSettings() {
  const num = id => Math.floor(Number($(id).value));
  const ops = NK.map(k => ({
    kind: k.toLowerCase(), on: $('nk' + k).checked,
    a1: num('nk' + k + 'A1'), a2: num('nk' + k + 'A2'), b1: num('nk' + k + 'B1'), b2: num('nk' + k + 'B2'),
  }));
  if (!ops.some(o => o.on)) return 'Tick at least one kind of problem.';
  for (const o of ops.filter(x => x.on)) {
    if (![o.a1, o.a2, o.b1, o.b2].every(n => Number.isFinite(n) && n >= 0 && n <= 9999)) return 'Use whole numbers from 0 to 9999.';
    if (o.a1 > o.a2 || o.b1 > o.b2) return 'In each "from … to …", the first number must be the smaller one.';
    if (o.kind === 'div' && o.a1 < 1) return "Division can't use 0 (you can't divide by zero).";
  }
  const duration = num('nkTime');
  if (!Number.isFinite(duration) || duration < 10 || duration > 600) return 'Pick a duration from 10 to 600 seconds.';
  return { duration, ops };
}

$('nkStart').addEventListener('click', () => {
  const s = readMathSettings();
  if (typeof s === 'string') { setMsg('nkMsg', s); $('nkMsg').className = 'msg center error'; return; }
  mathSettings = s;
  startSolo();
});

/* ================= WIRING ================= */

$('cancelSearchBtn').addEventListener('click', () => CA.go('menu'));
$('retryBtn').addEventListener('click', startSearch);
$('skipBtn').addEventListener('click', skipPressed);
$('micBtn').addEventListener('click', async () => {
  if (CA.voice.micOn()) CA.voice.setMic(false);
  else if (CA.voice.hasMic()) CA.voice.setMic(true);
  else if (await CA.voice.startMic()) CA.voice.setChoice('on');
  else CA.toast('The microphone is blocked. Allow it with the lock icon in the address bar.');
});
$('muteThemBtn').addEventListener('click', () => { muteThem = !muteThem; updateTiles(); });
$('faceBtn').addEventListener('click', () => {
  const on = !(CA.voice.cameraOn() || CA.voice.camPending);
  CA.voice.setCamWanted(on);
  if (!on) CA.toast('Now showing your cat. 🐱');
});
$('hideThemBtn').addEventListener('click', () => { hideThem = !hideThem; updateTiles(); });
function unmuteThem() {
  const v = $('themVideo');
  $('unmuteBtn').classList.add('hidden');
  v.muted = muteThem;
  v.play().catch(() => { // still blocked: keep their video playing without sound
    v.muted = true;
    v.play().catch(() => {});
    $('unmuteBtn').classList.remove('hidden');
  });
}
$('unmuteBtn').addEventListener('click', unmuteThem);
// Any click or key press is the "tap" the browser wants before it plays their voice.
['pointerdown', 'pointerup', 'keydown'].forEach(type => window.addEventListener(type, () => {
  if (!$('unmuteBtn').classList.contains('hidden')) unmuteThem();
}, { capture: true }));

window.addEventListener('ca:media', () => {
  if (CA.route !== 'solos' && CA.route !== 'practice') return;
  updateTiles();
  if (conn && conn.open && opp && !opp.bot) {
    sendMediaState();
    if (callSig() !== lastCallSig) callOpponent(); // the microphone or camera just started or stopped
  }
});
window.addEventListener('ca:change', () => {
  if ((CA.route === 'solos' || CA.route === 'practice') && CA.profile) setMsg('meStreak', mode === 'practice' ? '🎯' : '🔥 ' + CA.profile.streak);
});
window.addEventListener('pagehide', () => {
  forfeitIfPlaying(); // closing the page in the middle of a game counts as a loss, same as pressing Skip
  if (conn && conn.open) { try { conn.send({ t: 'bye' }); } catch (e) { /* ignore */ } }
  if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } }
});

const screenDef = {
  leave() {
    forfeitIfPlaying();
    rememberOpponent();
    hangUp();
    hideSearch();
    opp = null;
    match = null;
    clearInterval(botTalkTimer);
    clearTimeout(oppTalkTimer);
    CA.setMouths('talk-opp', 0);
    CA.voice.setInGame(false); // camera off outside games
  },
  canLeave(proceed) {
    if (mode !== 'solos' || !match || !match.started || match.over) return true;
    CA.confirmBox('Leave this match?', 'Leaving in the middle of a game counts as a loss and resets your streak.', 'Leave', () => {
      forfeitIfPlaying();
      proceed();
    });
    return false;
  },
};

// The first time you look for strangers with your camera on, say so once.
function enterSolos() {
  let seen = false;
  try { seen = localStorage.getItem('camarcade-camera-tip') === '1'; } catch (e) { /* ignore */ }
  if (seen || !CA.voice.camWanted()) { startSearch(); return; }
  CA.showScreen('scr-play');
  showSearch();
  clearInterval(searchTick); // nothing runs until you answer
  setMsg('searchSub', '');
  CA.modal({
    icon: '📷', locked: true,
    title: 'Other players will see you',
    text: "Classic Games matches you with people you don't know, and your camera will be on. Never share personal things like your real name, school or address. " +
      'Press 🐱 Show my cat to hide your face, or ⏭ Skip to leave any match.',
    buttons: [
      { label: 'Got it, find a match', primary: true, fn: () => { rememberTip(); startSearch(); } },
      { label: 'Play as my cat', fn: () => { rememberTip(); CA.voice.setCamWanted(false); startSearch(); } },
      { label: 'Cancel', fn: () => CA.go('menu') },
    ],
  });
}

function rememberTip() { try { localStorage.setItem('camarcade-camera-tip', '1'); } catch (e) { /* ignore */ } }

CA.register('solos', Object.assign({ enter: enterSolos }, screenDef));
CA.register('practice', Object.assign({
  enter(params) {
    const game = params.get('game');
    if (game === 'math') showMathSettings();
    else if (GAMES[game]) startPractice(game);
    else CA.go('menu');
  },
}, screenDef));

})();
