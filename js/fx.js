// Effects. Each factory returns { input, output, set: { param: (value, time) => void }, dispose() }.
import { getIR } from './sounds.js';

const sm = (param, tc = 0.03) => (v, t) => param.setTargetAtTime(v, t, tc);

function shaperCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}

const MAKERS = {
  // Ping-pong tape-style echo: filtered, saturated feedback and a little wow.
  echo(c, io, keep) {
    const dL = c.createDelay(4), dR = c.createDelay(4), hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
    const sat = c.createWaveShaper(), fb1 = c.createGain(), fb2 = c.createGain(), level = c.createGain();
    const mrg = c.createChannelMerger(2), wow = c.createOscillator(), wowG = c.createGain();
    hp.type = 'highpass'; hp.frequency.value = 160; sat.curve = shaperCurve(1.5);
    wow.frequency.value = 0.37; wow.connect(wowG); wowG.connect(dL.delayTime); wowG.connect(dR.delayTime); wow.start();
    io.input.connect(io.output);
    io.input.connect(dL);
    dL.connect(hp).connect(lp).connect(sat).connect(fb1).connect(dR);
    dR.connect(fb2).connect(dL);
    dL.connect(mrg, 0, 0); dR.connect(mrg, 0, 1);
    mrg.connect(level).connect(io.output);
    keep(dL, dR, hp, lp, sat, fb1, fb2, level, mrg, wow, wowG);
    return {
      time: (v, t) => { dL.delayTime.setTargetAtTime(v, t, 0.12); dR.delayTime.setTargetAtTime(v, t, 0.12); },
      feedback: (v, t) => { fb1.gain.setTargetAtTime(v, t, 0.03); fb2.gain.setTargetAtTime(v, t, 0.03); },
      tone: sm(lp.frequency), wobble: (v, t) => wowG.gain.setTargetAtTime(v * 0.003, t, 0.05), level: sm(level.gain),
    };
  },
  // Two convolvers (short room / long hall) cross-faded by "size" so decay is sweepable without clicks.
  reverb(c, io, keep) {
    const dry = c.createGain(), pre = c.createDelay(0.2), cs = c.createConvolver(), cl = c.createConvolver();
    const gs = c.createGain(), gl = c.createGain(), lp = c.createBiquadFilter(), level = c.createGain();
    pre.delayTime.value = 0.018; cs.buffer = getIR(1.3); cl.buffer = getIR(5);
    io.input.connect(dry).connect(io.output);
    io.input.connect(pre);
    pre.connect(cs).connect(gs).connect(lp); pre.connect(cl).connect(gl).connect(lp);
    lp.connect(level).connect(io.output);
    keep(dry, pre, cs, cl, gs, gl, lp, level);
    return {
      size: (v, t) => { gs.gain.setTargetAtTime(Math.cos((v * Math.PI) / 2), t, 0.05); gl.gain.setTargetAtTime(Math.sin((v * Math.PI) / 2), t, 0.05); },
      tone: sm(lp.frequency), level: sm(level.gain), dry: sm(dry.gain),
    };
  },
  filter(c, io, keep) {
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    f2.Q.value = 0.6;
    io.input.connect(f1).connect(f2).connect(io.output);
    keep(f1, f2);
    return {
      type: (v) => { f1.type = v; f2.type = v; },
      cutoff: (v, t) => { f1.frequency.setTargetAtTime(v, t, 0.03); f2.frequency.setTargetAtTime(v, t, 0.03); },
      res: sm(f1.Q),
    };
  },
  chorus(c, io, keep) {
    const wet = c.createGain(), mrg = c.createChannelMerger(2), set = { oscs: [], depths: [] };
    io.input.connect(io.output);
    [0.011, 0.017].forEach((base, i) => {
      const d = c.createDelay(0.1), o = c.createOscillator(), g = c.createGain();
      d.delayTime.value = base; o.connect(g).connect(d.delayTime); o.start();
      io.input.connect(d).connect(mrg, 0, i);
      set.oscs.push(o); set.depths.push(g); keep(d, o, g);
    });
    mrg.connect(wet).connect(io.output); keep(wet, mrg);
    return {
      rate: (v, t) => set.oscs.forEach((o, i) => o.frequency.setTargetAtTime(v * (1 + i * 0.13), t, 0.05)),
      depth: (v, t) => set.depths.forEach((g) => g.gain.setTargetAtTime(v * 0.005, t, 0.05)),
      mix: sm(wet.gain),
    };
  },
  phaser(c, io, keep) {
    const wet = c.createGain(), o = c.createOscillator(), g = c.createGain(), aps = [];
    o.connect(g); o.start();
    let node = io.input;
    for (let i = 0; i < 6; i++) {
      const ap = c.createBiquadFilter(); ap.type = 'allpass'; ap.Q.value = 0.6;
      g.connect(ap.detune); node.connect(ap); node = ap; aps.push(ap);
    }
    io.input.connect(io.output); node.connect(wet).connect(io.output);
    keep(wet, o, g, ...aps);
    return {
      rate: sm(o.frequency), depth: (v, t) => g.gain.setTargetAtTime(v * 2400, t, 0.05),
      center: (v, t) => aps.forEach((ap, i) => ap.frequency.setTargetAtTime(v * (1 + i * 0.35), t, 0.05)), mix: sm(wet.gain),
    };
  },
  drive(c, io, keep) {
    const pre = c.createGain(), sh = c.createWaveShaper(), lp = c.createBiquadFilter(), post = c.createGain();
    sh.curve = shaperCurve(2.5); sh.oversample = '2x';
    io.input.connect(pre).connect(sh).connect(lp).connect(post).connect(io.output);
    keep(pre, sh, lp, post);
    return {
      drive: (v, t) => { pre.gain.setTargetAtTime(1 + v * 14, t, 0.03); post.gain.setTargetAtTime(1 / (1 + v * 2.2), t, 0.03); },
      tone: sm(lp.frequency),
    };
  },
};

export function makeFx(ctx, type) {
  const io = { input: ctx.createGain(), output: ctx.createGain() };
  const nodes = [io.input, io.output];
  const set = MAKERS[type](ctx, io, (...n) => nodes.push(...n));
  return {
    ...io, set,
    dispose() {
      for (const n of nodes) { try { n.stop && n.stop(); } catch { /* not started */ } n.disconnect(); }
    },
  };
}
