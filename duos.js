/* Duos: 2 vs 2. Four players, two teams of two, and games made for four cats at once (see games-duos.js).

   Press Duos (at the bottom of the games page) and you join the Duos queue on the server (see DUOS in
   server/schema.sql). As soon as four players are looking, the server puts them in random teams: seats 0 and 1 are
   the blue team, seats 2 and 3 the orange team. Seat 0 runs the games (the host); the other three connect to it.
   Nobody else around? "Play now with bots" fills the empty seats with bots, and you can play straight away.

   The network. Each of the three others opens two connections to the host: a reliable one (who's who, which game,
   events, the result) and a fast lane that never waits for a lost packet (your keys, and the host's "here's where
   everything is", many times a second). Cameras and microphones go straight between every pair of players: each one
   calls the other three with their own camera and microphone, and answers their calls to listen. Under 18, or a match
   with someone under 18 in it: no cameras or microphones at all, everyone is their cat. All four cameras (or cats)
   are always on screen, across the top.

   The games. Each is a little simulation the host runs 60 times a second from all four players' controls (see run).
   It sends the result to the others 30 times a second, and they draw it smoothed, a moment behind. Every game is
   just for fun: Duos never changes streaks or fish. Nothing here touches the 1 vs 1 modes. */
(() => {
'use strict';

const W = 960, H = 540, DT = 1 / 60, SEND_EVERY = 2;       // the arena, the step, and how often the host sends
const VIEW_DELAY = 90;                                      // ms the others draw behind the host, so it's smooth
const PEER_PREFIX = 'camarcade-duo-';
const BASE_ICE = (window.CAMARCADE_CONFIG && CAMARCADE_CONFIG.iceServers) || [];
const POLL_MS = 1500, CONNECT_MS = 25000, RESULT_MS = 4200;
const TEAM = [{ main: '#3d8bff', light: '#9cc6ff', dark: '#1d4fa8', name: 'Blue' }, { main: '#ff8a1f', light: '#ffc58a', dark: '#b4520a', name: 'Orange' }];
const teamOf = seat => (seat < 2 ? 0 : 1);
const mateOf = seat => seat ^ 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const F = () => CA.floppy;
const sound = (k, r) => { try { CA.sound(k, r); } catch (e) { /* ignore */ } };

/* ---------- the games (added by games-duos.js) ---------- */

const GAMES = {}, ORDER = [];
function add(id, def) { GAMES[id] = def; ORDER.push(id); }

// The real games: the very same ones as 1 vs 1 (see games-duel.js), once a game knows how to play with four (its
// CA.games.add has duos: true). Each takes the place of the simpler stand-in written for Duos before it.
const REPLACES = { sumo: 'sumo2', trails: 'trails2', hockey: 'hockey2', paint: 'paint2', box: 'box2', dodge: 'dodge2', hoops: 'hoops2', kart: 'kart2', cannons: 'cannons2', poop: 'poop2', laser: 'laser2', walls: 'walls2', pond: 'pond2', mouse: 'heist2' };
const realIds = () => (CA.games && CA.games.ids ? CA.games.ids().filter(id => { const g = CA.games.get(id); return g && g.duos; }) : []);
// Every game Duos plays now: { id, name, icon, real }.
function lineup() {
  const real = realIds();
  const gone = new Set(real.map(id => REPLACES[id]).filter(Boolean));
  return real.map(id => { const g = CA.games.get(id); return { id, name: g.name, icon: g.icon, real: true }; })
    .concat(ORDER.filter(id => !gone.has(id)).map(id => ({ id, name: GAMES[id].name, icon: GAMES[id].icon, real: false })));
}
const gameInfo = id => lineup().find(x => x.id === id);

/* ---------- the screen ---------- */

let state = 'idle';     // idle | searching | connecting | playing
let peer = null, match = null, gen = 0;

function screenHTML() {
  return '<div class="duo-wrap">' +
    '<div class="duo-cams" id="duoCams"></div>' +
    '<div class="duo-bar" id="duoBar"></div>' +
    '<div class="duo-stage" id="duoStage"></div>' +
    '</div>';
}

function enter() {
  CA.showScreen('scr-duos');
  const root = $('scr-duos');
  if (!root.dataset.built) { root.innerHTML = screenHTML(); root.dataset.built = '1'; }
  CA.voice.setInGame(true); // (your camera turns on, if you allowed it)
  if (state === 'idle') showLobby();
}

function leaveScreen() {
  stopAll('left');
  CA.voice.setInGame(false);
}

function showLobby(note) {
  state = 'idle';
  drawCams();
  $('duoBar').innerHTML = '';
  $('duoStage').innerHTML =
    '<div class="duo-lobby">' +
    '<h1>Duos <small>2 vs 2</small></h1>' +
    '<p class="duo-sub">Team up with another player against another team of two. Every game is made for four cats at once. All four cameras show the whole time.</p>' +
    (note ? '<p class="duo-note">' + esc(note) + '</p>' : '') +
    '<div class="duo-games">' + lineup().map(x => '<span class="duo-chip">' + x.icon + ' ' + esc(x.name) + '</span>').join('') + '</div>' +
    '<button class="btn duo-go" id="duoFind">Find a Duos match</button>' +
    '<button class="btn ghost duo-bots" id="duoBots">Play now with bots</button>' +
    '<a class="duo-back" href="#/games">Back to the games</a>' +
    '</div>';
  $('duoFind').onclick = startSearch;
  $('duoBots').onclick = () => startBots();
}

function showSearching(text, sub) {
  $('duoStage').innerHTML =
    '<div class="duo-lobby duo-searching">' +
    '<div class="duo-radar"><i></i><i></i><i></i></div>' +
    '<h2 id="duoSearchTitle">' + esc(text) + '</h2>' +
    '<p class="duo-sub" id="duoSearchSub">' + esc(sub || '') + '</p>' +
    '<button class="btn duo-bots" id="duoBotsNow">Play now with bots</button>' +
    '<button class="btn ghost" id="duoCancel">Cancel</button>' +
    '</div>';
  $('duoCancel').onclick = () => { stopAll('cancel'); showLobby(); };
  $('duoBotsNow').onclick = () => { stopAll('bots'); startBots(); };
}

/* ---------- the cameras (or cats) across the top ---------- */

// seats[s]: { name, equip, bot, me, stream }
let seats = null;
function drawCams() {
  const box = $('duoCams');
  if (!box) return;
  const list = seats || [{ name: CA.profile ? CA.profile.name : 'You', equip: CA.profile && CA.profile.equip, me: true }, null, null, null];
  const meSeat = match ? match.seat : 0;
  // (your team on the left, always: you first, then your teammate; then the other team)
  const order = [meSeat, mateOf(meSeat), teamOf(meSeat) ? 0 : 2, teamOf(meSeat) ? 1 : 3];
  box.innerHTML = order.map((s, k) => {
    const p = list[s];
    const team = teamOf(s);
    return (k === 2 ? '<div class="duo-vs">VS</div>' : '') +
      '<div class="duo-cam t' + team + (p && p.me ? ' me' : '') + '" data-seat="' + s + '">' +
      '<video autoplay playsinline' + (p && p.me ? ' muted class="mirror"' : '') + '></video>' +
      '<div class="duo-cat">' + (p ? CA.catSVG(p.equip, { bg: false, anim: true, talker: p.me ? 'me' : undefined }) : '<span class="duo-empty">?</span>') + '</div>' +
      '<span class="duo-name">' + (p ? esc(p.me ? 'You' : p.name) + (p.bot ? ' <em>bot</em>' : '') : 'Looking…') + '</span>' +
      '</div>';
  }).join('');
  showStreams();
}

function showStreams() {
  const box = $('duoCams');
  if (!box) return;
  box.querySelectorAll('.duo-cam').forEach(el => {
    const s = +el.dataset.seat, p = seats ? seats[s] : (s === 0 ? { me: true } : null);
    const v = el.querySelector('video');
    let src = null;
    if (p && p.me) src = CA.voice.cameraOn() && canShare() ? CA.voice.camera : null;
    else if (p && p.stream) src = p.stream;
    const hasVideo = !!(src && src.getVideoTracks().some(t => t.readyState === 'live'));
    if (v.srcObject !== src) { v.srcObject = src; if (src) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    el.classList.toggle('live', hasVideo);
  });
}

// Cameras and microphones only between adults, in a match where everyone is one.
const canShare = () => CA.canVideoChat() && !(match && match.catsOnly);

/* ---------- looking for a match ---------- */

async function peerOpts() {
  let relay = [];
  try {
    const got = await Promise.race([CA.server.call('ca_turn', { p_token: CA.token }).catch(() => null), sleep(4000).then(() => null)]);
    if (got) relay = [].concat(got);
  } catch (e) { /* the free relays will do */ }
  return { debug: 0, config: { iceServers: BASE_ICE.concat(relay) } };
}

function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, x => x.toString(36).padStart(2, '0')).join('');
}

async function openPeer(myGen) {
  const opts = await peerOpts();
  return new Promise((resolve, reject) => {
    const p = new Peer(PEER_PREFIX + randomId(), opts);
    let done = false;
    p.on('open', () => { if (done) return; done = true; if (myGen !== gen) { p.destroy(); reject(new Error('cancelled')); return; } resolve(p); });
    p.on('error', err => { if (!done) { done = true; try { p.destroy(); } catch (e) { /* ignore */ } reject(err); } else onPeerError(p, err); });
  });
}

async function startSearch() {
  if (!CA.token) { CA.toast('Log in to play Duos online.'); return; }
  if (!CA.server.configured) { CA.toast("The game server isn't set up."); return; }
  const myGen = ++gen;
  state = 'searching';
  showSearching('Looking for 3 more players…', 'Teams are picked at random. You can start with bots while you wait.');
  try {
    peer = await openPeer(myGen);
  } catch (err) {
    if (myGen !== gen) return;
    showLobby("Can't reach the video connection server. Check your internet connection.");
    return;
  }
  peer.on('connection', c => onIncoming(c));
  peer.on('call', call => onCall(call));
  let fails = 0;
  while (myGen === gen && state === 'searching') {
    try {
      const r = await CA.server.call('ca_duo_poll', { p_token: CA.token, p_peer: peer.id });
      fails = 0;
      if (myGen !== gen || state !== 'searching') return;
      if (r && r.banned) { stopAll('banned'); showLobby('Your account is banned from matchmaking for now.'); return; }
      if (r && r.match) { startMatch(r.match, myGen); return; }
      if (r && r.waiting) {
        const t = $('duoSearchTitle'), sub = $('duoSearchSub');
        if (t) t.textContent = r.looking > 1 ? r.looking + ' of 4 players found…' + (r.fill_in != null ? ' Starting with bots in ' + r.fill_in + 's' : '') : 'Looking for 3 more players…';
        if (sub && r.online) sub.textContent = '🟢 ' + r.online + ' online now · teams are picked at random';
      }
    } catch (err) {
      if (myGen !== gen) return;
      if (err.code === 'not_logged_in') { CA.sessionLost(); return; }
      if (++fails >= 4) { stopAll('error'); showLobby(err.message || 'Lost the game server.'); return; }
    }
    await sleep(POLL_MS + Math.random() * 400);
  }
}

function onPeerError(p, err) {
  if (p !== peer || err.type === 'peer-unavailable') return;
  console.warn('Duos PeerJS error:', err.type, err);
}

/* ---------- the match ---------- */

// match: { id, seat, host, catsOnly, players: [{ seat, id, name, peer }], conns: { seat: { r, fast } }, live }
function startMatch(m, myGen) {
  state = 'connecting';
  match = { id: m.id, seat: m.seat, host: m.seat === 0, catsOnly: !!m.cats_only, players: m.players, conns: {}, hostConn: null, myGen, live: false, bots: false };
  // (an empty seat is a bot: the host's app plays it)
  const botNames = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  seats = m.players.map(p => (p.bot ? { name: botNames[p.seat], equip: BOT_EQUIP[p.seat], bot: true, ready: true } : { name: p.name, equip: null, me: p.seat === m.seat, peer: p.peer, stream: null }));
  seats[m.seat].equip = CA.profile.equip;
  drawCams();
  const people = m.players.filter(p => !p.bot).length;
  showSearching(people === 4 ? 'Found 3 players! Connecting…' : 'Found ' + (people - 1) + ' player' + (people > 2 ? 's' : '') + '! Bots fill the rest. Connecting…', 'Your team: ' + TEAM[teamOf(m.seat)].name + ', with ' + (seats[mateOf(m.seat)].name || 'a teammate'));
  match.timer = setTimeout(() => connectFailed('timeout'), CONNECT_MS);
  if (!match.host) {
    const host = m.players[0].peer;
    const r = peer.connect(host, { reliable: true, serialization: 'json', metadata: { seat: m.seat, k: 'r' } });
    match.hostConn = r;
    r.on('open', () => {
      if (!match || match.hostConn !== r) return;
      openFast(r, msg => onHostMsg(msg));
      r.send({ t: 'hi', seat: m.seat, name: CA.profile.name, equip: CA.profile.equip });
    });
    r.on('data', msg => onHostMsg(msg));
    r.on('close', () => { if (match && match.hostConn === r) hostGone(); });
    r.on('error', () => {});
  }
}

function connectFailed(why) {
  if (!match || match.live) return;
  const id = match.id;
  CA.server.call('ca_duo_fail', { p_token: CA.token, p_match: id }).catch(() => {});
  stopAll('failed');
  showLobby("Couldn't connect to everyone (" + why + '). Try again?');
}

// (host) One of the others connecting.
function onIncoming(c) {
  if (!match || !match.host) { try { c.close(); } catch (e) { /* ignore */ } return; }
  const seat = c.metadata && c.metadata.seat;
  const p = match.players[seat];
  if (!p || p.peer !== c.peer || seat === 0) { try { c.close(); } catch (e) { /* ignore */ } return; }
  c.on('open', () => {
    match.conns[seat] = { r: c, fast: null };
    openFast(c, msg => onGuestMsg(seat, msg), d => { if (match.conns[seat]) match.conns[seat].fast = d; });
  });
  c.on('data', msg => onGuestMsg(seat, msg));
  c.on('close', () => { if (match && match.conns[seat] && match.conns[seat].r === c) guestGone(seat); });
  c.on('error', () => {});
}

// The fast lane: an extra channel on the same connection that never resends a lost packet (both sides make it).
function openFast(c, onMsg, onReady) {
  let d = null;
  try { d = c.peerConnection.createDataChannel('fast', { negotiated: true, id: 7, ordered: false, maxRetransmits: 0 }); } catch (e) { return; }
  d.onmessage = e => { let msg; try { msg = JSON.parse(e.data); } catch (err) { return; } onMsg(msg); };
  if (match && !match.host) match.fast = d;
  if (onReady) onReady(d);
}
function sendFast(d, msg, fallback) {
  if (d && d.readyState === 'open') { try { d.send(JSON.stringify(msg)); return; } catch (e) { /* the slow lane, then */ } }
  if (fallback && fallback.open) fallback.send(msg);
}

// (host) What the others send.
function onGuestMsg(seat, msg) {
  if (!match || !msg || typeof msg !== 'object') return;
  if (msg.t === 'hi') {
    seats[seat].equip = msg.equip && typeof msg.equip === 'object' ? msg.equip : {};
    if (typeof msg.name === 'string') seats[seat].name = msg.name.slice(0, 24);
    seats[seat].ready = true;
    drawCams();
    if ([1, 2, 3].every(s => seats[s].ready || seats[s].bot)) beginMatch();
  } else if (msg.t === 'in' && run && run.input) run.input(seat, msg);
  else if (msg.t === 'rg' && run && run.deliver) run.deliver(msg.m, seat, msg.a);
}

// (guest) What the host sends.
function onHostMsg(msg) {
  if (!match || !msg || typeof msg !== 'object') return;
  if (msg.t === 'roster') {
    msg.seats.forEach((p, s) => { if (s !== match.seat) { seats[s].name = p.name; seats[s].equip = p.equip; seats[s].bot = !!p.bot; } });
    match.live = true;
    clearTimeout(match.timer);
    state = 'playing';
    drawCams();
    buildPlayScreen();
    if (!match.called) { match.called = true; callEveryone(); } // (everyone has the match by now, so they take the call)
  } else if (msg.t === 'game') startGame(msg.id, msg.seed, msg.score);
  else if (msg.t === 'rg') { if (run && run.deliver) run.deliver(msg.m, 0, msg.a); }
  else if (run && run.fromHost) run.fromHost(msg);
}

// (host) Everyone's here: off we go.
function beginMatch() {
  if (!match || match.live) return;
  match.live = true;
  clearTimeout(match.timer);
  state = 'playing';
  sendAll({ t: 'roster', seats: seats.map(p => ({ name: p.name, equip: p.equip, bot: !!p.bot })) });
  buildPlayScreen();
  nextGame();
  callEveryone();
}

function sendAll(msg) {
  if (!match || !match.host) return;
  for (const s in match.conns) { const c = match.conns[s].r; if (c && c.open) { try { c.send(msg); } catch (e) { /* ignore */ } } }
}
function sendAllFast(msg) {
  if (!match || !match.host) return;
  for (const s in match.conns) { const k = match.conns[s]; sendFast(k.fast, msg, k.r); }
}

// (host) Someone left: a bot takes their seat, so the game goes on.
function guestGone(seat) {
  if (!match) return;
  delete match.conns[seat];
  seats[seat].bot = true;
  seats[seat].stream = null;
  seats[seat].name = (seats[seat].name || 'Player') + ' (left)';
  if (!match.live) { connectFailed('someone left'); return; }
  CA.toast((seats[seat].name || 'A player') + ' left. A bot takes over.');
  sendAll({ t: 'roster', seats: seats.map(p => ({ name: p.name, equip: p.equip, bot: !!p.bot })) });
  drawCams();
}

function hostGone() {
  if (!match) return;
  const live = match.live;
  stopAll('host left');
  showLobby(live ? 'The host left, so the match is over.' : "Couldn't connect to everyone. Try again?");
}

/* ---------- cameras and microphones: everyone calls everyone ---------- */

const outCalls = {};
function callEveryone() {
  for (const s in outCalls) { try { outCalls[s].close(); } catch (e) { /* ignore */ } delete outCalls[s]; }
  if (!match || !peer || match.bots || !canShare()) return;
  const stream = CA.voice.outgoing();
  if (!stream) return;
  match.players.forEach(p => {
    if (p.seat === match.seat || p.bot || !p.peer) return;
    const call = peer.call(p.peer, stream, { metadata: { seat: match.seat } });
    if (!call) return;
    outCalls[p.seat] = call;
    if (CA.capVideo) CA.capVideo(call);
    call.on('error', () => {});
  });
}

const inCalls = {};
function onCall(call) {
  const seat = call.metadata && call.metadata.seat;
  if (!match || !canShare() || !match.players[seat] || match.players[seat].peer !== call.peer) { try { call.close(); } catch (e) { /* ignore */ } return; }
  if (inCalls[seat]) { try { inCalls[seat].close(); } catch (e) { /* ignore */ } }
  inCalls[seat] = call;
  call.on('stream', st => { if (inCalls[seat] !== call || !seats) return; seats[seat].stream = st; showStreams(); });
  call.on('close', () => { if (inCalls[seat] !== call || !seats) return; seats[seat].stream = null; showStreams(); });
  call.on('error', () => {});
  call.answer(); // (listen only: my own camera and microphone go out on my own calls)
}

// Your camera or microphone turned on or off: call everyone again with what you have now.
window.addEventListener('ca:media', () => {
  if (CA.route !== 'duos') return;
  showStreams();
  if (match && match.live && !match.bots) callEveryone();
});

/* ---------- playing with bots ---------- */

const BOT_NAMES = ['Mochi', 'Biscuit', 'Pickle', 'Noodle', 'Waffles', 'Pepper', 'Tofu', 'Nugget'];
const BOT_EQUIP = [null, { skin: 'skin-gray' }, { skin: 'skin-midnight' }, { skin: 'skin-cream' }];

function startBots() {
  stopAll('bots');
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const eqs = BOT_EQUIP;
  match = { id: 0, seat: 0, host: true, catsOnly: false, players: [0, 1, 2, 3].map(s => ({ seat: s })), conns: {}, live: true, bots: true };
  seats = [0, 1, 2, 3].map(s => (s === 0 ? { name: CA.profile.name, equip: CA.profile.equip, me: true } : { name: names[s], equip: eqs[s], bot: true }));
  state = 'playing';
  drawCams();
  buildPlayScreen();
  nextGame();
}

/* ---------- the match screen: the score, then one game after another ---------- */

let run = null, bag = [], score = [0, 0], gameNo = 0;

function buildPlayScreen() {
  score = [0, 0];
  gameNo = 0;
  bag = [];
  $('duoStage').innerHTML =
    '<div class="duo-play">' +
    '<canvas class="duo-canvas" id="duoCanvas" width="' + W + '" height="' + H + '"></canvas>' +
    '<div class="duo-over hidden" id="duoOver"></div>' +
    '</div>' +
    '<p class="duo-msg" id="duoMsg"></p>';
  drawBar();
}

function drawBar(name) {
  const me = match ? teamOf(match.seat) : 0;
  $('duoBar').innerHTML =
    '<span class="duo-score"><b class="t0">' + TEAM[0].name + (me === 0 ? ' (you)' : '') + ' ' + score[0] + '</b> : <b class="t1">' + score[1] + ' ' + TEAM[1].name + (me === 1 ? ' (you)' : '') + '</b></span>' +
    '<span class="duo-gname">' + esc(name || '') + ' <small id="duoNote"></small></span>' +
    '<button class="btn ghost duo-quit" id="duoQuit">Leave</button>';
  $('duoQuit').onclick = () => CA.confirmBox('Leave this Duos match?', match && !match.bots ? 'A bot takes your seat for your teammate.' : 'You can start another one any time.', 'Leave', () => { stopAll('quit'); showLobby(); });
}

// (host) Picks the next game: every game once, in a random order, before any comes back.
function nextGame() {
  if (!match || !match.host) return;
  if (!bag.length) bag = lineup().map(x => x.id).sort(() => Math.random() - 0.5);
  const id = (window.__duoGame && gameInfo(window.__duoGame)) ? window.__duoGame : bag.pop();
  const seed = Math.floor(Math.random() * 2 ** 31);
  sendAll({ t: 'game', id, seed, score });
  startGame(id, seed, score);
}

function startGame(id, seed, sc) {
  const info = gameInfo(id);
  if (!info || !match) return;
  if (sc) score = sc.slice();
  gameNo++;
  if (run) run.stop();
  $('duoOver').classList.add('hidden');
  drawBar(info.icon + ' ' + info.name);
  run = info.real ? makeRealRun(id, seed) : makeRun(GAMES[id], id, seed);
}

// The game is over: w is the team that won (or -1 for a draw).
function gameOver(w, why) {
  if (w === 0 || w === 1) score[w]++;
  drawBar(run ? run.def.icon + ' ' + run.def.name : '');
  const me = teamOf(match.seat), won = w === me;
  const box = $('duoOver');
  box.className = 'duo-over ' + (w < 0 ? 'draw' : won ? 'win' : 'lose');
  box.innerHTML = '<div class="duo-result"><h2>' + (w < 0 ? "It's a draw!" : won ? 'Your team wins!' : TEAM[w].name + ' team wins') + '</h2>' +
    (why ? '<p>' + esc(why) + '</p>' : '') +
    '<p class="duo-tally"><b class="t0">' + score[0] + '</b> : <b class="t1">' + score[1] + '</b></p>' +
    '<p class="duo-next">Next game in a moment…</p></div>';
  sound(w < 0 ? 'draw' : won ? 'win' : 'lose');
  if (won && CA.confetti) CA.confetti();
  if (match.host) setTimeout(() => { if (match && match.live && run && run.over) nextGame(); }, RESULT_MS);
}

function stopAll(why) {
  gen++;
  if (run) { run.stop(); run = null; }
  if (state === 'searching' && CA.token) CA.server.call('ca_duo_leave', { p_token: CA.token }).catch(() => {});
  if (match) {
    clearTimeout(match.timer);
    for (const s in match.conns) { try { match.conns[s].r.close(); } catch (e) { /* ignore */ } }
    if (match.hostConn) { try { match.hostConn.close(); } catch (e) { /* ignore */ } }
  }
  for (const s in outCalls) { try { outCalls[s].close(); } catch (e) { /* ignore */ } delete outCalls[s]; }
  for (const s in inCalls) { try { inCalls[s].close(); } catch (e) { /* ignore */ } delete inCalls[s]; }
  match = null;
  seats = null;
  if (peer) { const p = peer; peer = null; setTimeout(() => { try { p.destroy(); } catch (e) { /* ignore */ } }, 300); }
  state = 'idle';
}

/* ---------- the cat pictures ---------- */

// Each seat's cat, looking right or left, mouth closed or open, plus pics.face (with an expression): see drawBody.
function catPics(eq) {
  const pics = { 1: [null, null], '-1': [null, null], face: F().faceCache(eq || {}, {}, 200, 240) };
  [1, -1].forEach(look => [0, 1].forEach(open => {
    const svg = CA.catSVG(eq || {}, { bg: false, anim: false, mouth: open ? 'open' : 'closed', look: look * 6 }).replace('<svg ', '<svg width="200" height="240" ');
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 200; c.height = 240; c.getContext('2d').drawImage(img, 0, 0); pics[look][open] = c; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }));
  return pics;
}

/* ---------- running one of the real games ---------- */

// The real game runs on the arcade engine (games-duel.js), exactly as in 1 vs 1, with four players: this gives it what
// it would get from a 1 vs 1 match (see makeCtx in solos.js), only for four seats and over the Duos connections.
function makeRealRun(id, seed) {
  const g = CA.games.get(id), play = $('duoStage').querySelector('.duo-play');
  $('duoCanvas').classList.add('hidden');
  const stage = document.createElement('div');
  stage.className = 'duo-real';
  play.insertBefore(stage, $('duoOver'));
  // (a 1 vs 1 game left on the other screen keeps its parts; they mustn't be found instead of this game's)
  document.querySelectorAll('#dlCanvas, #dlMsg, #dlPad, #dlStick, #dlKnob').forEach(el => { if (!stage.contains(el)) el.removeAttribute('id'); });
  CA.camWalls.size(0, 0); // (no camera walls in the corners: the four cameras are above the game)
  const timers = new Set(), intervals = new Set(), listeners = [], handlers = [], enders = [];
  let alive = true, at = performance.now();
  const net = { last: 0, jitter: 8 };
  let a = (seed >>> 0) || 1;
  const rng = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = {
    def: { icon: g.icon, name: g.name }, over: false, real: true,
    // A message for the game, from seat `from`, `age` ms old when it was sent.
    deliver(msg, from, age) {
      if (!alive || !msg) return;
      const now = performance.now();
      if (msg.t === 's') { if (net.last) net.jitter = Math.max(net.jitter * 0.985, Math.abs(now - net.last - 33) * 0.8); net.last = now; }
      at = now - (Number.isFinite(age) ? clamp(age, 0, 200) : 0);
      handlers.forEach(h => h(msg, from));
    },
    stop() {
      if (!alive) return;
      alive = false;
      timers.forEach(clearTimeout); intervals.forEach(clearInterval);
      listeners.splice(0).forEach(([tg, ty, fn, o]) => tg.removeEventListener(ty, fn, o));
      enders.splice(0).forEach(fn => { try { fn(); } catch (e) { console.warn('Duos game cleanup failed:', e); } });
      stage.remove();
      const cv = $('duoCanvas');
      if (cv) cv.classList.remove('hidden');
      CA.camWalls.reset();
    },
  };
  const ctx = {
    stage, seed, rng, started: true, gameLog() {},
    players: 4, seat: match.seat, teamOf, names: seats.map(p => p.name || 'Player'), equips: seats.map(p => p.equip || {}),
    isBot: i => !!(seats && seats[i] && seats[i].bot),
    skill: 0.55,
    isHost: match.host,
    bot: match.bots ? { level: 5 } : null, // (all bots: nothing to send)
    oppName: '', oppEquip: null,
    alive: () => alive && !!match,
    send(msg) { if (match.host) sendAll({ t: 'rg', m: msg }); else if (match.hostConn && match.hostConn.open) { try { match.hostConn.send({ t: 'rg', m: msg }); } catch (e) { /* ignore */ } } },
    stream(msg, age) { const env = { t: 'rg', m: msg, a: age ? Math.round(age) : 0 }; if (match.host) sendAllFast(env); else sendFast(match.fast, env, match.hostConn); },
    netAt: () => at,
    viewDelay: sendMs => Math.min(320, sendMs * 1.6 + net.jitter * 1.6 + 12),
    netStarved(gap) { if (gap > 0) net.jitter = Math.max(net.jitter, Math.min(100, gap) / 1.5 + 2); },
    on(fn) { handlers.push(fn); },
    later(fn, ms) { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; },
    cancel(t) { clearTimeout(t); timers.delete(t); },
    every(fn, ms) { const t = setInterval(() => { if (alive) fn(); }, ms); intervals.add(t); return t; },
    stopEvery(t) { clearInterval(t); intervals.delete(t); },
    listen(tg, ty, fn, o) { tg.addEventListener(ty, fn, o); listeners.push([tg, ty, fn, o]); },
    onEnd(fn) { enders.push(fn); },
    record() {}, oppCheer() {}, afk() {}, theirCam: () => null,
    talking: () => false,
    score(mine, theirs) { const n = $('duoNote'); if (n) n.textContent = '· ' + (teamOf(match.seat) ? theirs + ' : ' + mine : mine + ' : ' + theirs); },
    note(text) { const m = $('duoMsg'); if (m) m.textContent = text || ''; },
    finish(outcome, o) {
      if (!alive || R.over) return;
      R.over = true;
      const me = teamOf(match.seat);
      gameOver(o && (o.w === 0 || o.w === 1 || o.w === -1) ? o.w : outcome === 'draw' ? -1 : outcome === 'win' ? me : 1 - me, '');
    },
  };
  try { g.start(ctx); } catch (e) { console.error('Duos: the game failed to start:', e); }
  if (window.__testHooks) {
    window.__duo = { R, id, seats, phase: () => (window.__duel ? window.__duel.phase() : 'ready'), snap: () => (window.__duel && window.__duel.snapNow ? window.__duel.snapNow() : null), api: window.__duel && window.__duel.api };
  }
  return R;
}

/* ---------- running one game ---------- */

// The controls: WASD or the arrows move, Space is 'a', the mouse aims (ax, ay) and its button is 'fire'. A game can
// add keys of its own (def.keys: { KeyE: 'e' }). Presses are counted, so one that happens between two steps (or a
// lost packet) still counts once.
const BASE_KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'a' };

function makeRun(def, id, seed) {
  const cv = $('duoCanvas'), g = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR;
  const host = match.host, me = match.seat;
  let rngState = seed >>> 0;
  const rng = () => { rngState = (rngState + 0x6D2B79F5) >>> 0; let t = rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const keys = Object.assign({}, BASE_KEYS, def.keys || {});
  const mine = { held: {}, hits: {}, ax: W / 2, ay: H / 2 };
  const inputs = [0, 1, 2, 3].map(() => ({ held: {}, hits: {}, seen: {}, ax: W / 2, ay: H / 2 }));
  const looks = seats.map(p => ({ pics: catPics(p.equip), fur: F().fur(p.equip) }));
  const party = F().party(W, H);
  const paint = F().painter(g, W);
  const moods = [0, 1, 2, 3].map(() => ({ f: null, until: 0 }));
  const fx = [];
  let phase = 'count', countT = 3, s = null, snapNow = null, acc = 0, last = performance.now(), raf = 0, steps = 0, stopped = false;
  let shake = 0, overW = null, overWhy = '';
  const buf = []; // (guests: the host's snapshots, with when they arrived)
  const R = {
    def, over: false,
    stop() { stopped = true; cancelAnimationFrame(raf); clearInterval(sendTimer); removeEventListener('keydown', kd); removeEventListener('keyup', ku); cv.removeEventListener('pointermove', pm); cv.removeEventListener('pointerdown', pd); removeEventListener('pointerup', pu); },
    input(seat, msg) { // (host) a guest's controls
      const n = inputs[seat];
      if (!n || !msg) return;
      if (msg.held && typeof msg.held === 'object') n.held = msg.held;
      if (msg.hits && typeof msg.hits === 'object') n.hits = msg.hits;
      if (Number.isFinite(msg.ax)) n.ax = clamp(msg.ax, 0, W);
      if (Number.isFinite(msg.ay)) n.ay = clamp(msg.ay, 0, H);
    },
    fromHost(msg) { // (guest)
      if (msg.t === 's' && msg.d) {
        buf.push({ at: performance.now(), d: msg.d, ph: msg.ph, c: msg.c });
        if (buf.length > 12) buf.shift();
        phase = msg.ph; countT = msg.c;
      } else if (msg.t === 'e' && msg.e) runEvent(msg.e);
      else if (msg.t === 'end') finish(msg.w, msg.why);
    },
  };

  const api = {
    rng, W, H, teamOf, mateOf, skill: 0.6,
    ev(type, data) { const e = Object.assign({ type }, data); runEvent(e); if (host) sendAll({ t: 'e', e }); },
    over(w, why) { if (overW == null) { overW = w; overWhy = why || ''; } },
  };
  s = def.init(api);

  // ----- your controls
  function kd(e) {
    const k = keys[e.code];
    if (!k || e.target.closest && e.target.closest('input, textarea')) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!mine.held[k]) mine.hits[k] = (mine.hits[k] || 0) + 1;
    mine.held[k] = true;
    sendMine();
  }
  function ku(e) { const k = keys[e.code]; if (k && mine.held[k]) { mine.held[k] = false; sendMine(); } }
  function aimAt(e) { const r = cv.getBoundingClientRect(); mine.ax = clamp((e.clientX - r.left) / r.width * W, 0, W); mine.ay = clamp((e.clientY - r.top) / r.height * H, 0, H); }
  function pm(e) { aimAt(e); }
  function pd(e) { aimAt(e); if (!mine.held.fire) mine.hits.fire = (mine.hits.fire || 0) + 1; mine.held.fire = true; sendMine(); }
  function pu() { if (mine.held.fire) { mine.held.fire = false; sendMine(); } }
  addEventListener('keydown', kd);
  addEventListener('keyup', ku);
  cv.addEventListener('pointermove', pm);
  cv.addEventListener('pointerdown', pd);
  addEventListener('pointerup', pu);
  let lastSent = 0;
  function sendMine() {
    if (host) { R.input(me, mine); return; }
    lastSent = performance.now();
    sendFast(match.fast, { t: 'in', held: mine.held, hits: mine.hits, ax: Math.round(mine.ax), ay: Math.round(mine.ay) }, match.hostConn);
  }
  // (the guests send their controls now and then anyway, and the mouse as it moves; the host sends the game)
  const sendTimer = setInterval(() => { if (!host && performance.now() - lastSent > 45) sendMine(); }, 50);
  if (host) R.input(me, mine);

  // This step's controls for each seat: what's held, what was pressed since the last step, and the aim.
  function stepInput(seat) {
    const n = inputs[seat], hit = {};
    for (const k in n.hits) { const c = n.hits[k] | 0; if (c > (n.seen[k] | 0)) hit[k] = true; n.seen[k] = c; }
    return { held: n.held, hit, ax: n.ax, ay: n.ay };
  }

  // ----- the host's loop
  function hostStep() {
    if (phase === 'count') {
      countT -= DT;
      if (countT <= 0) { phase = 'play'; sound('go'); }
    } else if (phase === 'play') {
      const ins = [0, 1, 2, 3].map(seat => (seats[seat] && seats[seat].bot ? def.bot(s, seat, DT, api) : stepInput(seat)));
      def.step(s, ins, DT, api);
      if (overW != null) {
        phase = 'over';
        sendAll({ t: 'end', w: overW, why: overWhy });
        finish(overW, overWhy);
      }
    }
    steps++;
    if (steps % SEND_EVERY === 0 && !match.bots) sendAllFast({ t: 's', d: def.snap(s), ph: phase, c: Math.round(countT * 10) / 10 });
  }

  function finish(w, why) {
    if (R.over) return;
    R.over = true;
    phase = 'over';
    const me2 = teamOf(me);
    [0, 1, 2, 3].forEach(seat => { moods[seat].f = w < 0 ? 'shock' : teamOf(seat) === w ? 'happy' : 'ko'; moods[seat].until = Infinity; });
    party.end(w < 0 ? 0 : w === me2 ? 1 : -1);
    setTimeout(() => gameOver(w, why), 1100);
  }

  // ----- what the others see: the host's snapshots, a moment behind, smoothed between two
  function guestSnap() {
    if (!buf.length) return null;
    const t = performance.now() - VIEW_DELAY;
    let a = buf[0], b = null;
    for (let k = 0; k < buf.length; k++) { if (buf[k].at <= t) a = buf[k]; else { b = buf[k]; break; } }
    if (!b || b === a) return a.d;
    const f = clamp((t - a.at) / Math.max(1, b.at - a.at), 0, 1);
    return lerpSnap(a.d, b.d, f);
  }
  function lerpSnap(a, b, f) {
    if (!a.c || !b.c || a.c.length !== b.c.length) return b;
    const out = Object.assign({}, b);
    out.c = b.c.map((cb, k) => { const ca = a.c[k]; if (!ca || Math.abs(cb.x - ca.x) > 120 || Math.abs(cb.y - ca.y) > 120) return cb; return Object.assign({}, cb, { x: ca.x + (cb.x - ca.x) * f, y: ca.y + (cb.y - ca.y) * f }); });
    if (a.k && b.k && def.lerpBall) out.k = def.lerpBall(a.k, b.k, f);
    return out;
  }

  // ----- drawing
  const view = {
    g, W, H, me, team: TEAM, teamOf, mateOf, names: seats.map(p => p.name), paint, now: 0,
    dot: paint.dot, label: paint.label, roundRect: paint.roundRect, bigText: paint.bigText,
    mood(seat, f, secs) { if (moods[seat] && moods[seat].until !== Infinity) { moods[seat].f = f; moods[seat].until = performance.now() + secs * 1000; } },
    faceOf(seat, face) { return face || (moods[seat] && performance.now() < moods[seat].until ? moods[seat].f : null); },
    // A cat seen from above, centered on (x, y), with a ring in its team's color (and a dot for you).
    catTop(seat, x, y, size, o) {
      o = o || {};
      const k = size || 1, col = TEAM[teamOf(seat)];
      g.globalAlpha = 0.28 * (o.alpha == null ? 1 : o.alpha);
      g.fillStyle = col.main; paint.dot(x, y, 18 * k);
      g.globalAlpha = o.alpha == null ? 1 : o.alpha;
      g.strokeStyle = seat === me ? '#ffffff' : col.main; g.lineWidth = seat === me ? 3 : 2.5;
      g.beginPath(); g.arc(x, y, 18 * k, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
      g.save(); g.translate(x, y + 17 * k); g.scale(0.48 * k, 0.48 * k);
      F().drawBody(g, looks[seat], 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, alpha: o.alpha == null ? 1 : o.alpha, face: view.faceOf(seat, o.face), top: true, bob: o.bob });
      g.restore();
      if (o.label !== false) paint.label(seat === me ? 'You' : view.names[seat], x, y + 31 * k + 2, 12, seat === me ? '#ffd23f' : col.light);
    },
    // A cat seen from the side, standing with its feet at (x, y), with a mark in its team's color under it and its name above.
    catSide(seat, x, y, size, o) {
      o = o || {};
      const k = size || 1, col = TEAM[teamOf(seat)];
      g.globalAlpha = 0.45 * (o.alpha == null ? 1 : o.alpha); g.fillStyle = col.main;
      g.beginPath(); g.ellipse(x, y + 2, 30 * k, 7 * k, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.save(); g.translate(x, y); g.scale(k, k);
      F().drawBody(g, looks[seat], 0, 0, { tilt: o.tilt || 0, lookRight: o.lookRight !== false, alpha: o.alpha == null ? 1 : o.alpha, squash: o.squash || 0, face: view.faceOf(seat, o.face), bob: o.bob });
      g.restore();
      if (o.label !== false) paint.label(seat === me ? 'You' : view.names[seat], x, y - 104 * k, 12, seat === me ? '#ffd23f' : col.light);
    },
    pop(x, y, text, color) { fx.push({ k: 'pop', x, y, text, c: color || '#ffffff', life: 1, max: 1 }); },
    burst(x, y, color, n, speed) { for (let q = 0; q < (n || 10); q++) { const a = Math.random() * Math.PI * 2, sp = (speed || 200) * (0.4 + Math.random() * 0.6); fx.push({ k: 'bit', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c: color, life: 0.5, max: 0.5 }); } },
    ring(x, y, color, r) { fx.push({ k: 'ring', x, y, c: color, r: r || 20, life: 0.4, max: 0.4 }); },
    shake(n) { shake = Math.max(shake, n); },
    fur: seat => looks[seat].fur,
    sound, party,
  };

  function runEvent(e) {
    if (def.event) def.event(view, e);
  }

  function drawFx(dt) {
    for (let k = fx.length - 1; k >= 0; k--) {
      const p = fx[k];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(k, 1); continue; }
      const a = p.life / p.max;
      if (p.k === 'bit') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; g.globalAlpha = a; g.fillStyle = p.c; paint.dot(p.x, p.y, 3.5); }
      else if (p.k === 'ring') { g.globalAlpha = a; g.strokeStyle = p.c; g.lineWidth = 4; g.beginPath(); g.arc(p.x, p.y, p.r + (1 - a) * 40, 0, Math.PI * 2); g.stroke(); }
      else if (p.k === 'pop') { g.globalAlpha = Math.min(1, a * 2); paint.label(p.text, p.x, p.y - (1 - a) * 30, 18, p.c); }
      g.globalAlpha = 1;
    }
  }

  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    view.now = now;
    if (host) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n++ < 8) { acc -= DT; hostStep(); }
      snapNow = def.snap(s);
    } else snapNow = guestSnap();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    if (shake > 0.2) { g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.pow(0.02, dt); }
    if (snapNow) def.draw(view, snapNow, phase);
    drawFx(dt);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (phase === 'count') {
      const c = Math.ceil(countT);
      paint.bigText(c > 0 ? String(c) : 'GO!', H / 2, 120, '#ffffff', 1);
      paint.label(def.how, W / 2, H / 2 + 80, 18, '#ffffff');
    }
    party.draw(g, dt);
    const m = $('duoMsg');
    if (m) m.textContent = phase === 'count' ? 'You are on the ' + TEAM[teamOf(me)].name + ' team, with ' + (seats[mateOf(me)].bot ? 'a bot' : seats[mateOf(me)].name) + '. ' + def.how : def.how;
  }
  raf = requestAnimationFrame(frame);
  if (window.__testHooks) window.__duo = { R, state: () => s, phase: () => phase, snap: () => snapNow, seats, api, def, id };
  return R;
}

/* ---------- the screen's route ---------- */

CA.register('duos', {
  enter,
  leave: leaveScreen,
  canLeave(go) {
    if (state !== 'playing' || !match || match.bots) return true;
    CA.confirmBox('Leave this Duos match?', 'A bot takes your seat for your teammate.', 'Leave', () => { stopAll('quit'); go(); });
    return false;
  },
});

addEventListener('beforeunload', () => { if (state === 'searching' && CA.token) CA.server.call('ca_duo_leave', { p_token: CA.token }, { keepalive: true }).catch(() => {}); });

// (For the tests: four browsers in one match without the server, each with a PeerJS id made from tag and seat.)
async function testMatch(seat, tag, bots) {
  if (!window.__testHooks) return;
  stopAll('test');
  const myGen = ++gen;
  const opts = await peerOpts();
  peer = await new Promise((resolve, reject) => { const p = new Peer(PEER_PREFIX + tag + seat, opts); p.on('open', () => resolve(p)); p.on('error', reject); });
  peer.on('connection', c => onIncoming(c));
  peer.on('call', call => onCall(call));
  if (seat) await sleep(2500); // (the host first)
  startMatch({ id: 0, seat, cats_only: true, players: [0, 1, 2, 3].map(s => ((bots || []).includes(s) ? { seat: s, bot: true } : { seat: s, id: s, name: 'Player ' + (s + 1), peer: PEER_PREFIX + tag + s })) }, myGen);
}

CA.duos = { add, GAMES, ORDER, TEAM, teamOf, mateOf, W, H, clamp, testMatch, get state() { return state; } };
})();
