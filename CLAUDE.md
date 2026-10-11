# Vaulter — project instructions

## Compact Instructions
Preserve, in priority order:
1. Current task and its exact status (not started / in progress / built awaiting JT's feel test / failing test or build).
2. Tuning changes and probe results from this session not yet written into `docs/vault-physics.md`.
3. Files changed this session and whether tests + build pass.
4. The immediate next step.
Do NOT preserve: routine tool logs, superseded file dumps, ruled-out approaches beyond a one-line note.

## How to use this file
- Current state, standing rules and open items only. Keep it short; replace "Current state", don't append.
- Design/feel decisions → `docs/design-intent.md`. Physics model, tuning and rejected models → `docs/vault-physics.md`. Levels, tiles and timing windows → `docs/level-design.md`. Generated audio → `docs/audio-assets.md`.
- Read `docs/design-intent.md` and `docs/vault-physics.md` at the start of any session that touches movement or the vault.

## Current state (2026-10-11)
- **v0.4.0** (JT played it, live at jutfish.github.io/Vaulter): the long run with slopes and the backwards-vault switchback. JT: fiddly to discover but very satisfying = exactly the vibe; game = discover what the pole can do, then execute; short, maybe one continuous level. Got past the switchback, not yet the big wall. Asked for: stricter pole contacts, hints carved in the land when stuck, a lost-pole hint.
- **v0.5.0 built, awaiting JT's play** (2026-10-11, pushed and deployed):
  1. strict pole contacts (`poleBody.ts`): out the way it came in, positional, 2 px spacing; plant drop collides with walls/ceilings; drawn wobble kept out of the ground. Penetration probe: >3 px ticks 1.3%/23% → 0.00%.
  2. hints carved into the land (`gameplay/hints.ts`, `data/hints.ts`, `rendering/pixelFont.ts`), stuck timers per obstacle across restarts; lost-pole hint after 3 s. See `docs/level-design.md`.
- **v0.6.0 built, awaiting JT's play** (pushed and deployed): gold → silver → bronze → black poles. Lose the pole → 9 s knock-down count (big, flashing, centre; HUD) → next pole in hand, old one gone; black→black 3 s; R = gold again. Logic in `World.countPoleLoss` (`poleTiers` in tuning), colours in WorldView, count in Hud. JT wrote "Gold" for the third pole; built as **Bronze** (medal order) — confirm. 74 tests, build OK; checked the count and the silver pole in the browser.
- Verified (v0.5): 69 tests, build OK, probes (vault windows unchanged); screenshots of the carved cliff hints and the lost-pole hint. Browser-pane screenshots can show only the top-left quarter of the page magnified (pane DPR quirk, not a game bug): draw `__vaulter.snapshot()` into a 50vw x 50vh img to see it.

## Open items
- JT's v0.5 play → hint timings/wording, strictness feel; big wall (80 px) is the hardest obstacle (JT hadn't solved it yet).
- The lost-pole hint still says "press R to restart", which the new-pole count makes misleading: JT is rewording hints.
- Hint progress isn't saved between sessions (closing the tab resets stuck timers and carvings).
- Backwards launches show quality 0% (quality rewards forward speed): decide whether a good backwards vault should score.
- `firstWall` level is still used by tests/probes only; no level select yet.
- v3 carry tuning still open: `carry` in `src/data/tuning.ts` (weight = `armTorque`, swing = `rotOmega`/`rotVelocityGain`, hand-walk = `handMoveTime`, losing it = `gripBreakStretch`/`slipStretch`, pick-up = `grabReach`, flip = `leadFlipAngle`).
- Next ideas: gamepad (stick = lead direction), javelin throw, pole-world puzzles, drag/strain sounds, more levels + level select.
- Connect ElevenLabs (official `elevenlabs-mcp` via `uvx`; key in agent config, never in repo), then propose prompts for approval.

## Standing rules
- **Feel first.** Any change to run/hop/vault must keep `tests/vault.test.ts` sweet-spot tests and `tests/course.test.ts` (the course is still completable) passing; run `npm run probe` and record the tables in docs/vault-physics.md / docs/level-design.md when tuning changes.
- All feel numbers live in `src/data/tuning.ts`; no magic numbers in gameplay code.
- `src/gameplay/` stays pure (no Pixi, DOM or audio) so it's testable headless and deterministic.
- Energy must be conserved by construction in vault.ts (compute before/after, never move `r` without paying for it) — see "Models tried and rejected".
- Never call paid generation APIs from game code. Credentials never in the repo or browser code.
- Saves: bump the schema `version` and add a migration when a stored format changes; never drop player progress.
- Don't claim something was visually checked unless it was screenshotted/inspected.
- Windows shell: PowerShell 5.1 blocks `npm.ps1` — use `npm.cmd`. Never edit source with `Get-Content`/`Set-Content` (mangles UTF-8); use the Edit tool.

## Commands
- Dev server: `npm.cmd run dev` → http://127.0.0.1:5180 (strictPort). Run it in a Terminal-panel tab so it persists; reuse it if already up (check `Get-NetTCPConnection -LocalPort 5180`).
- Hosted: repo https://github.com/jutfish/Vaulter, game at https://jutfish.github.io/Vaulter/ — `.github/workflows/pages.yml` tests, builds and deploys on every push to `main` (build uses `base: './'`).
- `npm.cmd test`, `npm.cmd run build`, `npm.cmd run preview` (port 5181), `npm.cmd run probe`, `npm.cmd run assets`.
- Browser verification: the in-app browser pane throttles `requestAnimationFrame` when hidden. In dev builds use `window.__vaulter` (`await __vaulter.play()`, `__vaulter.hold(['right','aimRight'], 2)`, `__vaulter.state()`, `__vaulter.teleport(col)`, `__vaulter.carveHints()`) to drive the sim deterministically, then screenshot. `__vaulter.manual = false` hands control back to real frames. `__vaulter.snapshot(w, h, scale)` returns a PNG data URL of an upscaled crop of the 480×270 game image around the player; to look at it, put it in a full-viewport `<img>` and take a screenshot (the screenshot tool's zoom crops but never magnifies).
