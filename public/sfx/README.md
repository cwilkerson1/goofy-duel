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

Formats: `.ogg`, `.mp3`, `.wav`, `.m4a`, `.flac` or `.webm`. Short files (under a second) work best.
The sound files themselves aren't kept in git, so a `git pull` never touches them.
Free CC0 packs that fit well: Kenney's "Impact Sounds" and "RPG Audio" (kenney.nl).
