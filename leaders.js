/* The leaderboard (longest win streaks, from the server) and the "how many people play" page.
   Both work without logging in, so you can share the links. */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const esc = s => CA.esc(s);

/* ================= LEADERBOARD ================= */

let lbData = null;
let lbTab = 'best';
let lbLoading = false;

// Only items that exist, in the right slot (the list comes from other players' browsers).
function safeEquip(eq) {
  const out = {};
  if (eq && typeof eq === 'object') {
    for (const s of CA.SLOTS) {
      const id = eq[s.id];
      if (typeof id === 'string' && CA.ITEM[id] && CA.ITEM[id].slot === s.id) out[s.id] = id;
    }
  }
  return out;
}

async function loadBoard() {
  if (lbLoading) return;
  lbLoading = true;
  $('lbMsg').textContent = 'Loading…';
  $('lbMsg').classList.remove('hidden');
  try {
    lbData = await CA.server.call('ca_leaderboard', { p_token: CA.token || null });
    renderBoard();
  } catch (err) {
    if (err.code === 'not_logged_in') CA.sessionLost();
    $('lbList').innerHTML = '';
    $('lbMsg').textContent = err.message;
  } finally {
    lbLoading = false;
  }
}

function renderBoard() {
  document.querySelectorAll('#lbTabs [data-lb]').forEach(b => b.classList.toggle('active', b.dataset.lb === lbTab));
  if (!lbData) return;
  const rows = lbData[lbTab] || [];
  const myId = CA.profile ? CA.profile.id : 0;
  const key = lbTab === 'best' ? 'best' : 'streak';
  $('lbList').innerHTML = rows.map(r => {
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '#' + r.rank;
    const other = lbTab === 'best' ? '🔥 ' + r.streak + ' now' : '🏆 ' + r.best + ' best';
    return '<li class="lb-row' + (r.id === myId ? ' me' : '') + '">' +
      '<span class="lb-rank">' + medal + '</span>' +
      '<span class="lb-cat">' + CA.catSVG(safeEquip(r.equip), { bg: false, anim: false, label: r.name }) + '</span>' +
      '<span class="lb-name"><b>' + esc(r.name) + '</b><small>' + other + ' · ' + r.wins + ' wins</small></span>' +
      '<span class="lb-score">' + (lbTab === 'best' ? '🏆' : '🔥') + ' ' + r[key] + '</span></li>';
  }).join('');
  $('lbMsg').textContent = rows.length ? '' : lbTab === 'best'
    ? 'Nobody has won a Classic Game yet. Be the first!'
    : 'Nobody is on a streak right now. Win a Classic Game to start one!';
  $('lbMsg').classList.toggle('hidden', !!rows.length);
  const me = lbData.me;
  if (me && CA.profile) {
    const rank = lbTab === 'best' ? me.best_rank : me.streak_rank;
    $('lbMe').innerHTML = rank
      ? 'You: <b>#' + rank + '</b> with ' + (lbTab === 'best' ? '🏆 ' + me.best + ' best' : '🔥 ' + me.streak + ' in a row') + '.'
      : lbTab === 'best' ? 'Win a Classic Game to get on the leaderboard!' : "You're not on a streak right now. Win a Classic Game to start one!";
    $('lbMe').classList.remove('hidden');
  } else {
    $('lbMe').classList.add('hidden');
  }
}

$('lbTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-lb]');
  if (!b) return;
  lbTab = b.dataset.lb;
  renderBoard();
});
$('lbRefresh').addEventListener('click', loadBoard);

CA.register('leaders', {
  public: true,
  enter() {
    CA.showScreen('scr-leaders');
    renderBoard();
    loadBoard();
  },
});

/* ================= HOW MANY PEOPLE PLAY ================= */

const fmt = n => (Number(n) || 0).toLocaleString();

async function loadStats() {
  $('stMsg').textContent = 'Loading…';
  $('stMsg').classList.remove('hidden');
  try {
    const s = await CA.server.call('ca_stats');
    const tiles = [
      ['🟢', 'Online now', s.online],
      ['👀', 'Visitors today', s.visitors_today],
      ['📅', 'Visitors, last 7 days', s.visitors_week],
      ['🌍', 'Visitors, all time', s.visitors_total],
      ['🏠', 'Internet connections, all time', s.networks_total],
      ['🐱', 'Accounts', s.players],
      ['🎮', 'Games played today', s.games_today],
      ['🏁', 'Games played, all time', s.games_total],
    ];
    $('stTiles').innerHTML = tiles.map(([icon, label, n]) =>
      '<div class="stat-tile"><span>' + icon + '</span><b>' + fmt(n) + '</b><small>' + label + '</small></div>').join('');
    $('stSince').textContent = s.since ? 'Counted by CamArcade\'s server since ' + s.since + '.' : "Counted by CamArcade's server.";
    const days = s.days || [];
    $('stDays').innerHTML = days.length
      ? '<thead><tr><th>Day</th><th>Visitors</th><th>Games</th></tr></thead><tbody>' +
        days.map(d => '<tr><td>' + esc(d.day) + '</td><td>' + fmt(d.visitors) + '</td><td>' + fmt(d.games) + '</td></tr>').join('') + '</tbody>'
      : '';
    $('stMsg').textContent = days.length ? '' : 'No visitors counted yet.';
    $('stMsg').classList.toggle('hidden', !!days.length);
  } catch (err) {
    $('stTiles').innerHTML = '';
    $('stDays').innerHTML = '';
    $('stMsg').textContent = err.message;
  }
}

CA.register('stats', {
  public: true,
  enter() {
    CA.showScreen('scr-stats');
    loadStats();
  },
});

})();
