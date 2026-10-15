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
- **Live:** v0.9.0 (the stadium + the traffic) at https://jutfish.github.io/Vaulter/ (pushed to main 2026-10-15). JT: the stadium "looks great"; JT is sharing the link with friends.
- **The traffic is awaiting JT's play** (110 tests, build OK, probe run). Get there: `http://127.0.0.1:5180/?level=traffic` (`?level=stadium` for the stadium), or `await __vaulter.level('traffic')`, or finish the stadium (fades straight in). Play starts at the furthest chapter reached (`Progress.chapter`, progress save v3).
- **Vision (JT):** discover what the pole can do, then execute it; fiddly-to-find but satisfying tricks (the backwards jump is the model); chaos and old-school difficulty are good. **Story: win Olympic gold, "now what???", look up at the moon, vault your way there** (stadium → traffic → building → scaffolding/cranes → helicopter → planes → rocket → moon). It should feel like one continuous world; each setting short. See `docs/design-intent.md`.
- **Chapter 1, the stadium** (night, moon; looks by `LevelData.zones`): the long run (`buildLongRun`, `longRunMarks`): competition bar, steeplechase potholes, hills, plateau, the backwards-vault switchback, the big wall, last wall. `tests/course.test.ts` plays it. Podium cutscene after a clean bar clearance (unskippable until seen once).
- **Chapter 2, the traffic** (`buildTraffic`, `trafficMarks`, `src/data/vehicles.ts`, `src/gameplay/traffic.ts`, `src/rendering/TrafficView.ts`; full write-up and timing tables in `docs/level-design.md`): simulated in the traffic's frame, vehicles are static tiles ('V'), the road ('=') and roadside move back at `traffic.speed` (200 px/s), roadside repeating every 1800 px (low bridge, building + canopy, lamps, signs). Fall onto the moving road → tumble back to the bus's platform. Obstacles: (1) walk up onto the open-top bus's platform, the medal goes in the fare box, it pulls off; (2) hop to the second bus, vault onto the lorry (+32); (3) off the lorry onto the low car before the bridge sweeps it; (4) tightrope: drop the pole across the gap under the caravan (no hop/vault there), walk it, pick it up; (5) up the car transporter, vault onto a building's canopy as it passes (~0.7 s window) → chapter done ("next: up the building, coming soon"). `tests/traffic.test.ts` plays it; `tests/probe/traffic.probe.ts`.
- **New for both chapters:** a resting pole ≤ 15° is a one-way platform for the feet (`poleWalk`, `standOnPole`); no hop without 10 px headroom (`hop.minHeadroom`); a run that used N sets no best time.
- **Pole:** own rigid body; strict contacts; gold → silver → bronze → black (9 s count, black 3 s); R = gold.
- **Not yet played by JT:** the traffic, walking on the pole, strict contacts, pole tiers, the podium cutscene. JT hadn't yet beaten the big wall.
- Browser pane: screenshots sometimes show only part of the page (pane quirk): `resize_window` preset desktop, wait 1 s, retry; `__vaulter.snapshot(160, 90, 5)` in a full-viewport img works (bigger crops came out clipped).

## Open items
- JT's play of the traffic: does the frame feel right (static vehicles, moving ground)? Speed (200 px/s), the canopy window, the bridge knocking the neutral-carried pole on the buses (it's 85 px up), the bus→bus gap (you can just drop onto bus 2's back step), being carried all the way back after a fall. Placeholder art (vehicles, roadside) and sounds (engine, ding, whoosh) all want JT's eye.
- Next chapter: up the inside of the tall building. JT's feedback on the podium cutscene.
- JT will reword hints; the lost-pole note still says "press R to restart". No words are carved in the traffic (no ground; the lost-pole note is off there).
- Backwards launches show quality 0%: decide whether a good backwards vault should score.
- A held pole wedged across a 1-tile gap can hold you up in the air (pole push); seen in testing between bus 2 and the lorry. Physical, odd; watch for it.
- Carved hints aren't saved between sessions; `firstWall` level is used by tests/probes only.
- v3 carry tuning still open (`carry` in `src/data/tuning.ts`).
- Next ideas: gamepad, javelin throw, pole-world puzzles, drag/strain sounds.
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
