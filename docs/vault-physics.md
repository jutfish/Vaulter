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

## Carrying the pole (v2, `src/gameplay/carry.ts` + `beam.ts`)

Between vaults the pole is carried, and that is simulated too:

- **Hands, hand over hand.** Two hands at positions `s` along the pole
  (px from the butt). Relaxed carry: hands mid-pole (`gripCarry` 20). Poised
  (within `poisedAngle` of level): the hand furthest from the target lets go,
  passes the other and re-grips (`handMoveTime`), then the pole slides through
  both hands to settle at `gripVault` 4. **Grip-to-tip = `totalLength` − hand
  midpoint**, and that is the vault's pole length: poise early (hands back,
  76 px) for a full vault; plant while the hands are still climbing and the
  pole is shorter and the vault lower (tested).
- **Lean.** A damped spring (`leanOmega`, `leanDamping`) toward a target
  lean = pole weight out in front (`leanFromPole` × how far the pole's middle
  sticks out past the hands × how level it is) + running speed
  (`leanFromSpeed`). The lean rotates the shoulders/hands about the feet, so it
  moves the grip slightly forward and down.
- **Running bob.** Shoulders drop at each foot strike and rise in flight:
  `−amp·|sin(π·stridePhase)|`, amp grows with speed (`bobAtLowSpeed` →
  `bobAtMaxSpeed`). The sharp dip at each foot strike is what sets the pole rippling.
- **Aim inertia.** Moment of inertia about the hands grows as more pole sticks
  out, so the aim spring's frequency drops (`aimOmega` × √(I_ref / I)), and the
  arms can only accelerate the pole round at `aimMaxAccel`.
- **Flexible pole (beam).** 17 points along the pole; only sideways
  deflection is simulated, in the frame that moves with the hands. Load on
  every point = gravity across the pole − the hands' acceleration across
  the pole − angular acceleration × distance from the hands. Discrete
  Euler-Bernoulli bending (free ends), two hand springs (a moving hand loosens
  to `1 − handLoosen` grip), velocity damping plus a little kink damping. Stiffness is
  derived from `tipFrequency` for the hands-back overhang (cantilever first
  mode). About 45 substeps per tick keep explicit integration stable (ω·h ≤ 1).
  **The vault physics never reads the beam**: it's feel and visuals only,
  and deterministic.

At current values: ~2.7 px droop when held level and still; ~±4 px steady
ripple at full running speed (stride-driven); ~13 px peak whip when swinging
the pole level from a relaxed carry, settling in ~1 s.

Inspect with `npm run probe` (carry timelines, whip sources).

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

### Probe at current values (2026-10-11, v2: grip height 20, hands 6 px forward, lean)

```
hold   D80 D100 D120 D140 D160 D180  quality
0.35     0    0    0    0    0    0   0.00
0.40    67   37    0    0    0    0   0.05
0.45    58   73   53   28    0    0   0.45
0.50    41   72   70   54   34   10   0.76
0.55    40   58   71   61   48   30   0.71
0.60    40   49   64   60   49   35   0.66
0.70    40   44   47   47   39   28   0.53
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
