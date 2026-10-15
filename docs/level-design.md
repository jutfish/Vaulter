# Level design — reference

Levels are plain platform shapes: no gimmicks, no moving parts. The fun is the
vaulter and the pole meeting different shapes of ground. Code:
`src/data/levels.ts` (`CourseBuilder`, `buildLongRun`), tiles in
`src/gameplay/level.ts`. Checks: `tests/course.test.ts` (a scripted run
finishes the course), `tests/probe/course.probe.ts` (timing windows).

## Tiles

| Char | Tile | Notes |
|---|---|---|
| `#` | earth | grass on top when open above |
| `B` | wall | same physics as earth, drawn as brick: reads as "vault this" |
| `/` `\` | 45° slope rising right / left | solid below the diagonal; earth fills under it |
| `S` `F` | start, finish column | |

Slopes: the running body's feet walk the diagonal (the box ignores slopes and
the earth tucked under them), with a `body.stepUp` (10 px) lip allowance and
"stick to the ground" when running down. Gravity along a slope is
`run.slopeGravity` (200): uphill costs speed, downhill adds it and overspeed
doesn't bleed away while you keep running down. The carried pole and the
planted tip collide with the diagonal exactly (a plant on a slope lands on the
slope surface). Planting while running *down* a slope onto flat ground plants
the pole nearly level: you fall back. Get to the flat first.

## Looks (zones, v0.7)

`LevelData.zones` sets the look of the land from a column on (rendering
only; no physics): `Level.themeAt(tx)`, used by `WorldView` to choose tiles,
slope colours and carving colours. Without zones a level keeps the old
daytime grass-and-stone look (`firstWall`).

| Theme | Top / body tiles | Walls (`B`) | What it is |
|---|---|---|---|
| track | `track` (red tartan) / `concrete` | concrete | the running track; its pits hold steeplechase water (drawn in front of the vaulter) |
| infield | `grass` / `dirt` | stone | the infield (the hills) |
| stand | `concreteTop` / `concrete`; ground raised above the track and floating tiers are `seats` | `adBoard` | the stands: lower stand (plateau), hoarding (plateau wall), the seating switchback |
| roof | `roofTop` / `roof` (lit window slits) | roof | the cliff top and the slide down the outside |
| outside | `tarmac` / `dirt` (potholes go down to the earth) | stone | the car park, the perimeter wall (big wall), the last wall |

Stadium backdrop (`src/rendering/stadium.ts`, painted once into canvases,
seeded): a banded night sky, slow stars, **the moon** (screen-fixed, top
right, always visible), the city skyline (parallax 0.2) and the far stand
full of people under floodlights (parallax 0.5; it ends about where the
near stand's cliff is). The land gets a night tint. The crowd flashes
cameras and bounces when you clear the bar.

## The long run (v0.4; the stadium since v0.7), left to right

`CourseBuilder` lays columns left to right with a running ground height;
landmarks (`longRunMarks`) are computed as it goes, so moving a section
doesn't break the tests.

1. **Run-up** (~850 px) and **the competition bar** (40 px, `LevelData.bar`;
   the Olympic final) with a landing mat and the scoreboard. Touch the bar,
   or pass it with your feet below it (ran under), and it falls: the crowd
   groan and the scoreboard says `NO JUMP! / PRESS R: TRY AGAIN`. Over it
   clean: cheering and `GOLD MEDAL! / OLYMPIC CHAMPION`. Knocking it doesn't
   stop you carrying on (`World.bar`, events `barKnocked` / `barCleared`).
2. **Potholes** 2, 3, 4, 5, 6 tiles wide, 1 deep. A hop at a sprint covers
   ~10 tiles; too slow, too early or a short hop and you're in the hole (hop
   out, rebuild speed). A carried pole can dip into them.
3. **Rolling hills** (1–3 tile slopes). The pole held level digs into an
   uphill slope (it scrapes and drags you); carry it up (no arrow) over hills.
4. **Plateau** (48 px cliff face): vault up onto it, run down its far slope,
   **48 px wall**.
5. **The switchback.** A cliff of 8 tiles (128 px) can't be vaulted (best
   apex ~87 px). Over the ground run-up is a **ledge** (4 tiles up, ends 7
   tiles short of the cliff, a 3-tile post at its far end so you can't vault
   onto it from the front), and over the ledge an **upper tier** at the
   cliff's height (ends 34 tiles short of the cliff on the left).
   - Run right under the ledge (pole level or it scrapes the ledge), plant
     short of the cliff, release **early** and hold ←: the vault fires you up
     and *backwards* onto the ledge.
   - Run left along the ledge (under the tier) and do it again, holding →:
     you land on the tier, which runs on to the cliff top.
6. **Long slope** down from the cliff top (8 tiles) into the **big wall**
   (80 px): only clearable with the downhill speed (~410 px/s) and an earlier
   release than usual (faster run → earlier release).
7. Two **potholes**, the **last wall** (64 px), the flag.

### Checkpoints and the skip cheat (v0.7)

`LevelData.checkpoints`: a landing spot just past each obstacle, in course
order (bar, five pits, plateau, plateau wall, ledge, tier, big wall, two
pits, last wall), each with the columns and height that count as "got
there". `World.checkpoint` is the furthest reached (on the ground there);
**N** (`World.skipObstacle`) puts you on the next one, standing, pole in
hand (same pole tier). Tests: a real run reaches every checkpoint in order;
skipping lands on each one.

### Timing windows (probe, 2026-10-11; the bar 2026-10-15)

Rows = how far before the obstacle Down is pressed (px), columns = hold after
the plant (s). `OK` = made it, pole still in hand.

```
The competition bar (40 px), at full speed (OK = cleared, x = knocked)
   d    0.20  0.25  0.30  0.35  0.40  0.45  0.50  0.55  0.60
  80       .     .     .     x     x     x     x     x     x
 100       .     .     .    OK    OK    OK    OK    OK    OK
 120       .     .     .     x    OK    OK    OK    OK    OK
 140       .     .     .     .    OK    OK    OK    OK    OK
 160       .     .     .     .     x    OK    OK    OK    OK
 180       .     .     .     .     .     x    OK    OK    OK
Backwards onto the ledge (running right at full speed; d = before the cliff face; Left after release)
   d    0.20  0.25  0.30  0.35  0.40
 120       .    OK    OK     .     .
 140       .    OK    OK    OK     .
 160       .    OK    OK    OK     .
 180       .     .     .    OK    OK
Backwards onto the tier (running left along the ledge; d = past the tier's left end; Right after release)
   d    0.20  0.25  0.30  0.35  0.40
 -40       .    OK    OK    OK    OK
 -20       .    OK    OK    OK     .
   0       .    OK    OK    OK     .
  20       .    OK    OK     .     .
  40       .    OK     .     .     .
Big wall (80 px), running down the long slope from the cliff top
   d    0.35  0.40  0.45  0.50
 100       .     .    OK     .
 120       .    OK    OK     .
 140       .    OK     .     .
 160      OK    OK    OK     .
Last wall (64 px), from after the last pothole at full speed
   d    0.40  0.45  0.50  0.55  0.60
 120      OK    OK     .     .     .
 140       .    OK    OK    OK     .
 160       .    OK    OK     .     .
 180       .     .    OK     .     .
```

Pressed earlier than ~190 px before the cliff, the backwards vault hits the
ledge's underside (knocked off the pole).

## Words in the land (v0.6)

Almost no instruction: the game is about discovering what the pole can do.
`src/data/hints.ts` holds everything written into the land; it's carved in a
3x5 pixel font (`src/data/pixelFont.ts`), dark groove with a lit edge, and
only ever into solid ground.

| Id | When | Where | Text |
|---|---|---|---|
| intro | always | under the ground at the start, big (2x) | THIS GAME IS ABOUT DISCOVERING SKILLS YOU ALREADY HAVE. |
| hopToIt | always | under the ground at the backwards jump, big (3x) | HOP TO IT. |
| slip | always | diagonally down the long slope from the cliff top, just under the surface (`followSurface`) | DON'T LET THIS OPPORTUNITY SLIP AWAY. |
| win | carved on finishing | under the ground past the flag, big (2x) | THAT'S IT FOR NOW. THANKS! |
| lost pole | 3 s without the pole | under the ground where you are | OOPS, BE CAREFUL NOT TO LOSE YOUR POLE! IF YOU CAN'T FIND IT, PRESS R TO RESTART. |

Text never overlaps text: the lost-pole note is placed clear of every
writing (including the win line before it's carved) and of its own earlier
spot: below the text in the way, else beside it, and only where all of it
is in solid ground. Tests check every writing is in the ground and none
overlap.

Stuck-at-an-obstacle hints (`StuckHint`, `HintTracker`: seconds spent at an
obstacle, counted across restarts, never shown once solved) still work but
none are used now. Dev: `__vaulter.carveHints()` carves the win line (and any
stuck hints) to look at them.

## Rules of thumb

- A wall ≤ 48 px is a rhythm obstacle; 64 px needs a clean vault at full
  speed; 80 px needs extra speed (a downhill run-up); 96+ px is a cliff.
- A vault needs ~120 px of flat ground before the obstacle *and* the run-up
  before that: walls straight after a landing are too tight (you land slow).
- A backwards vault lands ~100–140 px behind where the pole planted, ~64 px up.
- Headroom of 3 tiles (48 px) lets you run underneath with the pole level; the
  neutral carry (60° up) scrapes it.
