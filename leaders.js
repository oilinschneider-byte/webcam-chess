/* The leaderboard (longest win streaks, from the server: this week's race for the weekly prize, best ever, and right now)
   and the "how many people play" page.
   Both work without logging in, so you can share the links. */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const esc = s => CA.esc(s);

/* ================= LEADERBOARD ================= */

let lbData = null;
let lbTab = 'week';
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
  renderPrize();
  if (!lbData) return;
  const rows = lbData[lbTab] || [];
  const myId = CA.profile ? CA.profile.id : 0;
  const key = lbTab === 'best' ? 'best' : lbTab === 'week' ? 'week_best' : 'streak';
  const icon = lbTab === 'best' ? '🏆' : '🔥';
  $('lbList').innerHTML = rows.map(r => {
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '#' + r.rank;
    const other = lbTab === 'best' ? '🔥 ' + r.streak + ' now' : lbTab === 'week' ? '🔥 ' + r.week_streak + ' now · 🏆 ' + r.best + ' best ever' : '🏆 ' + r.best + ' best';
    return '<li class="lb-row' + (r.id === myId ? ' me' : '') + '">' +
      '<span class="lb-rank">' + medal + '</span>' +
      '<span class="lb-cat">' + CA.catSVG(safeEquip(r.equip), { bg: false, anim: false, label: r.name }) + '</span>' +
      '<span class="lb-name"><b>' + esc(r.name) + '</b><small>' + other + ' · ' + r.wins + ' wins</small></span>' +
      '<span class="lb-score">' + icon + ' ' + r[key] + '</span></li>';
  }).join('');
  $('lbMsg').textContent = rows.length ? '' : lbTab === 'best'
    ? 'Nobody has won a Classic Game yet. Be the first!'
    : lbTab === 'week' ? 'Nobody has won a Classic Game this week yet. Be the first!'
    : 'Nobody is on a streak right now. Win a Classic Game to start one!';
  $('lbMsg').classList.toggle('hidden', !!rows.length);
  const me = lbData.me;
  if (me && CA.profile) {
    let text;
    if (lbTab === 'week') {
      text = !me.adult ? 'The weekly prize is for players 18 and older, but your streak still counts on the other tabs.'
        : me.week_rank ? 'You: <b>#' + me.week_rank + '</b> this week with 🔥 ' + me.week_best + ' in a row.'
        : 'Win a Classic Game to get into this week\'s race!';
    } else {
      const rank = lbTab === 'best' ? me.best_rank : me.streak_rank;
      text = rank
        ? 'You: <b>#' + rank + '</b> with ' + (lbTab === 'best' ? '🏆 ' + me.best + ' best' : '🔥 ' + me.streak + ' in a row') + '.'
        : lbTab === 'best' ? 'Win a Classic Game to get on the leaderboard!' : "You're not on a streak right now. Win a Classic Game to start one!";
    }
    $('lbMe').innerHTML = text;
    $('lbMe').classList.remove('hidden');
  } else {
    $('lbMe').classList.add('hidden');
  }
}

// The weekly $100 prize, above the list on the "This week" tab: coming soon (and how close), or how long is left.
function renderPrize() {
  const box = $('lbPrize'), p = lbData && lbData.prize;
  if (lbTab !== 'week' || !p) { box.classList.add('hidden'); return; }
  let html;
  if (!p.on) {
    html = '<b>💵 Win $100 every week: coming soon!</b><p>The weekly prize starts the first time ' + p.need +
      ' players are online at the same time. Most at once so far: <b>' + p.peak + ' / ' + p.need + '</b> (' + p.online +
      ' online now). Invite your friends! Meanwhile, here\'s this week\'s race for practice.</p>';
  } else {
    const left = Math.max(0, new Date(lbData.week_ends) - Date.now()), d = Math.floor(left / 864e5), h = Math.floor(left % 864e5 / 36e5);
    html = '<b>💵 $100 to this week\'s longest win streak!</b><p>' + (d ? d + ' day' + (d === 1 ? '' : 's') + ' and ' : '') + h +
      ' hour' + (h === 1 ? '' : 's') + ' left. 18+ only; see the rules below.</p>';
  }
  const last = lbData.last_week || [];
  if (p.on && last.length) {
    html += '<p class="prize-last">Last week: ' + last.map(r => (r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉') + ' <b>' + esc(r.name) + '</b> (🔥 ' + r.streak + ')').join(' · ') +
      '. The winner is checked before the prize is paid.</p>';
  }
  box.innerHTML = html;
  box.classList.remove('hidden');
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
