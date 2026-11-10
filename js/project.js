// Project model: a plain JSON object { params, tracks, lfos, harmony, fx, ... } plus templates.
import { DEFS, register, rng } from './core.js';
import {
  GLOBAL, TRACK_COMMON, DRUM_DEFS, DRUM_PATTERNS, parsePattern, SEQ_DEFS, ENGINES, SYNTH_PRESETS,
  GRAN_DEFS, AUDIO_DEFS, FX, FX_GLOBAL, LFO_DEFS, generateSeq,
} from './defs.js';

const NAMES = { drum: 'Drum Machine', synth: 'Synth', gran: 'Granular', audio: 'Audio' };

function registerTrack(P, tr) {
  const p = 't' + tr.id;
  register(P, p, TRACK_COMMON);
  if (tr.type === 'drum') register(P, p, DRUM_DEFS);
  if (tr.type === 'synth') { register(P, p, SEQ_DEFS); for (const e in ENGINES) register(P, `${p}.${e}`, ENGINES[e]); }
  if (tr.type === 'gran') register(P, p, GRAN_DEFS);
  if (tr.type === 'audio') register(P, p, AUDIO_DEFS);
}

// (Re)build the global definition registry for a project; fills in any missing params with defaults.
export function rebuildDefs(P) {
  DEFS.clear();
  register(P, 'g', GLOBAL);
  register(P, 'fx', FX_GLOBAL);
  for (const s of ['a', 'b']) for (const type in FX) register(P, `fx.${s}.${type}`, FX[type].params);
  for (let i = 0; i < 8; i++) register(P, 'lfo' + i, LFO_DEFS);
  for (const tr of P.tracks) registerTrack(P, tr);
}

export function setPattern(tr, name) {
  tr.patternName = name;
  tr.pattern = parsePattern(DRUM_PATTERNS[name]);
  tr.base = parsePattern(DRUM_PATTERNS[name]);
  tr.len = 16;
}

export function applySynthPreset(P, tr, name) {
  const pr = SYNTH_PRESETS[name], p = 't' + tr.id;
  tr.preset = name;
  P.params[p + '.engine'] = pr.engine; P.params[p + '.role'] = pr.role;
  for (const k of ['oct', 'voicing', 'gate', 'density']) if (pr[k] !== undefined) P.params[`${p}.${k}`] = pr[k];
  for (const k in pr.set) P.params[`${p}.${k}`] = pr.set[k];
  regenerate(P, tr);
}

export function regenerate(P, tr) {
  const p = 't' + tr.id;
  generateSeq(tr.seq, P.params[p + '.role'], P.params[p + '.len'], P.params[p + '.density'], rng((Math.random() * 1e9) | 0));
}

export function addTrack(P, type, o = {}) {
  const id = P.nextId++, p = 't' + id;
  const tr = { id, type, name: o.name || o.preset || NAMES[type], mute: false, solo: false, open: o.open !== false };
  registerTrack(P, tr);
  if (type === 'drum') {
    tr.samples = {}; tr.locks = [true, true, false, false, false, false, false, false];
    setPattern(tr, o.pattern || 'Classic Deep');
    Object.assign(P.params, { [p + '.fx']: 0.15, [p + '.space']: 0.05, [p + '.vol']: 0.9 });
  }
  if (type === 'synth') { tr.seq = new Array(32).fill(null); applySynthPreset(P, tr, o.preset || 'Warm Pad'); }
  if (type === 'gran') tr.sample = null;
  if (type === 'audio') tr.clips = [];
  for (const k in o.set || {}) P.params[`${p}.${k}`] = o.set[k];
  P.tracks.push(tr);
  return tr;
}

export const TEMPLATES = {
  'Deep House — Late Night': (P) => {
    Object.assign(P.params, { 'g.bpm': 122, 'g.swing': 0.45, 'g.root': 9, 'g.scale': 'dorian', 'g.bpc': 2, 'g.pump': 0.4 });
    P.harmony = { prog: [0, 3], base: [0, 3] };
    addTrack(P, 'drum', { pattern: 'Classic Deep', set: { kit: '909 Deep' } });
    addTrack(P, 'synth', { preset: 'Deep Bass', set: { fx: 0.1, space: 0.02, vol: 0.85 } });
    const keys = addTrack(P, 'synth', { preset: 'Rhodes Keys', set: { vol: 0.75, space: 0.3 } });
    const pad = addTrack(P, 'synth', { preset: 'Warm Pad', open: false, set: { vol: 0.55, space: 0.5, drift: 0.3 } });
    addTrack(P, 'gran', { name: 'Vinyl dust', open: false, set: { src: 'Vinyl crackle', vol: 0.35, pmode: 'free', range: 0, size: 0.5, density: 6, fx: 0.2, evo: 0.1 } });
    P.lfos[0].targets.push({ id: `t${pad.id}.sub.cutoff`, amt: 0.25 });
    Object.assign(P.params, { 'lfo0.sync': 16, 'lfo1.shape': 'drift', 'lfo1.sync': 8 });
    P.lfos[1].targets.push({ id: 'fx.y', amt: 0.3 }, { id: `t${keys.id}.fm.index`, amt: 0.2 });
  },
  'Ambient House — Chill Out Room': (P) => {
    Object.assign(P.params, { 'g.bpm': 106, 'g.swing': 0.2, 'g.root': 2, 'g.scale': 'dorian', 'g.bpc': 4, 'g.pump': 0.25, 'g.spaceSize': 0.85, 'g.hevo': 0.3, 'fx.wet': 0.45 });
    P.harmony = { prog: [0, 5, 3, 4], base: [0, 5, 3, 4] };
    addTrack(P, 'drum', { pattern: 'Ambient Pulse', open: false, set: { kit: '808 Warm', vol: 0.6, drift: 0.5, space: 0.2 } });
    const pad = addTrack(P, 'synth', { preset: 'Warm Pad', set: { vol: 0.7, space: 0.6 } });
    addTrack(P, 'synth', { preset: 'FM Bell', open: false, set: { vol: 0.5, space: 0.6, density: 0.15, drift: 0.4, evoBars: 2 } });
    addTrack(P, 'synth', { preset: 'Sub Sine Bass', open: false, set: { vol: 0.7, fx: 0, space: 0.05, density: 0.15, drift: 0.3 } });
    const glass = addTrack(P, 'gran', { name: 'Glass cloud', set: { src: 'Glass pad', pmode: 'chord', range: 12, size: 0.6, density: 9, space: 0.6, vol: 0.6 } });
    addTrack(P, 'gran', { name: 'Rain', open: false, set: { src: 'Rain', pmode: 'free', range: 2, size: 0.9, density: 5, vol: 0.4, fx: 0.3, evo: 0.15 } });
    Object.assign(P.params, { 'lfo0.shape': 'drift', 'lfo0.sync': 16, 'lfo1.sync': 32, 'lfo2.shape': 'drift', 'lfo2.sync': 8 });
    P.lfos[0].targets.push({ id: `t${pad.id}.sub.cutoff`, amt: 0.3 });
    P.lfos[1].targets.push({ id: 'fx.x', amt: 0.25 });
    P.lfos[2].targets.push({ id: `t${glass.id}.pos`, amt: 0.2 }, { id: `t${glass.id}.cutoff`, amt: 0.2 });
  },
  'Dub Chords — Basement': (P) => {
    Object.assign(P.params, { 'g.bpm': 118, 'g.swing': 0.3, 'g.root': 0, 'g.scale': 'minor', 'g.bpc': 4, 'g.pump': 0.3, 'fx.wet': 0.5, 'fx.a.echo.feedback': 0.7, 'fx.a.echo.tone': 1500 });
    P.harmony = { prog: [0], base: [0] };
    addTrack(P, 'drum', { pattern: 'Dub Minimal', set: { kit: 'Dusty' } });
    const stab = addTrack(P, 'synth', { preset: 'Dub Chord', set: { space: 0.4 } });
    addTrack(P, 'synth', { preset: 'Sub Sine Bass', open: false, set: { fx: 0, space: 0, density: 0.3 } });
    addTrack(P, 'gran', { name: 'Vinyl dust', open: false, set: { src: 'Vinyl crackle', vol: 0.4, pmode: 'free', range: 0, size: 0.5, density: 6, fx: 0.1 } });
    Object.assign(P.params, { 'lfo0.shape': 'drift', 'lfo0.sync': 8, 'lfo1.sync': 16 });
    P.lfos[0].targets.push({ id: `t${stab.id}.sub.cutoff`, amt: 0.35 });
    P.lfos[1].targets.push({ id: 'fx.x', amt: 0.2 });
  },
  'Empty': (P) => { P.harmony = { prog: [0, 3], base: [0, 3] }; },
};

export function newProject(template = 'Deep House — Late Night') {
  const P = {
    version: 1, name: template, seed: (Math.random() * 1e9) | 0, nextId: 1, params: {}, tracks: [],
    lfos: Array.from({ length: 8 }, () => ({ targets: [] })),
    harmony: { prog: [0, 3], base: [0, 3] },
    fx: { a: { map: FX.echo.xy.slice() }, b: { map: FX.reverb.xy.slice() } },
    rec: { minutes: 10, bits: 16, auto: true },
  };
  rebuildDefs(P);
  (TEMPLATES[template] || TEMPLATES.Empty)(P);
  return P;
}

// Human-readable name of a parameter, e.g. "Warm Pad · Cutoff"
export function labelOf(P, id) {
  const d = DEFS.get(id);
  if (!d) return id;
  const m = /^t(\d+)\.(.*)$/.exec(id);
  if (m) {
    const tr = P.tracks.find((t) => t.id === +m[1]);
    const lane = /^l(\d)\./.exec(m[2]);
    return `${tr ? tr.name : '?'} · ${lane ? 'lane ' + (+lane[1] + 1) + ' ' : ''}${d.label}`;
  }
  const f = /^fx\.([ab])\.(\w+)\./.exec(id);
  if (f) return `FX ${f[1].toUpperCase()} ${FX[f[2]].label} · ${d.label}`;
  const l = /^lfo(\d)\./.exec(id);
  if (l) return `LFO ${+l[1] + 1} · ${d.label}`;
  return d.label;
}
