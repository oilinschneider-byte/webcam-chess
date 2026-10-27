/* Talks to CamArcade's server (Supabase): accounts, matchmaking, game results, the leaderboard and visitor counts.
   The server's side of all this is server/schema.sql. */
(() => {
'use strict';

const cfg = window.CAMARCADE_CONFIG || {};
const URL_ = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
const KEY = String(cfg.supabaseKey || '').trim();
const configured = /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(URL_) && KEY.length > 20; // (http only for a server on this computer)

// What each server error means, in words for the player.
const MESSAGES = {
  not_configured: "CamArcade isn't connected to its server yet. Fill in config.js (see SETUP.md).",
  offline: "Can't reach the CamArcade server. Check your internet connection and try again.",
  server_error: 'Something went wrong on the server. Please try again in a moment.',
  bad_name: 'Usernames are 3 to 16 letters, numbers or _ (no spaces).',
  bad_password: 'Pick a password with 4 to 72 characters.',
  bad_birthday: 'Pick the month and year you were born.',
  too_young: 'Sorry, you have to be 13 or older to play CamArcade.',
  too_many_signups: 'Too many accounts were made from this internet connection in the last hour. Try again later.',
  name_taken: 'That username is taken. Pick another one.',
  no_such_name: "There's no account with that username. Check the spelling, or sign up.",
  wrong_password: 'That password is not right. Try again.',
  too_many_tries: 'Too many wrong passwords. Wait 15 minutes and try again.',
  not_logged_in: 'You were logged out. Please log in again.',
  profile_too_big: 'Your cat could not be saved.',
  bad_peer: 'Matchmaking hit a snag. Please try again.',
  no_such_match: 'That match was not found.',
  match_closed: 'That match is over.',
  bad_game_no: 'That game result was out of order.',
  bad_outcome: 'That game result was not valid.',
  no_such_player: 'That player was not found.',
  bad_reason: 'Pick a reason for the report.',
  too_many_reports: "You've sent a lot of reports today. Thanks! Try again tomorrow.",
};

function fail(code, detail) {
  const e = new Error(MESSAGES[code] || MESSAGES.server_error);
  e.code = MESSAGES[code] ? code : 'server_error';
  if (detail) e.detail = detail;
  return e;
}

// Calls one of the ca_* functions in server/schema.sql. Resolves with what it returns; rejects with an Error
// whose .code is one of MESSAGES above and whose .message is ready to show.
async function call(fn, args, opts) {
  if (!configured) throw fail('not_configured');
  const headers = { 'Content-Type': 'application/json', apikey: KEY };
  if (KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + KEY; // (the legacy keys also want this)
  let res;
  try {
    res = await fetch(URL_ + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers, body: JSON.stringify(args || {}), keepalive: !!(opts && opts.keepalive),
    });
  } catch (e) {
    throw fail('offline');
  }
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
  if (!res.ok) {
    const code = data && typeof data.message === 'string' ? data.message : '';
    if (!MESSAGES[code]) console.warn('Server error from ' + fn + ':', res.status, text);
    throw fail(code, data);
  }
  if (data && typeof data === 'object' && typeof data.error === 'string') throw fail(data.error, data);
  return data;
}

window.CAServer = { configured, call, message: code => MESSAGES[code] || MESSAGES.server_error };

})();
