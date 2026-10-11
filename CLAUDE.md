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
- **v0.2.0 built, awaiting JT's feel test**: the carried pole is physical — flexible beam (stride ripple, droop, twang after launch), hand-over-hand grip (poise early → hands at the butt → full 76 px pole; late → shorter pole, lower vault), sprung forward lean under the pole's weight, running bob, aim inertia. Arms drawn live to the hands. See docs/vault-physics.md "Carrying the pole".
- v2 also changed: grip height 22 → 20, hands 6 px ahead of the body (sweet spot moved ~0.05 s later, ≈0.5–0.55 s); plant contact swept in 0.01 rad steps.
- Vault model = spring-chord + latch + drive (unchanged). All placeholders from `tools/`. ElevenLabs NOT connected yet (steps given 2026-10-11).
- Verified: 47 tests pass, build OK; screenshots checked of carry, mid hand-move, poised lean, running ripple, bend, launch.

## Open items
- JT's v2 feel test → tune `carry`/`beam` in `src/data/tuning.ts` (wobbliness = `beam.tipFrequency`/`damping`, weight = `carry.aimMaxAccel`/`leanFromPole`).
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
