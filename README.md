# Metronome

A simple, ad-free practice metronome that installs on your phone like an app and works offline.

**Open it:** https://wechuli.github.io/metronome/

Then, on Android (Chrome) tap ⋮ → **Install app** / **Add to Home screen**; on iPhone (Safari) tap
Share → **Add to Home Screen**. It opens full-screen and keeps working without a connection.

## What it does

- Tempo 20–300 with ±1/±5 buttons, a slider, **tap tempo**, and **Slow down 10%** in one tap.
- **Any time signature**: simple (2/4, 3/4, 4/4, 5/4, 2/2 ...), compound (6/8, 9/8, 12/8, felt in
  dotted-quarter beats) and **uneven beats** (5/8 as 2+3 or 3+2, 7/8 as 2+2+3, 3+2+2 or 2+3+2, or
  your own grouping such as `11/8(3+3+2+3)`).
- **Changing time signatures**: type the bars in order, e.g. `5/4 6/4` or `3/4*3 2/4`; the sequence
  repeats. The eighth note stays the same length across the changes.
- The tempo always names its note: ♩ = 72 in 4/4, ♩. = 60 in 6/8, ♪ = 160 in 7/8. With uneven beats
  the tempo is given for the eighth note, the way such music marks it.
- Subdivisions (beats only, eighths, triplets, sixteenths), an accented first beat, louder clicks on
  every beat than on subdivisions, three sounds, volume.
- Keeps the screen awake while playing (where the browser allows), remembers your settings.
- Keyboard: Space start/stop, arrows ±1, T tap.

Clicks are scheduled ahead on the Web Audio clock (100 ms lookahead, every 25 ms), so the timing does
not drift when the page is busy.

## Code

Plain HTML, CSS and JavaScript, no build step and no dependencies.

| File | |
| --- | --- |
| `meter.js` | Time signatures, groupings, bar sequences, the tempo's reference note, click schedules |
| `app.js` | Interface, audio and scheduling |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable, offline web app |
| `test/meter.test.js` | Tests for `meter.js`: `node --test` (Node 18+) |
| `.github/workflows/ci.yml` | Test, then deploy to GitHub Pages |

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000. Every push to `main` runs the tests and, if they pass, deploys to GitHub
Pages (`.github/workflows/ci.yml`). The deploy stamps `VERSION` in `sw.js` with the commit, so
installed copies update; pull requests only run the tests.

MIT licence.
