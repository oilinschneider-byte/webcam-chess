/* Classic Games: Rhyme Race, Longest Word, Category Rush, Guess Their Choice, Same Answer, Would You Rather Prediction.
   Longest Word checks answers against lib/words.js and Rhyme Race against lib/rhymes.js (each loaded only when its
   game comes up, usually during the 5 seconds of face to face). */
(() => {
'use strict';

const { $, setMsg, esc, sound, gauss, shuffle, scoreRace, predictRounds, L } = CA.games.kit;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function loadScript(src, global) {
  return new Promise((resolve, reject) => {
    if (window[global]) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(src + ' could not load.'));
    document.head.appendChild(s);
  });
}

let words = null;
let wordsLoading = null;
function loadWords() {
  if (words) return Promise.resolve(words);
  if (!wordsLoading) {
    wordsLoading = loadScript('lib/words.js', 'WORD_LIST').then(() => {
      words = new Set(window.WORD_LIST.split(' '));
      return words;
    }, err => { wordsLoading = null; throw err; });
  }
  return wordsLoading;
}

// Rhyme families: [{ prompts: [...], common: [...], rare: [...] }]. Every word in a family rhymes with every other one.
let rhymes = null;
let rhymesLoading = null;
function loadRhymes() {
  if (rhymes) return Promise.resolve(rhymes);
  if (!rhymesLoading) {
    rhymesLoading = loadScript('lib/rhymes.js', 'RHYME_FAMILIES').then(() => {
      const list = s => (s ? s.split(' ') : []);
      rhymes = window.RHYME_FAMILIES.map(([p, c, r]) => ({ prompts: list(p), common: list(c), rare: list(r) }));
      return rhymes;
    }, err => { rhymesLoading = null; throw err; });
  }
  return rhymesLoading;
}

// Word games wait for their list if it isn't there yet.
function withList(ctx, ready, load, run) {
  if (ready()) { run(); return; }
  ctx.stage.innerHTML = '<div class="stage-wait">Loading words…</div>';
  load().then(() => { if (ctx.alive()) run(); }, () => {
    if (!ctx.alive()) return;
    ctx.stage.innerHTML = '<div class="stage-wait">The word list could not load.</div>';
    ctx.later(() => ctx.finish('draw'), 1500);
  });
}
const withWords = (ctx, run) => withList(ctx, () => !!words, loadWords, run);

function wordInput(id, placeholder) {
  return '<div class="wi-row"><input class="wi-in" id="' + id + '" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="24" placeholder="' + placeholder + '" aria-label="' + placeholder + '">' +
    '<button class="btn go" id="' + id + 'Go">Enter</button></div>';
}
function onWord(ctx, id, fn) {
  const input = $(id);
  const go = () => { const w = input.value.trim().toLowerCase(); if (w) fn(w, input); input.value = ''; input.focus(); };
  ctx.listen(input, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  ctx.listen($(id + 'Go'), 'click', go);
  input.focus();
}
function feedback(id, text, ok) {
  const el = $(id);
  el.textContent = text;
  el.className = 'wi-feedback ' + (ok ? 'ok' : 'bad');
}

/* ================= RHYME RACE ================= */

// Both players get the same (familiar) word and type perfect rhymes: one point for each new one. Rhymes come from
// lib/rhymes.js, grouped by how they sound (American English), so obscure real words count too, but names don't.
// Same score: whoever found their last rhyme first wins (scoreRace does that).
CA.games.add('rhyme', {
  name: 'Rhyme Race', icon: '🎵', blurb: 'You both get the same word. Type as many words as you can that rhyme with it perfectly (like night: kite, bright, delight…). Most rhymes in 30 seconds wins!',
  prepare() { loadRhymes().catch(() => {}); },
  start(ctx) {
    const LEN = L(30000);
    const pick = ctx.rng(); // (taken now, so both players get the same word even while the rhymes load)
    withList(ctx, () => !!rhymes, loadRhymes, () => {
      const prompts = [];
      rhymes.forEach(fam => fam.prompts.forEach(p => prompts.push([p, fam])));
      const [target, fam] = prompts[Math.floor(pick * prompts.length)];
      const familiar = fam.prompts.concat(fam.common).filter((w, i, all) => w !== target && all.indexOf(w) === i);
      const valid = new Set(familiar.concat(fam.rare));
      const found = []; // your rhymes, in the order you found them
      const chips = (list, cls) => list.map(w => '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(w) + '</span>').join('');
      scoreRace(ctx, {
        len: LEN,
        note: 'Rhymes with ' + target.toUpperCase(),
        timerId: 'rhTimer',
        barMax: 12,
        revealMs: L(9000),
        html: bars => bars + '<div class="rh-play" id="rhPlay"><div class="rh-target">Rhymes with <b>' + target.toUpperCase() + '</b></div>' + wordInput('rhIn', 'Type a rhyme…') +
          '<p class="wi-feedback" id="rhFb"></p><div class="wi-chips rh-mine" id="rhChips"></div><div class="timer"><i id="rhTimer"></i></div></div>' +
          '<div class="rh-sum hidden" id="rhSum"></div>',
        start(api) {
          if (window.__testHooks) window.__peek = { rhymes: familiar, target };
          onWord(ctx, 'rhIn', w => { // (already trimmed and lowercase)
            if (!api.running()) return;
            if (w === target) { feedback('rhFb', "That's the word itself!", false); return; }
            if (found.includes(w)) { feedback('rhFb', 'You already have ' + w + '.', false); return; }
            if (!valid.has(w)) { feedback('rhFb', '✗ ' + w + " doesn't rhyme with " + target + '.', false); sound('miss'); return; }
            found.push(w);
            api.add(1);
            sound('correct');
            feedback('rhFb', '✓ ' + w, true);
            $('rhChips').insertAdjacentHTML('beforeend', '<span>' + esc(w) + ' ✓</span>');
          });
        },
        stop() { $('rhIn').disabled = true; },
        extra: () => ({ words: found.slice(0, 300) }),
        bot(skill) { // the bot knows some of the familiar rhymes
          const pool = shuffle(familiar, Math.random);
          const n = Math.min(pool.length, Math.max(1, Math.round(gauss(3 + skill * 6, 1.3))));
          const list = pool.slice(0, n).map((w, i) => ({ w, at: Math.round((i + 0.6 + Math.random() * 0.4) / n * LEN * 0.9) })).sort((x, y) => x.at - y.at);
          return { final: n, at: list.length ? list[list.length - 1].at : LEN, list };
        },
        botCurve: (bot, ms) => bot.list.filter(x => x.at <= ms).length,
        botExtra: (bot, ms) => ({ words: bot.list.filter(x => x.at <= ms).map(x => x.w) }),
        reveal(a, b, w, mine, theirs) {
          const theirWords = theirs && Array.isArray(theirs.words) ? theirs.words.filter(x => typeof x === 'string' && valid.has(x)).slice(0, 300) : [];
          const seen = new Set(found.concat(theirWords));
          const missed = [...valid].filter(x => !seen.has(x));
          const missedFamiliar = missed.filter(x => familiar.includes(x));
          const missedRare = missed.filter(x => !familiar.includes(x));
          const who = w > 0 ? 'you' : ctx.oppName;
          $('rhPlay').classList.add('hidden');
          $('rhSum').classList.remove('hidden');
          $('rhSum').innerHTML =
            '<h4>' + (w === 0 ? "It's a tie! " : w > 0 ? 'You win! ' : esc(ctx.oppName) + ' wins. ') + 'You: ' + a + ' · ' + esc(ctx.oppName) + ': ' + b +
            (w !== 0 && a === b ? '<small>Same score, but ' + esc(who) + ' found the last rhyme first.</small>' : '') + '</h4>' +
            '<div class="rh-cols"><div><b>Your rhymes (' + found.length + ')</b><div class="wi-chips">' + (chips(found) || '<i>none</i>') + '</div></div>' +
            '<div><b>' + esc(ctx.oppName) + '’s rhymes (' + theirWords.length + ')</b><div class="wi-chips">' + (chips(theirWords, 'them') || '<i>none</i>') + '</div></div></div>' +
            '<div class="rh-missed"><b>Rhymes nobody found</b><div class="wi-chips">' + (chips(missedFamiliar, 'miss') || '<i>Every common one was found!</i>') + '</div>' +
            (missedRare.length ? '<details><summary>+ ' + missedRare.length + ' rarer words that count too</summary><p>' + esc(missedRare.join(', ')) + '</p></details>' : '') + '</div>';
        },
      });
    });
  },
});

/* ================= LONGEST WORD ================= */

const VOWELS = 'aaaaeeeeeiiiioooouu';
const CONSONANTS = 'bbcccdddffggghhhklllllmmmnnnnnnpprrrrrrssssssstttttttvwwy';

function lettersFor(rng) {
  const v = 3 + Math.floor(rng() * 2);
  const pick = (pool, n) => Array.from({ length: n }, () => pool[Math.floor(rng() * pool.length)]);
  return shuffle(pick(VOWELS, v).concat(pick(CONSONANTS, 9 - v)), rng);
}
function counts(s) { const c = {}; for (const ch of s) c[ch] = (c[ch] || 0) + 1; return c; }
function canMake(word, have) {
  const need = counts(word);
  return Object.keys(need).every(ch => (have[ch] || 0) >= need[ch]);
}

CA.games.add('longword', {
  name: 'Longest Word', icon: '🔠', blurb: 'Make the longest real word you can from the 9 letters (each letter once). Longest word after 30 seconds wins!',
  prepare() { loadWords().catch(() => {}); },
  start(ctx) {
    const LEN = L(30000);
    withWords(ctx, () => {
      let letters, have, best = 0;
      for (let tries = 0; tries < 30; tries++) { // make sure a good word is possible (both players get the same letters)
        letters = lettersFor(ctx.rng);
        have = counts(letters.join(''));
        best = 0;
        for (const w of words) if (w.length > best && w.length >= 3 && canMake(w, have)) best = w.length;
        if (best >= 6) break;
      }
      let longest = '';
      scoreRace(ctx, {
        len: LEN,
        note: 'Longest word wins',
        timerId: 'lwTimer',
        barMax: 9,
        html: bars => bars + '<div class="lw-tiles" id="lwTiles">' + letters.map((ch, i) => '<button class="lw-tile" data-i="' + i + '">' + ch + '</button>').join('') + '</div>' +
          wordInput('lwIn', 'Type a word…') + '<p class="wi-feedback" id="lwFb"></p><div class="wi-chips" id="lwChips"></div><div class="timer"><i id="lwTimer"></i></div>',
        start(api) {
          const used = new Set();
          if (window.__testHooks) window.__peek = { letters: letters.join(''), best: [...words].filter(w => w.length === best && canMake(w, have))[0] };
          ctx.listen($('lwTiles'), 'click', e => {
            const b = e.target.closest('.lw-tile');
            if (!b) return;
            const input = $('lwIn');
            if (canMake(input.value.toLowerCase() + b.textContent, have)) { input.value += b.textContent; input.focus(); }
          });
          onWord(ctx, 'lwIn', w => {
            if (!api.running()) return;
            w = w.replace(/[^a-z]/g, '');
            if (w.length < 3) { feedback('lwFb', 'Use at least 3 letters.', false); return; }
            if (!canMake(w, have)) { feedback('lwFb', 'You can only use the letters above (each once).', false); sound('miss'); return; }
            if (!words.has(w)) { feedback('lwFb', w + " isn't in our word list.", false); sound('miss'); return; }
            if (used.has(w)) { feedback('lwFb', 'You already found ' + w + '.', false); return; }
            used.add(w);
            sound('correct');
            $('lwChips').insertAdjacentHTML('beforeend', '<span>' + esc(w) + '</span>');
            if (w.length > api.score) { longest = w; api.set(w.length); feedback('lwFb', '✓ ' + w + ': your longest so far!', true); } else feedback('lwFb', '✓ ' + w, true);
          });
        },
        reveal: (a, b) => feedback('lwFb', (longest ? 'Your longest: ' + longest.toUpperCase() + ' (' + a + ')' : 'You found no words') + ' · ' + ctx.oppName + ': ' + b + ' letters · The longest possible was ' + best + ' letters.', a >= b),
        bot(skill) { return { final: clamp(Math.round(gauss(4.5 + skill * 2.5, 0.8)), 3, best), at: LEN * (0.3 + Math.random() * 0.6) }; },
      });
    });
  },
});

/* ================= CATEGORY RUSH ================= */

const CATEGORIES = {
  animals: ['Animals', 'dog cat lion tiger bear wolf fox deer moose elk horse zebra giraffe elephant rhino rhinoceros hippo hippopotamus monkey gorilla chimpanzee chimp orangutan baboon lemur kangaroo koala wombat platypus panda sloth otter beaver squirrel chipmunk rabbit bunny hare mouse rat hamster gerbil guinea pig hedgehog porcupine skunk raccoon badger mole bat camel llama alpaca goat sheep cow bull pig donkey mule bison buffalo yak ox leopard cheetah jaguar panther lynx bobcat cougar puma hyena jackal coyote meerkat mongoose armadillo anteater aardvark antelope gazelle walrus seal sea lion dolphin whale shark octopus squid jellyfish starfish crab lobster shrimp fish salmon tuna eel turtle tortoise frog toad lizard gecko iguana snake python cobra crocodile alligator chameleon eagle hawk owl parrot penguin flamingo ostrich emu peacock pigeon dove crow raven robin sparrow swan duck goose chicken hen rooster turkey pelican seagull woodpecker hummingbird toucan bee wasp ant butterfly moth ladybug beetle spider scorpion snail slug worm caterpillar grasshopper cricket dragonfly mosquito fly falcon vulture parakeet hornet termite seahorse stingray orca narwhal manatee koi goldfish hamster ferret'],
  fruits: ['Fruits', 'apple banana orange grape strawberry blueberry raspberry blackberry cherry peach pear plum apricot mango pineapple watermelon melon cantaloupe honeydew kiwi lemon lime grapefruit coconut papaya passion fruit pomegranate fig date guava lychee dragon fruit avocado cranberry currant tangerine clementine nectarine persimmon starfruit jackfruit durian gooseberry mulberry kumquat plantain raisin tomato olive'],
  vegetables: ['Vegetables', 'carrot potato tomato onion garlic lettuce cabbage broccoli cauliflower spinach kale cucumber pepper bell pepper chili corn pea bean green bean pumpkin squash zucchini eggplant celery asparagus radish beet turnip sweet potato yam leek artichoke brussels sprout okra mushroom ginger parsnip bok choy arugula shallot'],
  sports: ['Sports', 'soccer football basketball baseball tennis golf hockey ice hockey volleyball cricket rugby swimming running cycling boxing wrestling karate judo taekwondo skiing snowboarding skating ice skating surfing skateboarding badminton table tennis ping pong bowling archery fencing gymnastics rowing sailing diving climbing rock climbing handball lacrosse softball polo water polo triathlon darts snooker pool billiards curling horse riding dodgeball netball kickball frisbee cheerleading dance weightlifting kayaking canoeing'],
  colors: ['Colors', 'red orange yellow green blue purple pink brown black white gray grey violet indigo turquoise teal cyan magenta maroon navy beige tan gold silver lime olive coral peach lavender lilac crimson scarlet cream ivory mint aqua amber bronze burgundy mustard charcoal khaki rose ruby emerald sky blue'],
  countries: ['Countries', 'afghanistan albania algeria andorra angola argentina armenia australia austria azerbaijan bahamas bahrain bangladesh barbados belarus belgium belize benin bhutan bolivia bosnia botswana brazil brunei bulgaria burkina faso burundi cambodia cameroon canada chad chile china colombia comoros congo costa rica croatia cuba cyprus czechia czech republic denmark djibouti dominica dominican republic ecuador egypt el salvador england eritrea estonia eswatini ethiopia fiji finland france gabon gambia georgia germany ghana greece grenada guatemala guinea guyana haiti honduras hungary iceland india indonesia iran iraq ireland israel italy ivory coast jamaica japan jordan kazakhstan kenya kiribati kosovo kuwait kyrgyzstan laos latvia lebanon lesotho liberia libya liechtenstein lithuania luxembourg madagascar malawi malaysia maldives mali malta mauritania mauritius mexico micronesia moldova monaco mongolia montenegro morocco mozambique myanmar namibia nauru nepal netherlands holland new zealand nicaragua niger nigeria north korea north macedonia macedonia norway oman pakistan palau palestine panama papua new guinea paraguay peru philippines poland portugal qatar romania russia rwanda samoa san marino saudi arabia scotland senegal serbia seychelles sierra leone singapore slovakia slovenia solomon islands somalia south africa south korea korea south sudan spain sri lanka sudan suriname sweden switzerland syria taiwan tajikistan tanzania thailand togo tonga trinidad and tobago tunisia turkey turkmenistan tuvalu uganda ukraine united arab emirates uae united kingdom uk united states usa america uruguay uzbekistan vanuatu vatican city vatican venezuela vietnam wales yemen zambia zimbabwe'],
  foods: ['Foods', 'pizza pasta spaghetti burger hamburger cheeseburger hot dog sandwich taco burrito sushi rice noodles ramen soup salad steak chicken bacon sausage egg pancake waffle toast bread bagel croissant muffin cake cookie brownie pie donut doughnut ice cream chocolate candy popcorn chips fries french fries cheese yogurt cereal oatmeal porridge cupcake lasagna curry dumpling kebab falafel hummus nachos quesadilla omelette omelet meatball fish and chips macaroni mac and cheese pretzel cracker peanut butter jelly jam honey butter ham turkey salmon tuna shrimp lobster crab tofu beans lentils stew chili gravy mashed potatoes spring roll pudding custard scone biscuit granola pancakes tortilla'],
  jobs: ['Jobs', 'teacher doctor nurse dentist vet veterinarian firefighter police officer policeman cop pilot chef cook baker farmer builder carpenter plumber electrician mechanic engineer scientist astronaut artist painter singer musician actor actress dancer writer author journalist photographer lawyer judge soldier sailor driver bus driver taxi driver waiter waitress cashier librarian programmer designer architect accountant banker barber hairdresser tailor gardener janitor cleaner lifeguard coach athlete president mayor zookeeper pharmacist surgeon paramedic mail carrier postman fisherman miner clown magician detective ranger pilot'],
  kitchen: ['Things in a kitchen', 'fridge refrigerator freezer oven stove microwave toaster kettle blender dishwasher sink pan pot frying pan spoon fork knife plate bowl cup mug glass spatula whisk ladle tongs grater peeler cutting board colander strainer rolling pin oven mitt apron napkin towel dish soap sponge trash can bin cupboard cabinet drawer table chair jar bottle can opener measuring cup baking tray tray teapot coffee maker lunchbox timer salt pepper sugar flour'],
  body: ['Body parts', 'head hair face eye ear nose mouth lip tongue tooth teeth chin cheek forehead eyebrow eyelash neck shoulder arm elbow wrist hand finger thumb nail chest stomach belly back hip leg knee ankle foot feet toe heel heart brain lung liver kidney bone skin muscle blood spine skull rib'],
  music: ['Musical instruments', 'piano guitar violin viola cello bass double bass drums drum flute clarinet oboe bassoon saxophone sax trumpet trombone tuba french horn horn harp harmonica accordion ukulele banjo mandolin xylophone marimba tambourine triangle cymbals bagpipes recorder organ keyboard synthesizer sitar bongos maracas kazoo glockenspiel didgeridoo castanets'],
  clothes: ['Clothes', 'shirt tshirt pants trousers jeans shorts skirt dress jacket coat sweater jumper hoodie sweatshirt vest suit tie scarf hat cap beanie gloves glove mittens socks sock shoes shoe boots sneakers sandals slippers pajamas underwear belt blouse cardigan leggings tights uniform raincoat swimsuit overalls robe kimono poncho apron'],
};
// Multi-word answers ("sea lion", "hot dog") are written with spaces in the lists above; single words are separated
// by spaces too, so the list of known multi-word answers is kept here.
const MULTI = ['guinea pig', 'sea lion', 'passion fruit', 'dragon fruit', 'bell pepper', 'green bean', 'sweet potato', 'brussels sprout', 'bok choy',
  'ice hockey', 'rock climbing', 'table tennis', 'ping pong', 'ice skating', 'water polo', 'horse riding', 'sky blue', 'burkina faso', 'costa rica',
  'czech republic', 'dominican republic', 'el salvador', 'ivory coast', 'new zealand', 'north korea', 'north macedonia', 'papua new guinea',
  'san marino', 'saudi arabia', 'sierra leone', 'solomon islands', 'south africa', 'south korea', 'south sudan', 'sri lanka', 'trinidad and tobago',
  'united arab emirates', 'united kingdom', 'united states', 'vatican city', 'hot dog', 'ice cream', 'french fries', 'fish and chips', 'mac and cheese',
  'peanut butter', 'mashed potatoes', 'spring roll', 'police officer', 'bus driver', 'taxi driver', 'mail carrier', 'frying pan', 'cutting board',
  'rolling pin', 'oven mitt', 'dish soap', 'trash can', 'can opener', 'measuring cup', 'baking tray', 'coffee maker', 'double bass', 'french horn'];

function categoryList(key) {
  let text = ' ' + CATEGORIES[key][1] + ' ';
  const items = new Set();
  for (const m of MULTI) if (text.includes(' ' + m + ' ')) { items.add(m); text = text.split(' ' + m + ' ').join(' '); }
  text.split(' ').filter(Boolean).forEach(w => items.add(w));
  return items;
}
const normAnswer = s => s.toLowerCase().replace(/-/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').replace(/^(the|a|an) /, '').trim();
function findAnswer(list, s) {
  const tries = [s, s.replace(/ies$/, 'y'), s.replace(/es$/, ''), s.replace(/s$/, '')];
  return tries.find(t => list.has(t)) || null;
}

CA.games.add('category', {
  name: 'Category Rush', icon: '📋', blurb: 'Name as many things in the category as you can! Most right answers in 30 seconds wins.',
  start(ctx) {
    const LEN = L(30000);
    const keys = Object.keys(CATEGORIES);
    const key = keys[Math.floor(ctx.rng() * keys.length)];
    let list = categoryList(key);
    let title = CATEGORIES[key][0];
    if (['animals', 'countries', 'foods'].includes(key) && ctx.rng() < 0.6) { // e.g. "Animals that start with S"
      const letters = [...'abcdefghijklmnopqrstuvwxyz'].filter(ch => [...list].filter(w => w[0] === ch).length >= 10);
      const ch = letters[Math.floor(ctx.rng() * letters.length)];
      list = new Set([...list].filter(w => w[0] === ch));
      title += ' that start with ' + ch.toUpperCase();
    }
    scoreRace(ctx, {
      len: LEN,
      note: title,
      timerId: 'crTimer',
      barMax: 12,
      html: bars => bars + '<div class="rh-target"><b>' + esc(title) + '</b></div>' + wordInput('crIn', 'Type an answer…') +
        '<p class="wi-feedback" id="crFb"></p><div class="wi-chips" id="crChips"></div><div class="timer"><i id="crTimer"></i></div>',
      start(api) {
        const used = new Set();
        if (window.__testHooks) window.__peek = { answers: [...list] };
        onWord(ctx, 'crIn', raw => {
          if (!api.running()) return;
          const hit = findAnswer(list, normAnswer(raw));
          if (!hit) { feedback('crFb', raw + " isn't on our list.", false); sound('miss'); return; }
          if (used.has(hit)) { feedback('crFb', 'You already said ' + hit + '.', false); return; }
          used.add(hit);
          api.add(1);
          sound('correct');
          feedback('crFb', '✓ ' + hit, true);
          $('crChips').insertAdjacentHTML('beforeend', '<span>' + esc(hit) + '</span>');
        });
      },
      bot(skill) { return { final: Math.max(1, Math.round(gauss(4 + skill * 6, 1.5) * (LEN / 30000))), at: LEN * 0.92 }; },
    });
  },
});

/* ================= GUESS THEIR CHOICE ================= */

const CHOICES = [
  ['Pick a snack', ['🍕 Pizza', '🍔 Burger', '🌮 Taco']], ['Pick a pet', ['🐶 Dog', '🐱 Cat', '🐹 Hamster']],
  ['Pick a superpower', ['🦸 Flying', '👻 Invisible', '⚡ Super speed']], ['Pick a season', ['☀️ Summer', '❄️ Winter', '🍂 Fall']],
  ['Pick a dessert', ['🍦 Ice cream', '🍰 Cake', '🍪 Cookies']], ['Pick a color', ['🔴 Red', '🔵 Blue', '🟢 Green']],
  ['Pick a place', ['🏖️ Beach', '🏔️ Mountains', '🏙️ City']], ['Pick a drink', ['🥤 Soda', '🧃 Juice', '🥛 Milk']],
  ['Pick a sport', ['⚽ Soccer', '🏀 Basketball', '🎾 Tennis']], ['Pick a ride', ['🚀 Rocket', '🚤 Speedboat', '🏎️ Race car']],
  ['Pick a breakfast', ['🥞 Pancakes', '🥣 Cereal', '🍳 Eggs']], ['Pick an animal', ['🦁 Lion', '🐬 Dolphin', '🦅 Eagle']],
  ['Pick a fun thing', ['🎮 Video games', '♟️ Board games', '📺 TV']], ['Pick a fruit', ['🍎 Apple', '🍌 Banana', '🍓 Strawberry']],
  ['Pick a time of day', ['🌅 Morning', '🌇 Evening', '🌙 Night']], ['Pick a movie', ['😂 Comedy', '😱 Scary', '🦸 Action']],
];

CA.games.add('guess', {
  name: 'Guess Their Choice', icon: '🔮', blurb: 'Pick your own answer, then guess what the other player picked. Every right guess scores a point!',
  start(ctx) {
    const rounds = shuffle(CHOICES, ctx.rng).slice(0, 5).map(([q, opts]) => ({ q: esc(q), options: opts.map(esc) }));
    predictRounds(ctx, { rounds, roundMs: L(16000), guess: true });
  },
});

/* ================= WOULD YOU RATHER ================= */

const RATHER = [
  ['be able to fly', 'be invisible', '✈️ Fly', '👻 Be invisible'], ['live in space', 'live under the sea', '🚀 Space', '🌊 Under the sea'],
  ['have a pet dragon', 'have a pet unicorn', '🐉 Dragon', '🦄 Unicorn'], ['eat only pizza', 'eat only ice cream', '🍕 Pizza', '🍦 Ice cream'],
  ['be super strong', 'be super fast', '💪 Strong', '⚡ Fast'], ['talk to animals', 'speak every language', '🐾 Animals', '🗣️ Every language'],
  ['never do homework', 'never do chores', '📚 No homework', '🧹 No chores'], ['live in a treehouse', 'live in a castle', '🌳 Treehouse', '🏰 Castle'],
  ['travel to the past', 'travel to the future', '⏪ The past', '⏩ The future'], ['be a famous singer', 'be a famous athlete', '🎤 Singer', '🏅 Athlete'],
  ['have summer all year', 'have winter all year', '☀️ Summer', '❄️ Winter'], ['ride a dinosaur', 'ride a giant eagle', '🦖 Dinosaur', '🦅 Giant eagle'],
  ['have a robot friend', 'have a ghost friend', '🤖 Robot', '👻 Ghost'], ['be a wizard', 'be a superhero', '🧙 Wizard', '🦸 Superhero'],
  ['explore the jungle', 'explore the desert', '🌴 Jungle', '🏜️ Desert'], ['have no phone for a week', 'have no TV for a month', '📵 No phone', '📺 No TV'],
];

CA.games.add('wyr', {
  name: 'Would You Rather', icon: '🤔', blurb: 'Would you rather…? Pick your answer, then predict what the other player picked. Every right prediction scores a point!',
  start(ctx) {
    const rounds = shuffle(RATHER, ctx.rng).slice(0, 5).map(([a, b, la, lb]) => ({ q: 'Would you rather <b>' + esc(a) + '</b> or <b>' + esc(b) + '</b>?', options: [esc(la), esc(lb)] }));
    predictRounds(ctx, { rounds, roundMs: L(16000), guess: true });
  },
});

/* ================= SAME ANSWER ================= */

const SAME = [
  ['Best pizza topping?', ['🧀 Cheese', '🍄 Mushroom', '🍍 Pineapple', '🍕 Pepperoni']], ['Best animal?', ['🐶 Dog', '🐱 Cat', '🐼 Panda', '🦁 Lion']],
  ['Best breakfast?', ['🥞 Pancakes', '🥣 Cereal', '🍳 Eggs', '🧇 Waffles']], ['Coolest superpower?', ['✈️ Flying', '⏱️ Stop time', '👻 Invisible', '🧠 Read minds']],
  ['Best place to live?', ['🏝️ Island', '🏔️ Mountains', '🏙️ Big city', '🌲 Forest']], ['Best color?', ['🔴 Red', '🔵 Blue', '🟢 Green', '🟣 Purple']],
  ['Best sport?', ['⚽ Soccer', '🏀 Basketball', '🏈 Football', '🎾 Tennis']], ['Best dessert?', ['🍦 Ice cream', '🍫 Chocolate', '🍩 Donut', '🍪 Cookie']],
  ['Best pet name?', ['Max', 'Luna', 'Buddy', 'Coco']], ['Pick a number!', ['1', '3', '7', '10']], ['Best way to travel?', ['✈️ Plane', '🚆 Train', '🚗 Car', '🚢 Ship']],
  ['Best holiday?', ['🎂 Birthday', '🎄 Christmas', '🎃 Halloween', '🏖️ Summer break']], ['Best drink?', ['🥤 Soda', '🧃 Juice', '🍫 Hot chocolate', '💧 Water']],
  ['Best game?', ['⛏️ Minecraft', '🏎️ Racing games', '⚽ Sports games', '🧩 Puzzles']],
];

CA.games.add('same', {
  name: 'Same Answer', icon: '🤝', blurb: 'Teamwork! Try to pick the SAME answer as the other player. Match on 3 of 5 and you BOTH win. Otherwise it is a draw.',
  start(ctx) {
    const rounds = shuffle(SAME, ctx.rng).slice(0, 5).map(([q, opts]) => ({ q: esc(q), options: opts.map(esc) }));
    const mine = v => (v && Number.isInteger(v.mine) ? v.mine : -1);
    predictRounds(ctx, {
      rounds,
      roundMs: L(12000),
      guess: false,
      points: (a, b) => (mine(a) >= 0 && mine(a) === mine(b) ? [1, 1] : [0, 0]),
      outcome: my => (my >= 3 ? 'win' : 'draw'),
      reveal: (a, b, rd, name) => (mine(a) >= 0 && mine(a) === mine(b) ? '🤝 You both picked ' + name(mine(a)) + '! Point for both of you.' : 'Different answers: you picked ' + name(mine(a)) + ', ' + ctx.oppName + ' picked ' + name(mine(b)) + '.'),
    });
  },
});

CA.games.loadWords = loadWords; // (the tests use these)
CA.games.loadRhymes = loadRhymes;

})();
