/* Chess: rules (chess.js), the board, talking cats (or your face, if you choose), 1v1 with a friend over
   WebRTC (PeerJS), pass & play on one computer, and practice against the computer. */
(() => {
'use strict';

const root = document.getElementById('scr-chess');
const $ = id => root.querySelector('#' + id);

if (typeof window.Chess !== 'function' || typeof window.Peer !== 'function') {
  root.innerHTML = '<div class="fatal"><h2>Chess could not load</h2><p>Some game files are missing. Keep the <b>lib</b> folder next to index.html, then refresh the page.</p></div>';
  CA.register('chess', { enter() { CA.showScreen('scr-chess'); } });
  return;
}

const FILES = 'abcdefgh';
const PEER_PREFIX = 'camarcade-chess-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'];
const START_COUNT = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1 };
const PEER_OPTS = { debug: 1 };
const JOIN_TIMEOUT = 25000;
const COMPUTER_CAT = { skin: 'skin-gray', bg: 'bg-neon', eyes: 'eyes-visor', shirt: 'shirt-astro' };
const REASONS = {
  checkmate: 'by checkmate',
  resign: 'by resignation',
  agreement: 'by agreement',
  stalemate: 'by stalemate',
  repetition: 'by threefold repetition',
  material: 'because neither side can checkmate',
  fifty: 'by the 50-move rule',
};

// Survives a page refresh (so the host lets you back in) but is different for every tab.
const PLAYER_ID = (() => {
  try {
    let id = sessionStorage.getItem('wc-pid');
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('wc-pid', id); }
    return id;
  } catch (e) { return Math.random().toString(36).slice(2, 10); }
})();
const CONN_OPTS = { reliable: true, serialization: 'json', metadata: { pid: PLAYER_ID } };

const game = new Chess();
let mode = null;            // null = lobby, 'online', 'local', 'bot'
let myColor = 'w';
let flipped = false;
let selected = null;
let targets = [];
let lastMove = null;
let result = null;          // { winner: 'w' | 'b' | null, reason }
let botLevel = 'medium';
let thinking = false;

let peer = null;
let conn = null;
let outCall = null;         // carries my voice (and face, if on) to the opponent
let inCall = null;          // carries theirs to me
let isHost = false;
let roomCode = null;
let oppPid = null;
let oppName = 'Opponent';
let oppEquip = {};
let oppMedia = { mic: false, face: false };
let remoteHasVideo = false;
let oppOnline = false;
let oppLeft = false;
let leaving = false;
let reconnectTries = 0;
let lastSeen = 0;
let pingTimer = null;
let joinTimer = null;
let talkOff = null;
let lastCallSig = '';       // which of mic ('a') / camera ('v') the call to the opponent carries
let lastTalk = -1;
let lastTalkAt = 0;
let oppTalkTimer = null;
let drawOffered = false;
let rematchOffered = false;
let incomingRematch = false;
let modalState = null;

function myName() { return CA.profile ? CA.profile.name : 'Player'; }
function sound(kind) { CA.sound(kind); }
function toast(text) { CA.toast(text); }

/* ================= BOARD ================= */

const boardEl = $('board');
const squares = [];
for (let i = 0; i < 64; i++) {
  const el = document.createElement('div');
  el.className = 'sq';
  boardEl.appendChild(el);
  squares.push(el);
}

function indexToSquare(i) {
  const r = i >> 3, c = i & 7;
  return FILES[flipped ? 7 - c : c] + (flipped ? r + 1 : 8 - r);
}

function squareEl(sq) {
  return boardEl.querySelector('.sq[data-sq="' + sq + '"]');
}

function squareFromPoint(x, y) {
  const rect = boardEl.getBoundingClientRect();
  const c = Math.floor((x - rect.left) / (rect.width / 8));
  const r = Math.floor((y - rect.top) / (rect.height / 8));
  if (c < 0 || c > 7 || r < 0 || r > 7) return null;
  return indexToSquare(r * 8 + c);
}

function renderBoard() {
  const b = game.board();
  const checkSq = !result || result.reason === 'checkmate' ? (game.in_check() ? findKing(game.turn()) : null) : null;
  const moveTargets = new Set(targets.map(m => m.to));
  const interactive = canMove();
  boardEl.classList.toggle('can-move', interactive);
  for (let i = 0; i < 64; i++) {
    const sq = indexToSquare(i);
    const file = FILES.indexOf(sq[0]);
    const rank = +sq[1];
    const p = b[8 - rank][file];
    const el = squares[i];
    el.dataset.sq = sq;
    let cls = 'sq ' + ((file + rank) % 2 ? 'dark' : 'light');
    if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls += ' last';
    if (sq === selected) cls += ' sel';
    if (sq === checkSq) cls += ' check';
    if (moveTargets.has(sq)) cls += p ? ' capture' : ' target';
    if (interactive && p && p.color === game.turn()) cls += ' movable';
    el.className = cls;
    let html = p ? '<div class="piece ' + p.color + p.type.toUpperCase() + '"></div>' : '';
    if ((i & 7) === 0) html += '<span class="coord rank">' + rank + '</span>';
    if (i >> 3 === 7) html += '<span class="coord file">' + sq[0] + '</span>';
    el.innerHTML = html;
  }
}

function animateMove(mv) {
  const pairs = [[mv.from, mv.to]];
  const home = mv.color === 'w' ? '1' : '8';
  if (mv.flags.includes('k')) pairs.push(['h' + home, 'f' + home]);
  if (mv.flags.includes('q')) pairs.push(['a' + home, 'd' + home]);
  for (const [from, to] of pairs) {
    const fromEl = squareEl(from);
    const toEl = squareEl(to);
    const piece = toEl && toEl.querySelector('.piece');
    if (!fromEl || !piece) continue;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    piece.style.transition = 'none';
    piece.style.transform = 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px)';
    piece.style.zIndex = '5';
    piece.getBoundingClientRect(); // commit the start position before animating
    piece.style.transition = 'transform 180ms ease-out';
    piece.style.transform = '';
    piece.addEventListener('transitionend', () => { piece.style.zIndex = ''; piece.style.transition = ''; }, { once: true });
  }
}

/* ---- mouse / touch: click-to-move and drag-and-drop ---- */

let drag = null;
let lastHint = 0;

boardEl.addEventListener('pointerdown', e => {
  if (e.button !== 0 || drag) return;
  const sq = squareFromPoint(e.clientX, e.clientY);
  if (!sq) return;
  e.preventDefault();
  if (!canMove()) { explainCantMove(); return; }
  if (selected && targets.some(m => m.to === sq)) { tryMove(selected, sq, true); return; }
  const p = game.get(sq);
  if (!p || p.color !== game.turn()) {
    if (selected) { selected = null; targets = []; renderBoard(); }
    return;
  }
  const wasSelected = selected === sq;
  selected = sq;
  targets = game.moves({ square: sq, verbose: true });
  renderBoard();
  drag = {
    from: sq, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, wasSelected,
    pieceEl: squareEl(sq).querySelector('.piece'), ghost: null, over: null, size: 0,
  };
  try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
});

boardEl.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5 || !drag.pieceEl) return;
    drag.moved = true;
    drag.size = boardEl.getBoundingClientRect().width / 8;
    const g = document.createElement('div');
    g.className = drag.pieceEl.className + ' ghost';
    g.style.width = g.style.height = drag.size + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    drag.pieceEl.classList.add('lifted');
  }
  drag.ghost.style.transform =
    'translate(' + (e.clientX - drag.size / 2) + 'px,' + (e.clientY - drag.size / 2) + 'px) scale(1.12)';
  const over = squareFromPoint(e.clientX, e.clientY);
  if (over !== drag.over) {
    if (drag.over) { const o = squareEl(drag.over); if (o) o.classList.remove('hover'); }
    drag.over = over;
    if (over && targets.some(m => m.to === over)) squareEl(over).classList.add('hover');
  }
});

boardEl.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = endDrag();
  if (!d.moved) {
    if (d.wasSelected) { selected = null; targets = []; renderBoard(); }
    return;
  }
  const to = squareFromPoint(e.clientX, e.clientY);
  if (to && to !== d.from && targets.some(m => m.to === to)) tryMove(d.from, to, false);
  else renderBoard();
});

boardEl.addEventListener('pointercancel', () => { if (drag) { endDrag(); renderBoard(); } });
boardEl.addEventListener('contextmenu', e => e.preventDefault());

function endDrag() {
  const d = drag;
  drag = null;
  if (d.ghost) d.ghost.remove();
  if (d.pieceEl) d.pieceEl.classList.remove('lifted');
  if (d.over) { const o = squareEl(d.over); if (o) o.classList.remove('hover'); }
  return d;
}

function explainCantMove() {
  if (!mode || Date.now() - lastHint < 1500) return;
  lastHint = Date.now();
  if (result) toast('The game is over. Press ' + (mode === 'online' ? 'Rematch' : 'New game') + ' to play again.');
  else if (mode === 'online' && !(conn && conn.open)) toast('Your opponent is not connected.');
  else if (mode === 'bot' && thinking) toast('The computer is thinking…');
  else if (game.turn() !== myColor && mode !== 'local') toast("It's " + oppName + "'s turn.");
}

/* ================= GAME FLOW ================= */

function canMove() {
  if (!mode || result) return false;
  if (mode === 'local') return true;
  if (mode === 'bot') return !thinking && game.turn() === myColor;
  return !!(conn && conn.open) && game.turn() === myColor;
}

function tryMove(from, to, animate) {
  if (!canMove()) { selected = null; targets = []; renderBoard(); return; }
  const options = targets.filter(m => m.from === from && m.to === to);
  if (!options.length) return;
  if (options.some(m => m.promotion)) { askPromotion(from, to, animate); return; }
  applyMove({ from, to }, { animate });
}

function applyMove(m, opts) {
  const remote = !!(opts && opts.remote);
  const res = game.move(m);
  if (!res) return null;
  lastMove = { from: res.from, to: res.to };
  selected = null;
  targets = [];
  if (remote) drawOffered = false;             // they moved instead of accepting my draw offer
  else hideOffer('draw');                       // I moved instead of accepting theirs
  if (mode === 'online' && !remote) {
    const msg = { t: 'move', from: res.from, to: res.to, ply: game.history().length - 1 };
    if (res.promotion) msg.promotion = res.promotion;
    send(msg);
  }
  render();
  if (!opts || opts.animate !== false) animateMove(res);
  const castle = res.flags.includes('k') || res.flags.includes('q');
  sound(game.in_check() ? 'check' : res.captured ? 'capture' : castle ? 'castle' : 'move');
  checkGameEnd();
  if (mode === 'bot' && !result && game.turn() !== myColor) computerTurn();
  return res;
}

function checkGameEnd() {
  let r = null;
  if (game.in_checkmate()) r = { winner: other(game.turn()), reason: 'checkmate' };
  else if (game.in_stalemate()) r = { winner: null, reason: 'stalemate' };
  else if (game.in_threefold_repetition()) r = { winner: null, reason: 'repetition' };
  else if (game.insufficient_material()) r = { winner: null, reason: 'material' };
  else if (game.in_draw()) r = { winner: null, reason: 'fifty' };
  if (r) finishGame(r);
}

function finishGame(r) {
  if (result) return;
  result = r;
  selected = null;
  targets = [];
  drawOffered = false;
  hideOffer('draw');
  render();
  const lost = (mode === 'online' || mode === 'bot') && r.winner && r.winner !== myColor;
  sound(!r.winner ? 'draw' : lost ? 'lose' : 'win');
  setTimeout(() => { if (result === r && !modalState) showResult(); }, 450);
}

function describeResult(r) {
  if (!r.winner) return { icon: '🤝', title: 'Draw', text: 'The game is a draw ' + REASONS[r.reason] + '.' };
  if (mode === 'online' || mode === 'bot') {
    return r.winner === myColor
      ? { icon: '🏆', title: 'You win!', text: 'You beat ' + oppName + ' ' + REASONS[r.reason] + '.' }
      : { icon: '😿', title: 'You lost', text: oppName + ' won ' + REASONS[r.reason] + '.' };
  }
  return { icon: '🏆', title: colorName(r.winner) + ' wins!', text: colorName(r.winner) + ' won ' + REASONS[r.reason] + '.' };
}

function showResult() {
  if (!result) return;
  const d = describeResult(result);
  const buttons = mode === 'online'
    ? [{ label: '↻ Rematch', primary: true, fn: requestRematch }, { label: 'View board' }, { label: 'Leave', fn: goToLobby }]
    : [{ label: '↻ New game', primary: true, fn: requestRematch }, { label: 'View board' }, { label: 'Menu', fn: () => CA.go('menu') }];
  openModal({ icon: d.icon, title: d.title, text: d.text, buttons, dismissable: true, kind: 'result' });
}

function enterGame(m) {
  mode = m;
  root.classList.add('in-game');
  root.classList.toggle('local-mode', m === 'local');
  $('lobby').classList.add('hidden');
  $('gameView').classList.remove('hidden');
  flipped = (m === 'online' || m === 'bot') && myColor === 'b';
  selected = null;
  targets = [];
  closeModal();
  hideBanner();
  renderCats();
  render();
  CA.voice.setInGame(true); // your camera turns on for every game (if you allowed it)
}

function startLocalGame() {
  cleanupNet();
  isHost = false;
  game.reset();
  lastMove = null;
  result = null;
  enterGame('local');
  sound('start');
}

function startBotGame(color) {
  cleanupNet();
  isHost = false;
  myColor = color;
  oppName = 'Computer';
  oppEquip = COMPUTER_CAT;
  game.reset();
  lastMove = null;
  result = null;
  thinking = false;
  enterGame('bot');
  $('oppDot').className = 'dot on';
  sound('start');
  toast('You play ' + colorName(myColor) + ' against the computer (' + botLevel + ').');
  if (game.turn() !== myColor) computerTurn();
}

function startOnlineGame(color, firstGame) {
  myColor = color;
  game.reset();
  lastMove = null;
  result = null;
  drawOffered = rematchOffered = incomingRematch = false;
  hideOffer();
  enterGame('online');
  sendState();
  sound('start');
  toast((firstGame ? 'Your friend joined! ' : 'New game! ') + 'You play ' + colorName(myColor) + '.');
}

function loadMoves(list) {
  game.reset();
  for (const san of list) if (!game.move(san)) break;
  const h = game.history({ verbose: true });
  lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  selected = null;
  targets = [];
}

function undoMove() {
  if (!game.history().length || thinking) return;
  if (mode === 'local') game.undo();
  else if (mode === 'bot') {
    game.undo();
    if (game.turn() !== myColor && game.history().length) game.undo(); // take back the computer's reply too
  } else return;
  result = null;
  closeModal();
  const h = game.history({ verbose: true });
  lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
  selected = null;
  targets = [];
  render();
  if (mode === 'bot' && game.turn() !== myColor) computerTurn();
}

function offerDraw() {
  if (result || !mode || mode === 'bot') return;
  if (mode === 'local') {
    confirmModal('Agree to a draw?', 'The game ends and nobody wins.', 'Yes, draw', () => finishGame({ winner: null, reason: 'agreement' }));
    return;
  }
  if (drawOffered || !(conn && conn.open)) return;
  drawOffered = true;
  send({ t: 'draw-offer' });
  toast('Draw offer sent.');
  updateControls();
}

function resign() {
  if (result || !mode) return;
  const loser = mode === 'local' ? game.turn() : myColor;
  const text = mode === 'local'
    ? colorName(loser) + ' gives up and ' + colorName(other(loser)) + ' wins.'
    : oppName + ' will win the game.';
  confirmModal('Resign?', text, 'Resign', () => {
    if (mode === 'online') send({ t: 'resign' });
    finishGame({ winner: other(loser), reason: 'resign' });
  });
}

function requestRematch() {
  if (mode === 'local') { startLocalGame(); return; }
  if (mode === 'bot') { startBotGame(other(myColor)); return; }
  if (!(conn && conn.open)) { toast('Your opponent is not connected.'); return; }
  if (incomingRematch) { acceptRematch(); return; }
  if (rematchOffered) return;
  rematchOffered = true;
  send({ t: 'rematch-offer' });
  toast('Rematch offer sent. Waiting for ' + oppName + '…');
  updateControls();
}

function acceptRematch() {
  incomingRematch = false;
  hideOffer();
  if (isHost) beginRematch();
  else send({ t: 'rematch-accept' });
}

function beginRematch() {
  rematchOffered = incomingRematch = false;
  startOnlineGame(other(myColor)); // colors swap every game
}

function leaveGame() {
  if (mode === 'bot') { CA.go('menu'); return; }
  if (mode === 'online' && !result && conn && conn.open) {
    confirmModal('Leave the game?', 'Your opponent will be left alone on the board.', 'Leave', goToLobby);
  } else {
    goToLobby();
  }
}

function goToLobby() {
  leaving = true;
  hangUp();
  cleanupNet();
  leaving = false;
  resetView();
  showPanel('menu');
  menuMsg('');
  renderLobby();
}

function resetView() {
  mode = null;
  result = null;
  selected = null;
  targets = [];
  thinking = false;
  closeModal();
  hideOffer();
  hideBanner();
  root.classList.remove('in-game', 'local-mode');
  $('gameView').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('inviteBox').classList.add('hidden');
  CA.voice.setInGame(false); // camera off in the lobby
}

/* ================= THE COMPUTER ================= */

const PV = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Piece-square tables (from White's side, a8 first): simple "put pieces on good squares" hints.
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

function evaluate(g) { // positive = good for White
  let s = 0;
  const b = g.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = b[r][f];
      if (!p) continue;
      const v = PV[p.type] + PST[p.type][p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f];
      s += p.color === 'w' ? v : -v;
    }
  }
  return s;
}

function orderMoves(moves) {
  return moves.sort((a, b) => (b.captured ? PV[b.captured] * 10 - PV[b.piece] : 0) - (a.captured ? PV[a.captured] * 10 - PV[a.piece] : 0));
}

function negamax(g, depth, alpha, beta, sign) {
  if (depth === 0) return sign * evaluate(g);
  const moves = g.moves({ verbose: true });
  if (!moves.length) return g.in_check() ? -100000 - depth : 0;
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    g.move(m);
    const s = -negamax(g, depth - 1, -beta, -alpha, -sign);
    g.undo();
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

function computerMove() { return pickMove(game.fen(), botLevel); }

// Also used by Speed Chess in Classic Games (through CA.chessAI).
function pickMove(fen, level) {
  const g = new Chess(fen);
  const moves = g.moves({ verbose: true });
  if (!moves.length) return null;
  if (level === 'easy' && Math.random() < 0.35) return moves[Math.floor(Math.random() * moves.length)];
  const depth = { easy: 1, medium: 2, hard: 3 }[level] || 2;
  const sign = g.turn() === 'w' ? 1 : -1;
  let best = -Infinity;
  let pick = moves[0];
  for (const m of orderMoves(moves)) {
    g.move(m);
    const s = -negamax(g, depth - 1, -Infinity, Infinity, -sign) + Math.random() * 12; // a little variety
    g.undo();
    if (s > best) { best = s; pick = m; }
  }
  return pick;
}
CA.chessAI = { pickMove };

function computerTurn() {
  thinking = true;
  render();
  setTimeout(() => {
    if (mode !== 'bot' || result || game.turn() === myColor) { thinking = false; render(); return; }
    const m = computerMove();
    thinking = false;
    applyMove({ from: m.from, to: m.to, promotion: m.promotion }, { remote: true });
    if (m.captured) catTalk(700);
  }, 450);
}

/* ================= RENDERING ================= */

function render() {
  renderBoard();
  renderBars();
  renderStatus();
  renderMoves();
  updateControls();
}

function renderBars() {
  const bottom = flipped ? 'b' : 'w';
  fillBar($('bottomBar'), bottom);
  fillBar($('topBar'), other(bottom));
}

function playerName(color) {
  if (mode === 'online' || mode === 'bot') return color === myColor ? myName() + ' (you)' : oppName;
  return colorName(color);
}

function fillBar(el, color) {
  const taken = capturedBy(color);
  const diff = material(color) - material(other(color));
  const toMove = !!mode && !result && game.turn() === color;
  const tag = (mode === 'online' || mode === 'bot') && color === myColor ? 'Your turn' : 'To move';
  el.className = 'pbar' + (toMove ? ' turn' : '');
  el.innerHTML =
    '<span class="avatar ' + color + '"></span>' +
    '<span class="pname">' + esc(playerName(color)) + '</span>' +
    '<span class="captured">' + taken.map(t => '<span class="piece ' + other(color) + t.toUpperCase() + '"></span>').join('') + '</span>' +
    (diff > 0 ? '<span class="adv">+' + diff + '</span>' : '') +
    (toMove ? '<span class="turn-tag">' + tag + '</span>' : '');
}

function renderStatus() {
  if (!mode) return;
  const box = $('statusBox');
  let text;
  let cls = 'status';
  if (result) {
    const d = describeResult(result);
    text = d.icon + ' ' + d.title;
    cls += ' over';
  } else if (mode === 'online' && !(conn && conn.open)) {
    text = 'Waiting for ' + oppName + '…';
    cls += ' waiting';
  } else {
    const turn = game.turn();
    if (mode === 'online' || mode === 'bot') {
      text = turn === myColor ? 'Your move' : mode === 'bot' ? 'The computer is thinking…' : oppName + ' is thinking…';
      if (turn === myColor) cls += ' mine';
    } else {
      text = colorName(turn) + ' to move';
    }
    if (game.in_check()) { text = 'Check! ' + text; cls += ' check'; }
  }
  box.className = cls;
  box.textContent = text;
}

function renderMoves() {
  const h = game.history();
  const list = $('moveList');
  if (!h.length) { list.innerHTML = '<div class="empty">No moves yet</div>'; return; }
  let html = '';
  for (let i = 0; i < h.length; i += 2) {
    const cur = h.length - 1;
    html += '<div class="mv-row"><span class="mv-n">' + (i / 2 + 1) + '.</span>' +
      '<span class="mv' + (i === cur ? ' cur' : '') + '">' + esc(h[i]) + '</span>' +
      '<span class="mv' + (i + 1 === cur ? ' cur' : '') + '">' + esc(h[i + 1] || '') + '</span></div>';
  }
  list.innerHTML = html;
  list.scrollTop = list.scrollHeight;
}

function updateControls() {
  const online = mode === 'online';
  const local = mode === 'local';
  const bot = mode === 'bot';
  const playing = !!mode && !result;
  const connected = !!(conn && conn.open);
  setShown('drawBtn', playing && !bot);
  setShown('resignBtn', playing);
  setShown('undoBtn', local || bot);
  setShown('rematchBtn', local || bot || (online && !!result));
  setShown('micBtn', online);
  setShown('faceBtn', !!mode);

  const rb = $('rematchBtn');
  rb.textContent = local || bot ? '↻ New game' : rematchOffered ? '⏳ Waiting…' : '↻ Rematch';
  rb.disabled = online && (rematchOffered || !connected);
  rb.classList.toggle('primary', !!result);

  $('drawBtn').textContent = drawOffered ? '⏳ Draw offered' : '🤝 Offer draw';
  $('drawBtn').disabled = online && (drawOffered || !connected);
  $('resignBtn').disabled = online && !connected;
  $('undoBtn').disabled = !game.history().length || thinking;
  $('leaveBtn').textContent = local || bot ? '☰ Menu' : '✕ Leave';
  updateMediaButtons();
}

/* ================= CATS, VOICE AND FACES ================= */

function renderCats() {
  const p = CA.profile;
  $('localCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  $('remoteCat').innerHTML = CA.catSVG(oppEquip, { label: oppName, talker: 'opp' });
  updateRemoteUI();
  updateMediaButtons();
}

function renderLobby() {
  const p = CA.profile;
  if (!p) return;
  $('lobbyCat').innerHTML = CA.catSVG(p.equip, { label: p.name, talker: 'me' });
  const on = CA.voice.micOn();
  $('chessMicPill').className = 'pill ' + (on ? 'on' : 'off');
  $('chessMicPill').textContent = on ? '🎤 Mic on' : '🔇 Mic off';
  const cam = CA.voice.camWanted()
    ? ' Your camera turns on when the game starts (press 🐱 Show my cat to hide it).'
    : ' You play as your cat.';
  $('lobbyMicHint').textContent = (on
    ? 'Your friend will hear you.'
    : 'Your microphone is off. Turn it on with 🎤 at the top.') + cam;
}

function faceOn() { return CA.voice.cameraOn(); }

function updateMediaButtons() {
  const mic = $('micBtn');
  mic.textContent = CA.voice.micOn() ? '🎤 Mic on' : CA.voice.hasMic() ? '🔇 Mic off' : '🎤 Turn on mic';
  mic.classList.toggle('off', CA.voice.hasMic() && !CA.voice.micOn());
  const face = $('faceBtn');
  face.textContent = faceOn() || CA.voice.camPending ? '🐱 Show my cat' : '📷 Show my face';
  const lv = $('localVideo');
  if (faceOn()) {
    if (lv.srcObject !== CA.voice.camera) lv.srcObject = CA.voice.camera;
    lv.play().catch(() => {});
  } else {
    lv.srcObject = null;
  }
  lv.classList.toggle('hidden', !faceOn());
  root.classList.toggle('cam-on', faceOn());
}

function toggleFace() {
  const on = !(faceOn() || CA.voice.camPending);
  CA.voice.setCamWanted(on);
  if (!on) toast('Now showing your cat. 🐱');
}

function callSig() { return (CA.voice.hasMic() ? 'a' : '') + (faceOn() ? 'v' : ''); }

function updateRemoteUI() {
  let text = '';
  if (mode === 'online' && !oppOnline) text = oppName + ' is not connected';
  $('remoteText').textContent = text;
  $('remoteOverlay').classList.toggle('hidden', !text);
  $('remoteName').textContent = oppName;
  $('remoteMic').textContent = mode === 'online' && oppOnline && !oppMedia.mic ? ' 🔇' : '';
  const showVideo = mode === 'online' && oppOnline && oppMedia.face && remoteHasVideo;
  $('remoteVideo').classList.toggle('hidden', !showVideo);
}

let catTalkTimer = null;
function catTalk(ms) {
  clearInterval(catTalkTimer);
  const end = Date.now() + ms;
  catTalkTimer = setInterval(() => {
    const done = Date.now() > end;
    CA.setMouths('talk-opp', done ? 0 : 0.3 + Math.random() * 0.7);
    if (done) clearInterval(catTalkTimer);
  }, 110);
}

function setOppMouth(v) {
  CA.setMouths('talk-opp', v);
  clearTimeout(oppTalkTimer);
  if (v > 0) oppTalkTimer = setTimeout(() => CA.setMouths('talk-opp', 0), 600);
}

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

/* ================= NETWORK (PeerJS / WebRTC) ================= */

function makeCode() {
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, n => CODE_CHARS[n % CODE_CHARS.length]).join('');
}

function newPeer(id) {
  const p = id ? new Peer(id, PEER_OPTS) : new Peer(PEER_OPTS);
  p.on('call', onIncomingCall);
  p.on('error', onPeerError);
  p.on('disconnected', () => {
    // lost the matchmaking server (not the opponent): reconnect so the room stays joinable
    setTimeout(() => { if (peer === p && !p.destroyed && p.disconnected) p.reconnect(); }, 1500);
  });
  return p;
}

function createRoom() {
  cleanupNet();
  isHost = true;
  roomCode = makeCode();
  showPanel('host');
  $('roomCode').textContent = '······';
  $('hostMsg').textContent = 'Creating your room…';
  $('copyCodeBtn').disabled = true;
  $('copyLinkBtn').disabled = true;
  const p = peer = newPeer(PEER_PREFIX + roomCode);
  p.on('open', () => {
    if (peer !== p) return;
    $('roomCode').textContent = roomCode;
    $('hostMsg').textContent = 'Waiting for your friend to join…';
    $('copyCodeBtn').disabled = false;
    $('copyLinkBtn').disabled = false;
  });
  p.on('connection', c => {
    if (peer !== p) return;
    const pid = c.metadata && c.metadata.pid;
    if (conn && conn.open && pid !== oppPid) {
      c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 500); });
      return;
    }
    if (conn && conn !== c) { const old = conn; conn = null; closeCalls(); try { old.close(); } catch (e) { /* already closed */ } }
    oppPid = pid;
    bindConn(c);
  });
}

function joinRoom(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) {
    menuMsg('Type the 6-character room code first.', 'error');
    $('joinInput').focus();
    return;
  }
  cleanupNet();
  isHost = false;
  roomCode = code;
  showPanel('join');
  $('joinMsg').textContent = 'Joining room ' + code + '…';
  const p = peer = newPeer();
  p.on('open', () => { if (peer === p && !conn) bindConn(p.connect(PEER_PREFIX + code, CONN_OPTS)); });
  joinTimer = setTimeout(() => {
    if (peer === p && !mode && !(conn && conn.open)) {
      failToMenu('Could not connect to room ' + code + '. Check the code, and make sure your friend still has the game open.');
    }
  }, JOIN_TIMEOUT);
}

function bindConn(c) {
  conn = c;
  c.on('open', () => {
    if (conn !== c) return;
    clearTimeout(joinTimer);
    reconnectTries = 0;
    oppLeft = false;
    lastSeen = Date.now();
    startHeartbeat();
    startTalking();
    send({ t: 'hello', name: myName(), equip: CA.profile.equip, mic: CA.voice.micOn(), face: faceOn() });
    if (isHost) {
      if (mode !== 'online') startOnlineGame('w', true);
      else sendState(); // the same opponent came back: continue the game
    }
    callOpponent();
    hideBanner();
    setOppOnline(true);
  });
  c.on('data', msg => { if (conn === c) onData(msg); });
  c.on('close', () => onConnClosed(c));
  c.on('error', err => console.warn('Data connection error:', err));
}

function sendState() {
  send({ t: 'start', color: other(myColor), moves: game.history(), result });
}

function resync() {
  if (isHost) sendState();
  else send({ t: 'sync' });
}

function readEquip(e) {
  const out = {};
  if (e && typeof e === 'object') {
    for (const s of CA.SLOTS) {
      const id = e[s.id];
      if (typeof id === 'string' && CA.ITEM[id] && CA.ITEM[id].slot === s.id) out[s.id] = id;
    }
  }
  return out;
}

function onData(msg) {
  lastSeen = Date.now();
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'ping':
      return;
    case 'talk':
      if (Number.isFinite(msg.v)) setOppMouth(Math.max(0, Math.min(1, msg.v)));
      return;
    case 'hello':
      oppName = CA.cleanName(msg.name) || 'Opponent';
      oppEquip = readEquip(msg.equip);
      oppMedia = { mic: !!msg.mic, face: !!msg.face };
      if (mode) { renderCats(); render(); }
      return;
    case 'media':
      oppMedia = { mic: !!msg.mic, face: !!msg.face };
      updateRemoteUI();
      return;
    case 'full':
      failToMenu('That room already has two players.');
      return;
    case 'start': {
      if (isHost) return;
      const wasPlaying = mode === 'online';
      myColor = msg.color === 'w' ? 'w' : 'b';
      loadMoves(Array.isArray(msg.moves) ? msg.moves : []);
      result = msg.result && typeof msg.result === 'object' ? msg.result : null;
      drawOffered = rematchOffered = incomingRematch = false;
      hideOffer();
      enterGame('online');
      if (!game.history().length && !result) {
        sound('start');
        toast((wasPlaying ? 'New game! ' : oppName + ' is ready! ') + 'You play ' + colorName(myColor) + '.');
      }
      if (result) showResult();
      return;
    }
    case 'sync':
      if (isHost) sendState();
      return;
    case 'move':
      onRemoteMove(msg);
      return;
    case 'resign':
      if (mode === 'online' && !result) finishGame({ winner: myColor, reason: 'resign' });
      return;
    case 'draw-offer':
      if (mode !== 'online' || result) return;
      showOffer('draw', oppName + ' offers a draw.', [
        { label: 'Accept', primary: true, fn: () => { send({ t: 'draw-accept' }); finishGame({ winner: null, reason: 'agreement' }); } },
        { label: 'Decline', fn: () => send({ t: 'draw-decline' }) },
      ]);
      sound('notify');
      return;
    case 'draw-accept':
      if (drawOffered && !result) finishGame({ winner: null, reason: 'agreement' });
      return;
    case 'draw-decline':
      drawOffered = false;
      updateControls();
      toast(oppName + ' declined the draw.');
      return;
    case 'rematch-offer':
      if (rematchOffered) { // we both asked at the same time
        if (isHost) beginRematch(); else send({ t: 'rematch-accept' });
        return;
      }
      incomingRematch = true;
      if (modalState && modalState.kind === 'result') closeModal();
      showOffer('rematch', oppName + ' wants a rematch!', [
        { label: 'Play again', primary: true, fn: acceptRematch },
        { label: 'No thanks', fn: () => { incomingRematch = false; send({ t: 'rematch-decline' }); } },
      ]);
      sound('notify');
      return;
    case 'rematch-accept':
      if (isHost && rematchOffered) beginRematch();
      return;
    case 'rematch-decline':
      rematchOffered = false;
      updateControls();
      toast(oppName + " doesn't want a rematch right now.");
      return;
    case 'bye':
      oppLeft = true;
      onConnClosed(conn);
      return;
  }
}

function onRemoteMove(msg) {
  if (mode !== 'online' || result) return;
  if (msg.ply !== game.history().length || game.turn() === myColor) { resync(); return; }
  const mv = { from: msg.from, to: msg.to };
  if (msg.promotion) mv.promotion = msg.promotion;
  if (!applyMove(mv, { remote: true })) resync();
}

function onConnClosed(c) {
  if (!c || c !== conn) return;
  conn = null;
  clearInterval(pingTimer);
  stopTalking();
  closeCalls();
  setOppMouth(0);
  setOppOnline(false);
  if (leaving) return;
  if (!mode) {
    if (!isHost) failToMenu('The connection closed before the game started. Try joining again.');
    return;
  }
  if (mode !== 'online') return;
  if (!isHost && !oppLeft && reconnectTries < 3 && peer && !peer.destroyed) {
    reconnectTries++;
    showBanner('Connection lost. Reconnecting…');
    setTimeout(() => {
      if (conn || !peer || peer.destroyed || mode !== 'online') return;
      const c2 = peer.connect(PEER_PREFIX + roomCode, CONN_OPTS);
      bindConn(c2);
      setTimeout(() => { if (conn === c2 && !c2.open) onConnClosed(c2); }, 10000);
    }, 1500 * reconnectTries);
    return;
  }
  showBanner(
    isHost ? oppName + ' left the game. They can come back with code ' + roomCode + '.' : oppName + ' left the game.',
    [{ label: 'Back to lobby', fn: goToLobby }]
  );
}

function onPeerError(err) {
  const type = err && err.type;
  console.warn('PeerJS error:', type, err);
  if (type === 'unavailable-id' && isHost && !mode) { createRoom(); return; } // code taken, pick another
  if (mode === 'online') {
    if (type === 'peer-unavailable' && !isHost) {
      showBanner(oppName + ' has left the game.', [{ label: 'Back to lobby', fn: goToLobby }]);
    }
    return; // everything else: the game itself keeps running peer-to-peer
  }
  if (mode) return;
  let text;
  switch (type) {
    case 'peer-unavailable':
      text = 'Room ' + roomCode + ' was not found. Check the code, and make sure your friend still has the game open.';
      break;
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      text = "Can't reach the game server. Check your internet connection and try again.";
      break;
    case 'browser-incompatible':
      text = "This browser can't do voice calls. Please use Chrome, Edge, Firefox or Safari.";
      break;
    default:
      text = 'Connection problem (' + (type || 'unknown') + '). Please try again.';
  }
  failToMenu(text);
}

// Sends your microphone (and camera, if it's on). Called again whenever either one starts or stops.
function callOpponent() {
  if (outCall) { const o = outCall; outCall = null; o.close(); }
  lastCallSig = callSig();
  const stream = CA.voice.outgoing();
  if (!peer || !conn || !conn.open || !stream) return;
  const call = peer.call(conn.peer, stream, { metadata: { pid: PLAYER_ID } });
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
    const v = $('remoteVideo');
    v.srcObject = stream;
    v.muted = false;
    const p = v.play();
    if (p && p.catch) {
      p.then(() => $('unmuteBtn').classList.add('hidden')).catch(() => {
        // the browser blocked sound until the page is clicked: play muted and offer a button
        v.muted = true;
        v.play().catch(() => {});
        $('unmuteBtn').classList.remove('hidden');
      });
    }
    updateRemoteUI();
  });
  call.on('close', () => {
    if (inCall !== call) return;
    inCall = null;
    remoteHasVideo = false;
    $('remoteVideo').srcObject = null;
    updateRemoteUI();
  });
  call.on('error', err => console.warn('Incoming call error:', err));
  call.answer(); // receive only: my own voice goes out on my own call
}

function closeCalls() {
  for (const c of [outCall, inCall]) if (c) { try { c.close(); } catch (e) { /* already closed */ } }
  outCall = inCall = null;
  remoteHasVideo = false;
  $('remoteVideo').srcObject = null;
  $('unmuteBtn').classList.add('hidden');
}

function sendMediaState() {
  send({ t: 'media', mic: CA.voice.micOn(), face: faceOn() });
}

function send(msg) {
  if (conn && conn.open) {
    try { conn.send(msg); } catch (e) { console.warn('Send failed:', e); }
  }
}

function startHeartbeat() {
  clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (!conn || !conn.open) return;
    send({ t: 'ping' });
    $('oppDot').className = 'dot ' + (Date.now() - lastSeen > 12000 ? 'weak' : 'on');
  }, 3000);
}

function setOppOnline(v) {
  oppOnline = v;
  $('oppDot').className = 'dot ' + (v ? 'on' : 'off');
  updateRemoteUI();
  if (mode) render();
}

// Tell the opponent we're going, then close the connection a moment later so the message gets out.
function hangUp() {
  if (conn && conn.open) send({ t: 'bye' });
  const c = conn;
  const p = peer;
  conn = null;
  peer = null;
  stopTalking();
  closeCalls();
  setTimeout(() => {
    try { if (c) c.close(); } catch (e) { /* ignore */ }
    try { if (p) p.destroy(); } catch (e) { /* ignore */ }
  }, 300);
}

function cleanupNet() {
  clearTimeout(joinTimer);
  clearInterval(pingTimer);
  stopTalking();
  closeCalls();
  if (conn) { const c = conn; conn = null; try { c.close(); } catch (e) { /* ignore */ } }
  if (peer) { const p = peer; peer = null; try { p.destroy(); } catch (e) { /* ignore */ } }
  oppOnline = false;
  oppLeft = false;
  oppPid = null;
  reconnectTries = 0;
  oppName = 'Opponent';
  oppEquip = {};
  oppMedia = { mic: false, face: false };
  $('oppDot').className = 'dot off';
  CA.setMouths('talk-opp', 0);
}

function failToMenu(text) {
  cleanupNet();
  showPanel('menu');
  menuMsg(text, 'error');
}

/* ================= LOBBY UI ================= */

function showPanel(name) {
  $('menuPanel').classList.toggle('hidden', name !== 'menu');
  $('hostPanel').classList.toggle('hidden', name !== 'host');
  $('joinPanel').classList.toggle('hidden', name !== 'join');
}

function menuMsg(text, kind) {
  const el = $('menuMsg');
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(what + ' copied!');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
    toast(ok ? what + ' copied!' : what + ': ' + text);
  }
}

/* ================= MODALS + OFFERS ================= */

function openModal(o) {
  modalState = o;
  $('modalIcon').textContent = o.icon || '';
  $('modalIcon').classList.toggle('hidden', !o.icon);
  $('modalTitle').textContent = o.title || '';
  $('modalText').textContent = o.text || '';
  $('modalText').classList.toggle('hidden', !o.text);
  $('promoRow').classList.toggle('hidden', !o.promo);
  const box = $('modalBtns');
  box.innerHTML = '';
  for (const b of o.buttons || []) {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => { closeModal(); if (b.fn) b.fn(); });
    box.appendChild(el);
  }
  $('modal').classList.remove('hidden');
  const first = box.querySelector('.btn.primary') || box.querySelector('.btn');
  if (first && !o.promo) first.focus({ preventScroll: true });
}

function closeModal() {
  const o = modalState;
  modalState = null;
  $('modal').classList.add('hidden');
  return o;
}

function dismissModal() {
  const o = modalState;
  if (!o || !o.dismissable) return;
  closeModal();
  if (o.onDismiss) o.onDismiss();
}

function confirmModal(title, text, okLabel, fn) {
  openModal({ title, text, dismissable: true, buttons: [{ label: okLabel, primary: true, fn }, { label: 'Cancel' }] });
}

function askPromotion(from, to, animate) {
  const color = game.turn();
  const row = $('promoRow');
  row.innerHTML = '';
  const names = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  for (const t of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    b.className = 'promo-btn';
    b.title = names[t];
    b.dataset.piece = t;
    b.innerHTML = '<span class="piece ' + color + t.toUpperCase() + '"></span><span class="promo-name">' + names[t] + '</span>';
    b.addEventListener('click', () => { closeModal(); applyMove({ from, to, promotion: t }, { animate }); });
    row.appendChild(b);
  }
  const cancel = () => { selected = null; targets = []; renderBoard(); };
  openModal({ title: 'Promote your pawn', promo: true, dismissable: true, onDismiss: cancel, buttons: [{ label: 'Cancel', fn: cancel }] });
}

function showOffer(kind, text, buttons) {
  const bar = $('offerBar');
  bar.dataset.kind = kind;
  $('offerText').textContent = text;
  const box = $('offerBtns');
  box.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn small' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => { hideOffer(); if (b.fn) b.fn(); });
    box.appendChild(el);
  }
  bar.classList.remove('hidden');
}

function hideOffer(kind) {
  const bar = $('offerBar');
  if (kind && bar.dataset.kind !== kind) return;
  bar.classList.add('hidden');
  if (!kind || kind === 'rematch') incomingRematch = false;
}

function showBanner(text, buttons) {
  $('bannerText').textContent = text;
  const box = $('bannerBtns');
  box.innerHTML = '';
  for (const b of buttons || []) {
    const el = document.createElement('button');
    el.className = 'btn small';
    el.textContent = b.label;
    el.addEventListener('click', b.fn);
    box.appendChild(el);
  }
  box.classList.toggle('hidden', !(buttons && buttons.length));
  $('banner').classList.remove('hidden');
}

function hideBanner() { $('banner').classList.add('hidden'); }

/* ================= HELPERS ================= */

function capturedBy(color) {
  const counts = countPieces(other(color));
  const out = [];
  for (const t of PIECE_ORDER) for (let i = counts[t]; i < START_COUNT[t]; i++) out.push(t);
  return out;
}

function countPieces(color) {
  const counts = { q: 0, r: 0, b: 0, n: 0, p: 0, k: 0 };
  for (const row of game.board()) for (const p of row) if (p && p.color === color) counts[p.type]++;
  return counts;
}

function material(color) {
  const c = countPieces(color);
  return PIECE_ORDER.reduce((s, t) => s + VALUE[t] * c[t], 0);
}

function findKing(color) {
  const b = game.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f];
    if (p && p.type === 'k' && p.color === color) return FILES[f] + (8 - r);
  }
  return null;
}

function colorName(c) { return c === 'w' ? 'White' : 'Black'; }
function other(c) { return c === 'w' ? 'b' : 'w'; }
function setShown(id, show) { $(id).classList.toggle('hidden', !show); }
function esc(s) { return CA.esc(s); }

/* ================= WIRING ================= */

$('createBtn').addEventListener('click', createRoom);
$('joinBtn').addEventListener('click', () => joinRoom($('joinInput').value));
$('inviteJoinBtn').addEventListener('click', () => joinRoom($('inviteCode').textContent));
$('joinInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('joinInput').value); });
$('joinInput').addEventListener('input', e => {
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (v !== e.target.value) e.target.value = v;
  menuMsg('');
});
$('localBtn').addEventListener('click', startLocalGame);
$('cancelHostBtn').addEventListener('click', () => { cleanupNet(); showPanel('menu'); });
$('cancelJoinBtn').addEventListener('click', () => { cleanupNet(); showPanel('menu'); });
$('copyCodeBtn').addEventListener('click', () => copyText(roomCode, 'Room code'));
$('copyLinkBtn').addEventListener('click', () => copyText(location.href.split('#')[0] + '#/chess?room=' + roomCode, 'Invite link'));

$('micBtn').addEventListener('click', async () => {
  if (CA.voice.micOn()) CA.voice.setMic(false);
  else if (CA.voice.hasMic()) CA.voice.setMic(true);
  else if (await CA.voice.startMic()) CA.voice.setChoice('on');
  else toast('The microphone is blocked. Allow it with the lock icon in the address bar.');
});
$('faceBtn').addEventListener('click', toggleFace);
$('flipBtn').addEventListener('click', () => { flipped = !flipped; render(); });
$('drawBtn').addEventListener('click', offerDraw);
$('resignBtn').addEventListener('click', resign);
$('undoBtn').addEventListener('click', undoMove);
$('rematchBtn').addEventListener('click', requestRematch);
$('leaveBtn').addEventListener('click', leaveGame);
function unmuteOpponent() {
  const v = $('remoteVideo');
  $('unmuteBtn').classList.add('hidden');
  v.muted = false;
  v.play().catch(() => { // still blocked: keep their video playing without sound
    v.muted = true;
    v.play().catch(() => {});
    $('unmuteBtn').classList.remove('hidden');
  });
}
$('unmuteBtn').addEventListener('click', unmuteOpponent);
// Any click or key press is the "tap" the browser wants before it plays your opponent's voice.
['pointerdown', 'pointerup', 'keydown'].forEach(type => window.addEventListener(type, () => {
  if (!$('unmuteBtn').classList.contains('hidden')) unmuteOpponent();
}, { capture: true }));

$('modal').addEventListener('click', e => { if (e.target.id === 'modal') dismissModal(); });
document.addEventListener('keydown', e => {
  if (CA.route !== 'chess' || e.key !== 'Escape') return;
  if (modalState) dismissModal();
  else if (selected) { selected = null; targets = []; renderBoard(); }
});
window.addEventListener('ca:media', () => {
  if (CA.route !== 'chess') return;
  if (!mode) renderLobby();
  updateMediaButtons();
  if (conn && conn.open) {
    sendMediaState();
    if (callSig() !== lastCallSig) callOpponent(); // the microphone or camera just started or stopped
  }
});
window.addEventListener('pagehide', () => {
  if (conn && conn.open) send({ t: 'bye' });
  leaving = true;
  if (peer) { try { peer.destroy(); } catch (e) { /* ignore */ } }
});

CA.register('chess', {
  enter(params) {
    CA.showScreen('scr-chess');
    resetView();
    showPanel('menu');
    menuMsg('');
    renderLobby();
    const onFile = location.protocol === 'file:';
    const onThisPcOnly = onFile || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    $('copyLinkBtn').classList.toggle('hidden', onFile);
    $('linkHint').classList.toggle('hidden', !onThisPcOnly);
    if (params.get('bot')) {
      try { botLevel = localStorage.getItem('camarcade-practice-level') || 'medium'; } catch (e) { botLevel = 'medium'; }
      startBotGame('w');
      return;
    }
    const invite = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (invite.length === 6) {
      $('inviteCode').textContent = invite;
      $('joinInput').value = invite;
      $('inviteBox').classList.remove('hidden');
    }
  },
  leave() {
    leaving = true;
    hangUp();
    cleanupNet();
    leaving = false;
    clearInterval(catTalkTimer);
    clearTimeout(oppTalkTimer);
    resetView(); // also turns the camera off
  },
  canLeave(proceed) {
    if (mode !== 'online' || result || !(conn && conn.open)) return true;
    CA.confirmBox('Leave the chess game?', 'Your opponent will be left alone on the board.', 'Leave', proceed);
    return false;
  },
});

})();
