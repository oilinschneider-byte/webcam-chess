-- ============================================================================================
-- CamArcade server
--
-- Paste this whole file into Supabase → SQL Editor → New query, and press Run.
-- Running it again later is safe: it updates the code and keeps every player, streak and report.
--
-- Everything is stored in the "camarcade" schema, which the website can't reach directly.
-- The website can only call the public ca_* functions at the bottom of this file, and they check everything:
-- a player's streak only changes when the server itself settles a game that it paired up.
-- ============================================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists camarcade;
revoke all on schema camarcade from public;

/* ================= TABLES ================= */

create table if not exists camarcade.settings (
  id int primary key default 1 check (id = 1),
  net_salt text not null default encode(extensions.gen_random_bytes(16), 'hex') -- makes the stored internet-connection ids unguessable
);
insert into camarcade.settings (id) values (1) on conflict (id) do nothing;
-- The most players online at the same time, counting internet connections (so one person with lots of accounts or
-- windows counts once). The weekly prize switches on for good the first time it reaches 30 (prize_from).
alter table camarcade.settings add column if not exists peak_online int not null default 0;
alter table camarcade.settings add column if not exists peak_at timestamptz;
alter table camarcade.settings add column if not exists prize_from timestamptz;

create table if not exists camarcade.players (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text not null unique,            -- the name in lower case, so "Tom" and "tom" can't both exist
  pass_hash text not null,                  -- bcrypt
  born date not null,                       -- the last day of the month they were born in (we only ask for month and year)
  created_at timestamptz not null default now(),
  created_net text,                         -- a scrambled id of their internet connection, never the real IP address
  last_net text,
  last_seen timestamptz not null default now(),
  streak int not null default 0,
  best int not null default 0,
  best_at timestamptz,                      -- when they reached their best (an earlier one ranks higher on a tie)
  streak_disputes int not null default 0,   -- disputed games during the current streak (3 end the streak)
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  friendly int not null default 0,          -- games that didn't count
  disputes int not null default 0,          -- games where the two players reported different results
  profile jsonb not null default '{}'::jsonb, -- their cat, fish and items: only looks, written by their own browser
  banned_until timestamptz,
  ban_reason text
);
create index if not exists players_best on camarcade.players (best desc, best_at);
create index if not exists players_streak on camarcade.players (streak desc);
create index if not exists players_seen on camarcade.players (last_seen);
-- The weekly prize: the longest win streak played this week (Monday to Sunday, US Central time). Only wins in the week
-- count, so it starts from 0 every Monday. Last week's is kept, for picking the winner.
alter table camarcade.players add column if not exists week_start date;
alter table camarcade.players add column if not exists week_streak int not null default 0;
alter table camarcade.players add column if not exists week_best int not null default 0;
alter table camarcade.players add column if not exists week_best_at timestamptz;
alter table camarcade.players add column if not exists prev_week_start date;
alter table camarcade.players add column if not exists prev_week_best int not null default 0;
alter table camarcade.players add column if not exists prev_week_best_at timestamptz;
create index if not exists players_week on camarcade.players (week_start, week_best desc, week_best_at);

create table if not exists camarcade.sessions (
  token_hash text primary key,
  player_id bigint not null references camarcade.players on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now()
);
create index if not exists sessions_player on camarcade.sessions (player_id);

create table if not exists camarcade.login_fails (
  name_key text not null,
  at timestamptz not null default now()
);
create index if not exists login_fails_key on camarcade.login_fails (name_key, at);

create table if not exists camarcade.signups (
  net text not null,
  at timestamptz not null default now()
);
create index if not exists signups_net on camarcade.signups (net, at);

-- Players looking for a match right now.
create table if not exists camarcade.queue (
  player_id bigint primary key references camarcade.players on delete cascade,
  peer_id text not null,                    -- their PeerJS id, so the other player's browser can connect to them
  net text not null,
  adult boolean not null,
  avoid_id bigint,                          -- who they just played (not again right away, unless nobody else turns up)
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  match_id bigint                           -- set when another player picked them; they collect it on their next poll
);

-- Two players the server put together. One match can have several games (rematches).
create table if not exists camarcade.matches (
  id bigint generated always as identity primary key,
  host bigint not null references camarcade.players on delete cascade,
  guest bigint not null references camarcade.players on delete cascade,
  host_peer text not null,
  guest_peer text not null,
  same_net boolean not null,                -- same internet connection: friendly games only
  cats_only boolean not null,               -- someone is under 18: no cameras or microphones
  status text not null default 'open',      -- open | failed (their browsers couldn't connect)
  created_at timestamptz not null default now()
);
create index if not exists matches_host on camarcade.matches (host, created_at);
create index if not exists matches_guest on camarcade.matches (guest, created_at);

create table if not exists camarcade.games (
  match_id bigint not null references camarcade.matches on delete cascade,
  game_no int not null,
  game text,
  host_report text,                         -- win | lose | draw, from the host's point of view
  guest_report text,
  host_at timestamptz,
  guest_at timestamptz,
  started_at timestamptz not null,          -- the earliest this game could have started
  result text,                              -- host | guest | draw | disputed | void
  ranked boolean,
  note text,                                -- why it didn't count: same_net | pair_limit | banned | void
  resolved_at timestamptz,
  primary key (match_id, game_no)
);
create index if not exists games_open on camarcade.games (match_id) where resolved_at is null;
create index if not exists games_resolved on camarcade.games (resolved_at);

create table if not exists camarcade.blocks (
  blocker bigint not null references camarcade.players on delete cascade,
  blocked bigint not null references camarcade.players on delete cascade,
  at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table if not exists camarcade.reports (
  id bigint generated always as identity primary key,
  reporter bigint references camarcade.players on delete set null,
  reported bigint references camarcade.players on delete set null,
  reported_name text not null,
  match_id bigint,
  reason text not null,                     -- nudity | young | hate | cheating | other
  note text,
  at timestamptz not null default now(),
  reviewed boolean not null default false
);
create index if not exists reports_reported on camarcade.reports (reported, at);
create index if not exists reports_reporter on camarcade.reports (reporter, at);

-- One row per visitor per day (a random id their browser keeps), for counting how many people play.
create table if not exists camarcade.visits (
  day date not null default current_date,
  visitor text not null,
  net text not null,
  primary key (day, visitor)
);

do $$
declare t text;
begin
  foreach t in array array['settings', 'players', 'sessions', 'login_fails', 'signups', 'queue', 'matches', 'games', 'blocks', 'reports', 'visits'] loop
    execute format('alter table camarcade.%I enable row level security', t);
  end loop;
end $$;

/* ================= HELPERS ================= */

create or replace function camarcade.pair_limit() returns int language sql immutable as 'select 3';

-- The visitor's IP address, as the Supabase proxy saw it. Supabase's own gateway sets sb-forwarded-for, and a visitor
-- can't change it (the test script checks); the other headers are only used if that one is missing, because some of
-- them pass through whatever the visitor sends.
create or replace function camarcade.client_ip() returns text
language plpgsql stable set search_path = '' as $$
declare
  h jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
begin
  if h is null then return 'no-request'; end if;
  return coalesce(
    nullif(trim(split_part(h->>'sb-forwarded-for', ',', 1)), ''),
    nullif(trim(h->>'cf-connecting-ip'), ''),
    nullif(trim(h->>'x-real-ip'), ''),
    nullif(trim(split_part(h->>'x-forwarded-for', ',', 1)), ''),
    'unknown');
end $$;

create or replace function camarcade.sha(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

-- A scrambled id of the visitor's internet connection. Two players with the same one are probably in the same house.
create or replace function camarcade.net() returns text
language sql stable set search_path = '' as $$
  select left(camarcade.sha(camarcade.client_ip() || ':' || s.net_salt), 24) from camarcade.settings s
$$;

create or replace function camarcade.me_json(p_id bigint) returns jsonb
language plpgsql stable set search_path = '' as $$
declare p camarcade.players;
begin
  select * into p from camarcade.players where id = p_id;
  return jsonb_build_object(
    'id', p.id, 'name', p.name, 'adult', p.born + interval '18 years' <= current_date,
    'streak', p.streak, 'best', p.best, 'wins', p.wins, 'losses', p.losses, 'draws', p.draws,
    'friendly', p.friendly, 'disputes', p.disputes, 'profile', p.profile,
    'banned_until', case when p.banned_until > now() then p.banned_until end,
    'ban_reason', case when p.banned_until > now() then p.ban_reason end);
end $$;

-- The cat, fish and items. Only these keys are kept: streaks and wins can't be sent in here.
create or replace function camarcade.clean_profile(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  if octet_length(p::text) > 20000 then raise exception 'profile_too_big'; end if;
  return coalesce(
    (select jsonb_object_agg(key, value) from jsonb_each(p) where key in ('fish', 'xp', 'owned', 'equip', 'claimed', 'mathBest', 'savedAt')),
    '{}'::jsonb);
end $$;

create or replace function camarcade.new_session(p_id bigint) returns text
language plpgsql set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from camarcade.sessions where player_id = p_id and used_at < now() - interval '30 days';
  insert into camarcade.sessions (token_hash, player_id) values (camarcade.sha(t), p_id);
  return t;
end $$;

-- How many players are online right now, counting internet connections (one house = one).
create or replace function camarcade.online_nets() returns int
language sql stable set search_path = '' as $$
  select count(distinct last_net)::int from camarcade.players where last_seen > now() - interval '2 minutes' and last_net is not null
$$;

-- The weekly prize needs this many players online at the same time (different internet connections) to switch on.
create or replace function camarcade.prize_need() returns int language sql immutable as 'select 30';

-- Keeps the record of the most players online at once, and switches the weekly prize on the first time it gets there.
create or replace function camarcade.note_online() returns void
language plpgsql set search_path = '' as $$
declare n int := camarcade.online_nets();
begin
  update camarcade.settings
  set peak_online = n, peak_at = now(),
      prize_from = coalesce(prize_from, case when n >= camarcade.prize_need() then now() end)
  where id = 1 and n > peak_online;
end $$;

-- The weekly prize, for the website: is it on yet, and how close is it?
create or replace function camarcade.prize_json() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('on', s.prize_from is not null, 'from', s.prize_from, 'need', camarcade.prize_need(),
                            'peak', s.peak_online, 'peak_at', s.peak_at, 'online', camarcade.online_nets())
  from camarcade.settings s
$$;

-- Who is calling? (Their browser sends the token it got when they logged in.)
create or replace function camarcade.auth(p_token text) returns bigint
language plpgsql set search_path = '' as $$
declare
  s camarcade.sessions;
  n text := camarcade.net();
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'not_logged_in'; end if;
  select * into s from camarcade.sessions where token_hash = camarcade.sha(p_token);
  if not found or s.used_at < now() - interval '30 days' then raise exception 'not_logged_in'; end if;
  if s.used_at < now() - interval '1 hour' then
    update camarcade.sessions set used_at = now() where token_hash = s.token_hash;
  end if;
  update camarcade.players set last_seen = now(), last_net = n
  where id = s.player_id and (last_seen < now() - interval '20 seconds' or last_net is distinct from n);
  if found then perform camarcade.note_online(); end if; -- (about every 20 seconds per player)
  return s.player_id;
end $$;

/* ================= ACCOUNTS ================= */

create or replace function camarcade.sign_up(p_name text, p_pass text, p_year int, p_month int, p_profile jsonb, p_net text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_born date;
  v_id bigint;
begin
  if p_name is null or p_name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'bad_name'; end if;
  if p_pass is null or length(p_pass) < 4 or octet_length(p_pass) > 72 then raise exception 'bad_password'; end if;
  if p_year is null or p_month is null or p_month not between 1 and 12
     or p_year not between 1900 and extract(year from current_date)::int then
    raise exception 'bad_birthday';
  end if;
  v_born := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  if v_born + interval '13 years' > current_date then raise exception 'too_young'; end if;
  if (select count(*) from camarcade.signups where net = p_net and at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_signups';
  end if;
  if exists (select 1 from camarcade.players where name_key = lower(p_name)) then raise exception 'name_taken'; end if;
  insert into camarcade.players (name, name_key, pass_hash, born, created_net, last_net, profile)
  values (p_name, lower(p_name), extensions.crypt(p_pass, extensions.gen_salt('bf', 8)), v_born, p_net, p_net,
          camarcade.clean_profile(p_profile))
  returning id into v_id;
  insert into camarcade.signups (net) values (p_net);
  return jsonb_build_object('token', camarcade.new_session(v_id), 'me', camarcade.me_json(v_id));
exception when unique_violation then
  raise exception 'name_taken';
end $$;

-- (Returns {error} instead of raising one, so that the failed try is still written down.)
create or replace function camarcade.log_in(p_name text, p_pass text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  k text := lower(coalesce(p_name, ''));
  p camarcade.players;
begin
  delete from camarcade.login_fails where at < now() - interval '1 day';
  if (select count(*) from camarcade.login_fails where name_key = k and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('error', 'too_many_tries');
  end if;
  select * into p from camarcade.players where name_key = k;
  if not found then return jsonb_build_object('error', 'no_such_name'); end if;
  if p.pass_hash <> extensions.crypt(coalesce(p_pass, ''), p.pass_hash) then
    insert into camarcade.login_fails (name_key) values (k);
    return jsonb_build_object('error', 'wrong_password');
  end if;
  return jsonb_build_object('token', camarcade.new_session(p.id), 'me', camarcade.me_json(p.id));
end $$;

/* ================= MATCHMAKING ================= */
-- Searching players poll every second or two. Each poll either hands over a match that someone else made with us,
-- or pairs us with the longest-waiting player who fits, or leaves us waiting. There's no limit on how many search at once.

create or replace function camarcade.pair_ranked(a bigint, b bigint) returns int
language sql stable set search_path = '' as $$
  select count(*)::int from camarcade.games g join camarcade.matches m on m.id = g.match_id
  where g.ranked and g.resolved_at > now() - interval '24 hours'
    and ((m.host = a and m.guest = b) or (m.host = b and m.guest = a))
$$;

create or replace function camarcade.match_json(p_match bigint, p_viewer bigint) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  m camarcade.matches;
  o camarcade.players;
  is_host boolean;
begin
  select * into m from camarcade.matches where id = p_match;
  is_host := m.host = p_viewer;
  select * into o from camarcade.players where id = case when is_host then m.guest else m.host end;
  return jsonb_build_object(
    'id', m.id, 'role', case when is_host then 'host' else 'guest' end,
    'opp', jsonb_build_object('id', o.id, 'name', o.name, 'streak', o.streak, 'best', o.best),
    'opp_peer', case when is_host then m.guest_peer else m.host_peer end,
    'cats_only', m.cats_only, 'same_net', m.same_net,
    'ranked_left', case when m.same_net then 0 else greatest(0, camarcade.pair_limit() - camarcade.pair_ranked(m.host, m.guest)) end);
end $$;

create or replace function camarcade.poll(p_me bigint, p_peer text, p_avoid bigint, p_net text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  me camarcade.players;
  mine camarcade.queue;
  cand camarcade.queue;
  m camarcade.matches;
begin
  select * into me from camarcade.players where id = p_me;
  if me.banned_until > now() then
    delete from camarcade.queue where player_id = p_me;
    return jsonb_build_object('banned', true, 'until', me.banned_until, 'reason', me.ban_reason);
  end if;
  if p_peer is null or p_peer !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'bad_peer'; end if;
  perform camarcade.resolve_stale(p_me);

  -- Did someone pick us since we last asked?
  select * into mine from camarcade.queue where player_id = p_me for update;
  if found and mine.match_id is not null then
    select * into m from camarcade.matches where id = mine.match_id and status = 'open';
    delete from camarcade.queue where player_id = p_me;
    if m.id is not null then
      return jsonb_build_object('match', camarcade.match_json(m.id, p_me));
    end if;
  end if;

  insert into camarcade.queue as q (player_id, peer_id, net, adult, avoid_id)
  values (p_me, p_peer, p_net, me.born + interval '18 years' <= current_date, p_avoid)
  on conflict (player_id) do update
    set peer_id = excluded.peer_id, net = excluded.net, avoid_id = excluded.avoid_id, seen_at = now(), match_id = null
  returning * into mine;

  -- Someone on a different internet connection first, then whoever has waited longest.
  select q.* into cand
  from camarcade.queue q
  join camarcade.players o on o.id = q.player_id
  where q.player_id <> p_me
    and q.match_id is null
    and q.seen_at > now() - interval '8 seconds'
    and not coalesce(o.banned_until > now(), false)
    and not exists (select 1 from camarcade.blocks b
                    where (b.blocker = p_me and b.blocked = q.player_id) or (b.blocker = q.player_id and b.blocked = p_me))
    and not exists (select 1 from camarcade.matches f
                    where f.status = 'failed' and f.created_at > now() - interval '2 minutes'
                      and ((f.host = p_me and f.guest = q.player_id) or (f.host = q.player_id and f.guest = p_me)))
    and ((q.player_id is distinct from mine.avoid_id and q.avoid_id is distinct from p_me)
         or least(mine.joined_at, q.joined_at) < now() - interval '20 seconds')
  order by (q.net = p_net), q.joined_at
  limit 1
  for update of q skip locked;

  if cand.player_id is null then
    return jsonb_build_object('waiting', true,
      'online', (select count(*) from camarcade.players where last_seen > now() - interval '2 minutes'));
  end if;

  insert into camarcade.matches (host, guest, host_peer, guest_peer, same_net, cats_only)
  values (cand.player_id, p_me, cand.peer_id, p_peer, cand.net = p_net, not (cand.adult and mine.adult))
  returning * into m;
  update camarcade.queue set match_id = m.id where player_id = cand.player_id;
  delete from camarcade.queue where player_id = p_me;
  return jsonb_build_object('match', camarcade.match_json(m.id, p_me));
end $$;

create or replace function camarcade.leave(p_me bigint) returns void
language plpgsql set search_path = '' as $$
declare q camarcade.queue;
begin
  delete from camarcade.queue where player_id = p_me returning * into q;
  if q.match_id is not null then
    update camarcade.matches set status = 'failed'
    where id = q.match_id and status = 'open' and not exists (select 1 from camarcade.games g where g.match_id = q.match_id);
  end if;
end $$;

-- Their browsers couldn't connect: call the match off (and don't pair those two again for a couple of minutes).
create or replace function camarcade.fail(p_me bigint, p_match bigint) returns void
language plpgsql set search_path = '' as $$
begin
  update camarcade.matches set status = 'failed'
  where id = p_match and (host = p_me or guest = p_me) and status = 'open'
    and not exists (select 1 from camarcade.games g where g.match_id = p_match);
  update camarcade.queue set match_id = null where match_id = p_match;
end $$;

/* ================= RESULTS ================= */
-- Both players report every game. The server settles it:
--   they agree           → it counts.
--   they disagree        → "disputed": nobody's streak goes up, and 3 disputes during one streak end that streak.
--   only one reported    → after a minute, it goes by that report (the other player left). A win claimed in the
--                          first 12 seconds of a game counts for nothing.
-- It only changes streaks when the two players are on different internet connections, and only for the first
-- 3 games between the same two players each day.

-- The prize week: it starts on Monday at midnight, US Central time.
create or replace function camarcade.week_now() returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', now() at time zone 'America/Chicago')::date
$$;

-- A new week since this player last played: last week's best moves to prev_week_*, and this week starts from 0.
create or replace function camarcade.roll_week(p bigint) returns void
language sql set search_path = '' as $$
  update camarcade.players
  set prev_week_start = week_start, prev_week_best = week_best, prev_week_best_at = week_best_at,
      week_start = camarcade.week_now(), week_streak = 0, week_best = 0, week_best_at = null
  where id = p and week_start is distinct from camarcade.week_now()
$$;

create or replace function camarcade.add_win(p bigint) returns void
language sql set search_path = '' as $$
  select camarcade.roll_week(p);
  update camarcade.players
  set streak = streak + 1, wins = wins + 1, best = greatest(best, streak + 1),
      best_at = case when streak + 1 > best then now() else best_at end,
      week_streak = week_streak + 1, week_best = greatest(week_best, week_streak + 1),
      week_best_at = case when week_streak + 1 > week_best then now() else week_best_at end
  where id = p
$$;

create or replace function camarcade.add_loss(p bigint) returns void
language sql set search_path = '' as $$
  select camarcade.roll_week(p);
  update camarcade.players set streak = 0, streak_disputes = 0, week_streak = 0, losses = losses + 1 where id = p
$$;

create or replace function camarcade.add_dispute(p bigint) returns void
language sql set search_path = '' as $$
  select camarcade.roll_week(p);
  update camarcade.players
  set disputes = disputes + 1,
      streak = case when streak_disputes + 1 >= 3 then 0 else streak end,
      week_streak = case when streak_disputes + 1 >= 3 then 0 else week_streak end,
      streak_disputes = case when streak_disputes + 1 >= 3 then 0 else streak_disputes + 1 end
  where id = p
$$;

create or replace function camarcade.resolve(p_match bigint, p_no int, p_single boolean) returns void
language plpgsql set search_path = '' as $$
declare
  g camarcade.games;
  m camarcade.matches;
  v_res text;
  v_ranked boolean := false;
  v_why text := null;
begin
  select * into m from camarcade.matches where id = p_match;
  select * into g from camarcade.games where match_id = p_match and game_no = p_no;
  if g.resolved_at is not null then return; end if;

  if not p_single then
    v_res := case
      when g.host_report = 'win' and g.guest_report = 'lose' then 'host'
      when g.host_report = 'lose' and g.guest_report = 'win' then 'guest'
      when g.host_report = 'draw' and g.guest_report = 'draw' then 'draw'
      else 'disputed' end;
  elsif coalesce(g.host_report, g.guest_report) = 'draw' then
    v_res := 'draw';
  elsif g.host_report = 'win' or g.guest_report = 'lose' then
    v_res := 'host';
  else
    v_res := 'guest';
  end if;
  if p_single and (g.host_report = 'win' or g.guest_report = 'win')
     and coalesce(g.host_at, g.guest_at) < g.started_at + interval '12 seconds' then
    v_res := 'void';
  end if;

  -- (Lock both players in id order, so two games settling at once can't deadlock.)
  perform 1 from camarcade.players where id in (m.host, m.guest) order by id for update;

  if v_res = 'void' then v_why := 'void';
  elsif m.same_net then v_why := 'same_net';
  elsif camarcade.pair_ranked(m.host, m.guest) >= camarcade.pair_limit() then v_why := 'pair_limit';
  elsif exists (select 1 from camarcade.players where id in (m.host, m.guest) and banned_until > now()) then v_why := 'banned';
  else v_ranked := true;
  end if;

  if v_ranked then
    if v_res = 'host' then perform camarcade.add_win(m.host); perform camarcade.add_loss(m.guest);
    elsif v_res = 'guest' then perform camarcade.add_win(m.guest); perform camarcade.add_loss(m.host);
    elsif v_res = 'draw' then update camarcade.players set draws = draws + 1 where id in (m.host, m.guest);
    else perform camarcade.add_dispute(m.host); perform camarcade.add_dispute(m.guest);
    end if;
  elsif v_res <> 'void' then
    update camarcade.players set friendly = friendly + 1 where id in (m.host, m.guest);
  end if;

  update camarcade.games set result = v_res, ranked = v_ranked, note = v_why, resolved_at = now()
  where match_id = p_match and game_no = p_no;
end $$;

-- Settle games where only one player reported, a minute ago or more. (p_player null: anyone's, a few at a time.)
create or replace function camarcade.resolve_stale(p_player bigint) returns void
language plpgsql set search_path = '' as $$
declare g camarcade.games;
begin
  for g in
    select gg.* from camarcade.games gg join camarcade.matches mm on mm.id = gg.match_id
    where gg.resolved_at is null
      and coalesce(gg.host_at, gg.guest_at) < now() - interval '60 seconds'
      and (p_player is null or mm.host = p_player or mm.guest = p_player)
    order by coalesce(gg.host_at, gg.guest_at)
    limit 50
    for update of gg skip locked
  loop
    perform camarcade.resolve(g.match_id, g.game_no, true);
  end loop;
end $$;

create or replace function camarcade.report_json(p_match bigint, p_no int, p_viewer bigint) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  g camarcade.games;
  m camarcade.matches;
  is_host boolean;
begin
  select * into m from camarcade.matches where id = p_match;
  select * into g from camarcade.games where match_id = p_match and game_no = p_no;
  is_host := m.host = p_viewer;
  return jsonb_build_object(
    'status', case when g.resolved_at is null then 'pending' else 'done' end,
    'result', case
      when g.resolved_at is null then null
      when g.result in ('draw', 'disputed', 'void') then g.result
      when (g.result = 'host') = is_host then 'win'
      else 'lose' end,
    'ranked', g.ranked, 'why', g.note, 'me', camarcade.me_json(p_viewer));
end $$;

create or replace function camarcade.report(p_me bigint, p_match bigint, p_no int, p_game text, p_outcome text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  m camarcade.matches;
  g camarcade.games;
  prev camarcade.games;
  is_host boolean;
begin
  if p_outcome is null or p_outcome not in ('win', 'lose', 'draw') then raise exception 'bad_outcome'; end if;
  select * into m from camarcade.matches where id = p_match for update; -- (one report at a time per match)
  if not found or (m.host <> p_me and m.guest <> p_me) then raise exception 'no_such_match'; end if;
  if m.status <> 'open' or m.created_at < now() - interval '12 hours' then raise exception 'match_closed'; end if;
  is_host := m.host = p_me;

  select * into g from camarcade.games where match_id = p_match and game_no = p_no;
  if not found then
    -- A new game has to be the next one. If the one before it is still waiting for a report, it's called off.
    select * into prev from camarcade.games where match_id = p_match order by game_no desc limit 1;
    if p_no is distinct from coalesce(prev.game_no, 0) + 1 then raise exception 'bad_game_no'; end if;
    if prev.game_no is not null and prev.resolved_at is null then
      update camarcade.games set result = 'void', ranked = false, note = 'void', resolved_at = now()
      where match_id = p_match and game_no = prev.game_no;
      prev.resolved_at := now();
    end if;
    insert into camarcade.games (match_id, game_no, game, started_at)
    values (p_match, p_no, left(p_game, 20), coalesce(prev.resolved_at, m.created_at))
    returning * into g;
  end if;
  if g.resolved_at is not null then return camarcade.report_json(p_match, p_no, p_me); end if;

  if is_host and g.host_report is null then
    update camarcade.games set host_report = p_outcome, host_at = now() where match_id = p_match and game_no = p_no returning * into g;
  elsif not is_host and g.guest_report is null then
    update camarcade.games set guest_report = p_outcome, guest_at = now() where match_id = p_match and game_no = p_no returning * into g;
  end if;
  if g.host_report is not null and g.guest_report is not null then
    perform camarcade.resolve(p_match, p_no, false);
  end if;
  return camarcade.report_json(p_match, p_no, p_me);
end $$;

/* ================= SAFETY ================= */

create or replace function camarcade.block(p_me bigint, p_other bigint) returns void
language plpgsql set search_path = '' as $$
begin
  if p_other is null or p_other = p_me or not exists (select 1 from camarcade.players where id = p_other) then
    raise exception 'no_such_player';
  end if;
  insert into camarcade.blocks (blocker, blocked) values (p_me, p_other) on conflict do nothing;
end $$;

-- Reports must be about someone you were matched with. Reporting also blocks them.
-- When 3 different players report the same person within a day, that person sits out Classic Games for a day.
create or replace function camarcade.report_player(p_me bigint, p_match bigint, p_reason text, p_note text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  m camarcade.matches;
  v_other bigint;
begin
  if p_reason is null or p_reason not in ('nudity', 'young', 'hate', 'cheating', 'other') then raise exception 'bad_reason'; end if;
  select * into m from camarcade.matches where id = p_match and (host = p_me or guest = p_me);
  if not found then raise exception 'no_such_match'; end if;
  v_other := case when m.host = p_me then m.guest else m.host end;
  insert into camarcade.blocks (blocker, blocked) values (p_me, v_other) on conflict do nothing;
  if exists (select 1 from camarcade.reports where reporter = p_me and match_id = p_match) then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from camarcade.reports where reporter = p_me and at > now() - interval '24 hours') >= 20 then
    raise exception 'too_many_reports';
  end if;
  insert into camarcade.reports (reporter, reported, reported_name, match_id, reason, note)
  values (p_me, v_other, (select name from camarcade.players where id = v_other), p_match, p_reason, left(p_note, 500));
  if (select count(distinct reporter) from camarcade.reports where reported = v_other and at > now() - interval '24 hours') >= 3 then
    update camarcade.players
    set banned_until = greatest(coalesce(banned_until, now()), now() + interval '24 hours'),
        ban_reason = coalesce(ban_reason, 'reports')
    where id = v_other;
    delete from camarcade.queue where player_id = v_other;
  end if;
  return jsonb_build_object('ok', true);
end $$;

/* ================= LEADERBOARD + STATS ================= */

create or replace function camarcade.leaderboard(p_viewer bigint) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_best jsonb;
  v_hot jsonb;
  v_week jsonb;
  v_last jsonb;
  v_me jsonb := null;
  p camarcade.players;
begin
  perform camarcade.resolve_stale(null);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank), '[]'::jsonb) into v_best from (
    select row_number() over (order by pl.best desc, pl.best_at nulls last, pl.id) as rank,
           pl.id, pl.name, pl.best, pl.streak, pl.wins, pl.profile->'equip' as equip
    from camarcade.players pl
    where pl.best > 0 and not coalesce(pl.banned_until > now(), false)
    order by pl.best desc, pl.best_at nulls last, pl.id
    limit 50) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank), '[]'::jsonb) into v_hot from (
    select row_number() over (order by pl.streak desc, pl.best desc, pl.id) as rank,
           pl.id, pl.name, pl.best, pl.streak, pl.wins, pl.profile->'equip' as equip
    from camarcade.players pl
    where pl.streak > 0 and not coalesce(pl.banned_until > now(), false)
    order by pl.streak desc, pl.best desc, pl.id
    limit 50) x;
  -- this week's prize race: adults only (the prize is for 18+), and only wins played this week
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank), '[]'::jsonb) into v_week from (
    select row_number() over (order by pl.week_best desc, pl.week_best_at nulls last, pl.id) as rank,
           pl.id, pl.name, pl.week_best, pl.week_streak, pl.best, pl.streak, pl.wins, pl.profile->'equip' as equip
    from camarcade.players pl
    where pl.week_start = camarcade.week_now() and pl.week_best > 0 and pl.born + interval '18 years' <= current_date
      and not coalesce(pl.banned_until > now(), false)
    order by pl.week_best desc, pl.week_best_at nulls last, pl.id
    limit 50) x;
  -- last week's final top 3 (the winner is the first one who checks out)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank), '[]'::jsonb) into v_last from (
    select row_number() over (order by y.streak desc, y.reached_at nulls last, y.id) as rank, y.name, y.streak from (
      select pl.id, pl.name,
             case when pl.week_start = camarcade.week_now() - 7 then pl.week_best else pl.prev_week_best end as streak,
             case when pl.week_start = camarcade.week_now() - 7 then pl.week_best_at else pl.prev_week_best_at end as reached_at
      from camarcade.players pl
      where (pl.week_start = camarcade.week_now() - 7 or pl.prev_week_start = camarcade.week_now() - 7)
        and pl.born + interval '18 years' <= current_date and not coalesce(pl.banned_until > now(), false)) y
    where y.streak > 0
    order by y.streak desc, y.reached_at nulls last, y.id
    limit 3) x;
  if p_viewer is not null then
    select * into p from camarcade.players where id = p_viewer;
    v_me := jsonb_build_object(
      'best', p.best, 'streak', p.streak, 'adult', p.born + interval '18 years' <= current_date,
      'week_best', case when p.week_start = camarcade.week_now() then p.week_best else 0 end,
      'week_rank', case when p.week_start = camarcade.week_now() and p.week_best > 0 and p.born + interval '18 years' <= current_date
        then 1 + (select count(*) from camarcade.players o
          where o.week_start = camarcade.week_now() and o.born + interval '18 years' <= current_date and not coalesce(o.banned_until > now(), false)
            and (o.week_best > p.week_best or (o.week_best = p.week_best and (o.week_best_at < p.week_best_at
              or (o.week_best_at = p.week_best_at and o.id < p.id))))) end,
      'best_rank', case when p.best > 0 then 1 + (select count(*) from camarcade.players o
        where not coalesce(o.banned_until > now(), false)
          and (o.best > p.best or (o.best = p.best and (o.best_at < p.best_at or (o.best_at = p.best_at and o.id < p.id))))) end,
      'streak_rank', case when p.streak > 0 then 1 + (select count(*) from camarcade.players o
        where not coalesce(o.banned_until > now(), false)
          and (o.streak > p.streak or (o.streak = p.streak and (o.best > p.best or (o.best = p.best and o.id < p.id))))) end);
  end if;
  return jsonb_build_object('best', v_best, 'hot', v_hot, 'week', v_week, 'last_week', v_last, 'me', v_me, 'prize', camarcade.prize_json(),
    'week_ends', ((camarcade.week_now() + 7)::timestamp at time zone 'America/Chicago'));
end $$;

create or replace function camarcade.stats() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'online', (select count(*) from camarcade.players where last_seen > now() - interval '2 minutes'),
    'prize', camarcade.prize_json(),
    'searching', (select count(*) from camarcade.queue where match_id is null and seen_at > now() - interval '8 seconds'),
    'players', (select count(*) from camarcade.players),
    'visitors_today', (select count(*) from camarcade.visits where day = current_date),
    'visitors_week', (select count(distinct visitor) from camarcade.visits where day > current_date - 7),
    'visitors_total', (select count(distinct visitor) from camarcade.visits),
    'networks_total', (select count(distinct net) from camarcade.visits),
    'games_today', (select count(*) from camarcade.games where resolved_at >= current_date and result <> 'void'),
    'games_total', (select count(*) from camarcade.games where resolved_at is not null and result <> 'void'),
    'since', (select min(day) from camarcade.visits),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'games', d.games) order by d.day desc), '[]'::jsonb)
             from (select v.day, count(*) as visitors,
                          (select count(*) from camarcade.games g
                           where g.resolved_at >= v.day and g.resolved_at < v.day + 1 and g.result <> 'void') as games
                   from camarcade.visits v where v.day > current_date - 14 group by v.day) d))
$$;

/* ================= THE WEBSITE'S FUNCTIONS ================= */
-- These are the only things the website (anyone on the internet) can call.

create or replace function public.ca_sign_up(p_name text, p_pass text, p_year int, p_month int, p_profile jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select camarcade.sign_up(p_name, p_pass, p_year, p_month, p_profile, camarcade.net())
$$;

create or replace function public.ca_log_in(p_name text, p_pass text) returns jsonb
language sql security definer set search_path = '' as $$
  select camarcade.log_in(p_name, p_pass)
$$;

create or replace function public.ca_log_out(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from camarcade.sessions where token_hash = camarcade.sha(coalesce(p_token, ''))
$$;

-- Your account (also keeps you counted as online).
create or replace function public.ca_me(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return camarcade.me_json(camarcade.auth(p_token));
end $$;

create or replace function public.ca_save_profile(p_token text, p_profile jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id bigint := camarcade.auth(p_token);
begin
  update camarcade.players set profile = camarcade.clean_profile(p_profile) where id = v_id;
end $$;

create or replace function public.ca_delete_account(p_token text, p_pass text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := camarcade.auth(p_token);
  p camarcade.players;
begin
  select * into p from camarcade.players where id = v_id;
  if p.pass_hash <> extensions.crypt(coalesce(p_pass, ''), p.pass_hash) then
    return jsonb_build_object('error', 'wrong_password');
  end if;
  delete from camarcade.players where id = v_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ca_mm_poll(p_token text, p_peer text, p_avoid bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return camarcade.poll(camarcade.auth(p_token), p_peer, p_avoid, camarcade.net());
end $$;

create or replace function public.ca_mm_leave(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform camarcade.leave(camarcade.auth(p_token));
end $$;

create or replace function public.ca_mm_fail(p_token text, p_match bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform camarcade.fail(camarcade.auth(p_token), p_match);
end $$;

create or replace function public.ca_report(p_token text, p_match bigint, p_game_no int, p_game text, p_outcome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return camarcade.report(camarcade.auth(p_token), p_match, p_game_no, p_game, p_outcome);
end $$;

create or replace function public.ca_block(p_token text, p_player bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform camarcade.block(camarcade.auth(p_token), p_player);
end $$;

create or replace function public.ca_report_player(p_token text, p_match bigint, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return camarcade.report_player(camarcade.auth(p_token), p_match, p_reason, p_note);
end $$;

create or replace function public.ca_leaderboard(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return camarcade.leaderboard(case when p_token is null then null else camarcade.auth(p_token) end);
end $$;

create or replace function public.ca_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select camarcade.stats()
$$;

create or replace function public.ca_visit(p_visitor text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_visitor is null or p_visitor !~ '^[a-z0-9]{6,32}$' then return; end if;
  insert into camarcade.visits (day, visitor, net) values (current_date, p_visitor, camarcade.net()) on conflict do nothing;
end $$;

-- For the test script: which internet-connection id the server sees, worked out from each header it could use.
-- (Only scrambled ids come back, never an IP address.)
create or replace function public.ca_net_check() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  salt text := (select net_salt from camarcade.settings);
begin
  return jsonb_build_object(
    'net', camarcade.net(),
    'sb', case when h ? 'sb-forwarded-for' then left(camarcade.sha((h->>'sb-forwarded-for') || ':' || salt), 24) end,
    'cf', case when h ? 'cf-connecting-ip' then left(camarcade.sha((h->>'cf-connecting-ip') || ':' || salt), 24) end,
    'real', case when h ? 'x-real-ip' then left(camarcade.sha((h->>'x-real-ip') || ':' || salt), 24) end,
    'xff', (select jsonb_agg(left(camarcade.sha(trim(x) || ':' || salt), 24)) from unnest(string_to_array(h->>'x-forwarded-for', ',')) x),
    'headers', (select jsonb_agg(k order by k) from jsonb_object_keys(h) k));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'ca_sign_up(text, text, int, int, jsonb)', 'ca_log_in(text, text)', 'ca_log_out(text)', 'ca_me(text)',
    'ca_save_profile(text, jsonb)', 'ca_delete_account(text, text)', 'ca_mm_poll(text, text, bigint)',
    'ca_mm_leave(text)', 'ca_mm_fail(text, bigint)', 'ca_report(text, bigint, int, text, text)', 'ca_block(text, bigint)',
    'ca_report_player(text, bigint, text, text)', 'ca_leaderboard(text)', 'ca_stats()', 'ca_visit(text)', 'ca_net_check()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;

/* ================= SELF-TEST ================= */
-- Run it in the SQL Editor with:   select camarcade.self_test();
-- It plays out sign-ups, matchmaking for 40 players at once, results, disputes, cheating attempts, blocks and reports
-- with made-up players, checks every rule, and then throws all of it away: nothing it does is kept.

create or replace function camarcade.t(ok boolean, label text) returns text
language plpgsql set search_path = '' as $$
begin
  if ok is not true then raise exception 'FAILED: %', label; end if;
  return '✓ ' || label || E'\n';
end $$;

-- Runs a statement and returns the error it raised ('no error' if it didn't).
create or replace function camarcade.t_err(q text) returns text
language plpgsql set search_path = '' as $$
begin
  execute q;
  return 'no error';
exception when others then
  return sqlerrm;
end $$;

create or replace function camarcade.t_player(p_tag text, p_adult boolean, p_net text) returns bigint
language plpgsql set search_path = '' as $$
declare j jsonb;
begin
  j := camarcade.sign_up('t' || p_tag || substr(md5(random()::text), 1, 6), 'secret',
                         case when p_adult then 1990 else extract(year from current_date)::int - 15 end, 1, '{}'::jsonb, p_net);
  return (j->'me'->>'id')::bigint;
end $$;

-- Player a waits, player b searches and gets paired with a. Returns the match id.
create or replace function camarcade.t_match(a bigint, b bigint, na text, nb text) returns bigint
language plpgsql set search_path = '' as $$
declare j jsonb;
begin
  delete from camarcade.queue;
  perform camarcade.poll(a, 'peer-a-' || a, null, na);
  j := camarcade.poll(b, 'peer-b-' || b, null, nb);
  return (j->'match'->>'id')::bigint;
end $$;

create or replace function camarcade.self_test() returns text
language plpgsql set search_path = '' as $$
declare
  v_log text := '';
  j jsonb;
  k jsonb;
  e text;
  a bigint; b bigint; c bigint; d bigint; x bigint; y bigint; w bigint;
  teen bigint;
  m bigint;
  i int;
  ids bigint[] := '{}';
  n int;
  tok text;
begin
  begin
    -- ---------- accounts ----------
    a := camarcade.t_player('a', true, 'netA');
    b := camarcade.t_player('b', true, 'netB');
    teen := camarcade.t_player('teen', false, 'netT');
    v_log := v_log || camarcade.t(a is not null and b is not null, 'sign up works');
    v_log := v_log || camarcade.t((camarcade.me_json(a)->>'adult')::boolean, 'someone born in 1990 is an adult');
    v_log := v_log || camarcade.t(not (camarcade.me_json(teen)->>'adult')::boolean, 'a 15-year-old is not an adult');
    e := camarcade.t_err(format('select camarcade.sign_up(%L, %L, %s, 1, null, %L)',
      'tkid' || substr(md5(random()::text), 1, 6), 'secret', extract(year from current_date)::int - 10, 'netK'));
    v_log := v_log || camarcade.t(e = 'too_young', 'a 10-year-old cannot sign up');
    e := camarcade.t_err(format('select camarcade.sign_up(%L, %L, 1990, 1, null, %L)',
      upper((select name from camarcade.players where id = a)), 'secret', 'netA'));
    v_log := v_log || camarcade.t(e = 'name_taken', 'names are unique, ignoring capital letters');
    e := camarcade.t_err(format('select camarcade.sign_up(%L, %L, 1990, 1, null, %L)', 'no spaces!', 'secret', 'netA'));
    v_log := v_log || camarcade.t(e = 'bad_name', 'bad usernames are refused');
    j := camarcade.log_in((select name from camarcade.players where id = a), 'wrong');
    v_log := v_log || camarcade.t(j->>'error' = 'wrong_password', 'a wrong password is refused');
    j := camarcade.log_in((select name from camarcade.players where id = a), 'secret');
    tok := j->>'token';
    v_log := v_log || camarcade.t(camarcade.auth(tok) = a, 'logging in gives a token that works');
    e := camarcade.t_err(format('select camarcade.auth(%L)', repeat('0', 64)));
    v_log := v_log || camarcade.t(e = 'not_logged_in', 'a made-up token is refused');
    update camarcade.players set profile = camarcade.clean_profile('{"fish": 5, "streak": 999, "best": 999, "wins": 999}') where id = a;
    j := camarcade.me_json(a);
    v_log := v_log || camarcade.t((j->>'streak')::int = 0 and (j->>'best')::int = 0 and (j->'profile'->>'fish')::int = 5
      and not (j->'profile' ? 'streak'), 'a saved profile cannot change the streak');
    e := camarcade.t_err(format('select camarcade.clean_profile(%L::jsonb)', jsonb_build_object('fish', repeat('9', 30000))));
    v_log := v_log || camarcade.t(e = 'profile_too_big', 'huge profiles are refused');

    -- ---------- matchmaking: 40 players at once, no limit ----------
    delete from camarcade.queue;
    for i in 1..40 loop
      ids := ids || camarcade.t_player('q' || i, true, 'netQ' || i);
    end loop;
    for i in 1..40 loop
      perform camarcade.poll(ids[i], 'peer-q-' || i || '-xyz', null, 'netQ' || i);
    end loop;
    select count(*) into n from camarcade.matches where host = any(ids) and guest = any(ids);
    v_log := v_log || camarcade.t(n = 20, '40 players searching at once make 20 matches (was capped at 10 players)');
    select count(*) into n from (select unnest(array[host, guest]) p from camarcade.matches where host = any(ids)) s;
    v_log := v_log || camarcade.t(n = 40, 'every one of the 40 players is in exactly one match');
    j := camarcade.poll(ids[1], 'peer-q-1-xyz', null, 'netQ1');
    v_log := v_log || camarcade.t(j ? 'match' and j->'match'->>'role' = 'host' and j->'match'->>'opp_peer' = 'peer-q-2-xyz',
      'the waiting player picks up their match and the other player''s connection id');
    v_log := v_log || camarcade.t(not exists (select 1 from camarcade.queue where player_id = ids[1]), 'a matched player leaves the queue');

    -- ---------- matchmaking rules ----------
    x := camarcade.t_player('x', true, 'netZ');
    y := camarcade.t_player('y', true, 'netZ');
    w := camarcade.t_player('w', true, 'netW');
    delete from camarcade.queue;
    insert into camarcade.queue (player_id, peer_id, net, adult, joined_at) values (x, 'peer-x-12345', 'netZ', true, now() - interval '10 seconds');
    insert into camarcade.queue (player_id, peer_id, net, adult) values (w, 'peer-w-12345', 'netW', true);
    j := camarcade.poll(y, 'peer-y-12345', null, 'netZ');
    v_log := v_log || camarcade.t((j->'match'->'opp'->>'id')::bigint = w,
      'someone on a different internet connection is picked first, even if a same-house player waited longer');
    j := camarcade.poll(x, 'peer-x-12345', null, 'netZ');
    v_log := v_log || camarcade.t(j ? 'waiting', 'nobody else fits: you keep waiting');

    delete from camarcade.queue;
    insert into camarcade.queue (player_id, peer_id, net, adult, joined_at) values (x, 'peer-x-12345', 'netZ', true, now() - interval '2 seconds');
    insert into camarcade.queue (player_id, peer_id, net, adult, seen_at) values (w, 'peer-w-12345', 'netW', true, now() - interval '30 seconds');
    j := camarcade.poll(y, 'peer-y-12345', null, 'netZ');
    v_log := v_log || camarcade.t((j->'match'->'opp'->>'id')::bigint = x and (j->'match'->>'same_net')::boolean
      and (j->'match'->>'ranked_left')::int = 0,
      'players who closed the page are skipped; two players in the same house can play, but it won''t count');

    perform camarcade.block(a, b);
    delete from camarcade.queue;
    perform camarcade.poll(a, 'peer-a-12345', null, 'netA');
    j := camarcade.poll(b, 'peer-b-12345', null, 'netB');
    v_log := v_log || camarcade.t(j ? 'waiting', 'blocked players are never matched');
    delete from camarcade.blocks where blocker = a;

    delete from camarcade.queue;
    insert into camarcade.queue (player_id, peer_id, net, adult, avoid_id) values (a, 'peer-a-12345', 'netA', true, b);
    j := camarcade.poll(b, 'peer-b-12345', a, 'netB');
    v_log := v_log || camarcade.t(j ? 'waiting', 'you don''t get the player you just left again right away');
    update camarcade.queue set joined_at = now() - interval '25 seconds';
    j := camarcade.poll(b, 'peer-b-12345', a, 'netB');
    v_log := v_log || camarcade.t(j ? 'match', '...unless nobody else turns up for 20 seconds');

    m := camarcade.t_match(a, teen, 'netA', 'netT');
    v_log := v_log || camarcade.t((camarcade.match_json(m, a)->>'cats_only')::boolean, 'an adult and a teen get a cats-only match');
    m := camarcade.t_match(a, b, 'netA', 'netB');
    v_log := v_log || camarcade.t(not (camarcade.match_json(m, a)->>'cats_only')::boolean, 'two adults can use cameras');
    perform camarcade.fail(b, m);
    delete from camarcade.queue;
    perform camarcade.poll(a, 'peer-a-12345', null, 'netA');
    j := camarcade.poll(b, 'peer-b-12345', null, 'netB');
    v_log := v_log || camarcade.t(j ? 'waiting', 'two players whose browsers couldn''t connect aren''t paired again right away');

    -- ---------- results ----------
    c := camarcade.t_player('c', true, 'netC');
    d := camarcade.t_player('d', true, 'netD');
    m := camarcade.t_match(c, d, 'netC', 'netD');
    j := camarcade.report(c, m, 1, 'rps', 'win');
    v_log := v_log || camarcade.t(j->>'status' = 'pending', 'one report waits for the other player');
    j := camarcade.report(d, m, 1, 'rps', 'lose');
    v_log := v_log || camarcade.t(j->>'status' = 'done' and j->>'result' = 'lose' and (j->>'ranked')::boolean, 'both agree: it counts');
    v_log := v_log || camarcade.t((camarcade.me_json(c)->>'streak')::int = 1 and (camarcade.me_json(d)->>'streak')::int = 0,
      'the winner''s streak goes up');
    e := camarcade.t_err(format('select camarcade.report(%s, %s, 5, %L, %L)', c, m, 'rps', 'win'));
    v_log := v_log || camarcade.t(e = 'bad_game_no', 'you can''t skip ahead to report extra games');
    e := camarcade.t_err(format('select camarcade.report(%s, %s, 2, %L, %L)', a, m, 'rps', 'win'));
    v_log := v_log || camarcade.t(e = 'no_such_match', 'you can''t report a match you weren''t in');
    perform camarcade.report(c, m, 2, 'rps', 'win');
    perform camarcade.report(d, m, 2, 'rps', 'lose');
    j := camarcade.me_json(c);
    v_log := v_log || camarcade.t((j->>'streak')::int = 2 and (j->>'best')::int = 2, 'a rematch win counts too');
    v_log := v_log || camarcade.t((select week_best from camarcade.players where id = c) = 2
      and (select week_start from camarcade.players where id = c) = camarcade.week_now(), 'wins this week count for the weekly prize streak too');
    perform camarcade.report(c, m, 3, 'rps', 'lose');
    perform camarcade.report(d, m, 3, 'rps', 'win');
    j := camarcade.me_json(c);
    v_log := v_log || camarcade.t((j->>'streak')::int = 0 and (j->>'best')::int = 2, 'a loss resets the streak and keeps the best');
    perform camarcade.report(c, m, 4, 'rps', 'win');
    j := camarcade.report(d, m, 4, 'rps', 'lose');
    v_log := v_log || camarcade.t(not (j->>'ranked')::boolean and j->>'why' = 'pair_limit' and (camarcade.me_json(c)->>'streak')::int = 0,
      'only 3 games a day between the same two players count');

    -- disputes
    x := camarcade.t_player('dp', true, 'netDP');
    y := camarcade.t_player('dq', true, 'netDQ');
    m := camarcade.t_match(x, y, 'netDP', 'netDQ');
    update camarcade.players set streak = 5, best = 5 where id = x;
    perform camarcade.report(x, m, 1, 'rps', 'win');
    j := camarcade.report(y, m, 1, 'rps', 'win');
    v_log := v_log || camarcade.t(j->>'result' = 'disputed' and (camarcade.me_json(x)->>'streak')::int = 5,
      'both claim the win: disputed, and nobody''s streak goes up');
    for i in 1..2 loop
      w := camarcade.t_player('dz' || i, true, 'netDZ' || i);
      m := camarcade.t_match(x, w, 'netDP', 'netDZ' || i);
      perform camarcade.report(x, m, 1, 'rps', 'win');
      perform camarcade.report(w, m, 1, 'rps', 'win');
    end loop;
    v_log := v_log || camarcade.t((camarcade.me_json(x)->>'streak')::int = 0,
      '3 disputed games in one streak end it (lying about losses doesn''t protect a streak)');

    -- one player left
    x := camarcade.t_player('l1', true, 'netL1');
    y := camarcade.t_player('l2', true, 'netL2');
    m := camarcade.t_match(x, y, 'netL1', 'netL2');
    perform camarcade.report(x, m, 1, 'rps', 'win');
    update camarcade.games set host_at = now() - interval '90 seconds', started_at = now() - interval '3 minutes' where match_id = m;
    perform camarcade.resolve_stale(null);
    v_log := v_log || camarcade.t((camarcade.me_json(x)->>'streak')::int = 1 and (camarcade.me_json(y)->>'losses')::int = 1,
      'the other player left without reporting: after a minute, it goes by the one report');
    x := camarcade.t_player('l3', true, 'netL3');
    y := camarcade.t_player('l4', true, 'netL4');
    m := camarcade.t_match(x, y, 'netL3', 'netL4');
    perform camarcade.report(x, m, 1, 'rps', 'win');
    update camarcade.games set host_at = now() - interval '90 seconds', started_at = now() - interval '95 seconds' where match_id = m;
    perform camarcade.resolve_stale(null);
    v_log := v_log || camarcade.t((camarcade.me_json(x)->>'streak')::int = 0
      and (select result from camarcade.games where match_id = m) = 'void',
      'a win claimed in the first seconds of a game, with no report from the other player, doesn''t count');
    m := camarcade.t_match(x, y, 'netL3', 'netL4');
    perform camarcade.report(x, m, 1, 'rps', 'win');
    perform camarcade.report(x, m, 2, 'rps', 'win');
    v_log := v_log || camarcade.t((select result from camarcade.games where match_id = m and game_no = 1) = 'void',
      'reporting game after game alone calls the earlier ones off');

    -- same internet connection
    x := camarcade.t_player('s1', true, 'netS');
    y := camarcade.t_player('s2', true, 'netS');
    m := camarcade.t_match(x, y, 'netS', 'netS');
    perform camarcade.report(x, m, 1, 'rps', 'win');
    j := camarcade.report(y, m, 1, 'rps', 'lose');
    v_log := v_log || camarcade.t(j->>'why' = 'same_net' and (camarcade.me_json(x)->>'streak')::int = 0,
      'beating your own second window (same internet connection) doesn''t count');

    -- ---------- reports + bans ----------
    x := camarcade.t_player('bad', true, 'netBad');
    for i in 1..3 loop
      y := camarcade.t_player('r' || i, true, 'netR' || i);
      m := camarcade.t_match(x, y, 'netBad', 'netR' || i);
      perform camarcade.report_player(y, m, 'nudity', null);
    end loop;
    v_log := v_log || camarcade.t(exists (select 1 from camarcade.blocks where blocker = y and blocked = x), 'reporting someone also blocks them');
    j := camarcade.poll(x, 'peer-bad-12345', null, 'netBad');
    v_log := v_log || camarcade.t((j->>'banned')::boolean, '3 players reporting the same person: they sit out Classic Games');
    e := camarcade.t_err(format('select camarcade.report_player(%s, %s, %L, null)', a, m, 'nudity'));
    v_log := v_log || camarcade.t(e = 'no_such_match', 'you can only report someone you played');
    update camarcade.players set best = 999, streak = 999 where id = x;
    j := camarcade.leaderboard(null);
    v_log := v_log || camarcade.t(not exists (select 1 from jsonb_array_elements(j->'best') r where (r->>'id')::bigint = x),
      'suspended players are left off the leaderboard');

    -- ---------- leaderboard + stats ----------
    update camarcade.players set best = 100000, best_at = now() - interval '1 hour', streak = 3 where id = c;
    update camarcade.players set best = 100000, best_at = now(), streak = 7 where id = d;
    j := camarcade.leaderboard(d);
    v_log := v_log || camarcade.t((j->'best'->0->>'id')::bigint = c and (j->'best'->1->>'id')::bigint = d and (j->'me'->>'best_rank')::int = 2,
      'the leaderboard ranks by best streak, and whoever got there first wins a tie');
    insert into camarcade.visits (visitor, net) values ('testvisitor1', 'netV'), ('testvisitor2', 'netV');
    j := camarcade.stats();
    v_log := v_log || camarcade.t((j->>'visitors_today')::int >= 2 and (j->>'players')::int >= 50, 'visitors and players are counted');

    raise exception using errcode = 'CAOK0', message = 'done';
  exception
    when sqlstate 'CAOK0' then
      v_log := v_log || E'\nALL TESTS PASSED. (Nothing the test did was kept.)';
    when others then
      v_log := v_log || E'\n✗ ' || sqlerrm || E'\n\nSOME TESTS FAILED. (Nothing the test did was kept.)';
  end;
  return v_log;
end $$;

-- So the test script on your computer can run the self-test with the secret key (never with the public one).
create or replace function public.ca_self_test() returns text
language sql security definer set search_path = '' as $$
  select camarcade.self_test()
$$;
revoke all on function public.ca_self_test() from public, anon, authenticated;
grant execute on function public.ca_self_test() to service_role;

/* ================= FOR YOU, IN THE SQL EDITOR ================= */
-- Handy views (only you can see these, in the Supabase dashboard).

create or replace view camarcade.top_players as
select p.name, p.best, p.streak, p.wins, p.losses, p.draws, p.friendly, p.disputes,
       (select count(distinct case when m.host = p.id then m.guest else m.host end)
        from camarcade.games g join camarcade.matches m on m.id = g.match_id
        where g.ranked and (m.host = p.id or m.guest = p.id)) as different_opponents,
       (select count(*) from camarcade.reports r where r.reported = p.id) as times_reported,
       p.created_at, p.last_seen, p.banned_until, p.ban_reason
from camarcade.players p
order by p.best desc, p.best_at
limit 100;

create or replace view camarcade.open_reports as
select r.id, r.at, r.reason, r.reported_name, (select name from camarcade.players where id = r.reporter) as reporter, r.note,
       (select count(*) from camarcade.reports r2 where r2.reported = r.reported) as total_reports_against_them
from camarcade.reports r
where not r.reviewed
order by r.at desc;

create or replace view camarcade.daily as
select v.day, count(*) as visitors, count(distinct v.net) as internet_connections,
       (select count(*) from camarcade.players p where p.created_at::date = v.day) as new_players,
       (select count(*) from camarcade.games g where g.resolved_at::date = v.day and g.result <> 'void') as games
from camarcade.visits v
group by v.day
order by v.day desc;

-- The weekly prize (open these in the Supabase SQL Editor, like: select * from camarcade.prize_last_week;)
-- (The prize is only on once camarcade.settings.prize_from is set: the first time 30 players were online at once.)
-- prize_this_week: the race so far. prize_last_week: last week's final order: the winner is the top player who
-- checks out. Before paying, look at different_opponents (lots of wins against the same one or two players is
-- suspicious) and times_reported.
create or replace view camarcade.prize_this_week as
select p.name, p.week_best as streak, p.week_streak as current_run, p.week_best_at as reached_at,
       (select count(distinct case when m.host = p.id then m.guest else m.host end)
        from camarcade.games g join camarcade.matches m on m.id = g.match_id
        where g.ranked and g.resolved_at >= (camarcade.week_now()::timestamp at time zone 'America/Chicago')
          and (m.host = p.id or m.guest = p.id)) as different_opponents,
       (select count(*) from camarcade.reports r where r.reported = p.id) as times_reported,
       p.created_at, p.banned_until
from camarcade.players p
where p.week_start = camarcade.week_now() and p.week_best > 0 and p.born + interval '18 years' <= current_date
order by p.week_best desc, p.week_best_at, p.id
limit 20;

create or replace view camarcade.prize_last_week as
select x.name, x.streak, x.reached_at,
       (select count(distinct case when m.host = x.id then m.guest else m.host end)
        from camarcade.games g join camarcade.matches m on m.id = g.match_id
        where g.ranked and (m.host = x.id or m.guest = x.id)
          and g.resolved_at >= ((camarcade.week_now() - 7)::timestamp at time zone 'America/Chicago')
          and g.resolved_at < (camarcade.week_now()::timestamp at time zone 'America/Chicago')) as different_opponents,
       (select count(*) from camarcade.reports r where r.reported = x.id) as times_reported,
       x.created_at, x.banned_until
from (select p.id, p.name, p.created_at, p.banned_until,
             case when p.week_start = camarcade.week_now() - 7 then p.week_best else p.prev_week_best end as streak,
             case when p.week_start = camarcade.week_now() - 7 then p.week_best_at else p.prev_week_best_at end as reached_at
      from camarcade.players p
      where (p.week_start = camarcade.week_now() - 7 or p.prev_week_start = camarcade.week_now() - 7)
        and p.born + interval '18 years' <= current_date) x
where x.streak > 0
order by x.streak desc, x.reached_at, x.id
limit 20;
