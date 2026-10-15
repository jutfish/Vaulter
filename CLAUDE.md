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

## Current state (2026-10-15)
- **Live:** v0.7.0, the stadium + N skip cheat, at https://jutfish.github.io/Vaulter/ (pushed to main 2026-10-15). 79 tests, build OK. JT: the stadium "looks great".
- **Vision (JT):** discover what the pole can do, then execute it; fiddly-to-find but satisfying tricks (the backwards jump is the model); chaos and old-school difficulty are good. **Story: win Olympic gold, "now what???", look up at the moon, vault your way there** (stadium → traffic → building → scaffolding/cranes → helicopter → planes → rocket → moon). It should feel like one continuous world; each setting short. See `docs/design-intent.md`.
- **Level = the stadium** (night, moon always visible; looks by `LevelData.zones`, see `docs/level-design.md`): the long run (`buildLongRun`, `CourseBuilder`, `longRunMarks`): the competition bar (40 px, `LevelData.bar`, `World.bar`; knock it → crowd "ahhh" + scoreboard "PRESS R: TRY AGAIN"), steeplechase-water potholes, hills (45° slope tiles), plateau, the backwards-vault switchback (ledge then upper tier), long downslope into the 80 px big wall, potholes, last wall. `tests/course.test.ts` plays it start to flag.
- **Pole:** own rigid body held by the hands; strict contacts (out the way it came in, positional); plant drop collides with walls/ceilings. Gold → silver → bronze → black poles: lose it → 9 s knock-down count (HUD) → next pole in hand; black→black 3 s; R = gold (`World.countPoleLoss`, `poleTiers`). Bronze confirmed by JT.
- **Words in the land** (`src/data/hints.ts`): intro line, "HOP TO IT." (backwards jump), "DON'T LET THIS OPPORTUNITY SLIP AWAY." (down the long slope), win line (carved on finishing), lost-pole note (3 s without the pole; placed clear of all other text). Stuck-timer hint mechanism exists but is unused.
- **Not yet played by JT:** strict contacts, pole tiers, the new words. JT hadn't yet beaten the big wall (tip: full speed down the slope, plant on the flat 7–10 tiles out, release ~0.4 s).
- Browser-pane screenshots sometimes show only the top-left quarter of the page magnified (pane quirk, not a game bug): wait 1 s and retry, or draw `__vaulter.snapshot()` into a 50vw x 50vh img.

## Open items
- JT's play → the stadium look; the bar (knocking it doesn't block you: should it?); strict contacts, pole tiers, big wall difficulty.
- Next story steps: the opening cutscene (podium, medal, "now what???", moon), then moving platforms (traffic).
- JT will reword hints; the lost-pole note still says "press R to restart" (misleading now that a new pole appears).
- Backwards launches show quality 0% (quality rewards forward speed): decide whether a good backwards vault should score.
- Carved hints aren't saved between sessions; `firstWall` level is used by tests/probes only (no level select).
- v3 carry tuning still open: `carry` in `src/data/tuning.ts` (weight = `armTorque`, swing = `rotOmega`/`rotVelocityGain`, hand-walk = `handMoveTime`, losing it = `gripBreakStretch`/`slipStretch`, pick-up = `grabReach`, flip = `leadFlipAngle`).
- Next ideas: gamepad (stick = lead direction), javelin throw, pole-world puzzles, drag/strain sounds, more of the one continuous level.
- Connect ElevenLabs (official `elevenlabs-mcp` via `uvx`; key in agent config, never in repo), then propose prompts for approval.
- Local branch `backup-before-email-rewrite` can be deleted. Commits must use the GitHub noreply email (repo-local `user.email` is set).

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
- Browser verification: the in-app browser pane throttles `requestAnimationFrame` when hidden. In dev builds use `window.__vaulter` (`await __vaulter.play()`, `__vaulter.hold(['right','aimRight'], 2)`, `__vaulter.state()`, `__vaulter.teleport(col, facing, groundLevel)`, `__vaulter.carveHints()`) to drive the sim deterministically, then screenshot. `__vaulter.manual = false` hands control back to real frames. `__vaulter.snapshot(w, h, scale)` returns a PNG data URL of an upscaled crop of the 480×270 game image around the player; to look at it, put it in a full-viewport `<img>` and take a screenshot (the screenshot tool's zoom crops but never magnifies).
