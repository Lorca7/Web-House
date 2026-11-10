// Core helpers: parameter registry, math, RNG, DOM.
export const DEFS = new Map(); // param id -> definition

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const num = (key, label, min, max, def, curve = 'lin', unit = '', int = false) =>
  ({ kind: 'num', key, label, min, max, def, curve, unit, int });
export const choice = (key, label, options, def) =>
  ({ kind: 'choice', key, label, def, options: options.map((o) => (Array.isArray(o) ? o : [o, String(o)])) });

export function register(project, prefix, defs) {
  for (const d of defs) {
    const id = prefix + '.' + d.key;
    DEFS.set(id, d);
    if (!(id in project.params)) project.params[id] = d.def;
  }
}

export function unregister(project, prefix) {
  const pre = prefix + '.';
  for (const id of Object.keys(project.params)) {
    if (id.startsWith(pre)) { delete project.params[id]; DEFS.delete(id); }
  }
  for (const l of project.lfos) l.targets = l.targets.filter((t) => !t.id.startsWith(pre));
}

export function toNorm(d, v) {
  if (d.curve === 'exp') return Math.log(v / d.min) / Math.log(d.max / d.min);
  return (v - d.min) / (d.max - d.min);
}
export function fromNorm(d, n) {
  n = clamp(n);
  const v = d.curve === 'exp' ? d.min * Math.pow(d.max / d.min, n) : d.min + (d.max - d.min) * n;
  return d.int ? Math.round(v) : v;
}

export function fmt(d, v) {
  if (d.kind === 'choice') { const o = d.options.find((o) => o[0] === v); return o ? o[1] : String(v); }
  if (d.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : v.toFixed(v < 10 ? 2 : 0) + ' Hz';
  if (d.unit === 's') return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s';
  if (d.int) return v + d.unit;
  const span = d.max - d.min;
  return v.toFixed(span > 50 ? 0 : span > 5 ? 1 : 2) + d.unit;
}

// Seeded PRNG (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stateless hash -> [0,1), used by sample&hold / drift LFOs
export function hash01(n, s = 0) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(s + 1, 0xc2b2ae35);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12; x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

// Tiny hyperscript
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const n in v) n.startsWith('--') ? el.style.setProperty(n, v[n]) : (el.style[n] = v[n]); }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c);
  return el;
}

export function mkBuffer(channels, sampleRate = 44100) {
  const b = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate });
  channels.forEach((c, i) => b.copyToChannel(c, i));
  return b;
}

// RBJ biquad run in place over a Float32Array (offline DSP for drum/texture synthesis)
export function bq(x, type, f, q, sr = 44100) {
  const w = (2 * Math.PI * f) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

export function normalize(x, peak = 0.95) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}
