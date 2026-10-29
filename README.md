# CamArcade

A browser game site for 1v1 games over webcam. Show your camera, or play as a cat whose mouth moves when you talk.

## Start it

CamArcade needs its free online server (Supabase) for accounts, matchmaking, streaks and the leaderboard. **Setting it up takes about 10 minutes: follow [SETUP.md](SETUP.md).** After that:

- Double-click **start.bat**. Your browser opens the site. Keep the black window open while you play.
- Or double-click **index.html**. This works in Edge and Chrome too, but the browser may ask about the microphone more often.

## How it works

1. **Sign up** with a username, a password and the month and year you were born. Next time, just **log in**. Accounts are saved online, so you can log in on any device. You have to be 13 or older. Players under 18 always play as their cat: other players never see or hear them, and they never see or hear other players.
2. **Allow camera & microphone**, or press **No thanks**. If you allow them, your camera turns on in games (Classic Games, Chess, Practice and Chess vs Computer) and turns off when you leave the game. In Classic Games, every new player sees your cat until you press **📷 Show my face**. With the microphone on, the other player hears you (18 and over only) and your cat's mouth moves when you talk. If you press **No thanks**, you play as your cat.
3. Pick from the menu:
   - **⚡ Classic Games** (left): starts searching for a random player right away. Every round goes like this:
     1. **Match found:** 5 seconds face to face (big cameras, or cats), while the game's rules show.
     2. **The game:** one of 36 games, picked at random. Most take about 30 seconds; a few (like Remember the Sequence, Barrel Brawl and Simon Says) keep going until someone wins, and Claw Climb is a race of a few minutes. See the list below.
     3. **After the game:** a few seconds face to face again to react, with **🔁 Rematch** and **⏭ Next**. If you both press Rematch, you play each other again with a new game. Otherwise you're matched with someone new right away. (If nobody new turns up for about 20 seconds, you can get the same player again.)

     Every win adds 🔥 to your streak and catches 🐟 fish, and the longer your streak, the more fish each win gives. A loss resets your streak. Your camera is on the left and the other player is on the right. The first time you search, a reminder explains how cameras and the 🚩 Report button work.

     **What counts for your streak:** both players' apps report every game to the server, and it only counts when they agree. Games against someone on the same internet connection (your own second window, or someone in your house) are friendly games and don't count. The same two players count for up to 3 games a day; after that, rematches are just for fun. Leaving in the middle of a game counts as a loss.
   - **🏆 Leaderboard**: the longest win streaks ever, and the longest streaks going on right now. It works without logging in, so you can share the link (`…/#/leaders`).
   - **♞ Chess** (right): create a room and send the code to a friend. Your cameras turn on when the game starts.
   - **🎯 Practice mode** (underneath): press **🎲 Classic mode vs bots** to play random games one after another against bots (face to face with each bot, then Rematch or a new bot), or pick one game to practice. There's also **Chess vs Computer**. Choose Easy, Medium or Hard bots. Practice doesn't change your streak or fish. **Math Sprint** practice lets you choose which kinds of problems, the number ranges, and the time limit.
   - **🐱 My Cat & Shop**: spend fish on fur colors, hats, glasses, shirts, collars, things to hold and backgrounds.
   - **🎟️ Streak Pass**: wins earn XP (more with a longer streak) that unlock 20 tiers of fish and exclusive items.

## The games

**Classic Games** (online) and **Classic mode vs bots** use 36 games: the 14 arcade duels below, plus the 22 other games that take the most skill: Barrel Brawl, Cat Hoops, Wall Duel, Claw Climb, Penalty Shootout, Speed Chess, Connect Four, Pose Match, Simon Says, Quick Draw, Aim Targets, Dodge, Snake Sprint, Memory Match, Remember the Sequence, Math Sprint, Spot the Difference, Type Race, Word Scramble, Category Rush, Flag Quiz and GeoGuessr. **Practice** has the same 36 games (pick one, or play them all in a random mix), plus Chess vs Computer.

In the mix, every game has exactly the same chance of coming up. The app goes through all 36 in a random order before any game repeats. (Online, the other player's app picks the game half the time, so a game can come back a bit sooner.) Pose Match, Simon Says and Staring Contest only come up when both players have their camera on.

**⚡ Action**

| Game | How to win |
| --- | --- |
| ⚡ Quick Draw | Click when it turns green. Clicking too early loses the round. First to 2. |
| 🎯 Aim Targets | Hit the most targets in 20 seconds. |
| ☄️ Dodge | Dodge the falling rocks (3 lives). Whoever lasts longest wins. |
| 🛢️ Barrel Brawl | Two cats with very long, floppy arms and one barrel. Press **Space** next to it to pick it up. Hold **Space** to wind up and let go to shoot it over your head at the other cat: the longer you hold, the further it flies. No barrel nearby? **Space** slaps with your long arms: it knocks the other cat back and makes it drop the barrel, but doesn't cost a life. Tap ← or → (or A or D) twice fast to dash. Jump with ↑, W or Space. On a phone, use the buttons under the game (tap ◀ or ▶ twice to dash). 3 lives each and no clock. After 40 seconds a few tiles of ground start cracking and falling into the lava, but most of the ground always stays. Fall in and you lose a life (you float back down on a parachute). |
| 🚧 Wall Duel | A top-down shootout in an arena seen from above. Move with WASD, aim with the mouse and click to shoot, or hold the mouse button down to keep shooting (4 bullets at a time). Bullets fly straight through your own walls, and stop at the first wall of the other cat's they hit. **Space** drops a dot where you stand, and it joins up with your nearest dots (up to 2, if they're close enough) by walls in your color (blue for one player, orange for the other). A dashed line shows which dots a new one would join. Dots can't go too close to another dot, on a line, or on the other cat, and you have 14 at most (a 15th takes away your oldest). You can walk and shoot through your own walls, but touching the other cat's walls hurts, and so do their bullets. Each cat has a 🛡️ shield (the bubble around it) that takes the first hit, then a moment when nothing can hurt it; the second hit is a K.O. Every piece of wall is shielded (glowing) for 2 seconds, then open (flickering and cracked, with a shrinking ring around each dot) for 1 second. A bullet breaks an open dot in one hit, along with the walls joined to it; an open wall needs 2 hits. On a phone, use the stick to move and the Shoot and Build buttons (it aims at the other cat for you). The game is played on a grassy lawn with a 🌀 safe zone, a glowing circle that starts shrinking towards the middle after 8 seconds: stay outside it for 1.5 seconds and you take a hit. Nobody knocked out after 2½ minutes? It's a draw. |
| 🏀 Cat Hoops | 1v1 basketball with the long-armed cats, in a gym full of cat fans. Move with A and D (or ← →), and tap A or D twice fast to dash. You pick the ball up just by touching it. Hold **W** to jump and shoot: a bar fills up next to you, and letting go in the green usually goes in (less often if the other cat is right in your face). If the bar reaches the top, you shoot anyway. Run in close to the hoop and **W** dunks instead. **Space** is a quick shot without the bar. On defense, jump with **W** and press **S** at the right moment to block a shot, or slap the ball out of their hands with **Space** (or **S** on the ground). Shots from beyond the arc are worth 3. Most points in 60 seconds wins; a tie goes to overtime, and the next basket wins. |
| 🧗 Claw Climb | A race up a winding mountain of junk, a lot like Getting Over It: from a backyard over a boulder, tires and an old armchair, up some crates and a slippery fridge (step up its two big magnets), back up a pallet leaning over it, past a boulder and some crooked crates, up a ladder, over a washing machine, another boulder and a plank bridge, up a zigzag tower of tires, and across stepping stones to a golden shelf, while the sky turns from sunset to night. Your cat climbs with one very long arm, and the paw follows your mouse or trackpad (click the game first; Esc gives you the mouse back). On a phone, drag on the game. Press the paw against a ledge and its claws hold on: moving the mouse on then moves your whole cat instead. Press down on a ledge to push yourself up, push sideways to shuffle along, and move fast to fling yourself higher. There is no jump button. Shiny metal is slippery. **Space** takes out a giant fish in your other paw (**Space** again puts it away). While the fish is out, the mouse swings the fish, and your climbing paw just keeps holding on where it is. A fast swing that hits the other cat knocks them loose and down the tower, but the fish only lasts 2 slaps. The cats are solid, but if they get stuck against each other for a second, they slip through each other for a moment, so nobody can block the way. First to the golden fish on the top shelf wins; after 4 minutes, whoever got further along the way wins (the bar on the right shows how far you both are). |
| 🗣️ Simon Says | Simon, a cat with a very deep voice, calls out poses (arms up in a V, hands on your head, show me your muscles…). Do the pose, but **only** when he starts with "Simon says"! If he just says "Hands on your head!", don't move. You hear him and see his words in a speech bubble, with a little drawing of the pose. The bubble glows pink when he really says "Simon says". Your camera is on the left and theirs is on the right, both with lines showing what the pose checker sees. A label on your camera says which pose Simon sees (or "Step back so Simon sees both hands"), and the **Hold it!** bar fills up while you hold the right pose. Every command comes faster, and Simon talks faster too. No clock: the first to mess up loses, by doing a pose Simon didn't say or by being too slow. If you both mess up on the same command, it keeps going (3 times in a row is a draw). |

**🎮 Arcade duels** (all built on one shared engine, `games-duel.js`: see "How the arcade duels work" below)

| Game | How to win |
| --- | --- |
| 🏍️ Light Trails | Steer a glowing bike with WASD or the arrows. Every bike leaves a solid trail; hitting a wall or any trail (yours too) puts you out. The bikes never stop, can't turn straight back, and speed up as the round goes on. Last bike riding wins the round; first to 3. |
| 📦 Box King | A cardboard box in the middle of the room. You score while you're in it alone; with both cats in it, nobody scores. Space throws your boomerang (the way you're facing, or at the other cat if you're standing still): it flies out slowly in a curve, so it can be dodged, and comes back to you. If it hits, the other cat is knocked back and dazed for a moment. One boomerang each: throw again once it's back. First to 20 seconds in the box, or the most after 75 seconds. |
| 🤼 Sumo Cats | Push the other cat out of the ring. The cats don't bounce off each other: touching, they lean in and shove, so whoever pushes harder slowly drives the other back (and pushing against each other is a standoff). Space charges forward for a small shove, then you need a moment to recover, so the other cat can dodge and push back. After 6 seconds the ring starts shrinking. First to 3 rounds. |
| 🎣 Pond Duel | Click (or Space) to cast, then click the moment your bobber dips to hook the fish (too early and you have to cast again; too late and it gets away). Then reel it in: the fish swims up and down the reel bar, and you move a big green zone with **W**/**S**, the arrow keys, or the mouse (it follows the mouse up and down, only so fast). Keep the fish in the green until the catch meter fills; if the meter runs out, it gets away. Bigger fish dart about faster: minnows are worth 1, up to 15 for the golden fish (and 0 for an old boot). Both players get the same fish in the same order, with the same waits and moves. Most points in 75 seconds. |
| 🏒 Cat Air Hockey | Move the mouse to move your paddle (you stay on your half). Knock the puck into the other cat's goal. Paddles can only speed up so fast and the puck has a top speed. First to 5 goals. |
| 🎨 Paint Wars | WASD to move, aim with the mouse, hold the button to spray paint in a cone. Every patch of floor is the color of whoever painted it last. Your sprayer runs out and refills when you let go. Most floor after 45 seconds wins. |
| 💥 Cat Cannons | Take turns firing your cannon across the hills: aim with the mouse, hold to charge, let go to fire. The cannonball flies in an arc (watch the wind) and blows a crater where it lands. A direct hit costs 2 of your 3 hearts, a near miss 1. 10 seconds a shot. |
| ⛳ Mini Golf Duel | Both play the same three holes at the same time (the balls go through each other): aim with the mouse, hold to charge, let go to putt. Walls bounce the ball, sand slows it, slopes push it, bumpers fling it, and water costs a stroke. At most 8 strokes and 60 seconds a hole. Fewest strokes wins; a tie goes to a 40-second playoff hole. |
| 🐭 Cat and Mouse | A maze. One of you is the cat, the other the mouse; then you swap, on the same maze from the same spots. The cat is a little faster, but the mouse's dash (Space) comes back sooner. Whoever survives longer as the mouse wins (45 seconds at most). |
| 🏎️ Kart Dash | Three laps in identical karts: W go, S brake (and reverse), A and D steer, Space for a short boost. A lap only counts if you went through all 8 checkpoints in order (the next one glows), so no shortcuts. You can bump each other. |
| 🧱 Block Battle | Falling blocks, side by side: A/D move, W rotates, S drops faster, Space drops all the way. Clear 2, 3 or 4 rows at once to send 1, 2 or 4 junk rows (with a gap) to the other board. Both get the same pieces in the same order. If a new piece can't fit, you're out. |
| 🤺 Floppy Sword Cats | Two cats built like the Cat Hoops cats (a solid body on normal legs, very long floppy arms), each starting with a sword (a dropped sword is picked up again by walking over it). The arms just flop about (the hands drag along the floor) until you hold the mouse button: then they lift up and your sword hand reaches for the mouse pointer (springy and only so fast, so you really swing). Only direct hits count: the outer part of the blade moving fast, straight into them; a slow or sliding touch just glances off. A direct hit to the head takes 34 of the 100 health, one to the body 20, and one to the sword arm knocks the sword out of their hand. Every time two swords meet (one of them swinging) they clank, and both cats get knocked back; even a glancing hit pushes the other cat back. Moving is quick: A/D run, W or Space jumps, Shift (or A or D twice) dashes, once in the air too. E blocks for a moment, then needs a short rest: a blocked sword bounces back hard, the arm holding it goes floppy for a moment and that cat is pushed back. Hold E longer to grab (the grab then needs 6 seconds to cool down; two little circles under your cat show when block and grab are ready): you drop your sword, your arm shoots out a long way towards the pointer, and if it catches the other cat, you're both stuck while you carry them through the air with the mouse (a dotted line shows where they'd fly). Let go of E to throw them; a hard landing hurts (15), leaves them dizzy and knocks their sword out of their hand. Out of health is a K.O.; when time runs out, more health wins the round. Now and then, a direct hit on a cat that's down to very little health (30 or less) is a critical hit: its head pops right off (cartoon style, no blood) and bounces away, and that's the round. First to 2 rounds. |
| 😐 Staring Contest | Look into your camera and don't blink: the first to blink loses the round. First to 2. Your camera is only checked on your own computer (nothing is recorded or sent). Everybody has the same line for "closed" (it isn't measured from your eyes at the start, so squinting doesn't help: squinted eyes count as closed). Each round starts once both players' eyes are properly open, and a blink only counts if your eyes stay shut for a couple of checks. If a camera loses the face, the round pauses (and starts over if it stays lost). Only comes up online when both cameras are on. |
| 🥊 Shadow Boxing | Punch the targets on your own camera, as fast as you can: blue ones with your left fist, red ones with your right, and now and then a pair at once for both. The moment you hit one, the next appears, and a target you're too slow for disappears. They start slow (big targets that wait almost 3 seconds) and get faster and faster. Between the two cameras is a little ring where your cats box: every hit is a punch, the cat that's been hit more gets more bruised, and when the 40 seconds are up the one with the most hits knocks the other one down (a tie goes to the faster average punch). Both players get the same targets in the same places. Your camera only finds your fists on your own computer. No camera? Click the targets. |

**How the arcade duels work.** They all run on one engine (`games-duel.js`), so they share the controls (keyboard, mouse, and buttons under the game on phones), the 3-2-1, the bots, the effects and the end screen. Online, the host's app runs the game from both players' controls, 60 times a second, and sends what happened to the guest's app 20 times a second; the guest's app sends its controls and draws what it gets, smoothed out. So both always agree on collisions, goals, cuts and who won. Block Battle and Pond Duel are different: each app runs its own board or rod (so it reacts instantly), both get the same pieces or fish from the match's seed, and the host's app is the referee. Staring Contest and Shadow Boxing only turn what your camera sees into button presses on your own computer; the game itself never looks at video.

**Playing covers the whole screen, and the cameras are walls.** While a Classic Game is on, it fills the window inside a brick wall that runs round the edge of the screen: the score and the buttons sit in the top of the wall, and the two cameras are blocks of wall sticking out of the left and right sides near the top. In the arcade games (the 14 duels, Barrel Brawl, Cat Hoops and Wall Duel) the top-left and top-right corners of the arena are solid walls, and the camera blocks sit exactly over them (`cam-walls.js`), so nothing can go behind a camera: cats, pucks, balls, bullets, barrels and karts all bump off them, the maze, the kart track and the golf holes go round them, and they can't be painted. Staring Contest and Simon Says show both cameras big in the game instead. On a phone held upright the cameras sit above the game, and the games draw the corner walls themselves.

**🧠 Brain & board**

| Game | How to win |
| --- | --- |
| 🧠 Memory Match | Same cards for both players. Find all 6 pairs first, or the most pairs in 40 seconds. |
| 🔁 Remember the Sequence | Tiles light up one after another, and you tap them back in order. Every round adds one more tile. The first to make a mistake loses. |
| 🔍 Spot the Difference | Find the 5 differences first (wrong clicks freeze you for a moment). |
| 🟦 Connect Four | Four in a row. 5 seconds a turn. |
| ♟️ Speed Chess | 8 seconds a move. If nobody wins within 40 seconds (or it's a draw), 💣 a nuke hits the middle of the board (the 16 squares from c3 to f6). For the last 15 seconds the middle glows red with a warning ("Get out of the middle!"), and then everything there except the kings is gone. Then you play 25 more seconds. No checkmate by then? Whoever has more piece points left wins (queen 9, rook 5, bishop and knight 3, pawn 1). |

**🌍 Quiz** (the fastest right answer wins each round)

| Game | How to win |
| --- | --- |

**🔤 Words & minds**

| Game | How to win |
| --- | --- |
| 🔤 Word Scramble | Unscramble the word first. First to 3. |
| 📝 Type Race | Type a short passage (3 or 4 sentences) exactly. First to finish wins. If nobody finishes in 75 seconds, whoever typed more wins. |

If you're too slow on your turn, a random move is made for you, so nobody can stall a game.

**About Pose Match and Simon Says:** they use Google's free MediaPipe pose detector, which runs on your own computer. Your video isn't sent anywhere new. (In Simon Says, the other player's app gets the dots for your head, shoulders, elbows, wrists and hips, so it can draw the lines on your camera.) The detector downloads (about 10 MB) the first time one of these games comes up, so it needs the internet. Simon talks with your browser's built-in voice: it sounds different in Edge, Chrome and on a Mac. A browser without voices makes him talk in deep little beeps (his words still show in the speech bubble). With 🔇 (sound effects off) at the top, he only talks in his bubble. If you play without headphones, the other player's sound is turned down while Simon talks, so you don't hear their Simon through their microphone.

**About the word games:** Longest Word checks answers against the ENABLE word list (public domain), which loads only when that game comes up.

**About Rhyme Race:** rhymes are checked by how words sound, not how they're spelled. The sounds come from the CMU Pronouncing Dictionary (American English). "Cot" and "caught" count as the same sound, like for most Americans, so dog, fog and log all rhyme, and so do hot and thought. Good and food don't rhyme, and neither do snow and cow. Rare words count if they're real dictionary words, but names don't. The rhyme families are saved in `lib/rhymes.js`. To add more words, edit the lists in `tools/make-rhymes.ps1` and run it (right-click → Run with PowerShell). It rebuilds `lib/rhymes.js`.

During a game:

- **🐱 Show my cat** turns your camera off and shows your cat instead. **📷 Show my face** turns the camera back on.
- **📷 / 🐱 at the top** does the same thing from any screen. The app remembers your choice until you close the tab.
- **🙈 Hide their camera** shows the other player's cat instead of their camera. **🔈 Mute them** turns their voice off.
- **⏭ Skip** finds a new player. Skipping or closing the page in the middle of a Classic Games match counts as a loss.

## Test it

- **Automatic tests:** double-click `tools\test-server.bat` (checks the server the way a cheater would try it) and `tools\test-browsers.bat` (two hidden browsers play real matches through your server). [SETUP.md](SETUP.md) explains what they check.
- **By yourself:** open CamArcade in two *different* browsers (for example Edge and Chrome), make a different account in each, and click **Classic Games** in both. They'll find each other in a few seconds. Those games are friendly (same internet connection), so they don't change your streak. If you hear a loud echo, mute one of them with 🎤 at the top.
- **A game that counts:** play from your phone on mobile data (Wi-Fi off) against your computer, or with a friend at their house.

## Playing with people on other computers

The other players need the site too. Either put this folder online (GitHub Pages or Netlify are free) and share the link, or send them the folder (zip it) and they double-click `index.html`. Games connect over the internet through the free PeerJS service, so you don't need to be on the same Wi-Fi. There's no limit on how many people can look for a match at the same time.

**How many people play:** the `…/#/stats` page shows visitors, accounts and games played, counted by the server.

## Safety

Classic Games matches you with strangers. Every new player sees your cat until you press **📷 Show my face**, and under 18 nobody ever sees or hears you. Don't share personal info. You can use these buttons at any time:

- **🐱 Hide my face** goes back to your cat.
- **🙈 Hide their camera** hides theirs.
- **🔈 Mute them** turns off their voice.
- **🚩 Report** tells CamArcade what happened, hides their camera and voice right away, and you're never matched with them again. You can also just block them. When 3 different players report the same person in a day, that person can't play Classic Games for a day. Reports are kept on the server for you to look at (see [SETUP.md](SETUP.md)).
- **⏭ Skip** leaves the match.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "The browser blocked the microphone" | Click the lock icon in the address bar, set Microphone to **Allow**, then press **Try again**. |
| "Windows is blocking your microphone" | Windows Settings → Privacy & security → Microphone → turn it on, including for desktop apps. |
| My camera doesn't turn on in games | Look at the camera button at the top. 🐱 means you're playing as your cat, so click it to switch to 📷. If the browser blocked the camera, click the lock icon in the address bar and set Camera to **Allow**. Close other apps that use the camera (Zoom, Teams, Discord). |
| I can't hear the other player | Click anywhere on the page once, because browsers keep sound off until you click. Also check that you didn't press **🔈 Mute them**. |
| Simon Says: Simon doesn't talk | Check that the 🔊 at the top isn't 🔇. Click anywhere on the page once. Some browsers have no built-in voices: then Simon beeps, and you read what he says in his speech bubble. |
| Simon Says (or Pose Match) doesn't see my pose | Step back until your head, shoulders and both hands fit in the camera, with some room above your head. A bright room helps. In Simon Says, the "Simon sees" label on your camera shows which pose he thinks you're doing. |
| My cat doesn't move its mouth | Check that 🎤 at the top isn't crossed out, and click anywhere on the page once (browsers keep sound paused until you click). |
| Classic Games keeps searching | Nobody else is searching right now. Keep it open, or use Practice mode. |
| "CamArcade isn't connected to its server yet" | Follow [SETUP.md](SETUP.md) and fill in `config.js`. |
| My streak didn't go up after a win | It was a friendly game: same internet connection, or the 4th game against the same player today. Or the two apps reported different results. A message says which. |
| Chess: "Room not found" | Check the code. Your friend must keep their game open. |
| Forgot my password | There's no email, so it can't be reset by itself. The owner can set a new one in Supabase (see [SETUP.md](SETUP.md)). |
| I played before accounts went online | Press **Sign up** and use the same username and password as before. Your cat, fish and items come along (your old streak doesn't, because the server didn't see those games). |

## Files

- `index.html`: the whole app (all the screens)
- `config.js`: the address of your Supabase server (see [SETUP.md](SETUP.md))
- `server.js`: talks to the server
- `server/schema.sql`: the server itself: accounts, matchmaking, settling results, streaks, the leaderboard, reports, visitor counts and a self-test. Paste it into Supabase's SQL Editor.
- `app.js`: sign up / log in, the camera and microphone question, the menu, the top bar
- `common.js`: accounts, your saved cat and fish, the cat drawing, the shop items, the Streak Pass, the microphone and camera
- `solos.js`: Classic Games matchmaking, reporting results, report and block, the first 5 mini-games, Practice mode
- `leaders.js`: the leaderboard and the "how many people play" page
- `games-quick.js`: Memory Match, Aim Targets, Higher or Lower
- `games-words.js`: Word Scramble, Type Race
- `games-board.js`: Connect Four, Speed Chess
- `games-world.js`: Flag Quiz (the flags are drawn in code, because Windows can't show flag emojis), GeoGuessr
- `games-action.js`: Perfect Timing, Dodge, Mini Maze Race, Stack Tower, Snake Sprint, Remember the Sequence, Cup Shuffle, Penalty Shootout
- `games-quiz.js`: Closest Guess, Country Shape, Odd One Out, Which Is Bigger?, Timeline, Emoji Movie Guess, Animal Guess, Pattern Next, Spot the Difference
- `games-mind.js`: Rhyme Race, Longest Word, Category Rush, Guess Their Choice, Same Answer, Would You Rather
- `games-pose.js`: Pose Match
- `cam-walls.js`: the camera walls in the arcade games' top corners (where they are, bumping things off them, drawing them)
- `games-floppy.js`: the long-armed cats that Barrel Brawl, Cat Hoops and Claw Climb share (the cat pictures, the floppy arms, the controls with double-tap dashes)
- `games-barrel.js`: Barrel Brawl
- `games-walls.js`: Wall Duel
- `games-duel.js`: the shared engine for the arcade duels (controls, online play, bots, effects)
- `games-trails.js`, `games-box.js`, `games-sumo.js`, `games-pond.js`, `games-hockey.js`, `games-paint.js`, `games-cannons.js`, `games-golf.js`, `games-mouse.js`, `games-kart.js`, `games-blocks.js`, `games-swords.js`, `games-stare.js`, `games-boxing.js`: the 14 arcade duels
- `games-hoops.js`: Cat Hoops
- `games-simon.js`: Simon Says (it shares Pose Match's pose detector)
- `games-climb.js`: Claw Climb (the junk mountain course, the one-armed climbing, the fish, and the bot that finds its way up)
- `chess.js`: chess (online, pass & play, vs computer)
- `pass.js`, `character.js`: the Streak Pass and My Cat screens
- `style.css`, `pieces.css`: how everything looks
- `lib/`: chess rules ([chess.js](https://github.com/jhlywa/chess.js), BSD), connections between players ([PeerJS](https://peerjs.com), MIT), the world map and country outlines (`world-map.js`, `countries.js`), the word list (`words.js`) and the rhyme families (`rhymes.js`)
- `tools/make-rhymes.ps1`: rebuilds `lib/rhymes.js` (only needed if you change the rhyme lists)
- `tools/test-server.bat`, `tools/test-browsers.bat` (with `test-server.ps1`, `test-browsers.ps1`, `autotest.js`): the automatic tests
- `start.bat`, `serve.ps1`: the small local web server

Chess pieces: the "cburnett" set by Colin M.L. Burnett (GPLv2+), the same pieces lichess.org uses. World map and country outlines: [Natural Earth](https://www.naturalearthdata.com) (public domain), via the [world-atlas](https://github.com/topojson/world-atlas) package (ISC). Word list: ENABLE (public domain). Pronunciations for Rhyme Race: the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD-style license, notice in `lib/rhymes.js`). Pose detection: [MediaPipe](https://developers.google.com/mediapipe) (Apache 2.0), loaded from the internet.

Everyone who plays together needs the same version. When the list of games changes, the app stops old and new versions from matching each other in Classic Games.
