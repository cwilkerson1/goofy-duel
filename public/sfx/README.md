# Sound effects

Drop recorded sounds into folders here, one folder per kind of sound. Every file in a folder is a
different take of that sound; the game picks one at random each time and nudges its pitch, so
several takes per folder sound best. Any kind without a folder uses the built-in synthesized sound.

| Folder | Plays when |
|---|---|
| `clang/` | weapons meet: a block, a parry, a chamber |
| `blade/` | an edged or pointed weapon hits someone |
| `blunt/` | a mace, hammer, flail or fist hits someone |
| `thud/` | heavy impacts: a sweet-spot hit, a kick, a guard break, a heavy swing |
| `swing/` | a weapon or kick whooshes through the air |
| `step/` | footsteps |
| `gore/` | a limb or head comes off |
| `grunt/` | the person who got hit (optional) |
| `cheer/` | the crowd roars (a hit, a kill, the end of a round) |
| `scream/` | someone in the crowd screams (a limb comes off, the pendulum, fire) |
| `ooh/` | the crowd winces at a big hit |
| `boo/` | the crowd gets bored when nothing happens for a while |
| `laugh/` | the crowd laughs (a tomato hits, a kick misses) |

Formats: `.ogg`, `.mp3`, `.wav`, `.m4a`, `.flac` or `.webm`. Short files (under a second) work best, except the crowd folders, where 1 to 3 seconds sounds right.
The sound files themselves aren't kept in git, so a `git pull` never touches them.
Free CC0 packs that fit well: Kenney's "Impact Sounds" and "RPG Audio" (kenney.nl).
