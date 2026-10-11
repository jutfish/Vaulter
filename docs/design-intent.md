# Vaulter — design intent

## The one-line pitch
A side-on pixel-art platformer where your only tool is a pole vault pole, and the joy is in how it *feels*: run, plant, bend, release, fly.

## What the game is about
- **Control feel above everything.** A handful of keys (run, aim, plant/bend/release) should produce motion that feels physical and earned. Getting it right should feel like landing a real vault.
- **A skill sweet spot.** Speed of the run-up, where you plant and when you release all matter. A perfect vault should be clearly better than a sloppy one, and the player should be able to *feel* why.
- **Momentum is honest.** Run speed becomes vault height; what isn't turned into height stays as forward speed. Nothing snaps, nothing is canned.
- **Pure platforming.** No enemies, no attacks, no health bars. Obstacles and the pole are the whole game.

## Inspirations — and what we take from each
| Game | Take | Leave |
|---|---|---|
| Super Meat Boy | Instant response, quick restarts, failure that costs seconds not minutes | Brutal difficulty spikes, gore |
| Celeste | Tight, readable controls; small forgiveness windows (coyote time, input buffering) | Dash-centric movement |
| Prince of Persia (1989) | Weight and commitment to movement; a body that has mass | Slow, sluggish input |
| Track and Field | Building speed by holding; the timing beat of plant → release | Button-mashing |

Visual style: crisp pixel art, readable silhouettes, side-on camera that follows the player.

## Core loop (prototype)
1. Hold A/D to build speed (takes ~2–3 s to top speed).
2. Aim the pole forward with the arrow keys.
3. Press Down to drop the tip and plant it.
4. Hold Down to load the pole as you swing over the pivot.
5. Release Down at the right moment to be launched.
6. Clear the obstacle, land, carry leftover speed. R to retry instantly.

## Planned later manoeuvres (not in the prototype)
- Javelin throw the pole to hit buttons or to drop it when it's a hindrance.
- More pole moves taught as the game goes on.

## Feedback the player must get
- The pole visibly bends in proportion to stored energy.
- A clear audio/visual cue at plant and at release, strongest at a perfect release.
- Dust/landing effects, squash and stretch on the vaulter.
- (Dev only) an energy readout and a release-quality meter while tuning.

## Things to avoid
- Floaty, low-gravity air time.
- Animations that take control away for long stretches.
- Input lag: no frame-delayed input, no smoothing on input itself.
- Hidden randomness in the physics. Same input → same result.
- Punishing failure states: a bad vault is weak, not lethal. (Over-holding Down bleeds energy away rather than snapping the pole.)
- Feature creep before the vault feels great.
