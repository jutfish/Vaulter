# Level design — reference

Levels are plain platform shapes. The fun is the vaulter and the pole meeting
different shapes of ground. The traffic (v0.9) is the first level with moving
parts, and even there the vehicles stand still in the simulation (see "The
traffic" below). Code:
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
| `=` | road | ground like any other until the traffic moves; then it carries you (and your pole) back |
| `V` | vehicle | solid like earth; not drawn as a tile (the vehicle's sprite draws it) |

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

After a clean clearance, the first landing starts the podium cutscene (once
per run; the world is frozen while it plays and resumes as it fades back in;
see `docs/design-intent.md`).

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

## The traffic (v0.9), left to right

The second part of the story, straight after the stadium (finish it and the
game fades into this; `?level=traffic` or `await __vaulter.level('traffic')`
starts here; Play starts at the furthest chapter reached, save v3). Code:
`buildTraffic` / `trafficMarks` in `src/data/levels.ts`, vehicle shapes in
`src/data/vehicles.ts`, the model in `src/gameplay/traffic.ts`, the look in
`src/rendering/TrafficView.ts`. Test: `tests/traffic.test.ts` (plays it from
the bus stop onto a canopy); probe: `tests/probe/traffic.probe.ts`.

**The frame.** It's simulated in the traffic's frame: every vehicle goes the
same speed, so vehicles are ordinary static tiles and the vault is unchanged.
The road and everything fixed to it move backwards at `traffic.speed` (200 px/s).
Where roadside things are is a pure function of time since the bus pulled off;
they repeat every block (1800 px, 9 s): a low bridge, a "LOW BRIDGE" sign
before it, a tall building with an entrance canopy, lamp posts every 200 px,
a sign gantry, trees. Night, the moon top right, the skyline scrolling at 0.2.

**The road.** Before you board, the world is still and the road is ground.
After, standing on it means you've fallen into the traffic: no control, you
tumble back along the near lane (no collisions), speeding up to 900 px/s, and
you're put back on the bus's rear platform (pay once per run; R restarts at
the bus stop with the fare unpaid). A pole planted on the moving road is torn
away; a loose pole on it is carried back and put down on the bus's top deck.

**Bridges and canopies** are solid: they shove you out of their front (back
with the road) or underside. Every bridge clears every vehicle (underside 85 px)
but not a vaulter standing on the lorry (head at 90) or the transporter. Land
on top of a canopy (116 px up) and you're off the traffic: the chapter's done,
the vehicles drive on without you.

Heights in tiles above the road (h):

1. **The bus stop and the bus.** Walk up the step at the back of the open-top
   bus onto its platform (h1): the gold medal hops off your chest into the fare
   box, *ding*, and 1.2 s later the bus pulls off (2.5 s to speed). Up the
   stairs to the top deck (h2).
2. **Up onto the lorry.** Run along the top deck, hop the 3-tile gap to the
   second bus (or just drop onto its back step), run on and vault up onto the
   box lorry (h4, +32 px; a hop tops out at ~16 px, so it's a vault). Plant on
   the bus: the gap is 1 tile.
3. **Off the lorry before the bridge.** The next bridge reaches the lorry ~4.5
   s after the bus pulls off, about when you'd land on it. Run straight off its
   front (or hop) onto the low car (h1) 7 tiles ahead; a bridge on you shoves
   you off the lorry's back onto the second bus. A hop from the lorry lands
   long: the car is short, the house move is 1 tile behind it (hop that gap too).
4. **The tightrope.** A static caravan carried over two dollies (h1) with a
   3-tile gap between them. Under the caravan there's 32 px of headroom: no
   hop (`hop.minHeadroom`), no vault (you'd bonk), the pole must be level. Stop
   near the edge with the pole pointing across (arrow held), let it go (S) and
   it lies across the gap; walk over it and pick it up (S) on the far side.
   Dolly A is long (6 tiles open before the caravan) so you land well before
   the caravan; a hop that's still in the air there jams the pole tip on its face.
5. **The car transporter.** Run off the far dolly, hop the 2-tile gap onto the
   transporter's rear deck, up its ramp and along the upper deck (h5), and
   vault up as the building's canopy comes past. The bridge sweeps the upper
   deck too: wait on the dolly (under the caravan's lee, h1) for the bridge to
   pass, then go when the next building's entrance comes into view.

Checkpoints (N): on the bus's top deck (skipping obstacle 1 pays the fare),
the lorry, the car, dolly B past the gap, then the last skip lands you on the
next canopy. A run that used N doesn't set a best time.

Couldn't be bypassed when checked (probe): from the lorry the best vault apex
is ~108 px (canopy top 116); the caravan's roof is 4 tiles above the car.

### Traffic timing windows (probe, 2026-10-15)

```
Bus to lorry (+32 px), running from the back of the first bus, hopping to the second (OK = on the lorry, pole in hand)
   d    0.35  0.40  0.45  0.50  0.55
 130       .    OK    OK    OK    OK
 150       .     .    OK    OK    OK
 170       .     .     .    OK    OK
 190       .     .     .    OK    OK
 210       .     .     .     .     .
Onto the canopy: start running from dolly B when the canopy's front is L px past the
transporter's front (Down 120 px before the deck's end, held 0.5 s)
  L 380-460 hit its edge | 480-620 ON THE CANOPY | 640 hit its edge | 660+ missed
```

The canopy window is ~140 px of road, 0.7 s: start the run as the building's
entrance appears at the right edge of the screen. A backwards vault (release
early) keeps you over a canopy that's coming towards you for longer: untested,
there to be discovered.

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
