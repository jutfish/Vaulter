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

## The long run (v0.4), left to right

`CourseBuilder` lays columns left to right with a running ground height;
landmarks (`longRunMarks`) are computed as it goes, so moving a section
doesn't break the tests.

1. **Run-up** (~850 px) and a **warm-up wall** (32 px).
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

### Timing windows (probe, 2026-10-11)

Rows = how far before the obstacle Down is pressed (px), columns = hold after
the plant (s). `OK` = made it, pole still in hand.

```
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

## Hints carved into the land (v0.5)

The game is about discovering what the pole can do, so help arrives late,
in the world, and only where you're struggling. `src/data/hints.ts` lists
them; `HintTracker` (`src/gameplay/hints.ts`) counts seconds the player's
feet spend in an obstacle's zone before it's solved (counted across restarts
with R; solving it once stops the clock for good). The text is carved
letter by letter into the earth (3x5 pixel font, `src/rendering/pixelFont.ts`)
and stays carved.

| Hint | After | Where | Text |
|---|---|---|---|
| firstVault | 45 s before the warm-up wall | ground | how to point, plant, bend, release |
| potholes | 60 s | ground under the holes | sprint, hop before the edge, hold for longer |
| plateau | 90 s | ground before it | the pole can take you up onto things |
| ledge | 3 min under the ledge | cliff face | NOT EVERY VAULT HAS TO GO FORWARDS. |
| ledge2 | 5 min | cliff face | let go early, hold the way you came |
| tier | 2 min on the ledge | in the ledge | ONCE MORE, THE OTHER WAY. |
| bigWall | 2 min | ground before it | more speed down the slope, plant on the flat, let go sooner |
| lastWall | 2 min | ground | plant two pole-lengths out, let go as it stands up |
| lost pole | 3 s without it | ground where you are | OOPS, BE CAREFUL NOT TO LOSE YOUR POLE! IF YOU CAN'T FIND IT, PRESS R TO RESTART. |

The lost-pole hint is carved again where you are if you lose it more than
240 px from the last one, and moves down past any hint already carved there.
Dev: `__vaulter.carveHints()` carves them all to look at.

## Rules of thumb

- A wall ≤ 48 px is a rhythm obstacle; 64 px needs a clean vault at full
  speed; 80 px needs extra speed (a downhill run-up); 96+ px is a cliff.
- A vault needs ~120 px of flat ground before the obstacle *and* the run-up
  before that: walls straight after a landing are too tight (you land slow).
- A backwards vault lands ~100–140 px behind where the pole planted, ~64 px up.
- Headroom of 3 tiles (48 px) lets you run underneath with the pole level; the
  neutral carry (60° up) scrapes it.
