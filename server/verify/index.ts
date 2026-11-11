// The replay check's checker: a Supabase Edge Function named "verify" (see SETUP.md, "7. The replay check").
//
// After an online Classic Game, each player's app sends its record of the game to the database (ca_game_log), then
// asks this function to check it: { match, game_no }. This fetches the records, loads the game's own code from the
// website (the version that's live now), replays the game with verify-replay.js, and writes down what it found
// (ca_verify_put). A host caught cheating loses their streak and sits out for a while: see THE REPLAY CHECK in
// server/schema.sql. Anyone can ask, any number of times: a game is only judged once.

const SITE = Deno.env.get('CA_SITE') || 'https://thecamarcade.com/';
const DB = Deno.env.get('SUPABASE_URL') || '';
const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(DB + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: SECRET, Authorization: 'Bearer ' + SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(fn + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// The website's files, for the version that's live (kept for a minute, and until the version changes).
const site = { ver: '', at: 0, files: new Map<string, string>(), replay: '' };
async function liveVersion() {
  if (Date.now() - site.at < 60000 && site.ver) return site.ver;
  const html = await (await fetch(SITE + '?nc=' + Date.now())).text();
  const m = /games-duel\.js\?v=(\d+)/.exec(html);
  const ver = m ? m[1] : '';
  if (ver !== site.ver) { site.files = new Map(); site.replay = ''; }
  site.ver = ver;
  site.at = Date.now();
  return ver;
}
async function file(name: string, ver: string) {
  if (!site.files.has(name)) {
    const r = await fetch(SITE + name + '?v=' + ver);
    if (!r.ok) throw new Error(name + ': ' + r.status);
    site.files.set(name, await r.text());
  }
  return site.files.get(name) as string;
}
// deno-lint-ignore no-explicit-any
async function replayer(ver: string): Promise<any> {
  if (site.replay !== ver) {
    new Function(await file('verify-replay.js', ver))(); // (sets globalThis.CAReplay)
    site.replay = ver;
  }
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).CAReplay;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    const match = Number(body.match), no = Number(body.game_no);
    if (!Number.isInteger(match) || match < 1 || !Number.isInteger(no) || no < 1 || no > 200) return reply({ error: 'bad request' }, 400);
    let row = await rpc('ca_verify_get', { p_match: match, p_game_no: no });
    if (row && row.verdict && row.verdict !== 'partial') return reply({ status: 'done', verdict: row.verdict }); // (checked already: its records are gone)
    if (!row || !row.host_log) return reply({ status: 'waiting for the host\'s record' });
    if (!row.guest_log) { // (give the guest's record a moment to arrive)
      await sleep(5000);
      row = await rpc('ca_verify_get', { p_match: match, p_game_no: no });
      if (row.verdict && row.verdict !== 'partial') return reply({ status: 'done', verdict: row.verdict });
    }
    const ver = await liveVersion();
    // deno-lint-ignore no-explicit-any
    let res: any;
    if (!ver || String(row.host_log.ver) !== ver) {
      res = { verdict: 'unverified', note: 'played on version ' + row.host_log.ver + ' of the site; ' + ver + ' is live now' };
    } else {
      const R = await replayer(ver);
      const names = R.files(row.host_log.game);
      if (!names) res = { verdict: 'unverified', note: row.host_log.game + " can't be replayed" };
      else {
        const sources: Record<string, string> = {};
        for (const n of names) sources[n] = await file(n, ver);
        try { res = R.run(sources, row.host_log, row.guest_log, { seed: R.seedFor(match, no) }); } catch (e) { res = { verdict: 'error', note: String((e as Error).message || e) }; }
      }
    }
    await rpc('ca_verify_put', { p_match: match, p_game_no: no, p_verdict: res.verdict, p_note: String(res.note || '').slice(0, 500) });
    return reply({ status: 'done', verdict: res.verdict });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 500);
  }
});
