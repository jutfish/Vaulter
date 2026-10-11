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
- **v0.3.0** (JT played it): pole as its own object. Liked it: more chaotic = more fun, more depth, harder in an old-school way (keep it).
- **v0.4.0 built, awaiting JT's play** (2026-10-11): the **long run** (6720 px) replaces the first-wall level in the game. Warm-up wall, potholes 2–6 wide, rolling hills, plateau + 48 px wall, the **switchback** (cliff too tall to vault; two backwards vaults: onto a ledge, then onto an upper tier), long downslope into an 80 px wall, potholes, 64 px last wall. See `docs/level-design.md`.
- New engine bits: 45° slope tiles (`/` `\`, feet walk the diagonal, `body.stepUp`, `run.slopeGravity`, pole + plant collide with slopes), `B` brick wall tiles, `CourseBuilder`, dev `__vaulter.teleport(col, facing)`.
- Fixed on the way: hands' vertical speed on slopes (pole was yanked away running downhill); plant-surface lookup off by 0.01 px at tile tops.
- Verified: 64 tests (incl. a scripted run that finishes the whole course with both backwards vaults), build OK, probes; screenshots of hills, switchback mid-backwards-vault and ledge landing, long slope + big wall, finish flag. Committed as 2c91210.

## Open items
- JT's v0.4 play → tune the course: big wall (80 px) is the hardest obstacle (drop to 4 tiles if it's a wall of frustration); the 64 px last wall has a narrow window.
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
- `npm.cmd test`, `npm.cmd run build`, `npm.cmd run preview` (port 5181), `npm.cmd run probe`, `npm.cmd run assets`.
- Browser verification: the in-app browser pane throttles `requestAnimationFrame` when hidden. In dev builds use `window.__vaulter` (`await __vaulter.play()`, `__vaulter.hold(['right','aimRight'], 2)`, `__vaulter.state()`, `__vaulter.teleport(col)`) to drive the sim deterministically, then screenshot. `__vaulter.manual = false` hands control back to real frames. `__vaulter.snapshot(w, h, scale)` returns a PNG data URL of an upscaled crop of the 480×270 game image around the player; to look at it, put it in a full-viewport `<img>` and take a screenshot (the screenshot tool's zoom crops but never magnifies).
