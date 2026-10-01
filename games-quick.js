/* Classic Games: Memory Match, Aim Targets and Higher or Lower.
   Games get a shared ctx from solos.js (seeded random numbers, messaging, timers) and work against bots too. */
(() => {
'use strict';

const { $, setMsg, sound, gauss, shuffle, startTimer, stopTimer, roundMatch, raceBars } = CA.games.kit;
const skillOf = ctx => (ctx.bot ? (ctx.bot.level - 1) / 8 : 0); // 0 = easy bot … 1 = hard bot
const msOf = v => (v && Number.isFinite(v.ms) ? v.ms : Infinity);
const secs = ms => (ms / 1000).toFixed(1) + 's';

/* ================= MEMORY MATCH ================= */

const FACES = ['🐶', '🐱', '🦊', '🐼', '🐸', '🐵', '🦄', '🐙', '🦁', '🐧', '🐢', '🦋', '🍕', '🍩', '⚽', '🚀', '🌈', '🍓'];

CA.games.add('memory', {
  name: 'Memory Match', icon: '🧠', blurb: 'Flip cards to find the 6 pairs. Clear the board first (or have the most pairs after 40 seconds) to win!',
  start(ctx) {
    const LEN = 40000;
    const PAIRS = 6;
    const picks = shuffle(FACES, ctx.rng).slice(0, PAIRS);
    const deck = shuffle(picks.concat(picks), ctx.rng);
    const bars = raceBars(ctx, PAIRS);
    ctx.stage.innerHTML =
      '<div class="g-mem">' + bars.html +
      '<div class="mem-grid">' + deck.map((f, i) =>
        '<button class="mem-card" data-i="' + i + '" aria-label="Card ' + (i + 1) + '"><span class="mem-back"></span><span class="mem-face">' + f + '</span></button>').join('') +
      '</div><div class="timer"><i id="memTimer"></i></div><p class="g-msg" id="memMsg">Get ready…</p></div>';
    const cards = [...ctx.stage.querySelectorAll('.mem-card')];
    const botT = ctx.bot ? Math.max(12000, gauss(44000 - skillOf(ctx) * 22000, 4000)) : 0; // how long the bot needs
    let open = [];
    let pairs = 0;
    let running = false;
    let t0 = 0;
    let closeTimer = null;
    let finishRace = null;
    const botPairs = () => Math.min(PAIRS - 1, Math.floor(PAIRS * (performance.now() - t0) / botT));

    function closeOpen() {
      if (closeTimer) { ctx.cancel(closeTimer); closeTimer = null; }
      open.forEach(i => cards[i].classList.remove('up'));
      open = [];
    }

    function flip(i) {
      const card = cards[i];
      if (!running || card.classList.contains('done') || open.includes(i)) return;
      if (open.length === 2) closeOpen(); // don't make fast players wait for the last pair to turn back
      card.classList.add('up');
      open.push(i);
      sound('flip');
      if (open.length < 2) return;
      const [a, b] = open;
      if (deck[a] !== deck[b]) { closeTimer = ctx.later(closeOpen, 750); return; }
      cards[a].classList.add('done');
      cards[b].classList.add('done');
      open = [];
      pairs++;
      bars.set('me', pairs);
      ctx.send({ t: 'live', n: pairs });
      sound('correct');
      if (pairs === PAIRS) { setMsg('memMsg', 'You found them all! 🎉'); finishRace(); }
    }

    cards.forEach((c, i) => ctx.listen(c, 'click', () => flip(i)));
    ctx.on(msg => { if (msg && msg.t === 'live' && Number.isFinite(msg.n)) bars.set('them', Math.max(0, Math.min(PAIRS, msg.n))); });

    const pairsOf = v => Math.max(0, Math.min(PAIRS, Math.floor(Number(v && v.pairs) || 0)));
    roundMatch(ctx, {
      target: 1,
      maxRounds: 1,
      revealMs: 2600,
      play(r, submit) {
        ctx.note('40 seconds · find all 6 pairs');
        running = true;
        t0 = performance.now();
        setMsg('memMsg', 'Find the pairs!');
        startTimer('memTimer', LEN);
        finishRace = () => {
          if (!running) return;
          running = false;
          closeOpen();
          stopTimer('memTimer');
          submit({ pairs, ms: Math.round(performance.now() - t0) });
        };
        ctx.later(() => { if (running) { setMsg('memMsg', "Time's up!"); finishRace(); } }, LEN);
        if (ctx.bot) ctx.every(() => { if (running) bars.set('them', botPairs()); }, 300);
      },
      onTheirs() { if (finishRace) finishRace(); }, // they're done, so the race is over
      compare(a, b) {
        const pa = pairsOf(a), pb = pairsOf(b);
        if (pa !== pb) return pa > pb ? 1 : -1;
        if (pa < PAIRS) return 0;
        const ma = msOf(a), mb = msOf(b);
        return ma === mb ? 0 : ma < mb ? 1 : -1;
      },
      reveal(r, a, b, w) {
        bars.set('me', pairsOf(a));
        bars.set('them', pairsOf(b));
        cards.forEach(c => c.classList.add('up'));
        setMsg('memMsg',
          w > 0 ? (pairsOf(a) === PAIRS ? 'You cleared the board in ' + secs(msOf(a)) + '!' : 'You found more pairs (' + pairsOf(a) + ' vs ' + pairsOf(b) + ')!')
          : w < 0 ? (pairsOf(b) === PAIRS ? ctx.oppName + ' cleared the board first.' : ctx.oppName + ' found more pairs (' + pairsOf(b) + ' vs ' + pairsOf(a) + ').')
          : 'You both found ' + pairsOf(a) + ' pairs. Tie!');
      },
      botValue() {
        return botT <= LEN ? { pairs: PAIRS, ms: Math.round(botT) } : { pairs: Math.floor(PAIRS * LEN / botT), ms: LEN };
      },
      botDelay(r, v) { return v.ms; },
      botNow() { return { pairs: botPairs(), ms: Math.round(performance.now() - t0) }; },
    });
  },
});

/* ================= AIM TARGETS ================= */

CA.games.add('aim', {
  name: 'Aim Targets', icon: '🎯', blurb: 'Click the targets as fast as you can for 20 seconds. Most hits wins!',
  start(ctx) {
    const LEN = 20000;
    const spots = [];
    for (let i = 0; i < 200; i++) spots.push([0.07 + ctx.rng() * 0.86, 0.1 + ctx.rng() * 0.8]);
    const bars = raceBars(ctx, 35);
    ctx.stage.innerHTML =
      '<div class="g-aim">' + bars.html +
      '<div class="aim-arena" id="aimArena"><button class="aim-target hidden" id="aimTarget" aria-label="Target"></button>' +
      '<span class="aim-big" id="aimBig">Get ready…</span></div>' +
      '<div class="timer"><i id="aimTimer"></i></div><p class="g-msg" id="aimMsg">Hit the targets!</p></div>';
    const arena = $('aimArena');
    const target = $('aimTarget');
    const rate = ctx.bot ? Math.max(0.4, gauss(0.7 + skillOf(ctx) * 0.8, 0.08)) : 0; // bot hits per second
    let hits = 0;
    let running = false;
    let t0 = 0;

    function place() {
      const [x, y] = spots[hits % spots.length];
      target.style.left = x * 100 + '%';
      target.style.top = y * 100 + '%';
      target.classList.remove('pop');
      void target.offsetWidth;
      target.classList.add('pop');
    }
    ctx.listen(target, 'pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (!running) return;
      hits++;
      bars.set('me', hits);
      ctx.send({ t: 'live', n: hits });
      sound('tick');
      place();
    });
    ctx.listen(arena, 'pointerdown', e => {
      if (!running || e.target !== arena) return;
      const r = arena.getBoundingClientRect();
      const m = document.createElement('span');
      m.className = 'aim-miss';
      m.style.left = (e.clientX - r.left) + 'px';
      m.style.top = (e.clientY - r.top) + 'px';
      arena.appendChild(m);
      ctx.later(() => m.remove(), 450);
    });
    ctx.on(msg => { if (msg && msg.t === 'live' && Number.isFinite(msg.n)) bars.set('them', msg.n); });

    const hitsOf = v => Math.max(0, Math.floor(Number(v && v.hits) || 0));
    roundMatch(ctx, {
      target: 1,
      maxRounds: 1,
      revealMs: 2600,
      play(r, submit) {
        ctx.note('20 seconds · most hits wins');
        ['3', '2', '1'].forEach((s, i) => ctx.later(() => { setMsg('aimBig', s); sound('tick'); }, i * 700));
        ctx.later(() => {
          running = true;
          t0 = performance.now();
          $('aimBig').classList.add('hidden');
          target.classList.remove('hidden');
          place();
          sound('go');
          startTimer('aimTimer', LEN);
          if (ctx.bot) ctx.every(() => { if (running) bars.set('them', Math.floor(rate * (performance.now() - t0) / 1000)); }, 250);
          ctx.later(() => {
            running = false;
            target.classList.add('hidden');
            setMsg('aimBig', "Time's up!");
            $('aimBig').classList.remove('hidden');
            setMsg('aimMsg', 'You hit ' + hits + '. Waiting for ' + ctx.oppName + '…');
            submit({ hits });
          }, LEN);
        }, 2100);
      },
      compare(a, b) {
        const ha = hitsOf(a), hb = hitsOf(b);
        return ha === hb ? 0 : ha > hb ? 1 : -1;
      },
      reveal(r, a, b, w) {
        bars.set('me', hitsOf(a));
        bars.set('them', hitsOf(b));
        setMsg('aimBig', w > 0 ? 'You win! 🎯' : w < 0 ? ctx.oppName + ' wins' : "It's a tie!");
        setMsg('aimMsg', 'You: ' + hitsOf(a) + ' hits · ' + ctx.oppName + ': ' + hitsOf(b) + ' hits');
      },
      botValue() { return { hits: Math.round(rate * LEN / 1000) }; },
      botDelay() { return 2100 + LEN + 200; },
    });
  },
});

/* ================= HIGHER OR LOWER ================= */

const SUITS = ['♠', '♥', '♦', '♣'];
const cardName = v => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[v] || String(v));
function cardHTML(c) {
  const red = c.s === 1 || c.s === 2;
  return '<div class="hl-card' + (red ? ' red' : '') + '"><b>' + cardName(c.v) + '</b><span>' + SUITS[c.s] + '</span><b class="flip">' + cardName(c.v) + '</b></div>';
}

CA.games.add('hilo', {
  name: 'Higher or Lower', icon: '🔢', blurb: 'Will the next card be higher or lower? Guess right to score. Most points after 5 cards wins! (A = 1, K = 13)',
  start(ctx) {
    const PICK_MS = 6000;
    const cards = [];
    for (let i = 0; i < 12; i++) cards.push({ v: 1 + Math.floor(ctx.rng() * 13), s: Math.floor(ctx.rng() * 4) });
    const LABEL = { h: '⬆️ Higher', l: '⬇️ Lower' };
    ctx.stage.innerHTML =
      '<div class="g-hilo">' +
      '<div class="hl-row"><div class="hl-slot"><small>Now</small><div id="hlNow"></div></div><div class="hl-arrow">➜</div>' +
      '<div class="hl-slot"><small>Next</small><div id="hlNext"></div></div></div>' +
      '<div class="hl-picks"><button class="hl-pick" data-c="h">⬆️ Higher<kbd>↑</kbd></button><button class="hl-pick" data-c="l">⬇️ Lower<kbd>↓</kbd></button></div>' +
      '<div class="timer"><i id="hlTimer"></i></div><p class="g-msg" id="hlMsg"></p><p class="muted small center" id="hlThem"></p></div>';
    const picks = [...ctx.stage.querySelectorAll('.hl-pick')];
    let onPick = null;
    picks.forEach(b => ctx.listen(b, 'click', () => { if (onPick) onPick(b.dataset.c); }));
    ctx.listen(document, 'keydown', e => {
      const k = { ArrowUp: 'h', ArrowDown: 'l' }[e.key];
      if (k && onPick) { e.preventDefault(); onPick(k); }
    });
    const right = r => (cards[r].v > cards[r - 1].v ? 'h' : cards[r].v < cards[r - 1].v ? 'l' : null);

    roundMatch(ctx, {
      revealMs: 2100,
      points(a, b, r) {
        const ok = right(r);
        return ok ? [a === ok ? 1 : 0, b === ok ? 1 : 0] : [0, 0];
      },
      over(my, op, r) { return (r >= 5 && my !== op) || r >= 8; },
      play(r, submit) {
        ctx.note(r <= 5 ? 'Card ' + r + ' of 5' : 'Tiebreaker!');
        $('hlNow').innerHTML = cardHTML(cards[r - 1]);
        $('hlNext').innerHTML = '<div class="hl-card back">?</div>';
        picks.forEach(b => { b.disabled = false; b.classList.remove('picked'); });
        setMsg('hlMsg', 'Higher or lower than ' + cardName(cards[r - 1].v) + '?');
        setMsg('hlThem', '');
        startTimer('hlTimer', PICK_MS);
        let picked = false;
        onPick = c => {
          if (picked) return;
          picked = true;
          onPick = null;
          picks.forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.c === c); });
          stopTimer('hlTimer');
          setMsg('hlMsg', 'You picked ' + LABEL[c] + '. Waiting for ' + ctx.oppName + '…');
          sound('tick');
          submit(c);
        };
        ctx.later(() => {
          if (picked) return;
          const c = Math.random() < 0.5 ? 'h' : 'l';
          onPick(c);
          setMsg('hlMsg', 'Too slow! We picked ' + LABEL[c] + ' for you.');
        }, PICK_MS);
      },
      onTheirs() { setMsg('hlThem', ctx.oppName + ' has picked ✅'); },
      reveal(r, a, b) {
        $('hlNext').innerHTML = cardHTML(cards[r]);
        const ok = right(r);
        const mark = v => (ok && v === ok ? '✅' : '❌');
        setMsg('hlMsg', !ok ? 'Same card! Nobody scores.' : (ok === 'h' ? 'Higher!' : 'Lower!') + ' You ' + mark(a) + ' · ' + ctx.oppName + ' ' + mark(b));
        setMsg('hlThem', ctx.oppName + ' picked ' + (LABEL[b] || 'nothing'));
      },
      botValue(r) {
        const cur = cards[r - 1].v;
        const better = cur < 7 ? 'h' : cur > 7 ? 'l' : Math.random() < 0.5 ? 'h' : 'l';
        return Math.random() < 0.55 + skillOf(ctx) * 0.4 ? better : better === 'h' ? 'l' : 'h';
      },
      botDelay() { return 700 + Math.random() * 2200; },
    });
  },
});

})();
