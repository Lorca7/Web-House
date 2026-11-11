// Audio engine. Works with a live AudioContext or an OfflineAudioContext (fast render):
// the caller drives it with control(t) (LFOs / modulation) and advance(until) (note scheduling).
import { DEFS, clamp, toNorm, fromNorm, rng, hash01, mtof } from './core.js';
import { FX, SCALES, VOICINGS, ENGINES, degToSemi, mutateSeq, evolveDrums } from './defs.js';
import { makeFx } from './fx.js';
import { getKit, getTexture, reversed, WINDOWS } from './sounds.js';

const VEL = [0, 0.3, 0.8, 1];
const LANE_PAN = [0, 0.05, -0.15, -0.25, 0.3, -0.4, 0.35, 0.2];
const sm = (param, tc = 0.03) => (v, t) => param.setTargetAtTime(v, t, tc);

export class Engine {
  constructor(ctx, project, store, hooks = {}) {
    Object.assign(this, {
      ctx, p: project, store, hooks, eff: {}, handlers: {}, mods: {}, xy: {}, xyN: { x: 0.5, y: 0.5 },
      tr: new Map(), slots: {}, playing: false, step: 0, nextTime: 0, startTime: 0, q: [],
      chord: 0, chordStart: true, chordShift: 0, bar: 0,
    });
    this.rand = rng(project.seed || 1);
    this.lfoVals = new Float32Array(8);
    this.buildMaster();
    for (const t of project.tracks) this.addTrack(t, true);
    this.setSlot('a', true); this.setSlot('b', true);
    this.rewire(); this.updateXY(true);
    const t = ctx.currentTime;
    for (const id in project.params) this.apply(id, t, 0, true);
    this.updateMix();
  }

  // ---------- parameters ----------
  H(id, fn) { this.handlers[id] = fn; }
  v(id) { const e = this.eff[id]; return e === undefined ? this.p.params[id] : e; }
  calc(id, mod) {
    const d = DEFS.get(id), base = this.p.params[id];
    if (!d || d.kind !== 'num') return base;
    const axis = this.xy[id];
    if (!axis && !mod) return base;
    return fromNorm(d, clamp((axis ? this.xyN[axis] : toNorm(d, base)) + mod));
  }
  apply(id, t, mod = 0, force = false) {
    const v = this.calc(id, mod);
    if (force || v !== this.eff[id]) { this.eff[id] = v; const fn = this.handlers[id]; if (fn) fn(v, t); }
  }
  touch(id) { this.apply(id, this.ctx.currentTime, this.mods[id] || 0, true); }

  lfo(i, t) {
    const sync = this.v(`lfo${i}.sync`);
    const ph = sync === 'free' ? t * this.v(`lfo${i}.rate`) : (((t - this.startTime) * this.v('g.bpm')) / 60) / (sync * 4);
    const n = Math.floor(ph), f = ph - n;
    switch (this.v(`lfo${i}.shape`)) {
      case 'tri': return 1 - 4 * Math.abs(f - 0.5);
      case 'up': return 2 * f - 1;
      case 'down': return 1 - 2 * f;
      case 'square': return f < 0.5 ? 1 : -1;
      case 'sh': return hash01(n, i) * 2 - 1;
      case 'drift': { const a = hash01(n, i), b = hash01(n + 1, i), s = f * f * (3 - 2 * f); return (a + (b - a) * s) * 2 - 1; }
      default: return Math.sin(2 * Math.PI * f);
    }
  }

  // Control-rate tick: evaluate LFOs + XY pad and push modulated values to the audio graph.
  control(t) {
    const P = this.p, mods = {};
    for (let i = 0; i < 8; i++) {
      const val = this.lfo(i, t), dep = this.v(`lfo${i}.depth`);
      this.lfoVals[i] = val;
      for (const tg of P.lfos[i].targets) mods[tg.id] = (mods[tg.id] || 0) + val * dep * tg.amt;
    }
    this.apply('fx.x', t, mods['fx.x'] || 0); this.apply('fx.y', t, mods['fx.y'] || 0);
    this.xyN.x = this.eff['fx.x']; this.xyN.y = this.eff['fx.y'];
    const ids = new Set(Object.keys(mods));
    for (const id in this.mods) ids.add(id);
    for (const id in this.xy) ids.add(id);
    for (const id of ids) if (id in P.params) this.apply(id, t, mods[id] || 0);
    this.mods = mods;
  }

  // ---------- graph ----------
  buildMaster() {
    const c = this.ctx, g = () => c.createGain();
    this.sum = g(); this.mg = g(); this.comp = c.createDynamicsCompressor(); this.out = g();
    this.comp.threshold.value = -10; this.comp.knee.value = 8; this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.out.gain.value = 0.8;
    this.sum.connect(this.mg).connect(this.comp).connect(this.out).connect(c.destination);
    this.fxIn = g(); this.fxPre = g(); this.dry = g(); this.wet = g(); this.byp = g();
    this.fxIn.connect(this.dry).connect(this.sum); this.fxIn.connect(this.fxPre);
    this.wet.connect(this.sum); this.byp.connect(this.sum);
    this.space = makeFx(c, 'reverb'); this.space.set.dry(0, 0); this.space.set.level(1, 0);
    this.spaceIn = g(); this.spaceIn.connect(this.space.input); this.space.output.connect(this.sum);
    this.an = c.createAnalyser(); this.an.fftSize = 1024; this.out.connect(this.an);
    this.H('g.vol', sm(this.mg.gain));
    this.H('fx.wet', (v, t) => { this.dry.gain.setTargetAtTime(Math.cos((v * Math.PI) / 2), t, 0.03); this.wet.gain.setTargetAtTime(Math.sin((v * Math.PI) / 2), t, 0.03); });
    this.H('g.spaceSize', (v, t) => this.space.set.size(v, t));
    this.H('g.spaceTone', (v, t) => this.space.set.tone(v, t));
    this.H('g.bpm', () => { for (const s of ['a', 'b']) if (this.slots[s] && this.slots[s].type === 'echo') this.touch(`fx.${s}.echo.time`); });
    this.H('fx.a.type', () => this.setSlot('a')); this.H('fx.b.type', () => this.setSlot('b'));
  }

  setSlot(s, init) {
    const type = this.p.params[`fx.${s}.type`], old = this.slots[s];
    if (old && old.type === type) return;
    if (old) { old.fx.dispose(); for (const d of FX[old.type].params) delete this.handlers[`fx.${s}.${old.type}.${d.key}`]; }
    const fx = makeFx(this.ctx, type);
    this.slots[s] = { type, fx };
    for (const d of FX[type].params) {
      const set = fx.set[d.key];
      this.handlers[`fx.${s}.${type}.${d.key}`] = type === 'echo' && d.key === 'time' ? (v, t) => set((v * 60) / this.v('g.bpm'), t) : set;
    }
    if (!init) { this.rewire(); this.updateXY(); for (const d of FX[type].params) this.touch(`fx.${s}.${type}.${d.key}`); }
  }
  rewire() {
    const { a, b } = this.slots;
    this.fxPre.disconnect(); a.fx.output.disconnect(); b.fx.output.disconnect();
    this.fxPre.connect(a.fx.input); a.fx.output.connect(b.fx.input); b.fx.output.connect(this.wet);
  }
  updateXY(init) {
    const old = Object.keys(this.xy);
    this.xy = {};
    for (const [s, axis] of [['a', 'x'], ['b', 'y']]) {
      const type = this.p.params[`fx.${s}.type`];
      for (const k of this.p.fx[s].map) if (k) this.xy[`fx.${s}.${type}.${k}`] = axis;
    }
    if (!init) for (const id of new Set([...old, ...Object.keys(this.xy)])) if (id in this.p.params) this.touch(id);
  }

  addTrack(tr, init) {
    const c = this.ctx, p = 't' + tr.id, g = () => c.createGain();
    const a = {
      p, type: tr.type, input: g(), duck: g(), rest: g(), vol: g(), pan: c.createStereoPanner(), fx: g(), byp: g(), sp: g(),
      live: new Set(), voices: new Set(), rt: { resting: false, fill: false, next: 0, drift: 0, lastT: 0, recent: [], oh: null },
    };
    a.input.connect(a.duck).connect(a.rest).connect(a.vol).connect(a.pan);
    a.meter = c.createAnalyser(); a.meter.fftSize = 256; a.pan.connect(a.meter);
    a.pan.connect(a.fx).connect(this.fxIn); a.pan.connect(a.byp).connect(this.byp); a.pan.connect(a.sp).connect(this.spaceIn);
    a.voiceIn = a.input;
    this.H(p + '.vol', () => this.updateMix());
    this.H(p + '.pan', sm(a.pan.pan));
    this.H(p + '.fx', (v, t) => { a.fx.gain.setTargetAtTime(v, t, 0.03); a.byp.gain.setTargetAtTime(1 - v, t, 0.03); });
    this.H(p + '.space', sm(a.sp.gain));
    if (tr.type === 'synth') {
      a.tone = c.createBiquadFilter(); a.tone.connect(a.input); a.voiceIn = a.tone;
      const tone = () => { const id = `${p}.${this.v(p + '.engine')}.tone`; a.tone.frequency.setTargetAtTime(id in this.p.params ? this.v(id) : 20000, c.currentTime, 0.03); };
      this.H(p + '.engine', tone);
      for (const e in ENGINES) for (const d of ENGINES[e]) {
        if (d.key === 'tone') this.H(`${p}.${e}.tone`, tone);
        // parameters that should move notes that are already sounding
        else if (['cutoff', 'res', 'vowel', 'q'].includes(d.key)) this.H(`${p}.${e}.${d.key}`, (v, t) => { for (const r of a.voices) if (r[d.key]) r[d.key](v, t); });
      }
    }
    if (tr.type === 'gran') {
      a.hp = c.createBiquadFilter(); a.hp.type = 'highpass'; a.lp = c.createBiquadFilter();
      a.hp.connect(a.lp).connect(a.input); a.voiceIn = a.hp;
      this.H(p + '.cutoff', sm(a.lp.frequency)); this.H(p + '.res', sm(a.lp.Q)); this.H(p + '.hp', sm(a.hp.frequency));
    }
    this.tr.set(tr.id, a);
    if (!init) {
      for (const id in this.p.params) if (id.startsWith(p + '.')) this.apply(id, c.currentTime, 0, true);
      this.updateMix();
    }
    return a;
  }
  removeTrack(id) {
    const a = this.tr.get(id);
    if (!a) return;
    this.silence(a); a.pan.disconnect(); a.input.disconnect();
    for (const k of Object.keys(this.handlers)) if (k.startsWith(a.p + '.')) delete this.handlers[k];
    this.tr.delete(id);
  }
  destroy() {
    this.stop();
    for (const s of ['a', 'b']) this.slots[s].fx.dispose();
    this.space.dispose(); this.out.disconnect(); this.sum.disconnect();
  }
  updateMix() {
    const solo = this.p.tracks.some((t) => t.solo), now = this.ctx.currentTime;
    for (const t of this.p.tracks) {
      const a = this.tr.get(t.id);
      if (a) a.vol.gain.setTargetAtTime(t.mute || (solo && !t.solo) ? 0 : this.v(a.p + '.vol'), now, 0.02);
    }
  }
  keep(a, srcs, last, done) {
    for (const s of srcs) a.live.add(s);
    srcs[0].onended = () => { for (const s of srcs) a.live.delete(s); last.disconnect(); if (done) done(); };
  }
  silence(a) {
    for (const s of a.live) { try { s.stop(); } catch { /* already stopped */ } }
    a.live.clear(); a.voices.clear();
  }

  // ---------- transport ----------
  start() {
    if (this.playing) return;
    const t = this.ctx.currentTime + 0.06;
    Object.assign(this, { playing: true, step: 0, nextTime: t, startTime: t, q: [] });
    for (const a of this.tr.values()) {
      Object.assign(a.rt, { resting: false, fill: false, next: t, drift: 0, lastT: 0, recent: [] });
      a.rest.gain.cancelScheduledValues(0); a.rest.gain.setValueAtTime(1, 0);
    }
  }
  stop() {
    this.playing = false;
    const now = this.ctx.currentTime;
    for (const a of this.tr.values()) {
      this.silence(a);
      a.duck.gain.cancelScheduledValues(now); a.duck.gain.setTargetAtTime(1, now, 0.02);
    }
    this.q = [];
  }
  pos() { // step currently audible (-1 when stopped)
    const now = this.ctx.currentTime;
    while (this.q.length > 1 && this.q[1][1] <= now) this.q.shift();
    return this.q.length && this.q[0][1] <= now ? this.q[0][0] : -1;
  }
  advance(until) {
    if (!this.playing) return;
    let guard = 0;
    while (this.nextTime < until && guard++ < 96) {
      this.doStep(this.step, this.nextTime);
      this.nextTime += 60 / this.v('g.bpm') / 4;
      this.step++;
    }
    for (const tr of this.p.tracks) if (tr.type === 'gran') this.grains(tr, this.tr.get(tr.id), until);
  }

  onBar(bar, t, sd) {
    const P = this.p, h = P.harmony, bpc = this.v('g.bpc'), scale = SCALES[this.v('g.scale')];
    const idx = Math.floor(bar / bpc) % h.prog.length;
    this.chordStart = bar % bpc === 0;
    if (bar > 0 && this.chordStart && idx === 0 && h.prog.length > 1 && this.rand() < this.v('g.hevo')) {
      const i = 1 + Math.floor(this.rand() * (h.prog.length - 1));
      if (h.prog[i] !== h.base[i]) h.prog[i] = h.base[i];
      else { const opts = [0, 2, 3, 4, 5, 6].filter((d) => d !== h.prog[i]); h.prog[i] = opts[Math.floor(this.rand() * opts.length)]; }
      this.changed('harmony');
    }
    this.chord = h.prog[idx]; this.bar = bar;
    this.chordShift = degToSemi(scale, this.chord) >= 7 ? -12 : 0;
    let awake = 0;
    for (const tr of P.tracks) {
      const a = this.tr.get(tr.id), p = a.p;
      if (tr.type !== 'audio') {
        const amt = this.v(p + '.evo');
        if (bar > 0 && amt > 0 && bar % this.v(p + '.evoBars') === 0) this.evolve(tr, a, amt);
      }
      if (tr.type === 'drum') a.rt.fill = (bar + 1) % 4 === 0 && this.rand() < this.v(p + '.fill');
      const drift = this.v(p + '.drift');
      if (bar > 0 && bar % 8 === 0 && (drift > 0 ? this.rand() < drift * 0.4 : a.rt.resting)) this.setRest(a, drift > 0 && !a.rt.resting, t, sd);
      if (!a.rt.resting) awake++;
    }
    if (!awake && P.tracks.length) this.setRest(this.tr.get(P.tracks[Math.floor(this.rand() * P.tracks.length)].id), false, t, sd);
    if (this.hooks.onBar) this.hooks.onBar(bar);
  }
  setRest(a, resting, t, sd) {
    a.rt.resting = resting;
    a.rest.gain.setTargetAtTime(resting ? 0 : 1, t, sd * 16 * 0.7);
    this.changed('rest');
  }
  changed(kind, id) { if (this.hooks.onChange) this.hooks.onChange(kind, id); }

  evolve(tr, a, amt) {
    const p = a.p;
    if (tr.type === 'drum') evolveDrums(tr, amt, this.rand);
    else if (tr.type === 'synth') mutateSeq(tr.seq, this.v(p + '.role'), this.v(p + '.len'), this.v(p + '.density'), amt, this.rand);
    else if (tr.type === 'gran') {
      for (const [k, w] of [['pos', 0.6], ['size', 0.25], ['density', 0.25], ['spray', 0.25]]) {
        if (this.rand() > 0.6) continue;
        const id = p + '.' + k, d = DEFS.get(id);
        this.p.params[id] = fromNorm(d, clamp(toNorm(d, this.p.params[id]) + (this.rand() - 0.5) * amt * w));
        this.touch(id); this.changed('param', id);
      }
      return;
    }
    this.changed('track', tr.id);
  }

  doStep(s, t) {
    const sd = 60 / this.v('g.bpm') / 4;
    const ts = t + (s & 1 ? this.v('g.swing') * 0.4 * sd : 0);
    if (s % 16 === 0) this.onBar(s / 16, t, sd);
    this.q.push([s, t]);
    for (const tr of this.p.tracks) {
      const a = this.tr.get(tr.id);
      if (tr.type === 'drum') this.drumStep(tr, a, s, t, ts);
      else if (tr.type === 'synth') this.synthStep(tr, a, s, ts, sd);
      else if (tr.type === 'audio') this.audioStep(tr, a, s, t, sd);
    }
  }

  // ---------- drums ----------
  drumStep(tr, a, s, t, ts) {
    const i = s % tr.len, fill = a.rt.fill && s % 16 >= 12;
    for (let l = 0; l < 8; l++) {
      let val = tr.pattern[l][i];
      if (fill && !val && (l === 2 || l === 6 || l === 7) && this.rand() < 0.4) val = 1 + (this.rand() < 0.4 ? 1 : 0);
      if (val) this.hit(tr, a, l, l === 0 ? t : ts, VEL[val]);
    }
  }
  hit(tr, a, l, t, vel) {
    const c = this.ctx, p = a.p, entry = tr.samples[l] && this.store.get(tr.samples[l]);
    const src = c.createBufferSource(), g = c.createGain(), pn = c.createStereoPanner();
    src.buffer = entry ? entry.buffer : getKit(this.v(p + '.kit'))[l];
    src.playbackRate.value = Math.pow(2, this.v(`${p}.l${l}.tune`) / 12);
    const dec = this.v(`${p}.l${l}.decay`);
    g.gain.setValueAtTime(this.v(`${p}.l${l}.level`) * vel, t);
    if (dec < 0.98) g.gain.setTargetAtTime(0, t + 0.005, 0.012 + dec * dec * 0.5);
    pn.pan.value = LANE_PAN[l];
    src.connect(g).connect(pn).connect(a.input);
    src.start(t);
    this.keep(a, [src], pn);
    if (l === 3 && a.rt.oh) { a.rt.oh.gain.cancelScheduledValues(t); a.rt.oh.gain.setTargetAtTime(0, t, 0.008); }
    if (l === 4) a.rt.oh = g;
    if (l === 0) this.pump(t);
  }
  pump(t) { // side-chain style ducking of everything that is not a drum machine
    const amt = this.v('g.pump');
    if (amt < 0.01) return;
    for (const a of this.tr.values()) {
      if (a.type === 'drum') continue;
      a.duck.gain.setTargetAtTime(1 - amt * 0.85, t, 0.004);
      a.duck.gain.setTargetAtTime(1, t + 0.03, 0.09);
    }
  }

  // ---------- synths ----------
  note(deg, oct) {
    return 48 + this.v('g.root') + 12 * oct + degToSemi(SCALES[this.v('g.scale')], this.chord + deg) + this.chordShift;
  }
  chordNotes(p, inv) {
    const degs = VOICINGS[this.v(p + '.voicing')] || VOICINGS['9th'], oct = this.v(p + '.oct');
    const notes = degs.map((d) => this.note(d, oct));
    for (let k = 0; k < inv; k++) notes[k % notes.length] += 12;
    return notes;
  }
  synthStep(tr, a, s, ts, sd) {
    const p = a.p, role = this.v(p + '.role'), gate = this.v(p + '.gate'), human = this.v(p + '.human');
    let st, notes, dur;
    if (role === 'pad') {
      if (s % 16 !== 0 || !this.chordStart) return;
      st = tr.seq[0] || { d: 0, v: 0.8 };
      notes = this.chordNotes(p, st.d); dur = this.v('g.bpc') * 16 * sd * gate;
    } else {
      st = tr.seq[s % this.v(p + '.len')];
      if (!st || this.rand() > this.v(p + '.prob')) return;
      notes = role === 'chords' ? this.chordNotes(p, st.d) : [this.note(st.d, this.v(p + '.oct'))];
      dur = st.l * sd * gate;
    }
    const vel = st.v * (1 - human * 0.4 * this.rand()), t = ts + human * 0.012 * this.rand();
    const voice = VOICES[this.v(p + '.engine')];
    for (const n of notes) voice(this, a, p, n, t, dur, notes.length > 1 ? vel * 0.7 : vel);
  }

  // ---------- granular ----------
  granSource(tr) {
    const src = this.v(`t${tr.id}.src`);
    return (src === 'sample' && this.store.get(tr.sample)) || getTexture(src);
  }
  grains(tr, a, until) {
    const rt = a.rt, now = this.ctx.currentTime, entry = this.granSource(tr);
    if (rt.next < now - 0.5) rt.next = now;
    let guard = 0;
    while (rt.next < until && guard++ < 400) {
      this.grain(a, entry, Math.max(rt.next, now));
      rt.next += (1 / this.v(a.p + '.density')) * (1 + (this.rand() - 0.5) * 1.8 * this.v(a.p + '.jitter'));
    }
  }
  grain(a, entry, t) {
    const c = this.ctx, rt = a.rt, v = (k) => this.v(a.p + '.' + k), B = entry.buffer, D = B.duration;
    if (rt.lastT) rt.drift += (v('scan') * (t - rt.lastT)) / D;
    rt.lastT = t; rt.drift -= Math.floor(rt.drift);
    let pos = v('pos') + rt.drift + (this.rand() - 0.5) * v('spray');
    pos -= Math.floor(pos);
    const size = v('size'), range = v('range'), mode = v('pmode'), r = this.rand();
    let semi = v('pitch') + ((this.rand() - 0.5) * 2 * v('fine')) / 100;
    if (mode === 'free') semi += (r * 2 - 1) * range;
    else if (mode === 'oct') semi += Math.round(((r * 2 - 1) * range) / 12) * 12;
    else if (mode === 'fifth') { const set = [-24, -17, -12, -5, 0, 0, 7, 12, 19, 24].filter((x) => Math.abs(x) <= range); semi += set[Math.floor(r * set.length)] || 0; }
    else {
      const tone = [0, 2, 4, 6, 8][Math.floor(r * 5)];
      semi += this.v('g.root') + degToSemi(SCALES[this.v('g.scale')], this.chord + tone) + this.chordShift + Math.round(((this.rand() * 2 - 1) * range) / 12) * 12;
      if (semi > 18) semi -= 12;
    }
    const rate = clamp(Math.pow(2, semi / 12), 0.05, 8), rev = this.rand() < v('reverse');
    const off = Math.min((rev ? 1 - pos : pos) * D, Math.max(0, D - size * rate - 0.01));
    const src = c.createBufferSource(), g = c.createGain(), pn = c.createStereoPanner();
    src.buffer = rev ? reversed(entry) : B; src.playbackRate.value = rate;
    const L = (v('level') * 0.9) / Math.sqrt(Math.max(1, v('density') * size)), w = WINDOWS[v('window')] || WINDOWS.hann;
    const curve = new Float32Array(w.length);
    for (let i = 0; i < w.length; i++) curve[i] = w[i] * L;
    g.gain.setValueCurveAtTime(curve, t, size);
    pn.pan.value = (this.rand() * 2 - 1) * v('spread');
    src.connect(g).connect(pn).connect(a.voiceIn);
    src.start(t, off, size * rate + 0.01); src.stop(t + size + 0.02);
    this.keep(a, [src], pn);
    rt.recent.push([pos, t]); if (rt.recent.length > 48) rt.recent.shift();
  }

  // ---------- audio clips ----------
  audioStep(tr, a, s, t, sd) {
    const beat = (s % (this.v(a.p + '.loopBars') * 16)) / 4;
    for (const clip of tr.clips) if (clip.start >= beat && clip.start < beat + 0.25) this.playClip(a, clip, t + (clip.start - beat) * sd * 4);
  }
  playClip(a, clip, t) {
    const entry = this.store.get(clip.sample);
    if (!entry) return;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    const rate = clip.rate * Math.pow(2, clip.pitch / 12), real = clip.dur / rate;
    src.buffer = clip.rev ? reversed(entry) : entry.buffer; src.playbackRate.value = rate;
    const fi = Math.min(clip.fi, real / 2), fo = Math.min(clip.fo, real / 2), G = clip.gain;
    g.gain.setValueAtTime(fi > 0 ? 0 : G, t);
    if (fi > 0) g.gain.linearRampToValueAtTime(G, t + fi);
    g.gain.setValueAtTime(G, t + real - Math.max(fo, 0.004));
    g.gain.linearRampToValueAtTime(0, t + real);
    src.connect(g).connect(a.input);
    src.start(t, clip.off, clip.dur); src.stop(t + real + 0.01);
    this.keep(a, [src], g);
  }
}

// ---------- synth voices ----------
function adsr(param, t, dur, A, D, S, R, L) {
  A = Math.min(A, dur);
  param.setValueAtTime(0, t); param.linearRampToValueAtTime(L, t + A);
  param.setTargetAtTime(L * S, t + A, D / 3); param.setTargetAtTime(0, t + dur, R / 4);
  return t + dur + R * 1.6 + 0.05;
}

// 24 dB low-pass with a decaying envelope on `detune`, so `frequency` stays free for live cutoff changes.
function filt(e, f, vel, t, g, envScale = 1) {
  const c = e.ctx, f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), ks = Math.pow(f / 261.6, 0.35);
  const env = g('envAmt') * 1200 * (0.5 + 0.5 * vel) * envScale;
  for (const fl of [f1, f2]) { fl.frequency.value = clamp(g('cutoff') * ks, 30, 18000); fl.detune.setValueAtTime(env, t); fl.detune.setTargetAtTime(0, t, g('fdecay') / 3); }
  f1.Q.value = g('res'); f2.Q.value = 0.5; f1.connect(f2);
  return { in: f1, out: f2, rec: {
    cutoff: (v, tt) => { for (const fl of [f1, f2]) fl.frequency.setTargetAtTime(clamp(v * ks, 30, 18000), tt, 0.05); },
    res: (v, tt) => f1.Q.setTargetAtTime(v, tt, 0.05),
  } };
}
const curves = {};
function curve(name) {
  if (!curves[name]) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = name === 'fold' ? Math.sin(x * Math.PI * 2.5) : Math.tanh(x * 3) / Math.tanh(3); }
    curves[name] = c;
  }
  return curves[name];
}
// formant frequencies for oo – oh – ah – eh – ee
const VOWELS = [[325, 700, 2700], [450, 800, 2830], [800, 1150, 2900], [400, 1600, 2700], [350, 2000, 2800]];
function formants(v) {
  const x = clamp(v) * 3.999, i = Math.floor(x), m = x - i;
  return VOWELS[i].map((a, k) => a + (VOWELS[i + 1][k] - a) * m);
}

const VOICES = {
  // Two oscillators + sub into a 24 dB low-pass with its own envelope.
  sub(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.sub.' + k);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), mix = c.createGain(), srcs = [o1, o2];
    o1.type = g('wave1'); o2.type = g('wave2');
    o1.frequency.value = f; o2.frequency.value = f * Math.pow(2, g('oct2'));
    o1.detune.value = -g('detune'); o2.detune.value = g('detune');
    mix.gain.value = 0.5; o1.connect(mix); o2.connect(mix);
    if (g('sub') > 0.01) { const s = c.createOscillator(), sg = c.createGain(); s.frequency.value = f / 2; sg.gain.value = g('sub'); s.connect(sg).connect(mix); srcs.push(s); }
    const fl = filt(e, f, vel, t, g), amp = c.createGain(), pan = c.createStereoPanner();
    const end = adsr(amp.gain, t, dur, g('attack'), g('decay'), g('sustain'), g('release'), g('level') * vel * 0.5);
    pan.pan.value = (e.rand() - 0.5) * 2 * g('spread');
    mix.connect(fl.in); fl.out.connect(amp).connect(pan).connect(a.voiceIn);
    for (const s of srcs) { s.start(t); s.stop(end); }
    a.voices.add(fl.rec);
    e.keep(a, srcs, pan, () => a.voices.delete(fl.rec));
  },
  // One modulator feeding two detuned, hard-panned carriers (electric piano, bells, FM bass).
  fm(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.fm.' + k);
    const m = c.createOscillator(), mg = c.createGain(), amp = c.createGain(), srcs = [m];
    const fmod = f * g('ratio'), dev = g('index') * (0.4 + 0.6 * vel) * fmod;
    m.frequency.value = fmod; m.connect(mg);
    mg.gain.setValueAtTime(dev, t); mg.gain.setTargetAtTime(dev * g('isus'), t, g('idecay') / 3);
    const det = g('detune');
    for (const side of det > 0.5 ? [-1, 1] : [0]) {
      const o = c.createOscillator(), pn = c.createStereoPanner();
      o.frequency.value = f; o.detune.value = side * det; pn.pan.value = side * 0.6;
      mg.connect(o.frequency); o.connect(pn).connect(amp); srcs.push(o);
    }
    const end = adsr(amp.gain, t, dur, g('attack'), g('decay'), g('sustain'), g('release'), g('level') * vel * (det > 0.5 ? 0.35 : 0.5));
    amp.connect(a.voiceIn);
    for (const s of srcs) { s.start(t); s.stop(end); }
    e.keep(a, srcs, amp);
  },
  // Additive drawbar organ (the classic house organ bass / stab) with a key click.
  organ(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.organ.' + k);
    const bars = [g('d1'), g('d2'), g('d3'), g('d4'), g('d5'), g('d6')], key = bars.map((b) => b.toFixed(2)).join();
    if (!a.wave || a.wave.key !== key) {
      const re = new Float32Array(9), im = new Float32Array(9);
      [1, 2, 3, 4, 6, 8].forEach((hrm, i) => { im[hrm] = bars[i] + 1e-4; });
      a.wave = { key, w: c.createPeriodicWave(re, im) };
    }
    const o = c.createOscillator(), k = c.createOscillator(), kg = c.createGain(), amp = c.createGain();
    o.setPeriodicWave(a.wave.w); o.frequency.value = f / 2;
    k.frequency.value = f * 4; kg.gain.setValueAtTime(g('click') * 0.35, t); kg.gain.setTargetAtTime(0, t, 0.012);
    o.connect(amp); k.connect(kg).connect(amp);
    const end = adsr(amp.gain, t, dur, g('attack'), 0.1, 1, g('release'), g('level') * vel * 0.45);
    amp.connect(a.voiceIn);
    o.start(t); o.stop(end); k.start(t); k.stop(t + 0.15);
    e.keep(a, [o, k], amp);
  },
  // Five detuned saws spread across the stereo field.
  saw(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.saw.' + k), srcs = [];
    const fl = filt(e, f, vel, t, g), amp = c.createGain(), det = g('detune'), side = g('mix'), w = g('spread');
    [-1, -0.5, 0, 0.5, 1].forEach((d, i) => {
      const o = c.createOscillator(), og = c.createGain(), pn = c.createStereoPanner();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d * det + (e.rand() - 0.5) * 3;
      og.gain.value = d === 0 ? 0.5 : side * 0.35; pn.pan.value = d * w;
      o.connect(og).connect(pn).connect(fl.in); srcs.push(o);
    });
    const end = adsr(amp.gain, t, dur, g('attack'), g('decay'), g('sustain'), g('release'), g('level') * vel * 0.45);
    fl.out.connect(amp).connect(a.voiceIn);
    for (const s of srcs) { s.start(t); s.stop(end); }
    a.voices.add(fl.rec);
    e.keep(a, srcs, amp, () => a.voices.delete(fl.rec));
  },
  // 303-style mono line: accent on loud steps, slide when notes overlap, driven output.
  acid(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.acid.' + k);
    const acc = vel > 0.85 ? g('accent') : 0, slide = g('slide'), last = a.rt.acid;
    const o = c.createOscillator(), fl = filt(e, f, 1, t, g, 0.7 + acc * 0.6), pre = c.createGain(), sh = c.createWaveShaper(), amp = c.createGain();
    o.type = g('wave');
    if (slide > 0.005 && last && t < last.end + 0.03) { o.frequency.setValueAtTime(last.f, t); o.frequency.exponentialRampToValueAtTime(f, t + slide); }
    else o.frequency.value = f;
    a.rt.acid = { f, end: t + dur };
    const drive = g('drive'), L = (g('level') * (0.55 + 0.25 * vel + acc * 0.3)) / (1 + drive * 1.5);
    pre.gain.value = 0.35 + drive * 2.5; sh.curve = curve('tanh');
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(L, t + 0.003);
    amp.gain.setTargetAtTime(L * 0.7, t + 0.003, 0.15); amp.gain.setTargetAtTime(0, t + dur, 0.012);
    o.connect(fl.in); fl.out.connect(pre).connect(sh).connect(amp).connect(a.voiceIn);
    o.start(t); o.stop(t + dur + 0.12);
    a.voices.add(fl.rec);
    e.keep(a, [o], amp, () => a.voices.delete(fl.rec));
  },
  // Sine (+ one partial) into a wavefolder; the fold depth has its own envelope.
  fold(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.fold.' + k);
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain(), pre = c.createGain(), sh = c.createWaveShaper(), amp = c.createGain();
    const hm = g('hmix'), base = (0.18 + g('fold') * 0.82) / (1 + hm), peak = Math.min(1 / (1 + hm), base + (g('fenv') * 0.8 * (0.4 + 0.6 * vel)) / (1 + hm));
    o1.frequency.value = f; o2.frequency.value = f * g('harm'); g2.gain.value = hm;
    pre.gain.setValueAtTime(peak, t); pre.gain.setTargetAtTime(base, t, g('fdecay') / 3);
    sh.curve = curve('fold'); sh.oversample = '2x';
    o1.connect(pre); o2.connect(g2).connect(pre); pre.connect(sh).connect(amp).connect(a.voiceIn);
    const end = adsr(amp.gain, t, dur, g('attack'), g('decay'), g('sustain'), g('release'), g('level') * vel * 0.4);
    for (const s of [o1, o2]) { s.start(t); s.stop(end); }
    e.keep(a, [o1, o2], amp);
  },
  // Two saws with vibrato through three parallel band-pass formants.
  vox(e, a, p, midi, t, dur, vel) {
    const c = e.ctx, f = mtof(midi), g = (k) => e.v(p + '.vox.' + k);
    const src = c.createGain(), amp = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), srcs = [lfo], det = g('detune');
    lfo.frequency.value = 5 + e.rand(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(g('vib') * 35, t + 0.4); lfo.connect(lg);
    for (const sgn of [-1, 1]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = sgn * det;
      lg.connect(o.detune); o.connect(src); srcs.push(o);
    }
    const bands = formants(g('vowel')).map((fr, i) => {
      const b = c.createBiquadFilter(), bg = c.createGain();
      b.type = 'bandpass'; b.frequency.value = fr; b.Q.value = g('q'); bg.gain.value = [1, 0.6, 0.3][i];
      src.connect(b).connect(bg).connect(amp);
      return b;
    });
    const rec = {
      vowel: (v, tt) => formants(v).forEach((fr, i) => bands[i].frequency.setTargetAtTime(fr, tt, 0.04)),
      q: (v, tt) => bands.forEach((b) => b.Q.setTargetAtTime(v, tt, 0.04)),
    };
    const end = adsr(amp.gain, t, dur, g('attack'), g('decay'), g('sustain'), g('release'), g('level') * vel * 1.5);
    amp.connect(a.voiceIn);
    for (const s of srcs) { s.start(t); s.stop(end); }
    a.voices.add(rec);
    e.keep(a, srcs, amp, () => a.voices.delete(rec));
  },
};
