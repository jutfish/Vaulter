# Vaulter

**Play in your browser:** https://jutfish.github.io/Vaulter/ (rebuilt and published automatically on every push to `main`).

A side-on pixel-art platformer about one thing: a physically simulated pole
vault that feels right with only a few keys. See
[docs/design-intent.md](docs/design-intent.md) for the feel we're after and
[docs/vault-physics.md](docs/vault-physics.md) for how the vault works.

Stack: PixiJS 8 (rendering) · TypeScript 7 · Vite 8 · Vitest 5 · Web Audio. No physics library.

## Setup

Requires Node 24+ (tested on 24.18, npm 11.16).

```bash
npm install
```

> **Windows PowerShell:** if `npm` fails with "running scripts is disabled on
> this system", use `npm.cmd` instead (e.g. `npm.cmd run dev`) or run the
> commands from Git Bash / cmd.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at **http://127.0.0.1:5180** (fixed port, `strictPort`) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve `dist/` at **http://127.0.0.1:5181** |
| `npm test` | Game-logic tests (Vitest) |
| `npm run probe` | Vault tuning sweep table (see docs/vault-physics.md) |
| `npm run assets` | Regenerate placeholder sprites + audio (needs Python 3 + Pillow) |

### Dev server: start / stop / restart

- **Start:** `npm run dev` in a terminal and leave it running. Vite hot-reloads on save.
- **Already running?** Open http://127.0.0.1:5180. If a start fails with
  "Port 5180 is in use", a server is already running — reuse it rather than starting another.
- **Stop:** press `Ctrl+C` in that terminal.
- **Restart:** `Ctrl+C`, then `npm run dev` again.
- **Find a stray server (Windows):** `Get-NetTCPConnection -LocalPort 5180` shows the owning process id;
  `Stop-Process -Id <id>` ends it.

## Controls

| Key | Action |
|---|---|
| A / D | Run (hold — about 2 s to top speed) |
| W / Space | Small hop (hold for a bit higher) |
| S | Let go of the pole / pick it up (stoop and grab, even on the run) |
| Arrow keys | Point the pole's long end. Roll round (→ ↑ ←) to swing it over; go straight to the opposite (→ then ←) to work your hands along to the other end |
| ↓ with the pole forward | Plant · **hold** to bend · **release** to vault |
| Esc / P | Pause (settings: music, effects, mute, pause-on-focus-loss) |
| R | Restart the level |
| M | Mute / unmute |
| F3 or ` | Dev overlay (dev builds only): FPS, frame-time graph, worst frame, vault physics |

**The long run (v0.4)** — warm-up wall, five potholes to hop at a sprint,
rolling hills, a vault up onto a plateau and a wall after it, then a cliff
too tall to vault. Get up it by vaulting **backwards**: run right under the
ledge, plant short of the cliff, let go of ↓ early (about 0.3 s) and hold ←.
You fly up and back onto the ledge. Run left along it (pole level under the
tier above), do the same again (hold → this time) and you're on the upper tier, which
leads to the cliff top. Down the long slope at speed into the big wall (let
go earlier than usual: faster run, earlier release), two more potholes, the
last wall and the flag.

**Stuck?** Keep trying: after a while at the same spot, a hint is carved
into the land nearby.

**How to vault:** hold D and → from the start. Holding the pole
out level makes the hands climb back to the end of the pole (watch the hands);
plant before they get there and you vault on a shorter pole. When you're
roughly two pole-lengths from the wall, press and hold ↓. Let go of ↓ about
half a second after the pole plants (as the pole comes upright).

**The pole (v3)** is its own physical object, held by your hands: it ripples
with every stride, has weight your arms have to work against (it trembles when
you ask too much), swings round heavily when held from the end and lightly from
the middle, scrapes and jams against the level, slides through your hands when
shoved, and can be knocked out of them. Then you go back and pick it up (S).

## Project layout

```
src/
  app/        startup, scene flow, keyboard, fixed-step loop
  scenes/     loading + gameplay scene (menu/pause are HTML)
  gameplay/   input, level + collision, player, vault physics, carry (hands, lean,
              bob, aim inertia), beam (flexible pole), world (pure, no DOM)
  rendering/  pixel stage, camera, world view, sprites, particles
  audio/      Web Audio engine + sound manifest
  ui/         HTML/CSS menus, HUD, settings panel, dev overlay
  data/       tuning values + level definitions (edit these to change feel)
  saves/      versioned saves, settings and progress schemas
public/assets/ sprites and audio (generated placeholders for now)
tools/        offline asset scripts (Python)
tests/        Vitest tests; tests/probe = tuning sweeps (not run by npm test)
docs/         design intent, vault physics, level design, audio asset log
```

## How it runs

- Simulation: fixed 120 Hz steps; rendering interpolates between the last two
  steps. Real time per frame is capped at 0.25 s, so returning to a suspended
  tab never fast-forwards the game.
- Rendering: the world is drawn at 480×270 into a texture, then scaled up by the
  largest whole number that fits the window (nearest-neighbour, letterboxed).
  Device pixel ratio is capped at 2.
- The level's tiles are baked into one texture at load time (one draw call).
- Saves: `localStorage` keys `vaulter.settings` and `vaulter.progress`, each
  `{ version, data }`, validated and migrated on load. If storage is blocked
  the game says so and doesn't pretend to save. Data written by a newer
  version is never overwritten.
- Audio unlocks on the first click/key press. Music and effects have separate
  volumes. Audio is suspended while the tab is hidden; the game pauses on focus
  loss (setting).

## Known limitations (prototype)

- Placeholder art and sound (generated by `tools/`); no animation for turning around.
  Arms are straight lines (no elbows); the leaning sprite is rotated, so it shows pixel jaggies.
- The flexible pole's bend is visual/feel only: planting uses the pole body's straight line.
- On the keyboard the tip can't be dipped on purpose (↓ is the plant key); a stick will allow it.
- One level (the long run, 6720 px). The level is baked into one texture, so a level can be at most
  the GPU's max texture size wide (16384 px here; 8192 on some older GPUs) until chunking is added.
- Keyboard only; input goes through an action layer so gamepad can be added.
- No touch controls.
- The flight pose is a simple rotation of the "pike" frame.
- Dev overlay FPS is meaningless while the tab/pane is hidden (browsers pause `requestAnimationFrame`).
