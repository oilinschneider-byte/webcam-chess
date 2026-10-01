/* Classic Games: Word Scramble and Type Race. */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, shuffle, startTimer, stopTimer, roundMatch, raceBars, L } = CA.games.kit;
const skillOf = ctx => (ctx.bot ? (ctx.bot.level - 1) / 8 : 0); // 0 = easy bot … 1 = hard bot
const msOf = v => (v && Number.isFinite(v.ms) ? v.ms : Infinity);
const secs = ms => (ms / 1000).toFixed(1) + 's';

/* ================= WORD SCRAMBLE ================= */

const WORDS = [
  'planet', 'rocket', 'banana', 'pencil', 'castle', 'dragon', 'jungle', 'pirate', 'monkey', 'turtle', 'garden', 'rabbit',
  'cookie', 'candle', 'window', 'orange', 'purple', 'yellow', 'silver', 'school', 'summer', 'winter', 'flower', 'forest',
  'island', 'desert', 'cheese', 'butter', 'carrot', 'tomato', 'potato', 'cactus', 'circle', 'square', 'bottle', 'basket',
  'jacket', 'button', 'pillow', 'mirror', 'rainbow', 'thunder', 'snowman', 'penguin', 'dolphin', 'octopus', 'giraffe',
  'gorilla', 'tiger', 'zebra', 'camel', 'horse', 'sheep', 'whale', 'shark', 'eagle', 'snake', 'lemon', 'grape', 'melon',
  'apple', 'peach', 'pizza', 'pasta', 'bread', 'honey', 'sugar', 'juice', 'water', 'cloud', 'storm', 'river', 'ocean',
  'beach', 'stone', 'plant', 'music', 'piano', 'guitar', 'dance', 'soccer', 'tennis', 'hockey', 'train', 'plane', 'truck',
  'robot', 'magic', 'ghost', 'crown', 'queen', 'knight', 'sword', 'tower', 'bridge', 'friend', 'doctor', 'farmer',
  'puzzle', 'secret', 'galaxy', 'comet', 'camera', 'laptop', 'candy', 'donut', 'waffle', 'popcorn', 'kitten', 'puppy',
  'spider', 'parrot', 'lizard', 'hamster', 'unicorn', 'wizard', 'balloon', 'bubble', 'marble', 'pocket', 'ladder',
  'helmet', 'engine', 'volcano', 'blanket',
];

function scramble(word, rng) {
  let s = word;
  for (let i = 0; i < 12 && s === word; i++) s = shuffle(word.split(''), rng).join('');
  return s;
}

CA.games.add('scramble', {
  name: 'Word Scramble', icon: '🔤', blurb: 'Unscramble the letters and type the word. Fastest to solve wins the round. First to 3!',
  start(ctx) {
    const ROUND = 15000;
    const words = shuffle(WORDS, ctx.rng).slice(0, 5);
    const mixed = words.map(w => scramble(w, ctx.rng));
    const skill = skillOf(ctx);
    ctx.stage.innerHTML =
      '<div class="g-words">' +
      '<div class="ws-tiles" id="wsTiles"></div>' +
      '<input class="math-in ws-in" id="wsIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="12" placeholder="type it" aria-label="Your answer" disabled>' +
      '<p class="muted small center ws-hint" id="wsHint"></p>' +
      '<div class="timer"><i id="wsTimer"></i></div><p class="g-msg" id="wsMsg"></p></div>';
    const input = $('wsIn');
    let check = null;
    let finishRound = null;
    ctx.listen(input, 'input', () => {
      const clean = input.value.toLowerCase().replace(/[^a-z]/g, '');
      if (clean !== input.value) input.value = clean;
      if (check) check();
    });

    roundMatch(ctx, {
      target: 3,
      maxRounds: 5,
      revealMs: 2300,
      play(r, submit) {
        const word = words[r - 1];
        if (window.__testHooks) window.__peek = { word };
        ctx.note('Round ' + r + ' · first to 3');
        $('wsTiles').innerHTML = mixed[r - 1].split('').map((ch, i) => '<span style="animation-delay:' + i * 45 + 'ms">' + ch + '</span>').join('');
        input.value = '';
        input.disabled = false;
        input.classList.remove('right');
        input.focus();
        setMsg('wsHint', '');
        setMsg('wsMsg', 'What word is this?');
        startTimer('wsTimer', ROUND);
        const t0 = performance.now();
        let done = false;
        finishRound = v => {
          if (done) return;
          done = true;
          check = null;
          finishRound = null;
          input.disabled = true;
          stopTimer('wsTimer');
          submit(v);
        };
        check = () => {
          if (input.value !== word) return;
          input.classList.add('right');
          sound('correct');
          const ms = Math.round(performance.now() - t0);
          setMsg('wsMsg', 'Got it in ' + secs(ms) + '! Waiting for ' + ctx.oppName + '…');
          finishRound({ ms });
        };
        ctx.later(() => { if (!done) setMsg('wsHint', 'Hint: it starts with ' + word[0].toUpperCase()); }, 7000);
        ctx.later(() => { if (!done) { setMsg('wsMsg', "Time's up!"); finishRound({ ms: null }); } }, ROUND);
      },
      onTheirs() { if (finishRound) finishRound({ ms: null }); }, // they solved it first (or the time ran out)
      compare(a, b) {
        const ma = msOf(a), mb = msOf(b);
        return ma === mb ? 0 : ma < mb ? 1 : -1;
      },
      reveal(r, a, b, w) {
        $('wsTiles').innerHTML = words[r - 1].split('').map(ch => '<span class="ok">' + ch + '</span>').join('');
        const t = v => (msOf(v) === Infinity ? 'no answer' : secs(msOf(v)));
        setMsg('wsHint', '');
        setMsg('wsMsg', (w > 0 ? 'Point for you! ' : w < 0 ? ctx.oppName + ' got it first. ' : 'Nobody got it. ') +
          'You: ' + t(a) + ' · ' + ctx.oppName + ': ' + t(b));
      },
      botValue() {
        if (Math.random() < 0.3 - skill * 0.25) return { ms: null };
        return { ms: Math.round(Math.min(ROUND - 500, Math.max(1800, gauss(11000 - skill * 7000, 2500)))) };
      },
      botDelay(r, v) { return v.ms == null ? ROUND : v.ms; },
      botNow() { return { ms: null }; }, // you solved it before the bot did
    });
  },
});

/* ================= TYPE RACE ================= */

// Short passages (3 or 4 sentences), all lowercase so nobody needs the shift key.
const SENTENCES = [
  'the sun came up over the quiet hills. a little fox ran across the wet field. it was looking for its friends in the tall grass. soon they all played together.',
  'my cat likes to nap in the warm sun. when it wakes up, it wants a snack right away. then it chases a toy mouse around the kitchen until it gets tired again.',
  'pizza tastes best when you share it with friends. we ordered a big one with extra cheese. everyone grabbed a slice before it got cold. there was nothing left.',
  'the rocket roared and lifted off the ground. it flew past the clouds and into space. the astronauts waved at the camera as they floated around the cabin.',
  'penguins cannot fly, but they are amazing swimmers. they slide on their bellies across the ice. the dads keep the eggs warm on their feet all winter.',
  'the dragon slept on a huge pile of gold. a brave knight tiptoed into the dark cave. he took one shiny coin and ran away before the dragon woke up.',
  'we played soccer in the park after school. my team was losing until the last minute. then i kicked the ball past the goalie and everyone cheered.',
  'an octopus has three hearts and blue blood. it can change color to hide from sharks. it can also squeeze through a hole as small as a coin.',
  'the pirate found an old map on the beach. a big x showed where the treasure was buried. he dug all day, but the chest was full of rubber ducks.',
  'snowflakes fell softly on the little town. the kids built a snowman with a carrot nose. later, everyone drank hot chocolate by the warm fire.',
  'a giraffe can eat leaves from the tallest trees. its tongue is almost as long as your arm. baby giraffes can stand up about an hour after they are born.',
  'the best way to get faster at typing is to practice. keep your eyes on the words, not on your fingers. soon your hands will know where every key is.',
  'our class went on a trip to the museum. we saw a giant dinosaur skeleton and an old mummy. my favorite part was the room full of shiny rocks.',
  'the wizard waved his wand and the lights went out. a cat on the shelf started to glow bright green. everyone laughed when it began to sing.',
];

CA.games.add('type', {
  name: 'Type Race', icon: '📝', blurb: 'Type the short passage exactly, as fast as you can. First to finish wins! (If time runs out, whoever typed more wins.)',
  start(ctx) {
    const LEN = L(75000);
    const text = SENTENCES[Math.floor(ctx.rng() * SENTENCES.length)];
    const bars = raceBars(ctx, 100);
    const wpm = ctx.bot ? Math.max(12, gauss(22 + skillOf(ctx) * 38, 4)) : 0;
    const botT = ctx.bot ? text.length * 12000 / wpm : 0; // ms the bot needs (a "word" is 5 letters)
    ctx.stage.innerHTML =
      '<div class="g-type">' + bars.html +
      '<div class="tr-text" id="trText"></div>' +
      '<input class="tr-in" id="trIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type here…" aria-label="Type the sentence" disabled>' +
      '<div class="timer"><i id="trTimer"></i></div><p class="g-msg" id="trMsg">Get ready…</p></div>';
    const input = $('trIn');
    let good = 0;
    let running = false;
    let t0 = 0;
    let finishRace = null;
    const pct = () => good / text.length * 100;

    function show() {
      const v = input.value;
      let ok = 0;
      while (ok < v.length && ok < text.length && v[ok] === text[ok]) ok++;
      const bad = Math.min(text.length - ok, v.length - ok);
      good = ok;
      $('trText').innerHTML =
        '<span class="ok">' + esc(text.slice(0, ok)) + '</span>' +
        (bad ? '<span class="bad">' + esc(text.slice(ok, ok + bad)) + '</span>' : '') +
        '<span class="cur">' + esc(text.slice(ok + bad, ok + bad + 1)) + '</span>' + esc(text.slice(ok + bad + 1));
      input.classList.toggle('wrong', v.length > ok);
      bars.set('me', pct(), Math.floor(pct()) + '%');
    }

    ctx.listen(input, 'input', () => {
      if (!running) return;
      show();
      if (input.value !== text) return;
      const ms = Math.round(performance.now() - t0);
      sound('correct');
      setMsg('trMsg', 'Done in ' + secs(ms) + ' (' + Math.round(text.length / 5 / (ms / 60000)) + ' words a minute)! Waiting for ' + ctx.oppName + '…');
      finishRace({ done: true, ms });
    });
    ctx.listen(input, 'paste', e => e.preventDefault()); // no copy-paste cheating
    ctx.listen(input, 'drop', e => e.preventDefault());
    ctx.on(msg => { if (msg && msg.t === 'live' && Number.isFinite(msg.n)) bars.set('them', msg.n, Math.floor(msg.n) + '%'); });

    const done = v => !!(v && v.done);
    const pOf = v => Math.max(0, Math.min(100, Number(v && v.p) || 0));
    roundMatch(ctx, {
      target: 1,
      maxRounds: 1,
      revealMs: 2800,
      play(r, submit) {
        ctx.note('First to finish wins · ' + Math.round(LEN / 1000) + ' seconds');
        show();
        ['3', '2', '1'].forEach((s, i) => ctx.later(() => { setMsg('trMsg', s + '…'); sound('tick'); }, i * 700));
        ctx.later(() => {
          running = true;
          t0 = performance.now();
          input.disabled = false;
          input.focus();
          setMsg('trMsg', 'Go! Type it exactly, with the dots and commas.');
          sound('go');
          startTimer('trTimer', LEN);
          const live = ctx.every(() => { if (running) ctx.send({ t: 'live', n: Math.round(pct()) }); }, 300);
          if (ctx.bot) {
            ctx.every(() => {
              if (!running) return;
              const p = Math.min(99, (performance.now() - t0) / botT * 100);
              bars.set('them', p, Math.floor(p) + '%');
            }, 250);
          }
          finishRace = v => {
            if (!running) return;
            running = false;
            input.disabled = true;
            stopTimer('trTimer');
            ctx.stopEvery(live);
            submit(v);
          };
          ctx.later(() => { if (running) { setMsg('trMsg', "Time's up!"); finishRace({ done: false, p: pct() }); } }, LEN);
        }, 2100);
      },
      onTheirs() { if (finishRace) finishRace({ done: false, p: pct() }); }, // they finished first
      compare(a, b) {
        if (done(a) && done(b)) { const ma = msOf(a), mb = msOf(b); return ma === mb ? 0 : ma < mb ? 1 : -1; }
        if (done(a) !== done(b)) return done(a) ? 1 : -1;
        const pa = pOf(a), pb = pOf(b);
        return Math.abs(pa - pb) < 0.01 ? 0 : pa > pb ? 1 : -1;
      },
      reveal(r, a, b, w) {
        const desc = v => (done(v) ? 'finished in ' + secs(msOf(v)) : Math.floor(pOf(v)) + '% done');
        if (done(b)) bars.set('them', 100, '100%');
        else bars.set('them', pOf(b), Math.floor(pOf(b)) + '%');
        setMsg('trMsg', (w > 0 ? 'You win! ' : w < 0 ? ctx.oppName + ' wins. ' : "It's a tie! ") +
          'You: ' + desc(a) + ' · ' + ctx.oppName + ': ' + desc(b));
      },
      botValue() { return botT <= LEN ? { done: true, ms: Math.round(botT) } : { done: false, p: LEN / botT * 100 }; },
      botDelay(r, v) { return 2100 + (v.done ? v.ms : LEN) + 100; },
      botNow() { return { done: false, p: Math.min(99, (performance.now() - t0) / botT * 100) }; },
    });
  },
});

})();
