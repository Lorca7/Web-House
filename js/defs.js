// Parameter definitions, musical data, presets and generative pattern logic.
import { num, choice } from './core.js';

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
export const PROGS = [
  ['i – iv (classic vamp)', [0, 3]],
  ['i – VII', [0, 6]],
  ['i – VI – VII', [0, 5, 6, 6]],
  ['i – v – iv', [0, 4, 3, 3]],
  ['i – III – iv – VI', [0, 2, 3, 5]],
  ['i – iv – VII – III', [0, 3, 6, 2]],
  ['One chord (dub)', [0]],
];
export const VOICINGS = {
  triad: [0, 2, 4],
  '7th': [0, 2, 4, 6],
  '9th': [0, 2, 4, 6, 8],
  'rootless 9': [2, 4, 6, 8],
  'sus 11': [0, 3, 4, 6],
  fifths: [0, 4, 8],
};

export function degToSemi(scale, deg) {
  const n = scale.length, o = Math.floor(deg / n);
  return scale[((deg % n) + n) % n] + 12 * o;
}

const BARS = (list) => list.map((b) => [b, b + (b === 1 ? ' bar' : ' bars')]);

export const GLOBAL = [
  num('bpm', 'BPM', 60, 150, 122, 'lin', ' bpm', true),
  num('swing', 'Swing', 0, 1, 0.4),
  num('vol', 'Master', 0, 1, 0.7),
  num('pump', 'Pump', 0, 1, 0.35),
  num('spaceSize', 'Space size', 0, 1, 0.6),
  num('spaceTone', 'Space tone', 500, 16000, 5000, 'exp', 'Hz'),
  num('hevo', 'Chord drift', 0, 1, 0.15),
  choice('root', 'Key', NOTE_NAMES.map((n, i) => [i, n]), 9),
  choice('scale', 'Scale', Object.keys(SCALES), 'dorian'),
  choice('bpc', 'Chord length', BARS([1, 2, 4, 8]), 2),
];

export const TRACK_COMMON = [
  num('vol', 'Vol', 0, 1.2, 0.8),
  num('pan', 'Pan', -1, 1, 0),
  num('fx', 'FX send', 0, 1, 1),
  num('space', 'Space', 0, 1, 0.2),
  num('drift', 'Drift', 0, 1, 0),
];

// ---------- drums ----------
export const LANES = ['Kick', 'Clap', 'Rim', 'Cl Hat', 'Op Hat', 'Shaker', 'Perc', 'Tom'];
const LANE_LEVEL = [1, 0.75, 0.5, 0.45, 0.4, 0.3, 0.5, 0.6];
export const KIT_NAMES = ['909 Deep', '808 Warm', 'Dusty', '707 Crisp', 'Tape Soft', 'Electro Zap'];
export const DRUM_DEFS = [
  choice('kit', 'Kit', KIT_NAMES, '909 Deep'),
  choice('evoBars', 'Evolve every', BARS([1, 2, 4, 8, 16]), 4),
  num('evo', 'Evolve', 0, 1, 0.3),
  num('fill', 'Fills', 0, 1, 0.2),
  ...LANES.flatMap((_, l) => [
    num(`l${l}.level`, 'Level', 0, 1.2, LANE_LEVEL[l]),
    num(`l${l}.tune`, 'Tune', -12, 12, 0, 'lin', ' st'),
    num(`l${l}.decay`, 'Decay', 0.05, 1, 1),
  ]),
];

// X accent, x normal, o ghost
export const DRUM_PATTERNS = {
  'Classic Deep': ['X...X...X...X...', '....X.......X...', '.......o..o.....', 'o.xoo.xoo.xoo.xo', '..X...X...X...X.', 'xoxoxoxoxoxoxoxo', '...x..x......x..', '................'],
  'Shuffle': ['X...X...X...X...', '....X.......X..o', '..o......o......', 'x.ox.ox.x.ox.oxo', '..x...x...x...X.', 'o.xoo.xoo.xoo.xo', '.x.....x..x.....', '..............o.'],
  'Soulful': ['X...X...X...X..o', '....X.......X...', '.o.....o.o....o.', 'xxoxxxoxxxoxxxox', '......X.......X.', 'x.x.x.x.x.x.x.x.', '..x..x....x..x..', '................'],
  'Dub Minimal': ['X...X...X...X...', '................', '....x.......x...', '..x...x...x...x.', '..........X.....', 'o.o.o.o.o.o.o.o.', '.......x........', '...............o'],
  'Broken': ['X.....x...X.....', '....X.......X...', '.......x.x......', 'x.x.x.xxx.x.x.x.', '...X.......X....', 'oxooxoooxooxoooo', '..x.....x....x..', '.............oo.'],
  'Ambient Pulse': ['X.......X.......', '............o...', '....o.........o.', '..o...o...o...o.', '......x.........', 'o.o.o.o.o.o.o.o.', '.........x......', '................'],
  'Chicago Jack': ['X...X...X...X...', '....X.......X...', '..x..x....x..x..', 'x.x.x.x.x.x.x.x.', '..X...X...X...X.', '................', '...x......x.....', '......o.......oo'],
  'Disco House': ['X...X...X...X...', '....X.......X...', '................', 'x.xxx.xxx.xxx.xx', '..X...X...X...X.', 'oxoxoxoxoxoxoxox', '.......x.......x', '................'],
  'Garage 2-Step': ['X.........X.....', '....X.......X...', '.......o.o......', 'x.x.x.x.x.x.x.x.', '...x.......x....', 'o.oxo.oxo.oxo.ox', '..x......x...x..', '................'],
  'Tech House': ['X...X...X...X...', '....X.......X...', '.o.....o..o....o', '..x...x...x...x.', '..X...X...X...X.', 'xxoxxxoxxxoxxxox', '...x.x.....x.x..', '.........o......'],
  'Afro House': ['X...X...X...X...', '............X...', '...x..x...x..x..', 'x.xxx.xxx.xxx.xx', '......x.......x.', 'xoxxxoxxxoxxxoxx', 'x..x..x.x..x..x.', '..o....o.o....o.'],
  'Tribal': ['X...X...X...X...', '............X...', '..x..x.x..x..x.x', 'x.x.x.x.x.x.x.x.', '..x.......x.....', 'o.o.o.o.o.o.o.o.', 'x.xx.x.xx.xx.x.x', '...x..x....x..xo'],
  'Lo-fi House': ['X..oX...X..oX...', '....X.......X..o', '.......o........', 'o.xoo.xoo.xoo.xo', '..x...x...x...x.', 'xoxoxoxoxoxoxoxo', '..........x.....', '................'],
  'Acid Trax': ['X...X...X...X...', '....X.......X...', '..x...x...x...x.', 'xxxxxxxxxxxxxxxx', '..X...X...X...X.', '................', '.x..x..x.x..x..x', '..............x.'],
  'Detroit': ['X...X...X...X...', '....X.......X...', '..o..o..o..o..o.', 'x.xxx.xxx.xxx.xx', '..X...X...X...X.', '................', '......x......x..', '.x.......x......'],
  'Minimal Click': ['X...X...X...X...', '................', '..o...ox..o...o.', '....x.......x...', '..........x.....', 'o..o..o..o..o..o', '.x.....o.x......', '................'],
  'Balearic': ['X...X...X...X...', '....X.......X...', '................', 'x.x.x.x.x.x.x.x.', '..x...x...x...X.', 'xoxoxoxoxoxoxoxo', 'x..x..x...x.x...', '.....o.......o..'],
  'Electro Break': ['X.....X...X.....', '....X.......X...', '..............o.', 'x.x.x.x.x.x.x.x.', '.......x........', '................', '...x.....x......', '........o..o....'],
  'Breakbeat': ['X.........X..o..', '....X.......X...', '.......o.o.....o', 'x.x.x.x.x.x.x.x.', '......x.......x.', 'o.o.o.o.o.o.o.o.', '..x.............', '................'],
  'Half-time Chill': ['X.........o.....', '........X.......', '....o.........o.', 'x.o.x.o.x.o.x.o.', '......x.........', 'o.o.o.o.o.o.o.o.', '...........x....', '..............o.'],
  'Downtempo': ['X......o..X.....', '....X.......X...', '..o.......o....o', 'x.x.x.x.x.x.x.x.', '..............x.', 'ooxoooxoooxoooxo', '.....x.......x..', '................'],
  'Trance Drive': ['X...X...X...X...', '....X.......X...', '................', '.xxx.xxx.xxx.xxx', '..X...X...X...X.', 'xoxoxoxoxoxoxoxo', '................', '...............o'],
  'Hats Only': ['................', '................', '................', 'x.xox.xox.xox.xo', '..X...X...X...X.', 'o.o.o.o.o.o.o.o.', '................', '................'],
  'Four Floor Only': ['X...X...X...X...', '................', '................', '................', '..x...x...x...x.', '................', '................', '................'],
};
export function parsePattern(rows) {
  return rows.map((r) => [...r].map((ch) => ({ '.': 0, o: 1, x: 2, X: 3 }[ch])));
}

export function evolveDrums(tr, amount, rand) {
  for (let l = 0; l < 8; l++) {
    if (tr.locks[l]) continue;
    const row = tr.pattern[l], base = tr.base[l];
    for (let i = 0; i < row.length; i++) {
      if (rand() > amount * 0.14) continue;
      const cur = row[i];
      if (cur !== base[i]) { if (rand() < 0.65) row[i] = base[i]; continue; }
      if (l === 0) { if (i % 4 !== 0 && rand() < 0.3) row[i] = cur ? 0 : 1; continue; }
      if (cur === 0) {
        if (l <= 2) { if (i % 2 === 1 || rand() < 0.3) row[i] = 1; }
        else row[i] = rand() < 0.6 ? 1 : 2;
      } else row[i] = rand() < 0.4 ? 0 : 1 + Math.floor(rand() * 3);
    }
  }
}

// ---------- synth sequencer ----------
export const ROLES = [['chords', 'Chord stabs'], ['bass', 'Bassline'], ['lead', 'Melody / arp'], ['pad', 'Sustained pad']];
export const SEQ_DEFS = [
  choice('engine', 'Engine', [['sub', 'Subtractive'], ['fm', 'FM (2-op)'], ['organ', 'Drawbar organ'], ['saw', 'Supersaw'], ['acid', 'Acid (303 style)'], ['fold', 'Wavefolder'], ['vox', 'Formant / vocal']], 'sub'),
  choice('role', 'Sequencer', ROLES, 'chords'),
  choice('len', 'Steps', [16, 32], 16),
  choice('evoBars', 'Evolve every', BARS([1, 2, 4, 8, 16, 32]), 4),
  num('evo', 'Evolve', 0, 1, 0.35),
  num('density', 'Density', 0, 1, 0.4),
  num('gate', 'Gate', 0.1, 2, 0.8),
  num('prob', 'Chance', 0, 1, 1),
  num('human', 'Humanize', 0, 1, 0.2),
  choice('oct', 'Octave', [-2, -1, 0, 1, 2].map((o) => [o, (o > 0 ? '+' : '') + o + ' oct']), 0),
  choice('voicing', 'Voicing', Object.keys(VOICINGS), '9th'),
];
const WAVES = [['sawtooth', 'Saw'], ['square', 'Square'], ['triangle', 'Triangle'], ['sine', 'Sine']];
export const ENGINES = {
  sub: [
    choice('wave1', 'Osc 1', WAVES, 'sawtooth'),
    choice('wave2', 'Osc 2', WAVES, 'sawtooth'),
    choice('oct2', 'Osc 2 oct', [[-1, '-1'], [0, '0'], [1, '+1']], 0),
    num('detune', 'Detune', 0, 50, 10, 'lin', ' ct'),
    num('sub', 'Sub', 0, 1, 0.3),
    num('cutoff', 'Cutoff', 60, 16000, 1200, 'exp', 'Hz'),
    num('res', 'Reso', 0.1, 18, 1.5),
    num('envAmt', 'Flt env', 0, 5, 1, 'lin', ' oct'),
    num('fdecay', 'Flt decay', 0.02, 4, 0.3, 'exp', 's'),
    num('attack', 'Attack', 0.002, 4, 0.01, 'exp', 's'),
    num('decay', 'Decay', 0.02, 4, 0.4, 'exp', 's'),
    num('sustain', 'Sustain', 0, 1, 0.6),
    num('release', 'Release', 0.02, 8, 0.4, 'exp', 's'),
    num('spread', 'Width', 0, 1, 0.4),
    num('level', 'Level', 0, 1, 0.7),
  ],
  fm: [
    choice('ratio', 'Ratio', [0.5, 1, 2, 3, 4, 5, 7, 14], 1),
    num('index', 'FM amount', 0, 12, 2),
    num('idecay', 'FM decay', 0.02, 4, 0.5, 'exp', 's'),
    num('isus', 'FM sustain', 0, 1, 0.15),
    num('detune', 'Detune', 0, 30, 5, 'lin', ' ct'),
    num('attack', 'Attack', 0.002, 4, 0.004, 'exp', 's'),
    num('decay', 'Decay', 0.02, 4, 1.2, 'exp', 's'),
    num('sustain', 'Sustain', 0, 1, 0.3),
    num('release', 'Release', 0.02, 8, 0.6, 'exp', 's'),
    num('tone', 'Tone', 200, 18000, 9000, 'exp', 'Hz'),
    num('level', 'Level', 0, 1, 0.7),
  ],
  organ: [
    num('d1', "16'", 0, 1, 0.9), num('d2', "8'", 0, 1, 0.9), num('d3', "5⅓'", 0, 1, 0.5),
    num('d4', "4'", 0, 1, 0.2), num('d5', "2⅔'", 0, 1, 0), num('d6', "2'", 0, 1, 0),
    num('click', 'Click', 0, 1, 0.4),
    num('attack', 'Attack', 0.002, 1, 0.004, 'exp', 's'),
    num('release', 'Release', 0.02, 3, 0.08, 'exp', 's'),
    num('tone', 'Tone', 200, 18000, 4000, 'exp', 'Hz'),
    num('level', 'Level', 0, 1, 0.7),
  ],
  // five detuned saws, hard-panned sides (trance / rave / string machine)
  saw: [
    num('detune', 'Detune', 0, 60, 22, 'lin', ' ct'),
    num('mix', 'Side mix', 0, 1, 0.7),
    num('cutoff', 'Cutoff', 60, 16000, 2500, 'exp', 'Hz'),
    num('res', 'Reso', 0.1, 18, 1),
    num('envAmt', 'Flt env', 0, 5, 1, 'lin', ' oct'),
    num('fdecay', 'Flt decay', 0.02, 4, 0.4, 'exp', 's'),
    num('attack', 'Attack', 0.002, 4, 0.01, 'exp', 's'),
    num('decay', 'Decay', 0.02, 4, 0.5, 'exp', 's'),
    num('sustain', 'Sustain', 0, 1, 0.7),
    num('release', 'Release', 0.02, 8, 0.5, 'exp', 's'),
    num('spread', 'Width', 0, 1, 0.8),
    num('level', 'Level', 0, 1, 0.6),
  ],
  // mono squelch: resonant filter, accent on loud steps, slide between overlapping notes
  acid: [
    choice('wave', 'Wave', [['sawtooth', 'Saw'], ['square', 'Square']], 'sawtooth'),
    num('cutoff', 'Cutoff', 60, 8000, 400, 'exp', 'Hz'),
    num('res', 'Reso', 0.5, 25, 13),
    num('envAmt', 'Env mod', 0, 6, 3, 'lin', ' oct'),
    num('fdecay', 'Decay', 0.03, 2, 0.2, 'exp', 's'),
    num('accent', 'Accent', 0, 1, 0.6),
    num('slide', 'Slide', 0, 0.4, 0.06, 'lin', 's'),
    num('drive', 'Drive', 0, 1, 0.3),
    num('level', 'Level', 0, 1, 0.7),
  ],
  // West-coast style: sine pushed through a wavefolder whose depth has its own envelope
  fold: [
    num('fold', 'Fold', 0, 1, 0.4),
    num('fenv', 'Fold env', 0, 1, 0.5),
    num('fdecay', 'Fold decay', 0.02, 4, 0.3, 'exp', 's'),
    choice('harm', 'Partial', [[0.5, 'Sub'], [1.5, 'Fifth'], [2, 'Octave'], [3, '3rd harm'], [5, '5th harm']], 2),
    num('hmix', 'Partial mix', 0, 1, 0.2),
    num('attack', 'Attack', 0.002, 4, 0.004, 'exp', 's'),
    num('decay', 'Decay', 0.02, 4, 0.4, 'exp', 's'),
    num('sustain', 'Sustain', 0, 1, 0.3),
    num('release', 'Release', 0.02, 8, 0.4, 'exp', 's'),
    num('tone', 'Tone', 200, 18000, 7000, 'exp', 'Hz'),
    num('level', 'Level', 0, 1, 0.6),
  ],
  // two saws through three vowel formants; "Vowel" sweeps oo – oh – ah – eh – ee
  vox: [
    num('vowel', 'Vowel', 0, 1, 0.5),
    num('q', 'Sharpness', 2, 20, 8),
    num('detune', 'Detune', 0, 40, 12, 'lin', ' ct'),
    num('vib', 'Vibrato', 0, 1, 0.2),
    num('attack', 'Attack', 0.002, 4, 0.05, 'exp', 's'),
    num('decay', 'Decay', 0.02, 4, 0.5, 'exp', 's'),
    num('sustain', 'Sustain', 0, 1, 0.8),
    num('release', 'Release', 0.02, 8, 0.6, 'exp', 's'),
    num('tone', 'Tone', 200, 18000, 9000, 'exp', 'Hz'),
    num('level', 'Level', 0, 1, 0.7),
  ],
};

// preset: engine + role + values (keys relative to the track prefix)
export const SYNTH_PRESETS = {
  'Warm Pad': { cat: 'Pads & ambient', engine: 'sub', role: 'pad', oct: 0, voicing: '9th', gate: 1.05, set: { 'sub.wave1': 'sawtooth', 'sub.wave2': 'sawtooth', 'sub.oct2': 0, 'sub.detune': 14, 'sub.sub': 0.2, 'sub.cutoff': 800, 'sub.res': 1, 'sub.envAmt': 0.4, 'sub.fdecay': 2, 'sub.attack': 1.4, 'sub.decay': 2, 'sub.sustain': 0.8, 'sub.release': 3.5, 'sub.spread': 0.8, 'sub.level': 0.5 } },
  'Dub Chord': { cat: 'Classic house', engine: 'sub', role: 'chords', oct: 1, voicing: '7th', gate: 0.5, density: 0.25, set: { 'sub.wave1': 'sawtooth', 'sub.wave2': 'square', 'sub.oct2': 0, 'sub.detune': 9, 'sub.sub': 0, 'sub.cutoff': 420, 'sub.res': 6, 'sub.envAmt': 2.6, 'sub.fdecay': 0.22, 'sub.attack': 0.003, 'sub.decay': 0.3, 'sub.sustain': 0.05, 'sub.release': 0.35, 'sub.spread': 0.5, 'sub.level': 0.7 } },
  'Deep Bass': { cat: 'Classic house', engine: 'sub', role: 'bass', oct: -1, gate: 0.7, density: 0.45, set: { 'sub.wave1': 'sawtooth', 'sub.wave2': 'square', 'sub.oct2': 0, 'sub.detune': 4, 'sub.sub': 0.8, 'sub.cutoff': 260, 'sub.res': 2.5, 'sub.envAmt': 1.6, 'sub.fdecay': 0.14, 'sub.attack': 0.003, 'sub.decay': 0.2, 'sub.sustain': 0.6, 'sub.release': 0.1, 'sub.spread': 0, 'sub.level': 0.85 } },
  'Sub Sine Bass': { cat: 'Classic house', engine: 'sub', role: 'bass', oct: -1, gate: 0.9, density: 0.3, set: { 'sub.wave1': 'sine', 'sub.wave2': 'triangle', 'sub.oct2': 0, 'sub.detune': 0, 'sub.sub': 0.5, 'sub.cutoff': 900, 'sub.res': 0.7, 'sub.envAmt': 0.3, 'sub.fdecay': 0.2, 'sub.attack': 0.005, 'sub.decay': 0.3, 'sub.sustain': 0.8, 'sub.release': 0.15, 'sub.spread': 0, 'sub.level': 0.9 } },
  'Pluck Lead': { cat: 'Classic house', engine: 'sub', role: 'lead', oct: 1, gate: 0.6, density: 0.3, set: { 'sub.wave1': 'square', 'sub.wave2': 'sawtooth', 'sub.oct2': 1, 'sub.detune': 6, 'sub.sub': 0, 'sub.cutoff': 900, 'sub.res': 3, 'sub.envAmt': 2.5, 'sub.fdecay': 0.18, 'sub.attack': 0.002, 'sub.decay': 0.25, 'sub.sustain': 0.1, 'sub.release': 0.5, 'sub.spread': 0.6, 'sub.level': 0.75 } },
  'Rhodes Keys': { cat: 'Classic house', engine: 'fm', role: 'chords', oct: 1, voicing: 'rootless 9', gate: 1.2, density: 0.3, set: { 'fm.ratio': 1, 'fm.index': 1.8, 'fm.idecay': 0.5, 'fm.isus': 0.12, 'fm.detune': 6, 'fm.attack': 0.003, 'fm.decay': 1.4, 'fm.sustain': 0.25, 'fm.release': 0.7, 'fm.tone': 5000, 'fm.level': 0.6 } },
  'FM Bell': { cat: 'Pads & ambient', engine: 'fm', role: 'lead', oct: 1, gate: 1.5, density: 0.2, set: { 'fm.ratio': 7, 'fm.index': 1.2, 'fm.idecay': 0.35, 'fm.isus': 0.05, 'fm.detune': 9, 'fm.attack': 0.002, 'fm.decay': 1.8, 'fm.sustain': 0, 'fm.release': 1.6, 'fm.tone': 9000, 'fm.level': 0.4 } },
  'FM Bass': { cat: 'Classic house', engine: 'fm', role: 'bass', oct: -1, gate: 0.7, density: 0.4, set: { 'fm.ratio': 1, 'fm.index': 2.6, 'fm.idecay': 0.12, 'fm.isus': 0.1, 'fm.detune': 0, 'fm.attack': 0.002, 'fm.decay': 0.3, 'fm.sustain': 0.5, 'fm.release': 0.1, 'fm.tone': 2500, 'fm.level': 0.85 } },
  'Organ Bass': { cat: 'Classic house', engine: 'organ', role: 'bass', oct: -1, gate: 0.6, density: 0.45, set: { 'organ.d1': 1, 'organ.d2': 0.8, 'organ.d3': 0.45, 'organ.d4': 0.1, 'organ.d5': 0, 'organ.d6': 0, 'organ.click': 0.5, 'organ.attack': 0.003, 'organ.release': 0.07, 'organ.tone': 2200, 'organ.level': 0.85 } },
  'Organ Stab': { cat: 'Classic house', engine: 'organ', role: 'chords', oct: 1, voicing: '7th', gate: 0.45, density: 0.3, set: { 'organ.d1': 0.3, 'organ.d2': 1, 'organ.d3': 0.6, 'organ.d4': 0.5, 'organ.d5': 0.2, 'organ.d6': 0.15, 'organ.click': 0.6, 'organ.attack': 0.003, 'organ.release': 0.12, 'organ.tone': 5000, 'organ.level': 0.5 } },
  'House Piano': { cat: 'Classic house', engine: 'fm', role: 'chords', oct: 1, voicing: 'triad', gate: 0.9, density: 0.35, set: { 'fm.ratio': 1, 'fm.index': 3.2, 'fm.idecay': 0.18, 'fm.isus': 0.08, 'fm.detune': 3, 'fm.decay': 0.9, 'fm.sustain': 0.1, 'fm.release': 0.35, 'fm.tone': 7000, 'fm.level': 0.6 } },
  'Supersaw Pad': { cat: 'Pads & ambient', engine: 'saw', role: 'pad', oct: 0, voicing: '9th', gate: 1.05, set: { 'saw.detune': 26, 'saw.cutoff': 1400, 'saw.envAmt': 0.3, 'saw.fdecay': 2, 'saw.attack': 1.2, 'saw.decay': 2, 'saw.sustain': 0.85, 'saw.release': 3, 'saw.level': 0.4 } },
  'String Machine': { cat: 'Pads & ambient', engine: 'saw', role: 'pad', oct: 1, voicing: '7th', gate: 1, set: { 'saw.detune': 14, 'saw.mix': 0.9, 'saw.cutoff': 3200, 'saw.res': 0.5, 'saw.envAmt': 0, 'saw.attack': 0.5, 'saw.sustain': 0.9, 'saw.release': 1.6, 'saw.level': 0.35 } },
  'Choir Pad': { cat: 'Pads & ambient', engine: 'vox', role: 'pad', oct: 1, voicing: '7th', gate: 1.05, set: { 'vox.vowel': 0.45, 'vox.q': 6, 'vox.detune': 18, 'vox.vib': 0.3, 'vox.attack': 0.9, 'vox.sustain': 0.9, 'vox.release': 2.5, 'vox.tone': 6000, 'vox.level': 0.4 } },
  'Glass Pad': { cat: 'Pads & ambient', engine: 'fm', role: 'pad', oct: 1, voicing: 'fifths', gate: 1.05, set: { 'fm.ratio': 2, 'fm.index': 0.9, 'fm.idecay': 2.5, 'fm.isus': 0.4, 'fm.detune': 10, 'fm.attack': 1.5, 'fm.decay': 3, 'fm.sustain': 0.7, 'fm.release': 4, 'fm.tone': 8000, 'fm.level': 0.4 } },
  'Dark Drone': { cat: 'Pads & ambient', engine: 'fold', role: 'pad', oct: -1, voicing: 'fifths', gate: 1.1, set: { 'fold.fold': 0.25, 'fold.fenv': 0.2, 'fold.fdecay': 3, 'fold.harm': 0.5, 'fold.hmix': 0.5, 'fold.attack': 2.5, 'fold.sustain': 0.9, 'fold.release': 5, 'fold.tone': 1800, 'fold.level': 0.6 } },
  'Acid Line': { cat: 'Acid & techno', engine: 'acid', role: 'bass', oct: -1, gate: 0.9, density: 0.75, set: {} },
  'Acid Squelch Lead': { cat: 'Acid & techno', engine: 'acid', role: 'lead', oct: 0, gate: 1.1, density: 0.6, set: { 'acid.wave': 'square', 'acid.cutoff': 700, 'acid.res': 18, 'acid.envAmt': 3.6, 'acid.fdecay': 0.3, 'acid.slide': 0.09, 'acid.drive': 0.6, 'acid.level': 0.5 } },
  'Reese Bass': { cat: 'Acid & techno', engine: 'saw', role: 'bass', oct: -1, gate: 1.4, density: 0.25, set: { 'saw.detune': 34, 'saw.mix': 1, 'saw.cutoff': 380, 'saw.res': 3, 'saw.envAmt': 0.6, 'saw.fdecay': 0.6, 'saw.sustain': 0.9, 'saw.release': 0.2, 'saw.spread': 0.3, 'saw.level': 0.75 } },
  'Rave Stab': { cat: 'Acid & techno', engine: 'saw', role: 'chords', oct: 1, voicing: 'triad', gate: 0.5, density: 0.3, set: { 'saw.detune': 30, 'saw.cutoff': 1800, 'saw.res': 2, 'saw.envAmt': 2.5, 'saw.fdecay': 0.15, 'saw.attack': 0.002, 'saw.decay': 0.2, 'saw.sustain': 0.2, 'saw.release': 0.25, 'saw.level': 0.85 } },
  'Techno Rumble': { cat: 'Acid & techno', engine: 'sub', role: 'bass', oct: -2, gate: 1.5, density: 0.7, set: { 'sub.wave1': 'sine', 'sub.wave2': 'triangle', 'sub.detune': 0, 'sub.sub': 0.3, 'sub.cutoff': 140, 'sub.res': 1, 'sub.envAmt': 0.5, 'sub.attack': 0.02, 'sub.decay': 0.2, 'sub.sustain': 0.7, 'sub.release': 0.2, 'sub.spread': 0, 'sub.level': 0.95 } },
  'Trance Lead': { cat: 'Trance & synthwave', engine: 'saw', role: 'lead', oct: 1, gate: 0.9, density: 0.5, set: { 'saw.detune': 28, 'saw.cutoff': 3000, 'saw.res': 1.5, 'saw.envAmt': 1.2, 'saw.fdecay': 0.3, 'saw.sustain': 0.6, 'saw.release': 0.4, 'saw.level': 0.7 } },
  'Trance Pluck': { cat: 'Trance & synthwave', engine: 'saw', role: 'lead', oct: 1, gate: 0.4, density: 0.7, set: { 'saw.detune': 18, 'saw.cutoff': 500, 'saw.res': 2.5, 'saw.envAmt': 3.5, 'saw.fdecay': 0.12, 'saw.attack': 0.002, 'saw.decay': 0.18, 'saw.sustain': 0, 'saw.release': 0.3, 'saw.level': 0.8 } },
  'Synthwave Bass': { cat: 'Trance & synthwave', engine: 'sub', role: 'bass', oct: -1, gate: 0.6, density: 0.9, set: { 'sub.wave1': 'sawtooth', 'sub.wave2': 'square', 'sub.oct2': -1, 'sub.detune': 6, 'sub.sub': 0.2, 'sub.cutoff': 500, 'sub.res': 2, 'sub.envAmt': 2, 'sub.fdecay': 0.12, 'sub.attack': 0.002, 'sub.decay': 0.15, 'sub.sustain': 0.4, 'sub.release': 0.08, 'sub.spread': 0, 'sub.level': 0.8 } },
  'Analog Brass': { cat: 'Trance & synthwave', engine: 'sub', role: 'chords', oct: 0, voicing: '7th', gate: 1.6, density: 0.2, set: { 'sub.wave1': 'sawtooth', 'sub.wave2': 'sawtooth', 'sub.detune': 7, 'sub.sub': 0, 'sub.cutoff': 700, 'sub.res': 1.2, 'sub.envAmt': 2, 'sub.fdecay': 0.9, 'sub.attack': 0.06, 'sub.decay': 0.6, 'sub.sustain': 0.7, 'sub.release': 0.4, 'sub.spread': 0.6, 'sub.level': 0.5 } },
  'Chiptune Arp': { cat: 'Trance & synthwave', engine: 'sub', role: 'lead', oct: 1, gate: 0.5, density: 0.85, set: { 'sub.wave1': 'square', 'sub.wave2': 'square', 'sub.oct2': 1, 'sub.detune': 0, 'sub.sub': 0, 'sub.cutoff': 9000, 'sub.res': 0.5, 'sub.envAmt': 0, 'sub.attack': 0.002, 'sub.decay': 0.08, 'sub.sustain': 0.5, 'sub.release': 0.05, 'sub.spread': 0.2, 'sub.level': 0.55 } },
  'West Coast Bongo': { cat: 'Experimental', engine: 'fold', role: 'lead', oct: 0, gate: 0.4, density: 0.5, set: { 'fold.fold': 0.15, 'fold.fenv': 0.9, 'fold.fdecay': 0.08, 'fold.harm': 1.5, 'fold.hmix': 0.3, 'fold.decay': 0.15, 'fold.sustain': 0, 'fold.release': 0.2, 'fold.level': 0.95 } },
  'Fold Bass': { cat: 'Experimental', engine: 'fold', role: 'bass', oct: -1, gate: 0.8, density: 0.45, set: { 'fold.fold': 0.35, 'fold.fenv': 0.6, 'fold.fdecay': 0.2, 'fold.harm': 0.5, 'fold.hmix': 0.6, 'fold.decay': 0.3, 'fold.sustain': 0.5, 'fold.release': 0.12, 'fold.tone': 3000, 'fold.level': 0.95 } },
  'Metallic Arp': { cat: 'Experimental', engine: 'fold', role: 'lead', oct: 1, gate: 0.7, density: 0.6, set: { 'fold.fold': 0.6, 'fold.fenv': 0.4, 'fold.fdecay': 0.5, 'fold.harm': 5, 'fold.hmix': 0.5, 'fold.decay': 0.6, 'fold.sustain': 0.1, 'fold.release': 0.8, 'fold.tone': 9000, 'fold.level': 0.65 } },
  'Vowel Bass': { cat: 'Experimental', engine: 'vox', role: 'bass', oct: -1, gate: 0.8, density: 0.45, set: { 'vox.vowel': 0.3, 'vox.q': 10, 'vox.detune': 5, 'vox.vib': 0, 'vox.attack': 0.005, 'vox.decay': 0.25, 'vox.sustain': 0.6, 'vox.release': 0.12, 'vox.tone': 5000, 'vox.level': 1 } },
  'Talking Lead': { cat: 'Experimental', engine: 'vox', role: 'lead', oct: 0, gate: 1, density: 0.35, set: { 'vox.vowel': 0.7, 'vox.q': 12, 'vox.detune': 8, 'vox.vib': 0.5, 'vox.attack': 0.02, 'vox.sustain': 0.7, 'vox.release': 0.4, 'vox.level': 0.8 } },
  'Kalimba': { cat: 'Experimental', engine: 'fm', role: 'lead', oct: 1, gate: 0.8, density: 0.45, set: { 'fm.ratio': 3, 'fm.index': 1.4, 'fm.idecay': 0.06, 'fm.isus': 0, 'fm.detune': 2, 'fm.decay': 0.5, 'fm.sustain': 0, 'fm.release': 0.5, 'fm.tone': 6000, 'fm.level': 0.55 } },
  'Steel Drum': { cat: 'Experimental', engine: 'fm', role: 'lead', oct: 1, gate: 0.9, density: 0.4, set: { 'fm.ratio': 2, 'fm.index': 2.4, 'fm.idecay': 0.25, 'fm.isus': 0.2, 'fm.detune': 4, 'fm.decay': 0.7, 'fm.sustain': 0.1, 'fm.release': 0.6, 'fm.tone': 8000, 'fm.level': 0.5 } },
  'Sci-fi Bleeps': { cat: 'Experimental', engine: 'fm', role: 'lead', oct: 2, gate: 0.3, density: 0.55, set: { 'fm.ratio': 7, 'fm.index': 4, 'fm.idecay': 0.05, 'fm.isus': 0.3, 'fm.detune': 0, 'fm.decay': 0.1, 'fm.sustain': 0.3, 'fm.release': 0.08, 'fm.tone': 12000, 'fm.level': 0.6 } },
};
export const PRESET_CATS = ['Classic house', 'Pads & ambient', 'Acid & techno', 'Trance & synthwave', 'Experimental'];

const WEIGHTS = {
  chords: [0.5, 0, 0.2, 0.8, 0, 0.1, 0.8, 0, 0.3, 0, 0.2, 0.6, 0, 0.1, 0.9, 0.1],
  bass: [0.3, 0, 0.9, 0.3, 0, 0.1, 0.9, 0.2, 0.2, 0, 0.9, 0.4, 0, 0.2, 0.9, 0.5],
  lead: [0.5, 0.1, 0.4, 0.3, 0.2, 0.1, 0.5, 0.2, 0.5, 0.1, 0.4, 0.3, 0.2, 0.2, 0.5, 0.3],
};
const DEGS = { chords: [0, 0, 0, 1, 2, 1], bass: [0, 0, 0, 0, 0, 4, 7, 6, 2], lead: [0, 2, 4, 4, 6, 7, 8, 9, 2, 4] };
const LENS = { chords: [1, 1, 2, 2, 3], bass: [1, 1, 2, 2, 3], lead: [1, 2, 2, 3, 4] };
const pick = (a, rand) => a[Math.floor(rand() * a.length)];
const target = (len, density) => Math.max(1, Math.round(density * len * 0.6));
const mkStep = (role, rand) => ({ d: pick(DEGS[role], rand), v: 0.6 + rand() * 0.4, l: pick(LENS[role], rand) });

function pickEmpty(seq, role, len, rand) {
  const w = WEIGHTS[role];
  let total = 0;
  for (let i = 0; i < len; i++) if (!seq[i]) total += w[i % 16] + 0.02;
  if (!total) return -1;
  let r = rand() * total;
  for (let i = 0; i < len; i++) if (!seq[i]) { r -= w[i % 16] + 0.02; if (r <= 0) return i; }
  return -1;
}

export function generateSeq(seq, role, len, density, rand) {
  seq.fill(null);
  if (role === 'pad') { seq[0] = { d: Math.floor(rand() * 3), v: 0.8, l: 16 }; return seq; }
  const n = target(len, density);
  for (let k = 0; k < n; k++) { const i = pickEmpty(seq, role, len, rand); if (i >= 0) seq[i] = mkStep(role, rand); }
  if (len === 32 && rand() < 0.5) for (let i = 0; i < 16; i++) if (rand() < 0.7) seq[i + 16] = seq[i] ? { ...seq[i] } : null;
  return seq;
}

export function mutateSeq(seq, role, len, density, amount, rand) {
  if (role === 'pad') {
    if (rand() < amount) seq[0] = { d: Math.floor(rand() * 4), v: 0.7 + rand() * 0.2, l: 16 };
    return;
  }
  const ops = Math.max(1, Math.round(amount * 5));
  const want = target(len, density);
  for (let k = 0; k < ops; k++) {
    const on = [];
    for (let i = 0; i < len; i++) if (seq[i]) on.push(i);
    let op = pick(['add', 'remove', 'move', 'pitch', 'pitch', 'len'], rand);
    if (on.length < want * 0.8) op = 'add'; else if (on.length > want * 1.25) op = 'remove';
    if (!on.length) op = 'add';
    const i = pick(on, rand);
    if (op === 'add') { const j = pickEmpty(seq, role, len, rand); if (j >= 0) seq[j] = mkStep(role, rand); }
    else if (op === 'remove') seq[i] = null;
    else if (op === 'move') { const j = pickEmpty(seq, role, len, rand); if (j >= 0) { seq[j] = seq[i]; seq[i] = null; } }
    else if (op === 'pitch') seq[i] = { ...seq[i], d: pick(DEGS[role], rand) };
    else seq[i] = { ...seq[i], l: pick(LENS[role], rand) };
  }
}

// ---------- granular ----------
export const TEXTURES = ['Glass pad', 'Vox choir', 'Rhodes phrase', 'Vinyl crackle', 'Rain'];
export const GRAN_DEFS = [
  choice('src', 'Source', [...TEXTURES, ['sample', 'Loaded sample']], 'Glass pad'),
  num('pos', 'Position', 0, 1, 0.3),
  num('scan', 'Scan', -2, 2, 0.05, 'lin', '×'),
  num('spray', 'Spray', 0, 1, 0.1),
  num('size', 'Grain size', 0.01, 2, 0.25, 'exp', 's'),
  num('density', 'Density', 0.5, 60, 12, 'exp', '/s'),
  num('jitter', 'Jitter', 0, 1, 0.5),
  num('pitch', 'Pitch', -24, 24, 0, 'lin', ' st'),
  choice('pmode', 'Pitch mode', [['free', 'Free random'], ['oct', 'Octaves'], ['fifth', 'Fifths'], ['chord', 'Follow chords']], 'oct'),
  num('range', 'Pitch range', 0, 24, 12, 'lin', ' st'),
  num('fine', 'Detune', 0, 100, 8, 'lin', ' ct'),
  num('reverse', 'Reverse', 0, 1, 0.2),
  num('spread', 'Stereo', 0, 1, 0.8),
  choice('window', 'Envelope', [['hann', 'Smooth'], ['tri', 'Triangle'], ['flat', 'Flat top'], ['perc', 'Percussive'], ['swell', 'Reverse swell']], 'hann'),
  num('cutoff', 'Low-pass', 80, 18000, 9000, 'exp', 'Hz'),
  num('res', 'Reso', 0.3, 12, 0.7),
  num('hp', 'High-pass', 20, 4000, 80, 'exp', 'Hz'),
  num('level', 'Level', 0, 1.5, 0.7),
  choice('evoBars', 'Evolve every', BARS([1, 2, 4, 8, 16, 32]), 4),
  num('evo', 'Evolve', 0, 1, 0.3),
];

export const AUDIO_DEFS = [choice('loopBars', 'Loop length', BARS([1, 2, 4, 8, 16, 32, 64]), 4)];

// ---------- effects ----------
export const FX = {
  echo: { label: 'Dub Echo', xy: ['time', 'feedback'], params: [
    num('time', 'Time', 0.125, 2, 0.75, 'exp', ' beats'), num('feedback', 'Feedback', 0, 0.95, 0.55),
    num('tone', 'Tone', 300, 9000, 2200, 'exp', 'Hz'), num('wobble', 'Wobble', 0, 1, 0.25), num('level', 'Echo level', 0, 1.2, 0.7)] },
  reverb: { label: 'Reverb', xy: ['size', 'level'], params: [
    num('size', 'Size', 0, 1, 0.6), num('tone', 'Damping', 500, 16000, 5000, 'exp', 'Hz'), num('level', 'Reverb level', 0, 1.5, 0.7)] },
  filter: { label: 'Filter', xy: ['cutoff', 'res'], params: [
    choice('type', 'Type', [['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass']], 'lowpass'),
    num('cutoff', 'Cutoff', 40, 18000, 2500, 'exp', 'Hz'), num('res', 'Resonance', 0.5, 20, 2)] },
  chorus: { label: 'Chorus', xy: ['depth', 'rate'], params: [
    num('rate', 'Rate', 0.05, 8, 0.6, 'exp', 'Hz'), num('depth', 'Depth', 0, 1, 0.5), num('mix', 'Mix', 0, 1, 0.6)] },
  phaser: { label: 'Phaser', xy: ['center', 'depth'], params: [
    num('rate', 'Rate', 0.02, 6, 0.2, 'exp', 'Hz'), num('depth', 'Depth', 0, 1, 0.6),
    num('center', 'Center', 150, 6000, 900, 'exp', 'Hz'), num('mix', 'Mix', 0, 1, 0.7)] },
  drive: { label: 'Tape Drive', xy: ['drive', 'tone'], params: [
    num('drive', 'Drive', 0, 1, 0.3), num('tone', 'Tone', 400, 18000, 8000, 'exp', 'Hz')] },
};
const FX_TYPES = Object.entries(FX).map(([k, f]) => [k, f.label]);
export const FX_GLOBAL = [
  num('x', 'XY pad X', 0, 1, 0.5), num('y', 'XY pad Y', 0, 1, 0.5), num('wet', 'Dry / Wet', 0, 1, 0.35),
  choice('a.type', 'Effect A', FX_TYPES, 'echo'), choice('b.type', 'Effect B', FX_TYPES, 'reverb'),
];

// ---------- LFOs ----------
export const LFO_DEFS = [
  choice('shape', 'Shape', [['sine', 'Sine'], ['tri', 'Triangle'], ['up', 'Ramp up'], ['down', 'Ramp down'], ['square', 'Square'], ['sh', 'Sample & hold'], ['drift', 'Random drift']], 'sine'),
  choice('sync', 'Sync', [['free', 'Free (Hz)'], [0.0625, '1/16'], [0.125, '1/8'], [0.25, '1/4'], [0.5, '1/2'], [1, '1 bar'], [2, '2 bars'], [4, '4 bars'], [8, '8 bars'], [16, '16 bars'], [32, '32 bars'], [64, '64 bars']], 'free'),
  num('rate', 'Rate', 0.01, 20, 0.1, 'exp', 'Hz'),
  num('depth', 'Depth', 0, 1, 1),
];
