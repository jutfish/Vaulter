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

## The pole feels like a real object (v2, from JT's first playtest)
JT liked v1's run-up, zoom, vault spring, air control, time trial and best
height. The ask for v2: four digital buttons should *feel* analogue because the
pole is physical, not animated.
- It **wobbles naturally**: a ripple that starts at the hands with every stride's
  rise and fall and travels to the tip, a bit wobblier than a real pole for fun.
- **Where the hands are and how fast you run** change the wobble.
- It has **weight**: held out in front, it slowly leans the body forward, more
  the longer and further out it's held; it's slower to swing round.
- **Hands move hand over hand** along the pole, and that matters: poise early
  so the hands reach the end of the pole and you vault on the full length.

## Chaos and difficulty are features (v3 playtest, 2026-10-11)
JT on v0.3: the physical pole makes play more chaotic, and that's more fun;
the controls have more depth; it's harder, like old-school games, and that's
good. So: keep the pole's mess (scrapes, jams, losing it) and let skill be
learning to manage it. Don't smooth it away to make things easier.

## Discover, then execute (v0.4 playtest, 2026-10-11)
JT: the backwards jump was fiddly to discover but very satisfying once found,
and that is exactly the vibe. The game will be short, perhaps one continuous
level. The whole game is discovering what you can do with the pole, then
executing it. So:
- Obstacles should have a "trick" to find, not just a harder number.
- Help comes late and carved into the land, never as a tutorial popup: a
  hint appears only after a real struggle at that spot (minutes, counted
  across restarts), and nudges rather than solves.
- The pole catching on things should be strict: it's a real object, so it
  hooks, jams and gets yanked away rather than sliding through the ground.

## Gold, silver, bronze, black (v0.6)
You start with a gold pole. Losing it isn't the end: a boxing-style
knock-down count (9 s) gives you the chance to get it back. If you don't, a
lesser pole appears in your hands: silver, then bronze, then plain black
(unlimited, with a short 3 s count, since a long one would just annoy). The
pole you carry is a quiet record of how cleanly you've played.

## Levels: shapes, not gimmicks (v0.4)
Levels stay pure platforming (the story will add moving things: traffic,
helicopter, planes, rocket). The variety comes from the shape of the ground
and how the vaulter and pole meet it: slopes up and down (speed, pole
digging in), potholes hopped at a sprint, low ceilings (pole level),
plateaus to vault onto, cliffs to get round. The backwards vault (release
early, fly up and back) is a real move: levels can need it. See
`docs/level-design.md`.

## The story: to the moon (2026-10-15)
JT wants a much stronger theme: a story that escalates wildly. He wins the
Olympic pole vault final, gets his gold medal on the podium (a short,
very zoomed-in pixel cutscene, presented by a little man in a suit), says
"now what???", loses his purpose... and looks up at the moon. The rest of
the game is him trying to get there with his pole: the stadium (the
seating is the backwards-vault switchback, the slope is sliding down the
outside), moving traffic, up the inside of a tall building, scaffolding
and cranes on top, onto a passing helicopter, between planes, onto a
rocket, then huge low-gravity jumps over craters on the moon.
- It should **feel like one continuous world**, but needn't actually be one
  if chapters are much easier.
- Each setting is **short** so the climb feels quick and rising.
- **The moon is in the sky from the very first frame**, so the look-up
  pays off.
- **Knocking the bar** in the final: the crowd groan "ahhh" and the
  scoreboard says try again. This teaches that R is a normal part of play.
- Cutscenes stay short, skippable and rare (the opening; maybe one later),
  in keeping with "no animations that take control away".
- The moon will need low gravity: this breaks "no floaty air time" on
  purpose, as the payoff.
- Ending idea (not decided): he plants his pole on the moon as a flag, and
  it's whichever pole he still has (gold/silver/bronze/black).

v0.7 = the stadium only (a reskin of the long run plus the competition
bar), without the cutscene.

**The podium cutscene** (built 2026-10-15, not yet played by JT): plays
once per run when you land after clearing the bar. Fade to black, then a
very zoomed-in (4x) pixel set: the podium (silver and bronze rivals already
up), the little man in a suit walks in and *hops* to hang the gold round
your neck (he's too short to reach), the crowd flashes, you wave, "NOW
WHAT???" types out in a speech bubble, you slump, then look up and the
camera tilts to the moon (its bottom edge already peeks in at the top
right). Fade back to the world, where you left off on the mat. 9 s; any
key except Esc/P/R/M skips it (straight to the fade back). Script and
timings: `src/data/cutscene.ts`; sequencing (pure, tested):
`src/scenes/cutscene.ts`; drawing: `src/rendering/PodiumView.ts`.

## The traffic (v0.9, built 2026-10-15, not yet played by JT)
JT's brief: the vehicles feel like static platforms and the feeling of
movement comes from the ground moving; all vehicles go the same speed. Fall
off and everything zooms by and you're back at the start, at the first
vehicle you can board: an open-top bus, boarded by paying with the medal (a
tiny beat, no cutscene, no control taken). A new skill: put the pole down as a
tightrope-style bridge, which reveals you could walk on the pole all along
(it works in the stadium too). Five obstacles: board the bus; vault up onto a
lorry; get off it onto a low car before a low bridge sweeps it; the tightrope
under a caravan; up the car transporter and onto a building's canopy as it
passes (into the building: the next chapter). Details and timings:
`docs/level-design.md`.

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
