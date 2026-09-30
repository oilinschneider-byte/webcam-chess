# CamArcade

A browser game site for 1v1 games over webcam. Show your camera, or play as a cat whose mouth moves when you talk.

## Start it

- Double-click **start.bat**. Your browser opens the site. Keep the black window open while you play.
- Or double-click **index.html**. This works in Edge and Chrome too, but the browser may ask about the microphone more often.

## How it works

1. **Sign up** with a username and password. Next time, just **log in**. Accounts are saved in this browser on this computer.
2. **Allow camera & microphone**, or press **No thanks**. If you allow them, your camera turns on by itself in every game (Classic Games, Chess, Practice and Chess vs Computer) and turns off when you leave the game. With the microphone on, other players hear you and your cat's mouth moves when you talk. If you press **No thanks**, you play as your cat.
3. Pick from the menu:
   - **⚡ Classic Games** (left): starts searching for a random player right away. You play a quick mini-game: Rock Paper Scissors, Quick Draw, Tic-Tac-Toe, Tap Race or Math Sprint. Every win adds 🔥 to your streak and catches 🐟 fish, and the longer your streak, the more fish each win gives. A loss resets your streak. The first time you search with your camera on, a reminder says that other players will see you.
   - **♞ Chess** (right): create a room and send the code to a friend. Your cameras turn on when the game starts.
   - **🎯 Practice mode** (underneath): play any game against a bot (Easy, Medium or Hard), or **Chess vs Computer**. Practice doesn't change your streak or fish. **Math Sprint** practice lets you choose which kinds of problems, the number ranges, and the time limit.
   - **🐱 My Cat & Shop**: spend fish on fur colors, hats, glasses, shirts, collars, things to hold and backgrounds.
   - **🎟️ Streak Pass**: wins earn XP (more with a longer streak) that unlock 20 tiers of fish and exclusive items.

During a game:

- **🐱 Show my cat** turns your camera off and shows your cat instead. **📷 Show my face** turns the camera back on.
- **📷 / 🐱 at the top** does the same thing from any screen. The app remembers your choice until you close the tab.
- **🙈 Hide their camera** shows the other player's cat instead of their camera. **🔈 Mute them** turns their voice off.
- **⏭ Skip** finds a new player. Skipping or closing the page in the middle of a Classic Games match counts as a loss.

## Test it by yourself

Open CamArcade in two *different* browsers (for example Edge and Chrome), make a different account in each, and click **Classic Games** in both. They'll find each other in a few seconds. (Two tabs in the same browser share one computer ID, so those matches count as practice.) If you hear a loud echo, mute one of them with 🎤 at the top.

## Playing with people on other computers

The other players need the site too. Either put this folder online (GitHub Pages or Netlify are free) and share the link, or send them the folder (zip it) and they double-click `index.html`. Games connect over the internet through the free PeerJS service, so you don't need to be on the same Wi-Fi.

Accounts only live on the computer where they were made. Logging in from other computers would need an online server.

## Safety

Classic Games matches you with strangers. They see you if your camera is on, and they hear you if your microphone is on. Don't share personal info. You can use these buttons at any time:

- **🐱 Show my cat** hides your face.
- **🙈 Hide their camera** hides theirs.
- **🔈 Mute them** turns off their voice.
- **⏭ Skip** leaves the match.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "The browser blocked the microphone" | Click the lock icon in the address bar, set Microphone to **Allow**, then press **Try again**. |
| "Windows is blocking your microphone" | Windows Settings → Privacy & security → Microphone → turn it on, including for desktop apps. |
| My camera doesn't turn on in games | Look at the camera button at the top. 🐱 means you're playing as your cat, so click it to switch to 📷. If the browser blocked the camera, click the lock icon in the address bar and set Camera to **Allow**. Close other apps that use the camera (Zoom, Teams, Discord). |
| I can't hear the other player | Click anywhere on the page once, because browsers keep sound off until you click. Also check that you didn't press **🔈 Mute them**. |
| My cat doesn't move its mouth | Check that 🎤 at the top isn't crossed out, and click anywhere on the page once (browsers keep sound paused until you click). |
| Classic Games keeps searching | Nobody else is searching right now. Keep it open, or use Practice mode. |
| Chess: "Room not found" | Check the code. Your friend must keep their game open. |
| Forgot my password | Accounts are only on this computer and can't be reset. Make a new account. |

## Files

- `index.html`: the whole app (all the screens)
- `app.js`: sign up / log in, the camera and microphone question, the menu, the top bar
- `common.js`: accounts, your saved cat and fish, the cat drawing, the shop items, the Streak Pass, the microphone and camera
- `solos.js`: Classic Games matchmaking, the mini-games, Practice mode
- `chess.js`: chess (online, pass & play, vs computer)
- `pass.js`, `character.js`: the Streak Pass and My Cat screens
- `style.css`, `pieces.css`: how everything looks
- `lib/`: chess rules ([chess.js](https://github.com/jhlywa/chess.js), BSD) and connections between players ([PeerJS](https://peerjs.com), MIT)
- `start.bat`, `serve.ps1`: the small local web server

Chess pieces: the "cburnett" set by Colin M.L. Burnett (GPLv2+), the same pieces lichess.org uses.
