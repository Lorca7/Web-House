# Web House

A generative ambient / deep house studio that runs entirely in the browser. Set up a session, try ideas, then
leave it to evolve and record the result to a WAV file for as long as you choose.

No build step, no server code and no audio files: it is a static site built on the Web Audio API.

## Run it

```bash
node tools/serve.mjs        # then open http://localhost:8080
```

Any static host works too (GitHub Pages, Netlify, an S3 bucket…). `.github/workflows/pages.yml` publishes the
site to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings.
Use a current Chrome, Edge, Safari or Firefox.

## What is in it

| Area | What you get |
| --- | --- |
| **Tracks** | Add any number of drum machines, synths, granular engines and audio tracks. Each has volume, pan, mute/solo, reordering, FX send, a send to the global "Space" reverb, and *Drift* (the track fades out and back in at phrase boundaries so long takes get an arrangement). Tracks can be renamed, duplicated and deleted. |
| **Drum machine** | 8 lanes × 16/32 steps with accent and ghost velocities. Six built-in kits (909 Deep, 808 Warm, Dusty, 707 Crisp, Tape Soft, Electro Zap) and 24 rhythm presets, from classic deep house through garage, afro, tech, acid and Detroit to breakbeat, downtempo and half-time. Patterns evolve every N bars around your edited "base" pattern; lanes can be locked. Level, tune and decay per lane, fills, and you can drop your own sample on any lane. |
| **Synth engines** | Seven engines: subtractive (2 osc + sub, 24 dB filter), 2-operator FM, drawbar organ, supersaw, acid (303-style resonant mono line with accent and slide), wavefolder (West Coast style) and formant/vocal. 34 presets in five groups: classic house, pads & ambient, acid & techno, trance & synthwave, experimental. |
| **Mixer** | A second page with a channel strip per track: volume fader, peak meter with hold, pan, FX and Space sends, Drift, mute/solo, plus a master strip. Faders accept LFOs like any knob. |
| **Evolving sequencers** | Every synth has its own generative sequencer (chord stabs, bassline, melody/arp or sustained pad) that follows the session's key, scale and chord progression and mutates every 1–32 bars at an amount you set. The pattern stays editable in a step grid. |
| **Granular engine** | Position, scan speed, spray, grain size, density, timing jitter, five grain envelopes, pitch with four modes (free, octaves, fifths, follow the chords), detune, reverse probability, stereo spread, high/low-pass filters and its own evolution. Five built-in textures, or drop in any audio file. |
| **Audio tracks** | Drag audio files from your computer onto a track (or anywhere on the track column). Clips loop in time with the song and can be moved, trimmed, split, duplicated, reversed, pitched, time-fitted to a bar length, faded and gain-adjusted. |
| **Effects XY pad** | Two effects in series, one per axis, each axis driving up to two parameters you choose, with a Dry/Wet knob. Effects: Dub Echo, Reverb, Filter, Chorus, Phaser, Tape Drive. |
| **8 LFOs** | Sine, triangle, ramps, square, sample & hold and random drift; free-running or synced from 1/16 note to 64 bars. Drag an LFO onto any knob (or tap the LFO, then the knob), including the XY pad axes and other LFOs. |
| **Recording** | Choose a length (up to 3 hours) and bit depth. *Record live* captures the master in real time while you listen and tweak. *Fast render* renders offline, faster than real time. The WAV downloads automatically when it finishes. |
| **Sessions** | Autosaved in the browser. *Save file* / *Open file* store a portable session that includes your loaded samples. |

Space bar starts and stops playback. Hover a control for a hint.

## Stand-alone macOS app

The same studio runs as a desktop app (Electron) that needs no browser, server or internet connection.
It keeps the Mac from sleeping while a take is being made and streams live recordings straight to disk
(default `~/Music/Web House`, changeable in the Record bar), so a long take survives even if something
goes wrong near the end.

Build it (Node 18+; produces Apple Silicon and Intel apps in `dist/`):

```bash
npm install
npm run build:mac
```

The app is not signed with an Apple Developer ID. The first time, right-click it and choose **Open**. If macOS
says it is damaged, clear the download flag and sign it locally:

```bash
xattr -cr "/Applications/Web House.app"
codesign --force --deep --sign - "/Applications/Web House.app"
```

Fully unattended takes from Terminal — the app starts, records, saves the WAV and quits:

```bash
open -a "Web House" --args --record 120 --quit                       # 2 hours of the last session
open -a "Web House" --args --record 60 --session ~/Desktop/my-session.json --out ~/Desktop --quit
open -a "Web House" --args --record 20 --fast --bits 24 --template "Dub Chords — Basement" --quit
```

`--record <minutes>` records in real time; add `--fast` to render offline instead. Without options the app
opens normally. Closing the lid still puts a Mac to sleep, so leave it open (or use an external display).

## Rendering in the cloud

The same engine can render without a screen, using headless Chromium:

```bash
npm install && npx playwright install chromium
node tools/render.mjs --minutes 20 --template "Ambient House — Chill Out Room" --out take.wav
node tools/render.mjs --minutes 20 --session my-session.json --bits 24
```

`.github/workflows/render.yml` wraps this as a manually triggered GitHub Action ("Cloud render"): pick the
length and a template or a committed session file, and the WAV is delivered as a downloadable artifact.

## Sound design reference points

The defaults come from a short survey of deep house and ambient house production practice:

- **Deep house**: 118–125 BPM, mostly minor/dorian keys, extended chords (7ths, 9ths, 11ths) on Rhodes-style
  keys and organ, warm bass placed between the kicks, TR-909/808-style drums with light swing and off-beat
  open hats, side-chain "pump" against the kick.
- **Ambient house** (The Orb, The KLF's *Chill Out*): slower and looser, long pads, field-recording and found-sound
  textures, rhythms that slide in and out rather than drive the track.
- **Dub chords**: a short minor chord stab through a resonant low-pass with a fast envelope, then a filtered,
  saturated, dotted-time tape echo with feedback and a little pitch wobble, plus reverb.

Sources: [Native Instruments – how to make a deep house track](https://blog.native-instruments.com/how-to-make-a-deep-house-track/),
[EDMProd – classic deep house](https://www.edmprod.com/how-to-make-classic-deep-house/),
[ModeAudio – deep house essentials](https://modeaudio.com/magazine/deep-house-5-production-essentials),
[MusicRadar – 22 deep house production tips](https://www.musicradar.com/tuition/tech/22-deep-house-production-tips-153784),
[Wikipedia – Ambient house](https://en.wikipedia.org/wiki/Ambient_house),
[Attack Magazine – dub techno synth chords](https://www.attackmagazine.com/technique/synth-secrets/dub-techno-synth-chords/),
[Attack Magazine – dub delays](https://www.attackmagazine.com/technique/tutorials/creating-dub-delays-with-standard-plugins/).

All drum sounds, textures and reverb impulses are synthesised in code (`js/sounds.js`), so there are no sample
licences to worry about.

## Code map

| File | Role |
| --- | --- |
| `js/engine.js` | Audio graph, scheduler, drum/synth/granular/clip playback, LFO + XY modulation, evolution |
| `js/defs.js` | Parameter definitions, scales, progressions, presets, pattern generation and mutation |
| `js/sounds.js` | Synthesised drum kits, granular textures, reverb impulses, grain windows |
| `js/fx.js` | Effects |
| `js/recorder.js` | Live recorder (AudioWorklet), offline renderer, WAV encoder |
| `js/project.js` | Session model and templates |
| `js/main.js`, `js/tracks.js`, `js/mixer.js`, `js/side.js`, `js/ui.js` | Interface |
| `tools/` | Local server and headless renderer |
