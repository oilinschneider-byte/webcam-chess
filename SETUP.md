# Setting up CamArcade's server

CamArcade uses **Supabase**, a free online database, as its server. It keeps the accounts, pairs players up, settles every game's result, keeps the streaks and the leaderboard, counts visitors and stores reports. The games themselves, voices and cameras still go straight between the two players' browsers.

It's free (no credit card) and takes about 10 minutes.

## 1. Make the Supabase project

1. Go to [supabase.com](https://supabase.com) and press **Start your project**. Sign in with GitHub (easiest).
2. Press **New project**.
   - **Name:** `camarcade`
   - **Database password:** press **Generate a password** and save it somewhere safe (you won't need it for CamArcade, but Supabase asks for it).
   - **Region:** the one closest to most of your players.
3. Press **Create new project** and wait a minute or two until it's ready.

## 2. Put the server code in

1. In the left menu, open **SQL Editor**.
2. Press **+ New query** (or the **+** tab).
3. Open `server/schema.sql` from this folder in Notepad, select everything (Ctrl+A), copy it, and paste it into the SQL Editor.
4. Press **Run** (or Ctrl+Enter). If Supabase warns about "destructive operations", press **Run this query**: the warning is about code inside the server's functions (like taking a player out of the search queue when they're matched), not about deleting your data.
5. It should say **Success. No rows returned**.
6. Check it works: replace everything in the editor with this line, and press **Run**:

   ```sql
   select camarcade.self_test();
   ```

   The result is a list of ✓ checks ending in **ALL TESTS PASSED**. The test plays out sign-ups, 40 players looking for a match at once, results, cheating attempts, blocks and reports with made-up players, and then throws all of it away.

Running `server/schema.sql` again later is safe. It updates the code and keeps every player, streak and report.

## 3. Connect the website to it

1. Find your **Project URL**. It looks like `https://abcdefghijklmnop.supabase.co`. It's under **Project Settings** (the gear at the bottom left) → **Data API**, or press **Connect** at the top of the project page.
2. Find your **publishable key**: **Project Settings** → **API Keys**. Copy the one that starts with `sb_publishable_`. (If you only see "anon public", that one works too.)
   - **Never** use the **secret** key (`sb_secret_…`, or "service_role") in the website: it can do anything.
3. Open `config.js` in Notepad and fill them in:

   ```js
   window.CAMARCADE_CONFIG = {
     supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
     supabaseKey: 'sb_publishable_xxxxxxxxxxxxxxxx',
   };
   ```

   Both are meant to be public. The website can only call the `ca_…` functions in `server/schema.sql`, and those check everything.

## 4. Test it

1. Double-click `tools\test-server.bat`. It checks the server from the outside, the way a cheater would try it:
   - nobody can read or change the database directly, or change their own streak;
   - sending made-up IP addresses doesn't fool it;
   - two players get paired, and beating your own second window doesn't count;
   - reports and blocks work, and 13–17 year olds only get cats-only matches.

   It makes 3 test accounts (named `zt…`) and deletes them at the end. It should end with **ALL … SERVER CHECKS PASSED**.

   *Optional:* to also run the full self-test from there, copy your **secret** key (Project Settings → API Keys → Secret keys) into a new file `tools\secret-key.txt`. That file is never uploaded to GitHub (it's in `.gitignore`).

2. Double-click `tools\test-browsers.bat`. Two hidden browsers play real Classic Games matches against each other through your server:
   - **Round 1:** an adult and a 15-year-old. It checks the match is cats-only, that leaving in the middle counts as a loss, that the game doesn't change any streak (same internet connection), and that the 🚩 Report button works.
   - **Round 2:** two adults with pretend webcams. It checks each one first sees the other's cat, and that pressing **📷 Show my face** shows only that player's camera.
   - **Round 3:** 🚧 Wall Duel. One browser checks every rule against the bot (building, dots joining up, the "can't build" messages, walls opening and breaking, getting knocked out by the other cat's wall) and lets the bot play on all three levels. Then both play it online and check they see the same walls and the same winner. This round takes about 4 minutes.
   - **Round 4:** the arcade duels. One browser plays a whole game of each against the bot (sped up, pressing random keys) and checks every one ends with a result. Then both play Sumo Cats online and check the guest gets the host's game and they agree who won. This round takes about 10 minutes.

   It should end with **ALL … BROWSER CHECKS PASSED**.

3. Try it yourself: double-click `start.bat`, sign up, and play. For a game that *counts*, play your phone on mobile data (Wi-Fi off) against your computer.

## 5. Put it online

Push the changes to GitHub. GitHub Pages publishes the `main` branch, so merge your branch into `main` when you're happy. Everyone who opens the site uses the same server, so there's nothing else to set up.

## 6. Log in with Google (optional)

This adds a **Continue with Google** button to the log-in screen. It takes about 15 minutes. The button stays hidden until the last step.

**A. Update the server code.** Open `server/schema.sql`, copy everything, paste it into Supabase → **SQL Editor** → **+ New query**, and press **Run**. (Running it again is safe: it keeps every player.)

**B. Make a Google sign-in key.**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with the Google account that should own this.
2. At the top, press the project picker → **New project**. Name it `CamArcade` and press **Create**. Make sure it's selected.
3. Open **APIs & Services** → **OAuth consent screen** (it may be called **Google Auth Platform** → **Branding**). Press **Get started**:
   - **App name:** `CamArcade`, **User support email:** your email.
   - **Audience:** **External**.
   - **Contact email:** your email. Agree and press **Create**.
   - In **Branding**, add the **App home page** `https://thecamarcade.com`, **Privacy policy** `https://thecamarcade.com/#/privacy`, **Terms** `https://thecamarcade.com/#/terms`, and under **Authorized domains** add `thecamarcade.com` and `supabase.co`. Save.
   - In **Audience**, press **Publish app** (so anyone can use it, not just test users).
4. Open **Clients** (or **Credentials** → **+ Create credentials** → **OAuth client ID**):
   - **Application type:** **Web application**, **Name:** `CamArcade`.
   - **Authorized JavaScript origins:** `https://thecamarcade.com`
   - **Authorized redirect URIs:** `https://gcobykzdjjnrukbluqya.supabase.co/auth/v1/callback`
   - Press **Create**. Copy the **Client ID** and the **Client secret** (keep the secret private: never put it in the website's files).

**C. Turn Google on in Supabase.**

1. Supabase → **Authentication** → **Sign In / Providers** → **Google**: switch it on, paste the **Client ID** and **Client secret**, and **Save**.
2. Supabase → **Authentication** → **URL Configuration**:
   - **Site URL:** `https://thecamarcade.com`
   - **Redirect URLs:** press **Add URL** and add `https://thecamarcade.com/**` (and `http://localhost:8080/**` for testing on your computer).

**D. Show the button.** In `config.js`, change `googleLogin: false` to `googleLogin: true`, and push it.

How it works: Google tells Supabase who you are, Supabase sends you back to CamArcade with its proof, and the server (`ca_google`) logs you in. The first time, it asks for a username and the month and year you were born, the same rules as signing up. Google accounts have no CamArcade password: to delete one, you type your username.

## Running CamArcade

Everything below is done in Supabase's **SQL Editor**: paste the line and press **Run**.

**How many people play** (also on your site at `…/#/stats`, which anyone can open):

```sql
select * from camarcade.daily;
```

Visitors are browsers per day. `internet_connections` counts different homes, schools and phones, which is much harder to fake than visitor ids.

**Reports to look at:**

```sql
select * from camarcade.open_reports;
```

When you've looked at one, mark it done: `update camarcade.reports set reviewed = true where id = 12;`

**Ban someone** (they can still log in and play Practice, but not Classic Games, and they're taken off the leaderboard):

```sql
update camarcade.players set banned_until = 'infinity', ban_reason = 'showed something rude' where name_key = 'theirname';
```

Lift a ban: `update camarcade.players set banned_until = null, ban_reason = null where name_key = 'theirname';`

When 3 different players report the same person within a day, they're automatically suspended for 24 hours (`ban_reason` is `reports`).

**Serious reports:** check `select * from camarcade.open_reports;` often, not only when someone complains. If a report may involve a child being sexually exploited, don't download or pass around anything yourself. Report it at [report.cybertip.org](https://report.cybertip.org) (NCMEC's CyberTipline), then ban the account and ask a lawyer what you have to report and keep. If someone may be in danger right now, call the police.

**Before you pay out any prize**, look at the top players:

```sql
select * from camarcade.top_players;
```

Things that look like cheating: few `different_opponents` for a long streak, many `disputes` (games where the two apps reported different results), or a lot of `times_reported`. To see who someone beat:

```sql
select g.resolved_at, g.game, g.result, h.name as host, gu.name as guest
from camarcade.games g
join camarcade.matches m on m.id = g.match_id
join camarcade.players h on h.id = m.host
join camarcade.players gu on gu.id = m.guest
where g.ranked and (h.name_key = 'theirname' or gu.name_key = 'theirname')
order by g.resolved_at desc;
```

**Someone forgot their password** (there's no email, so you set a new one and tell them):

```sql
update camarcade.players set pass_hash = extensions.crypt('their-new-password', extensions.gen_salt('bf', 8)) where name_key = 'theirname';
```

## Good to know

- **Free plan limits:** Supabase pauses a free project after a week with no visitors at all. Press **Restore** in the dashboard to wake it. 500 MB of database is plenty for many thousands of players.
- **Ages are what people type in.** Nobody checks an ID. The protection is that under-18 accounts never send or receive video or voice, a 13-year-old can't change that, and an under-13 answer blocks sign-ups from that browser.
- **Cheating can be made hard, not impossible.** Someone with two devices on two different internet connections (like a phone on mobile data and a laptop on Wi-Fi) could still play against themselves. The server limits that to 3 counted games a day per pair of accounts. Look at `top_players` before you pay a prize.
- **Video connections** between players go through the free PeerJS service. Very rarely two players' networks can't reach each other. Then the app calls the match off and finds someone else.
