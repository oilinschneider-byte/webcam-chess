/* Classic Games: Closest Guess, Country Shape, Odd One Out, Which Is Bigger?, Timeline, Emoji Movie Guess,
   Animal Guess, Pattern Next, Spot the Difference. */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, shuffle, startTimer, stopTimer, roundMatch, scoreRace, quizRounds, L, skillOf, msOf } = CA.games.kit;
const pickN = (rng, list, n) => shuffle(list, rng).slice(0, n);
// 4 answer options: the right one plus 3 others, in a shuffled order.
function options(rng, right, pool) {
  const opts = shuffle([right].concat(pickN(rng, pool.filter(x => x !== right), 3)), rng);
  return { options: opts, answer: opts.indexOf(right) };
}

/* ================= CLOSEST GUESS ================= */

// [question, answer, unit, how far off a so-so guess usually is]
const NUMBER_QS = [
  ['How many bones are in an adult human body?', 206, 'bones', 40],
  ['How many keys does a piano have?', 88, 'keys', 20],
  ['In what year did people first walk on the Moon?', 1969, '', 15],
  ['How tall is the Eiffel Tower, in meters?', 330, 'm', 120],
  ['How many countries are there in Africa?', 54, 'countries', 12],
  ['How many minutes are in one day?', 1440, 'minutes', 400],
  ['In what year did the Titanic sink?', 1912, '', 25],
  ['How many teeth does an adult usually have?', 32, 'teeth', 8],
  ['How many hours are in one week?', 168, 'hours', 40],
  ['How tall is Mount Everest, in meters?', 8849, 'm', 1500],
  ['How many squares are on a chessboard?', 64, 'squares', 20],
  ['How many stripes are on the flag of the United States?', 13, 'stripes', 4],
  ['How many seconds are in one hour?', 3600, 'seconds', 1000],
  ['In what year did the first iPhone come out?', 2007, '', 5],
  ['How many elements are on the periodic table?', 118, 'elements', 30],
  ['How many hearts does an octopus have?', 3, 'hearts', 2],
  ['How many days does it take the Earth to go around the Sun?', 365, 'days', 60],
  ['About how many people live on Earth, in billions?', 8, 'billion', 2],
  ['How long is a marathon, in kilometers?', 42, 'km', 10],
  ['How many strings does a normal guitar have?', 6, 'strings', 2],
  ['At what temperature does water boil, in degrees Fahrenheit?', 212, '°F', 40],
  ['How many planets are in our solar system?', 8, 'planets', 2],
  ['How many cards are in a deck (without jokers)?', 52, 'cards', 10],
  ['How tall is the Burj Khalifa, the tallest building in the world, in meters?', 828, 'm', 200],
  ['In what year was the first Harry Potter book published?', 1997, '', 8],
  ['How many eyes does a honeybee have?', 5, 'eyes', 2],
  ['About how many languages are spoken in the world today?', 7000, 'languages', 2500],
  ['How many players are on a soccer team, counting both teams on the field?', 22, 'players', 6],
  ['How many legs does a lobster have (not counting its claws)?', 8, 'legs', 3],
  ['How many years old is the Great Pyramid of Giza, roughly?', 4500, 'years', 1200],
];

CA.games.add('closest', {
  name: 'Closest Guess', icon: '📏', blurb: 'Answer with a number. Whoever is closest wins the round. 3 rounds!',
  start(ctx) {
    const ROUND = L(12000);
    const qs = pickN(ctx.rng, NUMBER_QS, 3);
    ctx.stage.innerHTML = '<div class="g-closest"><div class="cg-q" id="cgQ"></div><div class="row center">' +
      '<input class="math-in cg-in" id="cgIn" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="?" aria-label="Your guess" disabled>' +
      '<button class="btn go big" id="cgGo" disabled>Lock in</button></div><div class="timer"><i id="cgTimer"></i></div>' +
      '<p class="g-msg" id="cgMsg"></p><p class="muted small center" id="cgThem"></p></div>';
    const input = $('cgIn');
    let lock = null;
    ctx.listen(input, 'input', () => { const c = input.value.replace(/[^0-9]/g, ''); if (c !== input.value) input.value = c; });
    ctx.listen(input, 'keydown', e => { if (e.key === 'Enter' && lock) lock(); });
    ctx.listen($('cgGo'), 'click', () => { if (lock) lock(); });
    const off = (v, q) => (v && Number.isFinite(v.g) ? Math.abs(v.g - q[1]) : Infinity);
    roundMatch(ctx, {
      revealMs: 2600,
      points(a, b, r) { const da = off(a, qs[r - 1]), db = off(b, qs[r - 1]); return da === db ? [0, 0] : da < db ? [1, 0] : [0, 1]; },
      over: (my, op, r) => r >= 3,
      play(r, submit) {
        const q = qs[r - 1];
        ctx.note('Question ' + r + ' of 3');
        setMsg('cgQ', q[0]);
        input.value = '';
        input.disabled = false;
        $('cgGo').disabled = false;
        input.focus();
        setMsg('cgMsg', 'Type a number and press Enter.');
        setMsg('cgThem', '');
        if (window.__testHooks) window.__peek = { answer: q[1] };
        startTimer('cgTimer', ROUND);
        let done = false;
        lock = timedOut => {
          if (done) return;
          if (timedOut !== true && !input.value) return;
          done = true;
          lock = null;
          input.disabled = true;
          $('cgGo').disabled = true;
          stopTimer('cgTimer');
          const g = input.value ? Number(input.value) : null;
          setMsg('cgMsg', g == null ? "Time's up!" : 'Locked in! Waiting for ' + ctx.oppName + '…');
          sound('tick');
          submit({ g });
        };
        ctx.later(() => { if (lock) lock(true); }, ROUND);
      },
      onTheirs() { setMsg('cgThem', ctx.oppName + ' has answered'); },
      reveal(r, a, b, w) {
        const q = qs[r - 1];
        const say = v => (v && Number.isFinite(v.g) ? v.g.toLocaleString('en-US') + ' (' + off(v, q).toLocaleString('en-US') + ' off)' : 'no guess');
        setMsg('cgMsg', 'The answer is ' + q[1].toLocaleString('en-US') + (q[2] ? ' ' + q[2] : '') + '. ' + (w > 0 ? 'Point for you!' : w < 0 ? 'Point for ' + ctx.oppName + '.' : 'Tie!'));
        setMsg('cgThem', 'You: ' + say(a) + ' · ' + ctx.oppName + ': ' + say(b));
      },
      botValue(r) {
        const q = qs[r - 1];
        return { g: Math.max(0, Math.round(q[1] + gauss(0, q[3] * (1.4 - skillOf(ctx))))) };
      },
      botDelay() { return 2500 + Math.random() * 6000; },
    });
  },
});

/* ================= COUNTRY SHAPE ================= */

CA.games.add('shapes', {
  name: 'Country Shape', icon: '🗺️', blurb: 'Which country has this shape? The fastest right answer wins the round. First to 3!',
  start(ctx) {
    const S = window.COUNTRY_SHAPES || {};
    const names = Object.keys(S);
    const rounds = pickN(ctx.rng, names, 5).map(name => {
      const o = options(ctx.rng, name, names);
      return { q: '<svg class="cs-shape" viewBox="0 0 100 100" role="img" aria-label="A country outline"><path d="' + S[name] + '"/></svg>', options: o.options.map(esc), answer: o.answer, after: "It's " + name + '!' };
    });
    quizRounds(ctx, { rounds, target: 3, maxRounds: 5, roundMs: L(8000), note: r => 'Country ' + r + ' · first to 3', ask: 'Which country is this?', botRight: s => 0.45 + s * 0.45 });
  },
});

/* ================= ODD ONE OUT ================= */

// [four items, the odd one (index), why]
const ODD = [
  [['🍎', '🍌', '🍇', '🥕'], 3, "a carrot isn't a fruit"], [['🐶', '🐱', '🐭', '🚗'], 3, "a car isn't an animal"],
  [['⚽', '🏀', '🏈', '🎸'], 3, "a guitar isn't a ball"], [['🐟', '🐠', '🐡', '🐦'], 3, "a bird isn't a fish"],
  [['🍕', '🍔', '🌭', '🧦'], 3, "you can't eat a sock"], [['☀️', '🌙', '⭐', '🍩'], 3, "a donut isn't in the sky"],
  [['🎹', '🎸', '🎺', '📱'], 3, "a phone isn't an instrument"], [['🐘', '🦒', '🦁', '🐙'], 3, 'an octopus lives in the sea'],
  [['🌹', '🌻', '🌷', '🍄'], 3, "a mushroom isn't a flower"], [['✏️', '🖊️', '🖍️', '🍴'], 3, "you can't write with a fork"],
  [['👟', '👢', '👠', '🧢'], 3, "a cap isn't a shoe"], [['🍦', '🍰', '🍩', '🥦'], 3, "broccoli isn't a sweet"],
  [['🚀', '✈️', '🚁', '🚂'], 3, "a train can't fly"], [['🐝', '🦋', '🐞', '🐌'], 3, "a snail isn't an insect"],
  [['❄️', '⛄', '🧤', '🏖️'], 3, "a beach isn't wintery"], [['🍓', '🍒', '🍎', '🍋'], 3, "a lemon isn't red"],
  [['🐄', '🐖', '🐑', '🦈'], 3, "a shark doesn't live on a farm"], [['🥛', '🧃', '☕', '🍞'], 3, "bread isn't a drink"],
  [['🎃', '👻', '🦇', '🎄'], 3, 'a Christmas tree is for Christmas, not Halloween'], [['🦷', '👁️', '👂', '🧦'], 3, "a sock isn't a body part"],
  [['🥐', '🥖', '🍞', '🍉'], 3, "a watermelon isn't bread"], [['🦅', '🦉', '🦆', '🦇'], 3, "a bat isn't a bird"],
  [['🔨', '🔧', '🪛', '🧸'], 3, "a teddy bear isn't a tool"], [['🌍', '🪐', '🌕', '🍊'], 3, "an orange isn't in space"],
  [['🐬', '🐳', '🦭', '🐫'], 3, "a camel doesn't live in the sea"], [['💻', '📱', '🖥️', '📚'], 3, "books don't need electricity"],
  [['🧁', '🍪', '🍫', '🌶️'], 3, "a chili pepper isn't sweet"], [['🚒', '🚑', '🚓', '🚜'], 3, "a tractor isn't an emergency vehicle"],
  [['🕐', '⏰', '⌚', '🔦'], 3, "a flashlight doesn't tell the time"], [['🧊', '❄️', '⛄', '🔥'], 3, "fire isn't cold"],
  [['🦁', '🐯', '🐆', '🐺'], 3, "a wolf isn't a big cat"], [['🍳', '🥄', '🍴', '🧹'], 3, "a broom isn't for cooking or eating"],
  [['🎁', '🎂', '🎈', '🩹'], 3, "a bandage isn't for a party"], [['🛁', '🚿', '🧼', '🍕'], 3, "pizza isn't for washing"],
  [['🐧', '❄️', '🧊', '🌴'], 3, "a palm tree isn't cold"], [['🚲', '🛴', '🛹', '🛋️'], 3, "you can't ride a sofa"],
  [['🌧️', '⛈️', '🌨️', '🌈'], 3, "a rainbow doesn't fall from the sky"], [['🐸', '🐢', '🐊', '🐓'], 3, "a chicken isn't a reptile or a frog"],
  [['🥇', '🥈', '🥉', '🎖️'], 3, "the medal isn't a place (1st, 2nd, 3rd)"], [['👑', '💍', '📿', '🧽'], 3, "a sponge isn't jewelry"],
];

CA.games.add('odd', {
  name: 'Odd One Out', icon: '🧐', blurb: "Quick! Tap the thing that doesn't belong. Most right answers in 30 seconds wins. (A wrong tap freezes you for a second.)",
  start(ctx) {
    const LEN = L(30000);
    const sets = shuffle(ODD, ctx.rng).concat(shuffle(ODD, ctx.rng)).map(([items, odd, why]) => {
      const order = shuffle([0, 1, 2, 3], ctx.rng);
      return { items: order.map(i => items[i]), odd: order.indexOf(odd), why, word: items[odd] };
    });
    scoreRace(ctx, {
      len: LEN,
      note: 'Most right answers wins',
      timerId: 'ooTimer',
      barMax: 15,
      html: bars => bars + '<div class="oo-items" id="ooItems"></div><div class="timer"><i id="ooTimer"></i></div><p class="g-msg" id="ooMsg">Which one doesn\'t belong?</p>',
      start(api) {
        let i = 0, frozen = false;
        const show = () => {
          const s = sets[i % sets.length];
          $('ooItems').innerHTML = s.items.map((e, k) => '<button class="oo-item" data-k="' + k + '">' + e + '</button>').join('');
          if (window.__testHooks) window.__peek = { answer: s.odd };
        };
        ctx.listen($('ooItems'), 'pointerdown', e => {
          const b = e.target.closest('.oo-item');
          if (!b || frozen || !api.running()) return;
          const s = sets[i % sets.length];
          if (+b.dataset.k === s.odd) {
            api.add(1);
            sound('correct');
            setMsg('ooMsg', '✅ ' + s.word + ': ' + s.why);
            i++;
            show();
          } else {
            frozen = true;
            b.classList.add('bad');
            sound('miss');
            setMsg('ooMsg', '❌ Not that one! Wait a second…');
            ctx.later(() => { frozen = false; i++; show(); setMsg('ooMsg', 'Which one doesn\'t belong?'); }, 1000);
          }
        });
        show();
      },
      bot(skill) { return { final: Math.max(1, Math.round(gauss(0.35 + skill * 0.45, 0.06) * LEN / 1000)), at: LEN * 0.95 }; },
    });
  },
});

/* ================= WHICH IS BIGGER? ================= */

// [question, [answer, fact], [other, fact]]: the first one is always the right answer.
const BIGGER = [
  ['Which is taller?', ['🗼 Eiffel Tower', '330 m'], ['🗽 Statue of Liberty', '93 m, with its base']],
  ['Which is taller?', ['🏙️ Burj Khalifa', '828 m'], ['🏢 Empire State Building', '443 m, to the tip']],
  ['Which is taller?', ['🏔️ Mount Everest', '8,849 m'], ['🗻 Mount Fuji', '3,776 m']],
  ['Which is taller?', ['🦒 Giraffe', 'up to 5.5 m'], ['🐘 African elephant', 'about 3.3 m']],
  ['Which is taller?', ['🏢 Taipei 101', '508 m'], ['🗼 Eiffel Tower', '330 m']],
  ['Which is taller?', ['🌲 Tallest redwood tree', 'about 116 m'], ['🗽 Statue of Liberty', '93 m']],
  ['Which is heavier?', ['🐋 Blue whale', 'up to about 150 tonnes'], ['🐘 African elephant', 'about 6 tonnes']],
  ['Which is heavier?', ['🐘 African elephant', 'about 6 tonnes'], ['🦛 Hippo', 'about 1.5 tonnes']],
  ['Which is heavier?', ['🐘 An elephant', 'about 6 tonnes'], ['🚗 A car', 'about 1.5 tonnes']],
  ['Which country has more people?', ['India', 'about 1.4 billion'], ['United States', 'about 335 million']],
  ['Which country has more people?', ['Brazil', 'about 216 million'], ['Russia', 'about 144 million']],
  ['Which country has more people?', ['Japan', 'about 124 million'], ['United Kingdom', 'about 68 million']],
  ['Which country has more people?', ['Nigeria', 'about 224 million'], ['Germany', 'about 84 million']],
  ['Which country has more people?', ['Mexico', 'about 129 million'], ['Canada', 'about 40 million']],
  ['Which country is bigger?', ['Russia', '17.1 million km²'], ['Canada', '10.0 million km²']],
  ['Which country is bigger?', ['Brazil', '8.5 million km²'], ['Australia', '7.7 million km²']],
  ['Which is bigger?', ['🌍 Africa', '30.4 million km²'], ['🌎 North America', '24.7 million km²']],
  ['Which is bigger?', ['🌍 Earth', '12,742 km across'], ['🔴 Mars', '6,779 km across']],
  ['Which is bigger?', ['🪐 Jupiter', '139,820 km across'], ['🪐 Saturn', '116,460 km across']],
  ['Which is bigger?', ['🌕 The Moon', '3,475 km across'], ['🧊 Pluto', '2,377 km across']],
  ['Which is faster?', ['🐆 Cheetah', 'about 110 km/h'], ['🐎 Horse', 'about 70–88 km/h']],
  ['Which is faster?', ['🦅 A diving peregrine falcon', 'over 300 km/h'], ['🐆 Cheetah', 'about 110 km/h']],
  ['Which is faster?', ['✈️ A passenger jet', 'about 900 km/h'], ['🚄 A bullet train', 'about 320 km/h']],
  ['Which lives longer?', ['🐢 Giant tortoise', '100+ years'], ['🐘 Elephant', 'about 60–70 years']],
  ['Which lives longer?', ['🐶 Dog', 'about 10–13 years'], ['🐹 Hamster', 'about 2–3 years']],
  ['Which river is longer?', ['🏞️ The Nile', 'about 6,650 km'], ['🏞️ The Mississippi', 'about 3,730 km']],
  ['Which is deeper?', ['🌊 Mariana Trench', 'about 11 km'], ['🏜️ Grand Canyon', 'about 1.8 km']],
  ['Which is hotter?', ["☀️ The Sun's surface", 'about 5,500 °C'], ['🌋 Lava', 'about 1,100 °C']],
  ['Which planet is hotter?', ['Venus', 'about 465 °C'], ['Mercury', 'about 167 °C on average']],
  ['Which is older?', ['🐪 Pyramids of Giza', 'about 4,500 years old'], ['🏛️ Colosseum', 'about 1,900 years old']],
  ['Which is older?', ['🏛️ Colosseum', 'built in the year 80'], ['🕌 Taj Mahal', 'finished in 1653']],
  ['Which has more legs?', ['🕷️ Spider', '8 legs'], ['🐜 Ant', '6 legs']],
  ['Which has more legs?', ['🐛 Centipede', '30 or more legs'], ['🕷️ Spider', '8 legs']],
  ['Which is colder?', ['🧊 The South Pole', 'about −49 °C on average'], ['❄️ The North Pole', 'about −18 °C on average']],
  ['Which has more moons?', ['🪐 Saturn', '146 known moons'], ['🌍 Earth', '1 moon']],
  ['Which is longer on Venus?', ['A day', '243 Earth days'], ['A year', '225 Earth days']],
];

CA.games.add('bigger', {
  name: 'Which Is Bigger?', icon: '⚖️', blurb: 'Taller, faster, older, more people? Pick the right one. The fastest right answer wins the round. First to 3!',
  start(ctx) {
    const rounds = pickN(ctx.rng, BIGGER, 5).map(([q, a, b]) => {
      const flip = ctx.rng() < 0.5;
      const opts = flip ? [b, a] : [a, b];
      return { q: '<div class="wb-q">' + esc(q) + '</div>', options: opts.map(o => esc(o[0])), answer: flip ? 1 : 0, after: a[0] + ': ' + a[1] + ' · ' + b[0] + ': ' + b[1] + '.' };
    });
    quizRounds(ctx, { rounds, target: 3, maxRounds: 5, roundMs: L(6000), note: r => 'Question ' + r + ' · first to 3', ask: 'Pick one!', botMs: 3200 });
  },
});

/* ================= TIMELINE ================= */

// [event, year] (negative years are BC)
const EVENTS = [
  ['🦖 The dinosaurs die out', -66000000], ['🐪 The Great Pyramid of Giza is built', -2560], ['🏛️ The first Olympic Games in Greece', -776],
  ['🏟️ The Colosseum in Rome opens', 80], ['🖨️ Gutenberg builds his printing press', 1440], ['⛵ Columbus sails to the Americas', 1492],
  ['🖼️ Leonardo da Vinci starts the Mona Lisa', 1503], ['🍎 Isaac Newton explains gravity', 1687], ['📜 The United States declares independence', 1776],
  ['💡 Thomas Edison makes a working light bulb', 1879], ['🗼 The Eiffel Tower opens', 1889], ['✈️ The Wright brothers fly the first airplane', 1903],
  ['🚢 The Titanic sinks', 1912], ['🧪 Penicillin is discovered', 1928], ['🕊️ World War II ends', 1945], ['🛰️ The first satellite goes to space', 1957],
  ['👨‍🚀 People walk on the Moon', 1969], ['🌌 The first Star Wars movie', 1977], ['🌐 The World Wide Web is invented', 1989],
  ['🐑 Dolly the sheep is cloned', 1996], ['🧙 The first Harry Potter book', 1997], ['📺 YouTube is launched', 2005], ['📱 The first iPhone', 2007],
  ['⛏️ Minecraft is released', 2011],
];
const yearText = y => (y <= -1000000 ? Math.round(-y / 1e6) + ' million years ago' : y < 0 ? -y + ' BC' : String(y));

CA.games.add('timeline', {
  name: 'Timeline', icon: '📅', blurb: 'Tap the 4 events from OLDEST to NEWEST (tap one again to take it back), then lock in. Most in the right place wins the round (fastest breaks ties). 3 rounds!',
  start(ctx) {
    const ROUND = L(16000);
    const rounds = [];
    let pool = shuffle(EVENTS, ctx.rng);
    for (let r = 0; r < 3; r++) {
      if (pool.length < 4) pool = shuffle(EVENTS, ctx.rng);
      rounds.push(pool.splice(0, 4));
    }
    ctx.stage.innerHTML = '<div class="g-timeline"><p class="tl-help">Tap the <b>oldest</b> first, the <b>newest</b> last. Tap one again to take it back.</p><div class="tl-items" id="tlItems"></div>' +
      '<button class="btn go tl-lock" id="tlLock" disabled>🔒 Lock in</button>' +
      '<div class="timer"><i id="tlTimer"></i></div><p class="g-msg" id="tlMsg"></p><p class="muted small center" id="tlThem"></p></div>';
    let onTap = null;
    let onLock = null;
    ctx.listen($('tlItems'), 'click', e => { const b = e.target.closest('.tl-item'); if (b && onTap) onTap(+b.dataset.i); });
    ctx.listen($('tlLock'), 'click', () => { if (onLock) onLock(); });
    ctx.listen(document, 'keydown', e => { if (e.key === 'Enter' && onLock) { e.preventDefault(); onLock(); } });
    const rightCount = (v, evs) => {
      const correct = evs.map((e, i) => i).sort((a, b) => evs[a][1] - evs[b][1]);
      return v && Array.isArray(v.order) ? v.order.filter((k, pos) => k === correct[pos]).length : 0;
    };
    roundMatch(ctx, {
      revealMs: 3000,
      points(a, b, r) {
        const ra = rightCount(a, rounds[r - 1]), rb = rightCount(b, rounds[r - 1]);
        if (ra !== rb) return ra > rb ? [1, 0] : [0, 1];
        if (!ra) return [0, 0];
        const ma = msOf(a), mb = msOf(b);
        return ma === mb ? [0, 0] : ma < mb ? [1, 0] : [0, 1];
      },
      over: (my, op, r) => r >= 3,
      play(r, submit) {
        const evs = rounds[r - 1];
        ctx.note('Round ' + r + ' of 3');
        if (window.__testHooks) window.__peek = { order: evs.map((e, i) => i).sort((a, b) => evs[a][1] - evs[b][1]) };
        const order = [];
        const draw = () => {
          $('tlItems').innerHTML = evs.map((e, i) => {
            const at = order.indexOf(i);
            return '<button class="tl-item' + (at >= 0 ? ' done' : '') + '" data-i="' + i + '"><b>' + (at >= 0 ? at + 1 : '') + '</b>' + esc(e[0]) + '</button>';
          }).join('');
          $('tlLock').disabled = order.length < 4;
        };
        draw();
        setMsg('tlMsg', 'Which happened first?');
        setMsg('tlThem', '');
        startTimer('tlTimer', ROUND);
        const t0 = performance.now();
        let sent = false;
        const send = () => {
          if (sent) return;
          sent = true;
          onTap = null;
          onLock = null;
          $('tlLock').disabled = true;
          ctx.stage.querySelectorAll('.tl-item').forEach(b => { b.disabled = true; });
          stopTimer('tlTimer');
          setMsg('tlMsg', order.length < 4 ? "Time's up!" : 'Locked in! Waiting for ' + ctx.oppName + '…');
          submit({ order: order.slice(), ms: Math.round(performance.now() - t0) });
        };
        onTap = i => {
          const at = order.indexOf(i);
          if (at >= 0) order.splice(at, 1); // tapped again: take it back
          else order.push(i);
          sound('tick');
          draw();
          setMsg('tlMsg', order.length === 4 ? 'All set? Press 🔒 Lock in (or tap one to change it).' : at >= 0 ? 'Taken back. Tap it again to put it in a new spot.' : 'Which happened next?');
        };
        onLock = () => { if (order.length === 4) send(); };
        ctx.later(send, ROUND);
      },
      onTheirs() { setMsg('tlThem', ctx.oppName + ' has finished'); },
      reveal(r, a, b, w) {
        const evs = rounds[r - 1];
        const sorted = evs.map((e, i) => i).sort((x, y) => evs[x][1] - evs[y][1]);
        $('tlItems').innerHTML = sorted.map((i, pos) => '<div class="tl-item shown"><b>' + (pos + 1) + '</b>' + esc(evs[i][0]) + '<i>' + yearText(evs[i][1]) + '</i></div>').join('');
        setMsg('tlMsg', 'You got ' + rightCount(a, evs) + '/4 · ' + ctx.oppName + ' got ' + rightCount(b, evs) + '/4' + (w > 0 ? ' · Point for you!' : w < 0 ? ' · Point for ' + ctx.oppName + '.' : ''));
        setMsg('tlThem', '');
      },
      botValue(r) {
        const evs = rounds[r - 1];
        const order = evs.map((e, i) => i).sort((a, b) => evs[a][1] - evs[b][1]);
        if (Math.random() > 0.4 + skillOf(ctx) * 0.5) { const i = Math.floor(Math.random() * 3); [order[i], order[i + 1]] = [order[i + 1], order[i]]; }
        return { order, ms: Math.round(Math.min(ROUND - 300, gauss(8000 - skillOf(ctx) * 3000, 1500))) };
      },
      botDelay(r, v) { return v.ms; },
    });
  },
});

/* ================= EMOJI MOVIE GUESS ================= */

const MOVIES = [
  ['🦁👑', 'The Lion King'], ['❄️👸⛄', 'Frozen'], ['🐠🔍', 'Finding Nemo'], ['🧸🤠🚀', 'Toy Story'], ['🕷️🧑', 'Spider-Man'],
  ['🦖🏝️', 'Jurassic Park'], ['⚡🧙‍♂️👓', 'Harry Potter'], ['🚢🧊💔', 'Titanic'], ['👽📞🏠', 'E.T.'], ['🐭👨‍🍳', 'Ratatouille'],
  ['🏠🎈👴', 'Up'], ['🤖🌱', 'WALL-E'], ['🐼🥋', 'Kung Fu Panda'], ['🍫🏭🎫', 'Charlie and the Chocolate Factory'],
  ['🐉🔥🧒', 'How to Train Your Dragon'], ['🦸👨‍👩‍👧‍👦', 'The Incredibles'], ['🚗⚡🏁', 'Cars'], ['🧜‍♀️🌊', 'The Little Mermaid'],
  ['🌹👹', 'Beauty and the Beast'], ['🧞‍♂️🪔🐒', 'Aladdin'], ['🌪️👠🦁', 'The Wizard of Oz'], ['🐻🍯', 'Winnie the Pooh'],
  ['🦈🏖️', 'Jaws'], ['👸🍎😴', 'Snow White'], ['🧊🐿️🌰', 'Ice Age'], ['🐧💃', 'Happy Feet'], ['💚👹🏰', 'Shrek'],
  ['🐘🎪👂', 'Dumbo'], ['🕰️🚗⚡', 'Back to the Future'], ['🎸💀🌼', 'Coco'], ['🌊🛶👧', 'Moana'], ['🐷🕷️🕸️', "Charlotte's Web"],
  ['🍄👨‍🔧', 'The Super Mario Bros. Movie'], ['🦔💨', 'Sonic the Hedgehog'], ['👻🚫', 'Ghostbusters'], ['🦍🏙️', 'King Kong'],
  ['🧙‍♂️💍🌋', 'The Lord of the Rings'], ['🐝🎬', 'Bee Movie'], ['🐕🍝🐕', 'Lady and the Tramp'],
];

CA.games.add('emoji', {
  name: 'Emoji Movie Guess', icon: '🎬', blurb: 'Guess the movie from the emojis! The fastest right answer wins the round. First to 3!',
  start(ctx) {
    const titles = MOVIES.map(m => m[1]);
    const rounds = pickN(ctx.rng, MOVIES, 5).map(([e, title]) => {
      const o = options(ctx.rng, title, titles);
      return { q: '<div class="em-q">' + e + '</div>', options: o.options.map(esc), answer: o.answer, after: "It's " + title + '!' };
    });
    quizRounds(ctx, { rounds, target: 3, maxRounds: 5, roundMs: L(8000), note: r => 'Movie ' + r + ' · first to 3', ask: 'Which movie is this?' });
  },
});

/* ================= ANIMAL GUESS ================= */

// Groups of animals that are easy to mix up: all 4 answers in a round come from one group. Each animal has 3 clues:
// a hard one first, then easier ones (the last still needs you to know something about it).
const ANIMAL_GROUPS = {
  'Big cats': [
    ['🦁', 'Lion', 'I sleep up to 20 hours a day.', "I'm the only cat that lives in big family groups.", 'The boys in my family have a big shaggy mane.'],
    ['🐅', 'Tiger', "I'm the biggest cat in the world.", 'Unlike most cats, I love to swim.', 'No two of us have the same stripes.'],
    ['🐆', 'Leopard', 'I hunt alone, mostly at night.', 'I live in Africa and Asia.', "I drag my food up into trees so lions can't steal it."],
    ['🐆', 'Cheetah', "I can't roar, but I can purr and chirp.", 'I have black "tear lines" running down from my eyes.', "I'm the fastest runner on land."],
    ['🐆', 'Jaguar', 'I have the strongest bite of any big cat.', 'I swim in rivers and hunt caimans.', "I'm the biggest cat in the Americas."],
    ['🐆', 'Snow leopard', 'My huge fluffy tail keeps my nose warm when I sleep.', 'My big furry paws work like snowshoes.', 'I live high in the cold mountains of Asia.'],
  ],
  'Bears (and animals called bears)': [
    ['🐻‍❄️', 'Polar bear', 'Under my fur, my skin is black.', "I'm a great swimmer and I hunt seals.", 'I live on the ice of the Arctic.'],
    ['🐻', 'Brown bear', 'I sleep through most of the winter in a den.', 'I catch salmon jumping up rivers.', 'I have a big hump of muscle on my shoulders.'],
    ['🐼', 'Giant panda', 'I spend most of the day eating.', 'My "thumb" is really a special wrist bone.', 'I munch bamboo in the mountains of China.'],
    ['🐾', 'Red panda', 'I was called a "panda" before the famous one was.', 'I wrap my bushy striped tail around me like a blanket.', "I'm reddish-brown and about the size of a cat."],
    ['🐨', 'Koala', "People call me a bear, but I'm not one.", 'My baby rides in a pouch.', 'I eat eucalyptus leaves in Australia.'],
  ],
  'Sea giants': [
    ['🐋', 'Blue whale', 'My heart is about as big as a small car.', 'I eat tiny shrimp called krill.', "I'm the biggest animal that has ever lived."],
    ['🐳', 'Orca', "I'm really the biggest kind of dolphin.", 'My family pod hunts seals together.', 'I have a tall black fin and white patches near my eyes.'],
    ['🐬', 'Dolphin', 'I sleep with one half of my brain at a time.', 'I find my food with clicks and echoes.', "I'm a smart, playful mammal that loves to jump beside boats."],
    ['🦈', 'Shark', "I'm a fish with no bones, just cartilage.", 'I keep growing new teeth my whole life.', 'My fin sticking out of the water scares swimmers.'],
    ['🦭', 'Walrus', 'I can sleep while floating, thanks to air pockets in my neck.', 'I find clams on the sea floor with my whiskers.', 'I have two very long tusks.'],
    ['🌊', 'Manatee', 'My closest relative on land is the elephant.', 'I slowly munch sea grass in warm, shallow water.', 'I\'m called a "sea cow," and sailors once thought I was a mermaid.'],
  ],
  'Birds': [
    ['🦉', 'Owl', 'My feathers let me fly without a sound.', 'I swallow my food whole and cough up pellets.', 'I can turn my head almost all the way around.'],
    ['🦅', 'Eagle', 'I build some of the biggest nests of any bird.', 'My eyes can spot a rabbit from far away.', 'The bald kind is the national bird of the United States.'],
    ['🦜', 'Parrot', 'Some of us live more than 80 years.', 'I crack nuts with my strong curved beak.', "I'm colorful and I can copy words people say."],
    ['🐦', 'Hummingbird', 'My heart can beat over 1,000 times a minute.', "I'm the only bird that can fly backwards.", "I'm tiny and I drink nectar from flowers."],
    ['🦚', 'Peacock', 'Only the boys of my kind have the fancy look.', "I'm the national bird of India.", 'I spread out a huge tail full of "eyes" to show off.'],
    ['🐦', 'Woodpecker', 'My very long tongue wraps around the back of my skull.', 'My head is built to take thousands of bumps a day.', 'I drum on trees with my beak to find bugs.'],
  ],
  'Water birds and birds that can\'t fly': [
    ['🐧', 'Penguin', 'I can drink salty sea water: my body gets rid of the salt.', 'The dads of one kind keep the egg warm on their feet.', 'I waddle across the ice in a black-and-white "tuxedo."'],
    ['🪶', 'Ostrich', 'My eye is bigger than my brain.', "I'm the fastest bird on land.", "I'm the biggest bird in the world, and I can't fly."],
    ['🦩', 'Flamingo', 'I eat with my head upside down.', 'I often stand on one leg.', 'The shrimp I eat make my feathers pink.'],
    ['🐦', 'Pelican', 'I fly in lines low over the waves.', 'I dive into the sea from high up.', 'My beak has a giant stretchy pouch for scooping fish.'],
    ['🦢', 'Swan', 'I can have more than 25,000 feathers.', 'Couples of my kind often stay together for life.', "I'm a big white bird with a long curved neck, gliding on lakes."],
  ],
  'Reptiles': [
    ['🐊', 'Crocodile', 'I swallow stones to help me dive.', 'I shed "tears" while I eat, but I\'m not sad.', 'My pointy snout shows my teeth even when my mouth is shut.'],
    ['🐊', 'Alligator', 'I live mostly in the southern United States and China.', 'I build a nest of plants to keep my eggs warm.', 'My snout is wide and U-shaped, and my bottom teeth hide when I close it.'],
    ['🦎', 'Chameleon', 'My two eyes can look in different directions at once.', 'My tongue can be longer than my whole body.', 'I change the color of my skin.'],
    ['🦎', 'Komodo dragon', 'My bite is venomous.', 'I only live on a few islands in Indonesia.', "I'm the biggest lizard in the world."],
    ['🐢', 'Tortoise', 'Some of us live more than 150 years.', "I live on land and I'm not a good swimmer.", "I carry a heavy shell and I'm famous for being slow."],
    ['🦎', 'Iguana', 'I have a "third eye" on top of my head.', 'I love sunbathing on branches, and I can drop my tail to escape.', "I'm a green lizard with spikes down my back and a flap under my chin."],
  ],
  'Bugs and creepy crawlies': [
    ['🐝', 'Bee', 'I dance to tell my friends where food is.', 'I have five eyes.', 'I make honey and wax.'],
    ['🐜', 'Ant', 'I can carry many times my own weight.', 'My colony has a queen and lots of workers.', 'I march in long lines to your picnic.'],
    ['🦋', 'Butterfly', 'I taste with my feet.', 'My wings are covered in tiny scales.', 'I used to be a caterpillar.'],
    ['🐞', 'Ladybug', 'Farmers love me because I eat aphids.', "I'm a kind of beetle.", "I'm red with black spots."],
    ['🪲', 'Firefly', "I'm a beetle that comes out on summer nights.", 'My light makes almost no heat.', 'My tail glows to talk to my friends.'],
    ['🕷️', 'Spider', 'I can have eight eyes.', "I'm not an insect.", 'I spin webs out of silk.'],
  ],
  'Apes and monkeys': [
    ['🦍', 'Gorilla', "I'm the biggest primate in the world.", 'My family is led by a "silverback."', 'I beat my chest to show how strong I am.'],
    ['🐒', 'Chimpanzee', 'I share about 98% of my DNA with people.', 'I use sticks as tools to fish termites out of their nests.', "I'm a noisy, very smart ape with black hair from African forests."],
    ['🦧', 'Orangutan', 'My name means "person of the forest."', 'I build a new bed of leaves high in the trees every night.', 'I have very long arms and orange-red hair.'],
    ['🐒', 'Baboon', 'I live on the ground in big troops in Africa.', 'I have a long, dog-like snout and big sharp teeth.', 'I have a bright red, hairless bottom.'],
    ['🐒', 'Lemur', 'Some of us sunbathe with our arms stretched out.', 'I have a long black-and-white ringed tail.', 'I only live on the island of Madagascar.'],
  ],
  'Big African animals': [
    ['🦒', 'Giraffe', 'My tongue is dark blue and very long.', 'I only need about 30 minutes of sleep a day.', "I'm the tallest animal in the world."],
    ['🦓', 'Zebra', 'No two of us have the same pattern.', "I'm in the horse family.", "I'm covered in black and white stripes."],
    ['🦏', 'Rhino', 'My horn is made of the same stuff as your fingernails.', 'Birds ride on my back and eat the bugs on me.', "I'm huge and gray, with one or two horns on my nose."],
    ['🦛', 'Hippo', 'My sweat is red and works like sunscreen.', "I can't really swim; I walk along the river bottom.", 'I spend the day in rivers and open my giant mouth wide.'],
    ['🐘', 'Elephant', 'I have the biggest brain of any land animal.', 'I can "hear" rumbles through my feet.', 'I drink and pick things up with my trunk.'],
  ],
  'Small animals': [
    ['🦔', 'Hedgehog', 'I eat bugs, worms and snails at night.', 'I sleep through the winter.', "I roll into a spiky ball when I'm scared."],
    ['🐿️', 'Squirrel', 'My front teeth never stop growing.', 'I forget where I buried lots of my food, and it grows into trees.', 'I have a bushy tail and I bury nuts.'],
    ['🦫', 'Beaver', 'My front teeth are orange because of iron.', 'I can hold my breath for 15 minutes.', 'I build dams out of sticks.'],
    ['🦝', 'Raccoon', 'I often dip my food in water before I eat it.', 'My clever front paws can open almost anything, even trash cans.', 'I have a black "mask" across my eyes and a ringed tail.'],
    ['🦨', 'Skunk', 'I stamp my feet as a warning.', "I'm black and white.", 'I spray a very stinky smell.'],
    ['🕳️', 'Mole', "I'm nearly blind.", 'My big paddle-shaped hands are made for digging.', 'I live underground and leave little hills of dirt on lawns.'],
  ],
  'Sea creatures': [
    ['🐙', 'Octopus', 'I have three hearts and blue blood.', 'I can squeeze through any hole bigger than my beak.', 'I have eight arms covered in suckers.'],
    ['🦑', 'Squid', 'The giant kind has the biggest eyes of any animal.', 'I squirt ink to escape.', 'I have eight arms plus two extra-long tentacles.'],
    ['🌊', 'Jellyfish', 'I have no brain, heart or bones.', 'My kind has been around longer than the dinosaurs.', "I'm see-through, and my tentacles sting."],
    ['⭐', 'Starfish', 'I can grow back an arm I lost.', 'I eat by pushing my stomach out of my body.', "I'm shaped like a star and live on the sea floor."],
    ['🐠', 'Seahorse', 'The dad carries the babies in a pouch.', 'I hold onto seaweed with my curly tail.', "My head looks like a tiny horse's."],
    ['🦀', 'Crab', 'My skeleton is on the outside.', 'I have ten legs, and two of them are claws.', 'I walk sideways.'],
  ],
};

CA.games.add('animal', {
  name: 'Animal Guess', icon: '🐾', blurb: 'Guess the animal from the clues. The first clue is hard and they get easier, but all 4 answers are alike! The fastest right answer wins the round. First to 3!',
  start(ctx) {
    const rounds = pickN(ctx.rng, Object.keys(ANIMAL_GROUPS), 5).map(group => {
      const list = ANIMAL_GROUPS[group];
      const [e, name, c1, c2, c3] = list[Math.floor(ctx.rng() * list.length)];
      const o = options(ctx.rng, name, list.map(a => a[1]));
      return {
        q: '<div class="an-box"><p class="an-group">' + esc(group) + '</p><ol class="an-clues"><li>' + esc(c1) + '</li><li class="hide">' + esc(c2) + '</li><li class="hide">' + esc(c3) + '</li></ol></div>',
        options: o.options.map(esc), answer: o.answer, after: e + ' ' + name + '!',
      };
    });
    quizRounds(ctx, {
      rounds, target: 3, maxRounds: 5, roundMs: L(11000), note: r => 'Animal ' + r + ' · first to 3', ask: 'Which animal am I?', botMs: 5500,
      botRight: skill => 0.4 + skill * 0.45,
      onRound(rd, c) {
        const clues = [...$('qzQ').querySelectorAll('li')];
        c.later(() => { if (clues[1]) clues[1].classList.remove('hide'); }, L(3500));
        c.later(() => { if (clues[2]) clues[2].classList.remove('hide'); }, L(7000));
      },
    });
  },
});

/* ================= PATTERN NEXT ================= */

const SHAPES = ['🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '⭐', '❤️', '🔺', '🟦'];

function makePattern(rng) {
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const kind = Math.floor(rng() * 7);
  let seq, answer;
  if (kind === 0) { const a = int(1, 20), d = int(2, 9) * (rng() < 0.25 ? -1 : 1); seq = [0, 1, 2, 3].map(i => a + d * i + (d < 0 ? 40 : 0)); answer = seq[3] + d; }
  else if (kind === 1) { const a = int(1, 5), q = int(2, 3); seq = [0, 1, 2, 3].map(i => a * q ** i); answer = seq[3] * q; }
  else if (kind === 2) { const k = int(1, 6); seq = [0, 1, 2, 3].map(i => (k + i) ** 2); answer = (k + 4) ** 2; }
  else if (kind === 3) { const a = int(1, 10), x = int(2, 6), y = int(1, 5); seq = [a]; for (let i = 1; i < 5; i++) seq.push(seq[i - 1] + (i % 2 ? x : y)); answer = seq[4] + x; }
  else if (kind === 4) { const a = int(1, 3), b = int(1, 4); seq = [a, b]; for (let i = 2; i < 5; i++) seq.push(seq[i - 1] + seq[i - 2]); answer = seq[3] + seq[4]; }
  else {
    const pick = shuffle(SHAPES, rng).slice(0, 3);
    const unit = kind === 5 ? [pick[0], pick[1]] : [pick[0], pick[1], pick[2]];
    seq = [];
    for (let i = 0; i < 6; i++) seq.push(unit[i % unit.length]);
    answer = unit[6 % unit.length];
    const wrong = shuffle(SHAPES.filter(s => s !== answer), rng).slice(0, 3);
    const opts = shuffle([answer].concat(wrong), rng);
    return { seq, options: opts, answer: opts.indexOf(answer) };
  }
  const wrongs = new Set();
  const spread = Math.max(2, Math.round(Math.abs(answer) * 0.15));
  while (wrongs.size < 3) { const w = answer + (rng() < 0.5 ? -1 : 1) * int(1, spread); if (w !== answer && w >= 0) wrongs.add(w); }
  const opts = shuffle([answer].concat([...wrongs]), rng);
  return { seq, options: opts, answer: opts.indexOf(answer) };
}

CA.games.add('pattern', {
  name: 'Pattern Next', icon: '🧩', blurb: 'What comes next? Numbers and shapes follow a pattern. Most right answers in 30 seconds wins! (A wrong tap freezes you for a second.)',
  start(ctx) {
    const LEN = L(30000);
    const puzzles = [];
    for (let i = 0; i < 60; i++) puzzles.push(makePattern(ctx.rng));
    scoreRace(ctx, {
      len: LEN,
      note: 'Most right answers wins',
      timerId: 'pnxTimer',
      barMax: 12,
      html: bars => bars + '<div class="px-seq" id="pxSeq"></div><div class="px-opts" id="pxOpts"></div><div class="timer"><i id="pnxTimer"></i></div><p class="g-msg" id="pxMsg">What comes next?</p>',
      start(api) {
        let i = 0, frozen = false;
        const show = () => {
          const p = puzzles[i % puzzles.length];
          $('pxSeq').innerHTML = p.seq.map(v => '<span>' + v + '</span>').join('') + '<span class="q">?</span>';
          $('pxOpts').innerHTML = p.options.map((o, k) => '<button class="px-opt" data-k="' + k + '">' + o + '</button>').join('');
          if (window.__testHooks) window.__peek = { answer: p.answer };
        };
        ctx.listen($('pxOpts'), 'pointerdown', e => {
          const b = e.target.closest('.px-opt');
          if (!b || frozen || !api.running()) return;
          if (+b.dataset.k === puzzles[i % puzzles.length].answer) {
            api.add(1);
            sound('correct');
            setMsg('pxMsg', '✅ Right!');
            i++;
            show();
          } else {
            frozen = true;
            b.classList.add('bad');
            sound('miss');
            setMsg('pxMsg', '❌ Not that one!');
            ctx.later(() => { frozen = false; i++; show(); setMsg('pxMsg', 'What comes next?'); }, 1000);
          }
        });
        show();
      },
      bot(skill) { return { final: Math.max(1, Math.round(gauss(0.2 + skill * 0.3, 0.05) * LEN / 1000)), at: LEN * 0.95 }; },
    });
  },
});

/* ================= SPOT THE DIFFERENCE ================= */

const SCENE = ['🌳', '🏠', '🌞', '☁️', '🚗', '🐶', '🌸', '🎈', '⭐', '🍎', '🐱', '🦋', '🌈', '🍄', '🐦', '🚲', '⛵', '🌙', '🐟', '🌵', '🍩', '🎁'];
const FLIPPY = ['🚗', '🐶', '🐱', '🐦', '🚲', '⛵', '🌙', '🐟']; // mirroring these is easy to see (a mirrored ⭐ looks the same)

function makeScene(rng) {
  const objs = [];
  for (let tries = 0; objs.length < 13 && tries < 400; tries++) {
    const s = 8 + rng() * 5;
    const o = { e: SCENE[Math.floor(rng() * SCENE.length)], x: 7 + rng() * 86, y: 7 + rng() * 56, s };
    if (objs.every(p => Math.hypot(p.x - o.x, p.y - o.y) > (p.s + o.s) * 0.62)) objs.push(o);
  }
  const right = objs.map(o => Object.assign({}, o));
  const diffs = [];
  const kinds = shuffle(['gone', 'swap', 'big', 'flip', 'swap'], rng);
  shuffle(objs.map((o, i) => i), rng).slice(0, 4).forEach((i, k) => {
    const o = right[i];
    const kind = kinds[k] === 'flip' && !FLIPPY.includes(o.e) ? 'big' : kinds[k];
    if (kind === 'gone') o.gone = true;
    else if (kind === 'swap') o.e = SCENE.filter(e => e !== o.e)[Math.floor(rng() * (SCENE.length - 1))];
    else if (kind === 'big') o.s *= 1.55;
    else o.flip = true;
    diffs.push({ x: o.x, y: o.y, r: Math.max(o.s, objs[i].s) * 0.75 + 3 });
  });
  for (let tries = 0; tries < 200; tries++) { // one extra thing that's only in the right picture
    const o = { e: SCENE[Math.floor(rng() * SCENE.length)], x: 7 + rng() * 86, y: 7 + rng() * 56, s: 9 };
    if (objs.every(p => Math.hypot(p.x - o.x, p.y - o.y) > (p.s + o.s) * 0.7)) { right.push(o); diffs.push({ x: o.x, y: o.y, r: 9.5 }); break; }
  }
  return { left: objs, right, diffs };
}

function sceneSVG(list, id) {
  return '<svg class="sd-pic" id="' + id + '" viewBox="0 0 100 70">' + list.filter(o => !o.gone).map(o =>
    '<text x="' + o.x.toFixed(1) + '" y="' + o.y.toFixed(1) + '" font-size="' + o.s.toFixed(1) + '"' +
    (o.flip ? ' transform="translate(' + (2 * o.x).toFixed(1) + ' 0) scale(-1 1)"' : '') + '>' + o.e + '</text>').join('') + '<g class="sd-marks"></g></svg>';
}

CA.games.add('spot', {
  name: 'Spot the Difference', icon: '🔍', blurb: 'The two pictures have 5 differences. Click them in either picture! First to find all 5 (or the most in 30 seconds) wins.',
  start(ctx) {
    const LEN = L(30000);
    const sc = makeScene(ctx.rng);
    const total = sc.diffs.length;
    scoreRace(ctx, {
      len: LEN,
      note: 'Find all ' + total + ' differences',
      timerId: 'sdTimer',
      barMax: total,
      endsRace: true,
      fmt: n => Math.floor(n) + '/' + total,
      html: bars => bars + '<div class="sd-pics">' + sceneSVG(sc.left, 'sdL') + sceneSVG(sc.right, 'sdR') + '</div>' +
        '<div class="timer"><i id="sdTimer"></i></div><p class="g-msg" id="sdMsg">Click on the differences!</p>',
      start(api) {
        const found = new Set();
        let frozen = false;
        const mark = d => ['sdL', 'sdR'].forEach(id => {
          $(id).querySelector('.sd-marks').insertAdjacentHTML('beforeend', '<circle cx="' + d.x.toFixed(1) + '" cy="' + d.y.toFixed(1) + '" r="' + d.r.toFixed(1) + '"/>');
        });
        ['sdL', 'sdR'].forEach(id => ctx.listen($(id), 'pointerdown', e => {
          if (!api.running() || frozen) return;
          const svg = $(id);
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const p = pt.matrixTransform(svg.getScreenCTM().inverse());
          const k = sc.diffs.findIndex((d, i) => !found.has(i) && Math.hypot(d.x - p.x, d.y - p.y) <= d.r);
          if (k < 0) { // no guessing everywhere: a wrong click freezes you for a moment
            frozen = true;
            sound('miss');
            svg.classList.add('frozen');
            setMsg('sdMsg', '❌ Nothing different there!');
            ctx.later(() => { frozen = false; svg.classList.remove('frozen'); setMsg('sdMsg', 'Click on the differences!'); }, 800);
            return;
          }
          found.add(k);
          mark(sc.diffs[k]);
          sound('correct');
          api.add(1);
          if (found.size === total) { setMsg('sdMsg', 'You found them all! 🎉'); api.done(); }
        }));
        if (window.__testHooks) window.__peek = { diffs: sc.diffs };
      },
      bot(skill) {
        const T = Math.max(8000, gauss(30000 - skill * 12000, 4000)) * (LEN / 30000);
        return T < LEN ? { final: total, at: T } : { final: Math.floor(total * LEN / T), at: LEN };
      },
      botNow: (bot, ms) => Math.min(total - 1, Math.floor(bot.final * Math.min(1, ms / bot.at))),
    });
  },
});

})();
