# Vault physics — reference

The pole vault is the game. This doc explains the model and what each tuning
value in `src/data/tuning.ts` does to the feel. Code: `src/gameplay/vault.ts`
(planted pole) and `src/gameplay/player.ts` (run, hop, aim, plant swing).

Units: pixels, seconds, radians. World y points **down**. 16 px = 1 m.

## The sequence

| Phase | Input | What happens |
|---|---|---|
| Run | hold A/D | Accelerates along a tapering curve: ~2.2 s to 95% of `run.maxSpeed`. |
| Aim | arrow keys | The carried pole swings toward the held direction at `pole.aimSpeed`. No arrow = neutral carry (60° up, facing side). |
| Plant swing | press ↓ with the pole within `plantAimTolerance` of horizontal | Tip drops at `plantSwingSpeed`. Releasing ↓ before contact cancels. |
| Plant | tip touches a top surface | Pole planted exactly where the tip touches (`startVault`). Shaft hitting a wall face = **jam** (`stab` event, small knock-back). |
| Bend | hold ↓ | Run momentum compresses the pole; the pole is **latched** (can bend, can't straighten). The bowed pole *drives* the vaulter forward around the pivot. |
| Release | let go of ↓ | Pole unlatches and straightens (stiffer by `returnEfficiency`), firing the vaulter out along the chord. |
| Flight | — | Normal gravity + air control. Leftover forward speed is kept. |

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
- **Release near vertical** (≈0.45–0.55 s after plant at full speed): the
  remaining bend fires you *up*, and your swing carries you *forward*.
- **Hold too long**: the bend has all gone into rotation or bled away
  (`bleedAngle`, `bleedDelay`) — you roll over the top low, or the pole tips
  over (`autoReleaseAngle`).

Where you plant matters as well: the best clearances come from planting so
the wall face is ~100–140 px past the point where ↓ was pressed.

## Tuning values (pole)

| Key | Now | Effect of raising it |
|---|---|---|
| `length` | 76 | Longer swing, more height, later sweet spot. |
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

### Probe at current values (2026-10-11)

```
hold   D80 D100 D120 D140 D160 D180  quality
0.35    11    0    0    0    0    0   0.00
0.40    73   48   18    0    0    0   0.25
0.45    68   73   58   35   11    0   0.63
0.50    48   72   68   55   38   16   0.74
0.55    41   59   66   58   45   29   0.68
0.60    41   49   58   52   42   28   0.61
0.70    40   40   39   32   23   11   0.47
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
