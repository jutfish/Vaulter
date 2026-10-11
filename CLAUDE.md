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
- **v0.1.0 first playable**: menu → loading → one level ("First wall": run-up, 3-tile wall at col 100, 4-tile wall at col 160, finish flag at col 164). Pause, settings (music/effects/mute/pause-on-blur), restart, versioned saves (best height, cleared + best time), dev overlay.
- Vault model = spring-chord + latch + drive (see docs/vault-physics.md). Sweet spot ≈ release 0.45–0.55 s after plant at full speed.
- All placeholders (art + audio) from `tools/`. ElevenLabs NOT connected yet (JT to set up; steps were given 2026-10-11).
- Verified: 36 tests pass, `npm run build` OK, dev + preview builds load in the browser pane, a scripted full-speed vault clears wall 1 (5.1 m, 74%). **JT has not played it yet — feel is untested by a human.**

## Open items
- JT's first feel test → tune `src/data/tuning.ts` from feedback.
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
- Browser verification: the in-app browser pane throttles `requestAnimationFrame` when hidden. In dev builds use `window.__vaulter` (`await __vaulter.play()`, `__vaulter.hold(['right','aimRight'], 2)`, `__vaulter.state()`) to drive the sim deterministically, then screenshot. `__vaulter.manual = false` hands control back to real frames.
