# Vault physics — reference

The pole vault is the game. This doc explains the model and what each tuning
value in `src/data/tuning.ts` does to the feel. Code: `src/gameplay/vault.ts`
(planted pole) and `src/gameplay/player.ts` (run, hop, aim, plant swing).

Units: pixels, seconds, radians. World y points **down**. 16 px = 1 m.

## The sequence

| Phase | Input | What happens |
|---|---|---|
| Run | hold A/D | Accelerates along a tapering curve: ~2.2 s to 95% of `run.maxSpeed`. |
| Aim | arrow keys | The carried pole swings toward the held direction on a damped spring with capped angular acceleration (`carry.aim*`), heavier when more pole sticks out. No arrow = neutral carry (60° up, facing side). |
| Poise | pole held near level | The hands climb hand-over-hand to the butt (`carry.gripVault`), so grip-to-tip grows from 60 to 76 px (~0.4 s). The body leans forward under the weight. |
| Plant swing | press ↓ with the pole within `plantAimTolerance` of horizontal | Tip drops at `plantSwingSpeed`, swept in 0.01 rad steps so first contact is exact. Releasing ↓ before contact cancels. |
| Plant | tip touches a top surface | Pole planted exactly where the tip touches (`startVault`, with the current grip-to-tip length). Shaft hitting a wall face = **jam** (`stab` event, small knock-back). |
| Bend | hold ↓ | Run momentum compresses the pole; the pole is **latched** (can bend, can't straighten). The bowed pole *drives* the vaulter forward around the pivot. |
| Release | let go of ↓ | Pole unlatches and straightens (stiffer by `returnEfficiency`), firing the vaulter out along the chord. |
| Flight | — | Normal gravity + air control. Leftover forward speed is kept. |

## The pole as its own object (v3: `poleBody.ts`, `carry.ts`, `beam.ts`)

Between vaults the pole is a **rigid body of its own** (position, velocity,
angle, spin; gravity acts on it). The vaulter only acts on it through the hands:

- **Hand spring** at the hands' midpoint (`handOmega`, capped at
  `handForceCap`) pulls the pole's hand point to where the hands are.
- **Arms' couple** (capped at `armTorque`) holds the pole's weight
  (feed-forward) and turns it toward the wanted angle at a speed it can still
  brake from (`rotOmega`, `rotVelocityGain`), so a heavy pole doesn't overshoot.
  Holding it level from one end needs `(totalLength/2 - gripVault) * g` = 25 200,
  ~42% of the arms; swinging it hard maxes them out (strain > 1, the pole trembles).
  Held near the middle it's light and quick (tested: rising from level is
  over 1.5x slower held from the end).
- **Angles are continuous** (not wrapped), so a lagging pole still follows the
  path the input drew.
- **Flexible pole (beam)**: bending only, both hands always pin it; shaken by
  the hands' own motion (stride jolts, lean) and turned with the body. Stiffness
  from `beam.tipFrequency`. The vault physics never reads it.

### Input: "point the long end this way"
- A direction within `leadFlipAngle` (~100 deg) of the **last commanded** lead
  direction rotates the pole there. Rolling Right, Up, Left therefore arcs it
  over the top (a stick half-circle is the same thing).
- Further away (e.g. Right straight to Left), the **other end becomes the
  lead**; it turns at most ~80 deg and the hands work hand over hand along the
  whole pole (~1.2 s end to end) to make it long.
- Holding a direction: hands go to `gripVault` from the far end (lead length
  76). No direction: hands relax to `gripCarry` (lead 60) and the lead end rises
  to `carryElevation` on its side.
- Plant (Down, lead within `plantAimTolerance` of level): the arms drive the lead
  end down at `plantSwingSpeed`, tracking its speed with `plantStrength` x the
  strength; the drop ignores collisions and its contact is swept exactly as
  before. The pole lands ~20 px later than v2 (press Down a touch earlier).

### Against the level
- Contact points every 4 px along the pole are pushed out of solid tiles
  (`poleBounce`, `poleFriction`, `contactBias`). A dipped tip scrapes and drags;
  a pole run into a wall is shoved back and **slides through the hands** once
  they lag it by `slipStretch` along its length.
- The vaulter feels only the force **beyond** carrying the pole along
  (`poleMassRatio`), so running with it costs nothing; drags, jams and big
  swings push you. On the ground the feet absorb pushes under `footHold`.

### Losing it (normal, not special-cased)
- **Yanked:** pulled sideways out of the hands by more than `gripBreakStretch`.
- **Pushed off the end:** slid through the hands past the pole's end.
- **Bonk:** body hits something mid-vault: knocked off, the pole topples.
- **Let go:** S. **Pick up:** S again; reach `grabReach` anywhere from the
  hands down to the ankles (you stoop), at any speed (scoop it on the run). The
  hands grab where they meet it; the longer side leads.
- A free pole falls, bounces, slides and settles (`stepFreePole`,
  `freeSpinDrag`). Without it Down does nothing; hop still works.

Inspect with `npm run probe` (carry timelines incl. slide and arc; busy-run
stability; slide-then-arc player trace; long-course vault windows).

### Slopes (v0.4)
- 45° slope tiles. The body's feet walk the diagonal; `body.stepUp` (10 px)
  steps onto lips where a slope meets the next tile (at a sprint the feet are
  up to half the body width plus a tick's travel below it).
- `run.slopeGravity` (200 px/s²) along a slope: uphill slows you, downhill
  speeds you up, and overspeed doesn't decay while running downhill. It must
  stay below `run.accelFromRest` (300) or you can't start up a slope from a
  standstill (g/2 = 350 was tried: stuck at the foot of a hill).
- The hands get the body's real vertical speed on slopes (the feet move by
  snapping, so `vy` reads 0); without it the grip spring saw a yank running
  downhill and the pole was lost every time.
- Planting: the tip lands on the slope surface where it touches. Pressing ↓
  while running down a slope onto the flat plants the pole almost level and
  you fall back (physically right; the course leaves flat ground before walls).
- The backwards vault: release early (0.25–0.35 s) and the launch is up and
  back: ~64 px up, landing ~100–140 px behind the plant (hold the back
  direction). Faster run-up (~410 px/s downhill) → release earlier (0.35–0.45 s
  for an 80 px wall). Windows: `docs/level-design.md`.

## The model

The vaulter is a point mass at the grip on the end of a **compression spring**
(the pole's chord) pivoting about the planted tip. Polar coordinates about the
pivot: `phi` = chord angle from straight up (negative = still behind the
pivot), `r` = chord length = `pole.length − compression`.

Each tick (4 substeps, semi-implicit Euler):

```
radial:   r''   = r·ω² − g·cos φ + k·c          (c = L − r, spring only pushes)
angular:  ω'    = (g·sin φ − 2·ṙ·ω) / r          (gravity torque + Coriolis)
latch:    while ↓ held, ṙ can't go positive (the bend is kept)
drive:    while latched, c decays at rate pole.drive; the energy that frees
          goes into forward swing speed (angular momentum conserved)
bleed:    over-holding lets c decay with the energy simply lost
release:  latch off, spring stiffness × returnEfficiency; vaulter leaves the
          pole when the chord is back to full length and still extending
```

Energy is conserved by construction everywhere except: the release bonus
(`returnEfficiency` > 1, the vaulter's own push-off), bleeding (loses energy),
and the bend limit (excess inward speed lost). `tests/vault.test.ts` checks it.

### Why there is a sweet spot

At plant the pole leans ~72° back, so almost all run energy goes into bending
it. While ↓ is held the bend slowly turns into forward rotation (drive), so:

- **Release too early** (chord still leaning back): the spring fires you *up
  and backwards* — you lose your forward speed and land short.
- **Release near vertical** (≈0.5–0.55 s after plant at full speed, hands fully back): the
  remaining bend fires you *up*, and your swing carries you *forward*.
- **Hold too long**: the bend has all gone into rotation or bled away
  (`bleedAngle`, `bleedDelay`) — you roll over the top low, or the pole tips
  over (`autoReleaseAngle`).

Where you plant matters as well: the best clearances come from planting so
the wall face is ~100–140 px past the point where ↓ was pressed.

## Tuning values (pole)

| Key | Now | Effect of raising it |
|---|---|---|
| `length` | 76 | Grip-to-tip with the hands fully back (`totalLength` 80 − `carry.gripVault` 4). Longer swing, more height, later sweet spot. |
| `stiffness` | 160 | Faster bend/recoil, less visible bend. |
| `maxCompression` | 30 | Deeper possible bend (visual and energy cap). |
| `drive` | 1.5 | Faster rotation, earlier and *narrower* sweet spot (see probe). |
| `returnEfficiency` | 1.35 | Bigger launch. 1.0 = no push-off bonus. |
| `plantEfficiency` | 0.92 | More of the run speed survives the plant. |
| `bleedAngle` / `bleedDelay` / `bleedRate` | 12° / 0.35 s / 6 | When and how fast over-holding loses energy. |
| `qualityForwardSpeed` | 90 | Launch quality only: forward speed needed for 100%. |
| `perfectThreshold` | 0.8 | Quality for the "PERFECT!" cue. |

Launch quality (feedback only, physics never reads it) = (height the grip
will reach above the pivot ÷ the most this vault's energy could give) ×
forward-speed factor.

## Tuning workflow

1. Change values in `src/data/tuning.ts`.
2. `npm run probe` prints a table: rows = how long ↓ was held after the
   plant, columns = how far past the ↓ press a 32 px wall starts, cells = the
   tallest wall that would be cleared. `DRIVES=1.5,3 npm run probe` compares
   drive values (use `set DRIVES=1.5,3` / `$env:DRIVES='1.5,3'` on Windows).
3. `npm test` — the sweet-spot tests in `tests/vault.test.ts` must still pass
   (well-timed clears, early and late don't, quality peaks in the middle).
4. Play it. Numbers only get you close; feel decides.

### Probe at current values (2026-10-11, v3: pole body, collisions; plant ~20 px later than v2)

```
hold   D80 D100 D120 D140 D160 D180  quality
0.40    29   55   23    0    0    0   0.05
0.45    29   65   66   43   14    0   0.45
0.50    29   44   74   64   46   25   0.76
0.55    29   41   63   68   56   38   0.72
0.60    29   41   52   65   57   45   0.66
```

## Models tried and rejected (don't repeat)

1. **Momentum redirected straight into rotation at plant** — releasing early
   launched almost as high as a perfect release (80 vs 83 px): no sweet spot.
2. **Spring + latch without drive** — the swing stalled and fell back: at a
   72° plant angle nearly all energy goes into the bend, none into rotation.
3. **Drive as a tangential force paid from the bend by editing `r`** — created
   energy (70k → 116k) because moving the chord skipped angular-momentum
   conservation. The current `driveSwing` / `bleedBend` compute energy
   before/after exactly instead.
4. **Carried beam, first tuning** (v2) — swinging the pole level whipped the
   tip ~48 px: soft hand springs (the rear hand takes ~10x the load through
   leverage), an aim spring demanding ~250 rad/s², and hands fully letting go
   mid-move. Fixed with stiff hands (2e6), `aimMaxAccel` 40, `handLoosen` 0.85,
   `tipFrequency` 4 Hz, damping 3.2.
5. **Plant contact checked once per tick** — the tip drops ~7° per tick, so
   "contact near the tip" vs "mid-shaft jam" depended on where the step
   landed; a 2 px grip change made every plant jam. Now swept in 0.01 rad steps.
6. **Pole body with a plain spring for the arms and a torque cap near the
   pole's weight** (v3): arms at 30 000 vs 25 200 needed left no braking
   margin and the pole fell 72 deg past level. Now 60 000 with a brake-aware turn speed.
7. **Beam hand pins loosening during hand moves** (v3): with the rigid motion
   now in the pole body, a single-pin beam double-counted rotation and drifted
   to 300 px. The beam is bending-only; both hands always pin it.
8. **Dev snapshot via `extract.pixels(renderTexture)`**: reading the live
   render texture back corrupted later frames (world layer vanished). The
   snapshot now renders a separate copy with `extract.canvas`.
