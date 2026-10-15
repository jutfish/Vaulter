# Audio assets — log

All in-game audio lives in `public/assets/audio/` and is keyed in
`src/audio/sounds.ts`. The game **never** calls a generation API at runtime;
approved files are generated during development, saved here, committed and
reused.

## Current status: placeholders

Every file is synthesized by `tools/make_placeholder_audio.py` (standard
library, deterministic). No licensing restrictions — generated from code in
this repo.

| Key | File | Placeholder description | Replacement wanted |
|---|---|---|---|
| step | step.wav | Short filtered noise tick | Spike shoe on a track/grass, 4–6 variations |
| hop | hop.wav | Rising square blip | Light effort breath + shoe scuff |
| plant | plant.wav | Thud + low drop | Pole tip slamming into a box: hard, woody/metal clack |
| bend | bend.wav | Wobbling low creak | Fiberglass pole flexing under load, creak |
| release | release.wav | Falling pluck | Pole snapping straight: whippy "thwang" |
| perfect | perfect.wav | Rising 4-note arpeggio | Bright success sting (short, musical) |
| land | land.wav | Noise thump | Landing on a mat / ground, scaled by speed |
| bonk | bonk.wav | Falling square + noise | Comic but not silly bump into a wall |
| ui_click | ui_click.wav | Square tick | Soft menu click |
| crowd_ahh | crowd_ahh.wav | 36 buzzy voices through "ah" formants, sliding down together | A stadium crowd's disappointed "ahhhh" (~2 s) |
| crowd_cheer | crowd_cheer.wav | Voices through "eh" formants, rising, applause crackle, two whistles | A stadium crowd erupting for a gold-medal clearance (~2.5 s) |
| music:main | music_loop.wav | 8-bar 120 bpm chiptune loop | Upbeat, light, loopable track (Track & Field energy, not frantic) |

## ElevenLabs

Status (2026-10-11): **not connected** to the coding agent. Use placeholders
until generation is set up and each prompt is approved.

For every generated asset, add a row below **before** wiring it in:

| Date | Key | Tool / model | Prompt | Voice ID (if speech) | Settings (duration, influence, seed) | Licence / plan notes | Approved by |
|---|---|---|---|---|---|---|---|

Notes to keep:
- Record the ElevenLabs plan at generation time (commercial-use rights depend on the plan).
- Keep the raw download (original format) under `tools/audio-source/` if it
  is edited before use; the edited file goes in `public/assets/audio/`.
- Never put the API key in this repo, in browser code, or in `.env` files that get committed.
