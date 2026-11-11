// Synthesised sample material: drum kits, granular source textures, reverb impulses, grain windows.
// Everything is generated with plain maths so the app ships no audio files.
import { rng, bq, normalize, mkBuffer } from './core.js';

const SR = 44100;
const TAU = Math.PI * 2;

// ---------------- drum voices ----------------
function kick(r, { f0 = 50, f1 = 220, pd = 0.035, ad = 0.22, click = 0.5, drive = 1.5, len = 0.55 }) {
  const n = (len * SR) | 0, x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (f0 + (f1 - f0) * Math.exp(-t / pd))) / SR;
    let s = Math.sin(ph) * Math.exp(-t / ad);
    if (t < 0.004) s += (r() * 2 - 1) * click * (1 - t / 0.004);
    x[i] = Math.tanh(s * drive) * Math.min(1, (n - i) / 400);
  }
  return normalize(x);
}
function clap(r, { tail = 0.11, f = 1300 }) {
  const n = (0.5 * SR) | 0, x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let e = 0;
    for (const k of [0, 0.011, 0.022]) if (t >= k) e += Math.exp(-(t - k) / 0.006) * 0.8;
    if (t >= 0.03) e += Math.exp(-(t - 0.03) / tail);
    x[i] = (r() * 2 - 1) * e;
  }
  bq(x, 'bp', f, 1.3); bq(x, 'hp', 500, 0.7);
  return normalize(x);
}
function rim(r, { f = 1750, d = 0.014 }) {
  const n = (0.12 * SR) | 0, x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 0.27 * t)) * Math.exp(-t / d) + (t < 0.002 ? (r() * 2 - 1) * 0.6 : 0);
  }
  bq(x, 'hp', 300, 0.7);
  return normalize(x);
}
const METAL = [263, 400, 421, 474, 587, 845];
function hat(r, { dec = 0.035, hp = 7500, len = 0.2, mult = 1.45 }) {
  const n = (len * SR) | 0, x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let m = 0;
    for (const f of METAL) m += Math.sin(TAU * f * mult * t) > 0 ? 1 : -1;
    x[i] = ((m / 6) * 0.6 + (r() * 2 - 1) * 0.5) * Math.exp(-t / dec) * Math.min(1, (n - i) / 300);
  }
  bq(x, 'hp', hp, 0.8); bq(x, 'hp', hp * 0.7, 0.7);
  return normalize(x);
}
function shaker(r, { f = 6000 }) {
  const n = (0.16 * SR) | 0, x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = (r() * 2 - 1) * (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.04));
  }
  bq(x, 'bp', f, 1.2); bq(x, 'hp', 2500, 0.7);
  return normalize(x);
}
function tone(r, { f0 = 300, f1 = 340, pd = 0.02, ad = 0.11, slap = 0.4, len = 0.4 }) {
  const n = (len * SR) | 0, x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (f0 + (f1 - f0) * Math.exp(-t / pd))) / SR;
    x[i] = (Math.sin(ph) * Math.exp(-t / ad) + (t < 0.006 ? (r() * 2 - 1) * slap * (1 - t / 0.006) : 0)) * Math.min(1, (n - i) / 300);
  }
  return normalize(x);
}
function lofi(x) {
  bq(x, 'lp', 5200, 0.7);
  let hold = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % 2 === 0) hold = Math.round(Math.tanh(x[i] * 1.6) * 180) / 180;
    x[i] = hold;
  }
  return normalize(x, 0.9);
}

const KITS = {
  '909 Deep': (r) => [kick(r, {}), clap(r, {}), rim(r, {}), hat(r, {}), hat(r, { dec: 0.22, len: 0.7 }), shaker(r, {}), tone(r, {}), tone(r, { f0: 95, f1: 150, pd: 0.05, ad: 0.25, slap: 0.2, len: 0.6 })],
  '808 Warm': (r) => [kick(r, { f0: 43, f1: 110, pd: 0.05, ad: 0.5, click: 0.12, drive: 1.1, len: 1 }), clap(r, { tail: 0.16, f: 1100 }), rim(r, { f: 1650, d: 0.01 }),
    hat(r, { dec: 0.03, hp: 8500, mult: 1 }), hat(r, { dec: 0.3, hp: 8000, len: 0.8, mult: 1 }), shaker(r, { f: 7000 }), tone(r, { f0: 220, f1: 250, ad: 0.16 }), tone(r, { f0: 80, f1: 120, pd: 0.06, ad: 0.35, slap: 0.1, len: 0.8 })],
  'Dusty': (r) => [kick(r, { f0: 55, f1: 180, ad: 0.18, click: 0.8, drive: 2.5 }), clap(r, { tail: 0.08, f: 1500 }), rim(r, { f: 1400, d: 0.02 }), hat(r, { dec: 0.045, hp: 6000 }),
    hat(r, { dec: 0.18, hp: 5500, len: 0.6 }), shaker(r, { f: 4500 }), tone(r, { f0: 380, f1: 420, ad: 0.08, slap: 0.7 }), tone(r, { f0: 120, f1: 200, ad: 0.2, slap: 0.4 })].map(lofi),
  '707 Crisp': (r) => [kick(r, { f0: 58, f1: 260, pd: 0.022, ad: 0.16, click: 0.9, drive: 1.2, len: 0.4 }), clap(r, { tail: 0.07, f: 1700 }), rim(r, { f: 2100, d: 0.01 }), hat(r, { dec: 0.025, hp: 9000, mult: 1.9 }),
    hat(r, { dec: 0.16, hp: 8500, len: 0.5, mult: 1.9 }), shaker(r, { f: 8000 }), tone(r, { f0: 520, f1: 560, ad: 0.07, slap: 0.5 }), tone(r, { f0: 150, f1: 230, pd: 0.03, ad: 0.18, slap: 0.3 })],
  'Tape Soft': (r) => [kick(r, { f0: 46, f1: 130, pd: 0.045, ad: 0.3, click: 0.05, drive: 1, len: 0.7 }), clap(r, { tail: 0.2, f: 900 }), rim(r, { f: 1200, d: 0.018 }), hat(r, { dec: 0.03, hp: 5000, mult: 1.2 }),
    hat(r, { dec: 0.2, hp: 4500, len: 0.6, mult: 1.2 }), shaker(r, { f: 3800 }), tone(r, { f0: 250, f1: 270, ad: 0.2, slap: 0.1 }), tone(r, { f0: 100, f1: 130, pd: 0.06, ad: 0.3, slap: 0.05, len: 0.7 })]
    .map((x) => normalize(bq(x, 'lp', 7000, 0.6), 0.9)),
  'Electro Zap': (r) => [kick(r, { f0: 45, f1: 900, pd: 0.018, ad: 0.3, click: 0.2, drive: 2, len: 0.6 }), clap(r, { tail: 0.05, f: 2200 }), tone(r, { f0: 900, f1: 2600, pd: 0.03, ad: 0.05, slap: 0.2, len: 0.2 }), hat(r, { dec: 0.02, hp: 10000, mult: 2.4 }),
    hat(r, { dec: 0.12, hp: 9500, len: 0.4, mult: 2.4 }), shaker(r, { f: 9000 }), tone(r, { f0: 300, f1: 1400, pd: 0.05, ad: 0.12, slap: 0 }), tone(r, { f0: 70, f1: 600, pd: 0.07, ad: 0.3, slap: 0, len: 0.6 })],
};
const kitCache = new Map();
export function getKit(name) {
  if (!kitCache.has(name)) kitCache.set(name, (KITS[name] || KITS['909 Deep'])(rng(909)).map((x) => mkBuffer([x])));
  return kitCache.get(name);
}

// ---------------- granular textures (all tuned to C) ----------------
const C3 = 130.81;
const TEX = {
  'Glass pad'(r) {
    const n = SR * 8, x = new Float32Array(n);
    for (const k of [1, 2, 3, 4, 5, 6, 8, 10]) for (let v = 0; v < 3; v++) {
      const f = C3 * k * (1 + (r() - 0.5) * 0.006), rate = 0.05 + r() * 0.3, p0 = r() * TAU, p1 = r() * TAU, a = 1 / (k * 3);
      for (let i = 0; i < n; i++) { const t = i / SR; x[i] += a * Math.sin(TAU * f * t + p0) * (0.5 + 0.5 * Math.sin(TAU * rate * t + p1)); }
    }
    return normalize(x, 0.8);
  },
  'Vox choir'(r) {
    const n = SR * 8, saw = new Float32Array(n);
    for (let v = 0; v < 4; v++) {
      const f = C3 * (v === 3 ? 2 : 1) * (1 + (r() - 0.5) * 0.01), vr = 4.5 + r(), vp = r() * TAU;
      let ph = r();
      for (let i = 0; i < n; i++) { ph += (f * (1 + 0.006 * Math.sin((TAU * vr * i) / SR + vp))) / SR; ph -= Math.floor(ph); saw[i] += (ph * 2 - 1) * 0.25; }
    }
    const vowels = [[800, 1150], [450, 800], [350, 2000], [600, 1000]].map(([a, b]) => {
      const y = bq(saw.slice(), 'bp', a, 6), z = bq(saw.slice(), 'bp', b, 8);
      for (let i = 0; i < n; i++) y[i] += z[i] * 0.6;
      return y;
    });
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = (i / n) * 4, a = Math.floor(p) % 4, b = (a + 1) % 4, m = p - Math.floor(p), s = m * m * (3 - 2 * m);
      x[i] = vowels[a][i] * (1 - s) + vowels[b][i] * s;
    }
    return normalize(x, 0.8);
  },
  'Rhodes phrase'() {
    const n = SR * 8, x = new Float32Array(n);
    [0, 3, 7, 10, 14, 19, 15, 10, 7, 12].forEach((semi, k) => {
      const f = C3 * Math.pow(2, semi / 12), start = (k * 0.75 * SR) | 0;
      for (let i = start; i < n; i++) { const t = (i - start) / SR; x[i] += Math.sin(TAU * f * t + 2.2 * Math.exp(-t / 0.4) * Math.sin(TAU * f * t)) * Math.exp(-t / 1.6) * Math.min(1, t / 0.003); }
    });
    return normalize(x, 0.8);
  },
  'Vinyl crackle'(r) {
    const n = SR * 6, x = new Float32Array(n), hiss = new Float32Array(n);
    for (let i = 0; i < n; i++) hiss[i] = (r() * 2 - 1) * 0.05;
    bq(hiss, 'bp', 3500, 0.5);
    for (let k = 0; k < 260; k++) {
      const at = (r() * (n - 400)) | 0, a = Math.pow(r(), 3), d = 0.0004 + r() * 0.002;
      for (let i = 0; i < 300; i++) x[at + i] += (r() * 2 - 1) * a * Math.exp(-i / SR / d);
    }
    bq(x, 'hp', 900, 0.7);
    for (let i = 0; i < n; i++) x[i] += hiss[i] + 0.04 * Math.sin((TAU * 33 * i) / SR) * Math.sin((TAU * 0.55 * i) / SR);
    return normalize(x, 0.7);
  },
  'Rain'(r) {
    const n = SR * 8, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = (r() * 2 - 1) * (0.25 + 0.1 * Math.sin((TAU * 0.13 * i) / SR));
    bq(x, 'bp', 3200, 0.5); bq(x, 'hp', 700, 0.7);
    for (let k = 0; k < 220; k++) {
      const at = (r() * (n - 3000)) | 0, f = 1200 + r() * 3200, a = 0.1 + r() * 0.5;
      for (let i = 0; i < 2600; i++) { const t = i / SR; x[at + i] += a * Math.sin(TAU * f * (1 + t * 8) * t) * Math.exp(-t / 0.012); }
    }
    return normalize(x, 0.75);
  },
};
const texCache = new Map();
export function getTexture(name) {
  if (!TEX[name]) name = 'Glass pad';
  if (!texCache.has(name)) texCache.set(name, { name, buffer: mkBuffer([TEX[name](rng(77))]) });
  return texCache.get(name);
}

// reversed copy of a store/texture entry, cached on the entry
export function reversed(entry) {
  if (!entry.rev) {
    const b = entry.buffer, chans = [];
    for (let c = 0; c < b.numberOfChannels; c++) chans.push(b.getChannelData(c).slice().reverse());
    entry.rev = mkBuffer(chans, b.sampleRate);
  }
  return entry.rev;
}

// ---------------- reverb impulse responses ----------------
const irCache = new Map();
export function getIR(seconds) {
  if (!irCache.has(seconds)) {
    const r = rng(seconds * 1000 + 5), n = (seconds * SR) | 0, chans = [];
    for (let c = 0; c < 2; c++) {
      const x = new Float32Array(n);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const k = 0.9 - 0.75 * t; // tail gets darker
        lp += k * ((r() * 2 - 1) - lp);
        x[i] = lp * Math.pow(1 - t, 2) * Math.exp(-3.2 * t) * Math.min(1, i / 60);
      }
      chans.push(x);
    }
    irCache.set(seconds, mkBuffer(chans));
  }
  return irCache.get(seconds);
}

// ---------------- grain windows ----------------
const W = 33;
const win = (fn) => { const a = new Float32Array(W); for (let i = 0; i < W; i++) a[i] = fn(i / (W - 1)); a[0] = 0; a[W - 1] = 0; return a; };
export const WINDOWS = {
  hann: win((t) => 0.5 - 0.5 * Math.cos(TAU * t)),
  tri: win((t) => 1 - Math.abs(2 * t - 1)),
  flat: win((t) => Math.min(1, t * 6, (1 - t) * 6)),
  perc: win((t) => Math.min(1, t * 20) * Math.exp(-4.5 * t)),
  swell: win((t) => Math.min(1, (1 - t) * 20) * Math.exp(-4.5 * (1 - t))),
};
