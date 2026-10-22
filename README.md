# ⚔️ Arena Roulette

(Formerly Goofy Duel. The repository, the `goofy-duel` folder and the Mac mini service keep their old names so existing setups keep working.)

A silly first-person sword duel in a haunted Halloween arena, played in the browser, with Last Oasis-style
directional combat. Arms, legs and heads come off, and the crowd of monsters loves it.

The arena is set on a full-moon night: jack-o'-lanterns on the pillars, tombstones along the wall,
dead trees, ghosts drifting over the stands, bats overhead, and a wolf howl at the start of each round.

- **Server:** one Node.js file plus one library (`npm install` once, and again after updates). It runs the fight itself (so nobody can cheat) and serves the game page. The 3D engine (Three.js) is bundled in `public/vendor/`, so it works without internet.
- **Strictly 1v1:** open the page in any browser on your home network; the first two people with the same arena code fight each other (or practice alone against the computer). Anyone after that watches with a camera circling the fight, and the first watcher steps in if a fighter leaves.

## Run it on the Mac mini

1. Install Node.js 18 or newer if it isn't there yet: `brew install node` (check with `node --version`).
2. Download the game, either way works:
   - **Terminal:** `git clone https://github.com/cwilkerson1/goofy-duel.git ~/goofy-duel`
     (to update later: `cd ~/goofy-duel && git pull && npm install`)
   - **No git:** on the GitHub page click **Code → Download ZIP**, unzip it, and move the folder to `~/goofy-duel`.
3. Start it:
   ```bash
   cd ~/goofy-duel
   npm install          # once: the WebRTC library for the smooth connection (below)
   npm start            # or: PORT=8080 npm start
   ```
4. The terminal prints the addresses to open, for example:
   ```
   Arena Roulette running on port 3000
     This machine:  http://localhost:3000
     On your LAN:   http://192.168.1.42:3000
   ```
   Open the **LAN** address on any computer in the house. The first time, macOS may ask whether
   `node` can accept incoming connections: click **Allow**.

### Asking OpenClaw to do it

If OpenClaw runs your Mac mini, you can hand it the steps in plain words, for example:

> Copy the goofy-duel folder to ~/goofy-duel, make sure Node 18+ is installed with Homebrew,
> then run `npm start` in that folder in the background and tell me the "On your LAN" address it prints.

To keep it running all the time (and after reboots), have it install the launchd file in
`mac/com.goofyduel.server.plist`. The comments at the top of that file say which two paths to edit
and the two commands to load or stop it. Logs go to `/tmp/goofyduel.log`.
The launchd file also tells macOS not to throttle the server in the background, which keeps the
game's timing steady, and keeps the Mac from idle-sleeping while it runs. If you installed it before,
copy it over again (editing the two paths) and reload it.

**Smooth connection (WebRTC):** the game talks to each browser two ways. Game updates and movement go
over a WebRTC data channel that behaves like UDP: on Wi-Fi a lost packet is just skipped, because the next
update replaces it 33 ms later. Over a plain WebSocket (TCP) a lost packet holds up everything behind it
until it's resent, which shows up as the opponent freezing and then jumping. Swings, kicks and hits still
go over the WebSocket, which never loses anything. If the library isn't installed (`npm install`) or the
channel can't connect, everything uses the WebSocket, as before. **F3** in the game shows which link
you're on, and the server log says when each player joins the fast lane. If the Mac's firewall is on,
allow incoming connections for `node` so the channel can connect.

## How to play

The combat works like Last Oasis: you pick a side with the mouse, draw back, and release, and
the defender has to read which side you're on and block it. Click into the game to grab the
mouse (press **Esc** to let go).

**No one to fight?** Press **🤖 Practice against the computer** on the start screen. You get a
private arena against a computer knight that keeps to its weapon's range, attacks from all three
sides (sometimes heavy, sometimes a feint), blocks about 60% of attacks it sees coming, and kicks
anyone who turtles. Its settings are at the top of `bot.js`.

| Do this | How |
|---|---|
| Move / jump / look | **W A S D**, **Space**, mouse |
| Sprint | **Hold Shift** while moving forward: 60% faster, but it drains stamina and you can't sprint while attacking or blocking. |
| Pick a side | **Flick** the mouse **left**, **right** or **up**. Slowly turning to follow your opponent doesn't change it, and once you're winding up it takes a bigger flick. A small mark beside your crosshair shows your side; only you can see it, so your opponent still has to read your weapon. It stays until you flick another way. If the swings feel backwards, turn on **Flip side swings** in Settings so the mouse points the way the blade travels. |
| Light attack | **Click** (or hold just long enough to draw back) and release. Quick to throw, quick to recover. A ring round the crosshair fills while you hold; once it passes the tick mark, letting go swings a light attack. |
| Heavy attack | **Keep holding** until the ring closes, you hear a rising ping and your weapon glows white. Your weapon draws back further, the swing is a third slower and you recover slower, but it does 1.5× damage and staggers someone who blocks it. You move slower while charging. |
| Block | **Hold right click** and move the mouse **toward the side the blade is coming from**. While you hold it, the guard follows the mouse freely, no flick needed: slide left or right to switch sides, up for overhead, back down to return to the sides. A good block bounces the attacker back. Blocking a heavy still staggers you briefly. Blocking costs stamina; with too little, the guard breaks. Every weapon winds up in one of three shapes you can read: raised diagonally to one side for a side swing, or held straight up over the head for an overhead. A faint streak follows the weapon's head as it's drawn back and swung. |
| Feint | **Q** (or right click) cancels your attack: any time while drawing back, and even early in the swing itself, up to about halfway, as long as it hasn't hit yet. Cancelling a swing already in motion costs more stamina. Your side is locked in the moment you click, so to come from another side, feint and attack again. |
| Kick | **F** (or a side mouse button). You see your boot fly out. Kicks can't be blocked and they're short range. **Land it** and the target is knocked flat on their back for about two seconds: they can't block, swing or move until they've got up, so step in and look down to hit them on the ground. A kick burns most of your stamina (65 of 100) and you need at least 40 to throw one. **Miss** and you stumble forward, unable to act for a moment, with your stamina slow to recover. |
| Taunt | **T**. Shout at your opponent and play to the crowd. For just over a second you can't attack, block or kick, and a hit cuts it short. The crowd's roar gives you back 15 stamina (25 if your opponent is beaten: knocked down, stunned, missing two limbs or badly hurt), and the crowd turns against your opponent, throwing more at them from then on. Taunt someone who's beaten and the crowd pelts them right away. Once every 4 seconds. |
| Rematch, once the match is over | **R** (both fighters press it, and a fresh best of 5 starts at 0–0) |
| Copy an invite link while waiting for an opponent | **C** |
| Mute | **M** |
| Settings menu (mouse, volume), or leave the arena | **Esc** (or ⚙ Settings on the start screen) |
| Connection and frame-rate stats, for tracking down stutter | **F3** |

**Reading attacks.** There are no hints. Watch where their weapon is drawn back to: a swing drawn on
*their* right arrives on *your* left. The only glow is white, when their attack has become a heavy.
Once they start drawing back, their side is locked in; the only way to change it is to feint and start again.

**Drag and accel.** Once a swing is on its way, turn your view to change when it lands. Turning the
same way the blade is travelling (to your right for a left swing, to your left for a right swing,
down for an overhead) speeds it up by up to 30%. Turning against it slows it down by up to 35%, or 45%
for a heavy, which drains stamina while you hold it back. Use it to beat a guard that went up too
early, or to land a beat before they expect.

**Chaining swings.** You don't have to wait for a swing to fully finish: click again while it's still going and the next attack starts the moment it can, halfway through the recovery. Move the mouse toward a side as you click to pick it, so right-then-left combos flow. (A swing that got parried still has its full recovery.)

**The rhythm.** A clean block bounces their swing back into a long recovery, so your answer comes at
normal speed but they have less time to get a guard up. A solid hit cancels whatever the victim was
winding up. That makes most fights go attack, block, counter.

**Chamber.** Release your own swing from the side their attack is coming at (the same side you'd
block) just as theirs is about to land. Their swing is cancelled and yours keeps going.

**Stamina** (the yellow bar) is spent by swings, heavies, kicks, feints, jumps, sprinting and absorbing blocks. If you
block with too little stamina, your guard breaks and the hit lands anyway.

**Footwork.** Knights in armour walk at a steady pace, back off slower than they advance, and take a
moment to get going and to stop. You see and hear every step, and your weapon sways with your stride.

**Momentum** matters. Stepping into your swing hits harder, and backing away from theirs softens it.

**Where swings land.** Overheads come down on heads (two clean ones take a head off). Side swings
follow where you look, so look down while slashing to go for the legs.

## The Wheel of Weapons

Before every round, a game-show wheel spins and picks each fighter's weapon. The slices are a fair
shot at everything, except Excalibur, which is a thin jackpot slice. Your result and your
opponent's are revealed when it stops, and the fight begins.

| Weapon | What it's like |
|---|---|
| 🗡️ Longsword | The baseline: reach and speed in balance |
| ⚔️ Greatsword | Two-handed. Huge reach and damage, slow, cheap to block with |
| 🔪 Rondel Dagger | Very fast, very short, weak blocks. A stabbing weapon, so it rarely takes limbs |
| 🪓 Battle Axe | Very good at taking arms and legs off |
| 🔨 War Hammer | Two-handed. Every hit dazes and shoves; bad at severing |
| 🔱 Halberd | Two-handed. An axe blade on a long pole with a spike on top: long reach, big hits, takes limbs, slow to swing |
| 💀 War Scythe | Two-handed. Long, slow, and the best limb remover after Excalibur |
| 🗡️ Arming Sword | A short one-handed sword: quick and light, a little less reach and damage than the longsword |
| ⚒️ Flanged Mace | One-handed and blunt. Built to beat armour: hits hard, dazes and shoves |
| ⛓️ Flail | Blunt, with a spiked ball on a chain. Hits hard and knocks people back, but it's poor for blocking |
| ⛏️ War Pick | A long spike that punches through armour; small sweet spot, big damage |
| ✨ Excalibur | Rare jackpot. Fast, brutal, golden. Comes with a fanfare |

**Hitboxes and sweet spots.** Each weapon only hits with the part of it you can see, so reach comes
from its real shape, and the hitboxes are matched to each weapon's 3D model. Whichever part of the weapon
makes contact first decides the damage. There are no pop-up numbers or words: a sweet-spot hit sprays more
blood and lands with a heavy thud, while a handle or shaft hit barely bleeds.

| Weapon | Sweet spot | Weak spot |
|---|---|---|
| Longsword, Greatsword, Excalibur | Upper third of the blade | Near the hilt |
| Dagger | The point | |
| Axe, Hammer, Mace | The head | The handle |
| Halberd | The axe blade, near the top of the pole (the spike on top hits well too) | The pole, up close |
| Scythe | **The heel**, where the blade meets the pole: the strongest hit in the game | The pole |
| Arming Sword | Upper third of the blade | Near the hilt |
| Flail | The spiked ball | The handle, and the chain is weak |
| War Pick | The spike | The handle |

**Blunt weapons** (hammer, mace, flail) can still knock limbs and heads off,
but every hit also **bruises**: the body part darkens and you keep losing health over time, so
they can win by bruising someone to death.

**Practice one weapon:** `WEAPON=scythe npm start` makes the wheel always land on that weapon
(use any id from `WEAPONS`, such as `mace`, `flail`, `pick` or `arming`).

**Two-handed weapons.** The big ones (greatsword, hammer, halberd and scythe) are held with both hands.
They swing slower than one-handed weapons but hit about 20% harder. Lose an arm while holding one and
you swing it one-handed: slower still, and 30% weaker.

**Every weapon swings differently.** Each one has its own wind-up, swing speed, recovery,
stamina cost and footwork, and the wheel tells you what you got (for example "quick wind-up · fast recovery"):

| Weapon | Feel |
|---|---|
| Dagger | Very fast to wind up, swing and recover, cheap on stamina, nimble feet, but tiny reach |
| Arming Sword | Quick and light |
| Flail | The ball takes a moment to come round, so its swing is a touch slow |
| Longsword | The baseline |
| Excalibur | Quicker than a longsword in every way |
| Mace, War Pick | Close to the baseline; the pick winds up a bit slower |
| Halberd | Big, slow chopping arcs with the longest reach in the game |
| Axe | Slow wind-up, then a fast chop, then a long recovery |
| Hammer | The slowest wind-up; costs lots of stamina |
| Scythe | Slow wind-up and a long, sweeping swing |
| Greatsword | Slow at everything, heavy on stamina and slows your feet, but huge damage |

Each weapon's numbers live in `WEAPONS` at the top of `shared/sim.js`: reach, damage, limb-severing,
speed, knockback, daze and block cost, plus its slice size on the wheel.

What happens when a part comes off:

- **One leg gone:** you hop everywhere. **Both legs:** you crawl around at knee height.
- **Sword arm gone:** a spare sword appears in the other hand (a bit weaker). **No arms:** you kick, and with no legs either you headbutt.
- **Head gone:** you lose the round, and your camera rides along inside your flying head. Your body drops on the spot.
- **Every missing limb bleeds,** and if your health bar empties you bleed out.
- **Dying:** the body goes limp, the knees give, and it falls like dead weight in the direction the killing blow pushed it.

Every duel is **best of 5**: the first to win 3 rounds wins and the match ends there. Both fighters press **R**
to run it back at 0–0 (the screen shows when your opponent is waiting on you), or press **Esc** and leave.

**Arena codes:** the start screen gives you a short code like `WOLF-42`. Anyone who types the same code (or
opens the invite link from **🔗 Copy invite link**, which is `/?room=WOLF-42`) lands in your arena. **🎲 New code**
picks another, so several pairs can fight at once without bumping into each other. While you wait in the
arena, the code is on screen and **C** copies the link.

## Traps

Each round rolls one kind of trap (never the same kind twice in a row) and lays it out differently. Nobody is told which one it is; you find out when it starts moving:

- **The pendulum.** Two stone pillars hold a beam across the arena, and a huge axe blade swings from
  it right through the middle, across the line between the spawns. It cuts whatever it catches and
  knocks you off your feet. It's low enough to hit your body in the middle and climbs as it swings out.
  The pillars also block movement, so you can fight around them.
- **Fire vents.** Iron grates in the floor glow and spark for a moment, then roar up in a column of
  flame. Standing in it burns, and you keep smouldering for a moment after you get out.
- **Spike plates.** Step on one and it clicks. A moment later spikes punch up through it and into the
  legs of whoever is standing there, which could be your opponent if you knock them onto it.
- **The sweeper.** A spiked iron arm turns around a post in the middle of the arena at shin height,
  reaching all the way to the wall. Jump it. If it catches your legs it cuts them and sweeps you off
  your feet, and anyone lying on the floor gets caught again next time round.
- **The bull.** A few seconds into the fight a gate opens and a bull trots in. It turns to face
  whoever is closest, paws the ground and snorts, then charges in a straight line. Get out of its path
  (or bait it into your opponent). Its horns throw you across the arena. It stops at the wall or when
  it runs out of steam, gets its breath back, and picks a new target.

Traps only hurt once the fight starts. The practice knight steps out of the pendulum's way, away
from vents and out of the bull's path, and usually jumps the sweeper, but walks straight onto spike plates.

**Practice one trap:** `TRAP=bull npm start` makes every round use that trap (`pendulum`, `fire`,
`spikes`, `sweeper` or `bull`).

## The crowd

The stands are packed with people who bounce on the benches, leap up waving when blood is spilled,
and make noise: a constant murmur, roars and cheers, screams when a limb comes off or someone gets
caught by a trap, an "ooooh" at a big hit, laughter when a tomato lands, and boos when nothing has
happened for a while. The voices are synthesized; recorded crowd sounds can replace them (see Sound effects).

**Throwing things.** Anyone watching (the third person in an arena onwards) gets a seat in the stands.
Click to take it, look around with the mouse, pick **1** 🍅 tomato, **2** 🪨 rock or **3** 🥬 cabbage,
and click to throw at whatever the crosshair is on, about one throw a second. A tomato splatters (in the
face, it covers the fighter's screen for a few seconds), a rock stings and interrupts a wind-up, and a
cabbage knocks you back a step. Nothing thrown can take off a limb. The crowd also throws things on its
own every few seconds, and more after someone loses a limb.

## Sound effects

Every sound is synthesized in the browser unless recorded ones are installed. Put audio files in
folders under `public/sfx/` (`clang`, `blade`, `blunt`, `thud`, `swing`, `step`, `gore`, `grunt`) and
they're used instead, with several takes per folder picked at random. `public/sfx/README.md` says
which folder plays when. Kenney's free CC0 "Impact Sounds" and "RPG Audio" packs fit well.

## Files

```
server.js          HTTP + WebSocket server and the 60 Hz game loop
rtc.js             The WebRTC fast lane: game updates and movement over a UDP-like data channel
shared/sim.js      Combat rules, body poses, 3D hit detection (used by server and browser)
shared/predict.js  Moves your own knight instantly in the browser, before the server confirms it
shared/hazards.js  The arena's traps: layout, pendulum, vents, spike plates, sweeper, bull (server and browser)
public/index.html  Start screen
public/client.js   3D arena, knights, blood and flying limbs, HUD, sounds (all synthesized), input
public/hazards.js  Drawing the traps: pillars, the pendulum, fire and smoke, spikes, the sweeper, the bull
public/crowd.js    The people in the stands, their voices, and the things they throw
public/music/      Fight music: drop audio files here
public/vendor/     Three.js 0.169 and its glow/post-processing add-ons (MIT licence)
mac/               launchd file for running it as a background service on macOS
legacy-2d/         The earlier side-view 2D version, kept for reference (not served)
```

**Fight music.** Ten tracks come with the game (Crown of Ash, Iron Jester, Midnight Marionettes and more), and each round starts with a random one. Both fighters (and anyone watching) hear the same track. To add your own, put music files (mp3, m4a, ogg, wav, aac, flac or webm) in `public/music/`. A track
starts when each fight begins and fades out when the round ends; with several files, each fight picks
a different one. No restart is needed: just refresh the page. **M** mutes music and sounds.

**Graphics.** The knights wear great helms, mail and team-coloured surcoats, and fight in a moonlit stone
arena. All textures (stone, earth, wood, mail, steel, cloth) are generated in code when the page loads,
so there are no image files to download. Graphics are fixed at the fastest setting (Low) for everyone. Press **Esc** in game (or **⚙ Settings**
on the start screen) for mouse sensitivity, field of view, and music and sound volume. These are remembered
on that computer. The richer graphics options are still in the code (`PRESETS` in `public/client.js`)
if you ever want them back.

**Smooth over Wi-Fi.** Your own knight moves the instant you press a key and quietly lines up with
the server afterwards, and your opponent is drawn from a short buffer that grows on a bumpy connection.
A wired connection or 5 GHz Wi-Fi still gives the crispest fights.

Tuning knobs (timings in `T`, stamina costs in `COST`, damage and swing arcs in `SWING`, part health) are at the top of `shared/sim.js`.
