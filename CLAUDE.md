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
- Design/feel decisions → `docs/design-intent.md`. Physics model, tuning and rejected models → `docs/vault-physics.md`. Generated audio → `docs/audio-assets.md`.
- Read `docs/design-intent.md` and `docs/vault-physics.md` at the start of any session that touches movement or the vault.

## Current state (2026-10-11)
- **v0.1.0** (JT played it): liked run-up time/top speed, zoom, vault spring, hop/air control after the vault, time trial, best height. Visuals OK as placeholder for now.
- **v0.2.0** (JT played it): liked the improvements; asked for the pole to be "a separate object the player manages"; wants losing the pole to feel normal, not situational.
- **v0.3.0 built, awaiting JT's feel test** (2026-10-11), in four layers:
  1. pole = own rigid body (`poleBody.ts`) held by a capped hand spring + capped arm couple (strain visible as tremble);
  2. input = "point the long end here": rolling directions arcs it over; the opposite direction makes the other end lead and the hands work along the whole pole;
  3. the carried pole collides with the level (drag, jam, slides through the hands); the vaulter feels only the excess force;
  4. losing it: yanked / pushed off the end / bonk mid-vault / S to let go; a free pole falls and settles; S picks it up (stoop, scoop on the run).
- Plant drop now ~20 px later than v2 (the arms drive it physically). Vault model unchanged; sweet spot about 0.5-0.55 s hold.
- Verified: 59 tests, build OK; screenshots of slide, arc, wall shove, drop, settled pole.

## Open items
- JT's v3 feel test → tune `carry` in `src/data/tuning.ts`: weight = `armTorque`, swing speed = `rotOmega`/`rotVelocityGain`, hand-walk speed = `handMoveTime`, how easily it's lost = `gripBreakStretch`/`slipStretch`, pick-up reach = `grabReach`, flip threshold = `leadFlipAngle`.
- Next ideas from the design list: gamepad (stick = lead direction, half-circle arcs), javelin throw (release with velocity), pole-world puzzles (corridors), drag/strain sounds.
- Connect ElevenLabs (official `elevenlabs-mcp` via `uvx`; key in agent config, never in repo), then propose prompts for approval.
- Later: javelin-throw manoeuvre, more levels, gamepad, real art.

## Standing rules
- **Feel first.** Any change to run/hop/vault must keep `tests/vault.test.ts` sweet-spot tests passing; run `npm run probe` and record the table in docs/vault-physics.md when tuning changes.
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
- Browser verification: the in-app browser pane throttles `requestAnimationFrame` when hidden. In dev builds use `window.__vaulter` (`await __vaulter.play()`, `__vaulter.hold(['right','aimRight'], 2)`, `__vaulter.state()`) to drive the sim deterministically, then screenshot. `__vaulter.manual = false` hands control back to real frames. `__vaulter.snapshot(w, h, scale)` returns a PNG data URL of an upscaled crop of the 480×270 game image around the player; to look at it, put it in a full-viewport `<img>` and take a screenshot (the screenshot tool's zoom crops but never magnifies).
