# ⚔️ Goofy Duel

A silly first-person sword duel in a haunted Halloween arena, played in the browser, with Last Oasis-style
directional combat. Arms, legs and heads come off, and the crowd of monsters loves it.

The arena is set on a full-moon night: jack-o'-lanterns on the pillars, tombstones along the wall,
dead trees, ghosts drifting over the stands, bats overhead, and a wolf howl at the start of each round.

- **Server:** one Node.js file, no `npm install` needed. It runs the fight itself (so nobody can cheat) and serves the game page. The 3D engine (Three.js) is bundled in `public/vendor/`, so it works without internet.
- **Strictly 1v1, players only:** there are no bots. Open the page in any browser on your home network; the first two people in an arena fight each other. Anyone after that watches with a camera circling the fight, and the first watcher steps in if a fighter leaves.

## Run it on the Mac mini

1. Install Node.js 18 or newer if it isn't there yet: `brew install node` (check with `node --version`).
2. Download the game, either way works:
   - **Terminal:** `git clone https://github.com/cwilkerson1/goofy-duel.git ~/goofy-duel`
     (to update later: `cd ~/goofy-duel && git pull`)
   - **No git:** on the GitHub page click **Code → Download ZIP**, unzip it, and move the folder to `~/goofy-duel`.
3. Start it:
   ```bash
   cd ~/goofy-duel
   npm start            # or: PORT=8080 npm start
   ```
4. The terminal prints the addresses to open, for example:
   ```
   Goofy Duel running on port 3000
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

## How to play

The combat works like Last Oasis: you pick a side with the mouse, draw back, and release, and
the defender has to read which side you're on and block it. Click into the game to grab the
mouse (press **Esc** to let go).

| Do this | How |
|---|---|
| Move / jump / look | **W A S D**, **Space**, mouse |
| Pick a side | Move the mouse **left**, **right** or **up**. Your chosen side is **invisible**: no indicator, you just have to know. It stays until you move another way. |
| Attack | **Hold left click** to draw the weapon back on that side. You can keep steering to switch sides, then **release** to swing. |
| Heavy attack | Keep holding until your weapon glows white. It does 1.5× damage and staggers someone who blocks it, but you move slower while charging. |
| Block | **Hold right click** (or Shift) and move the mouse **toward the side the blade is coming from**. |
| Feint | Right click while drawing back cancels the attack. Or switch sides just before you release. |
| Kick | **F** (or a side mouse button). Kicks can't be blocked, they knock the target back and cancel what they were doing, and they're short range. |
| Mute | **M** |

**Reading attacks.** There are no hints. Watch where their weapon is drawn back to: a swing drawn on
*their* right arrives on *your* left. The only glow is white, when their attack has become a heavy.
They can switch sides until they release, so stay sharp.

**The rhythm.** A clean block bounces their swing and gives you a quick **riposte**: your next draw
is almost instant. A solid hit cancels whatever the victim was winding up. That makes most fights
go attack, block, riposte.

**Chamber.** Release your own swing from the side their attack is coming at (the same side you'd
block) just as theirs is about to land. Their swing is cancelled and yours keeps going.

**Stamina** (the yellow bar) is spent by swings, heavies, kicks, feints, jumps and absorbing blocks. If you
block with too little stamina, your guard breaks and the hit lands anyway.

**Momentum** matters. Stepping into your swing hits harder, and backing away from theirs softens it.

**Where swings land.** Overheads come down on heads (two clean ones take a head off). Side swings
follow where you look, so look down while slashing to go for the legs.

## The Wheel of Weapons

Before every round, a game-show wheel spins and picks each fighter's weapon. The slices are a fair
shot at everything, except Excalibur, which is a thin jackpot slice. Your result and your
opponent's are revealed when it stops, and the fight begins.

| Weapon | What it's like |
|---|---|
| 🗡️ Trusty Longsword | The baseline. Reliable. Boring. Effective. |
| ⚔️ Absurd Greatsword | Huge reach and damage, slow, cheap to block with |
| 🔪 Pointy Dagger | Very fast, very short, weak blocks |
| 🪓 Limb Collector | An axe that is very good at taking arms and legs off |
| 🔨 Bonk Hammer | Every hit dazes and shoves; bad at severing |
| 🔱 Very Long Stick | A spear with the longest reach in the game |
| 💀 Grim Scythe | Long, slow, and the best limb remover after Excalibur |
| 🐔 Rubber Chicken | Barely hurts, squeaks, and launches people across the arena |
| 🥖 Day-Old Baguette | Quick and weak, sprays crumbs |
| 🐟 Slappy Trout | A wet slap that knocks people flying |
| 🍳 Frying Pan | BONG. Heavy daze on hit, and blocking with it barely costs stamina |
| 👊 Bare Fists | The wheel hates you. Tiny reach, fast, red boxing glove. Comes with a sad trombone |
| ✨ EXCALIBUR | Rare jackpot. Fast, brutal, golden. Comes with a fanfare |

**Hitboxes and sweet spots.** Each weapon only hits with the part of it you can see, so reach comes
from its real shape. Where it connects decides the damage, and big yellow text tells you when you
found the sweet spot:

| Weapon | Sweet spot | Weak spot |
|---|---|---|
| Longsword, Greatsword, Excalibur | Upper third of the blade | Near the hilt |
| Dagger | The point | |
| Axe, Hammer | The head (BONK) | The handle |
| Spear | The tip, at the far end of its reach | Shaft pokes up close |
| Scythe | **The heel**, where the blade meets the pole: the strongest hit in the game | The pole |
| Frying Pan | The pan (BONG) | The handle |
| Chicken, Baguette, Trout | Beak, crusty end, face | |

**Blunt weapons** (hammer, chicken, baguette, trout, pan, fists) can still knock limbs and heads off,
but every hit also **bruises**: the body part turns purple and you keep losing health over time, so
they can win by bruising someone to death.

**Practice one weapon:** `WEAPON=scythe npm start` makes the wheel always land on that weapon
(use any id from `WEAPONS`, such as `trout` or `pan`).

**Every weapon swings differently.** Each one has its own wind-up, swing speed, recovery,
stamina cost and footwork, and the wheel tells you what you got (for example "quick wind-up · fast recovery"):

| Weapon | Feel |
|---|---|
| Dagger, Fists | Very fast to wind up, swing and recover, cheap on stamina, nimble feet, but tiny reach |
| Baguette, Chicken | Quick and light; the chicken's floppy swing takes a moment to arrive |
| Longsword | The baseline |
| Excalibur | Quicker than a longsword in every way |
| Trout, Frying Pan | Close to the baseline; the pan's swing is snappy |
| Spear | Quick jab with the longest reach, but slow to pull back |
| Axe | Slow wind-up, then a fast chop, then a long recovery |
| Hammer | The slowest wind-up; costs lots of stamina |
| Scythe | Slow wind-up and a long, sweeping swing |
| Greatsword | Slow at everything, heavy on stamina and slows your feet, but huge damage |

Each weapon's numbers live in `WEAPONS` at the top of `shared/sim.js`: reach, damage, limb-severing,
speed, knockback, daze and block cost, plus its slice size on the wheel.

What happens when a part comes off:

- **One leg gone:** you hop everywhere. **Both legs:** you crawl around at knee height.
- **Sword arm gone:** a spare sword appears in the other hand (a bit weaker). **No arms:** you kick, and with no legs either you headbutt.
- **Head gone:** you lose the round, and your camera rides along inside your flying head. Your body may keep running for a couple of seconds.
- **Every missing limb bleeds,** and if your health bar empties you bleed out.

First to 5 round wins takes the duel. To have more than one fight going at once, give each pair
its own arena name on the start screen, or add `?room=name` to the link.

## Files

```
server.js          HTTP + WebSocket server and the 60 Hz game loop
shared/sim.js      Combat rules, body poses, 3D hit detection (used by server and browser)
public/index.html  Start screen
public/client.js   3D arena, knights, blood and flying limbs, HUD, sounds (all synthesized), input
public/vendor/     Three.js 0.169 and its glow/post-processing add-ons (MIT licence)
mac/               launchd file for running it as a background service on macOS
legacy-2d/         The earlier side-view 2D version, kept for reference (not served)
```

**Graphics.** The game uses glow (bloom), moonlit reflections and a soft vignette. On a slow computer,
add `?lowfx` to the end of the address to turn those effects off.

Tuning knobs (timings in `T`, stamina costs in `COST`, damage and swing arcs in `SWING`, part health) are at the top of `shared/sim.js`.
