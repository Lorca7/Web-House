// Recording: live capture of the master bus (AudioWorklet) and faster-than-real-time offline rendering.
import { Engine } from './engine.js';

const FADE = 4; // seconds of fade-out at the end of every take

const WORKLET = `
class WHRec extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.n = 0; this.L = new Float32Array(4096); this.R = new Float32Array(4096);
    this.port.onmessage = (e) => { this.on = e.data.on; this.n = 0; }; }
  process(inputs) {
    if (!this.on) return true;
    const i = inputs[0], l = i && i[0], r = (i && i[1]) || l;
    for (let k = 0; k < 128; k++) {
      this.L[this.n] = l ? l[k] : 0; this.R[this.n] = r ? r[k] : 0;
      if (++this.n === 4096) { this.port.postMessage({ l: this.L.slice(), r: this.R.slice() }); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('wh-rec', WHRec);`;

function wavHeader(frames, sr, bits) {
  const bytes = bits / 8, data = frames * 2 * bytes, b = new DataView(new ArrayBuffer(44));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); b.setUint32(4, 36 + data, true); str(8, 'WAVE'); str(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 2, true); b.setUint32(24, sr, true);
  b.setUint32(28, sr * 2 * bytes, true); b.setUint16(32, 2 * bytes, true); b.setUint16(34, bits, true);
  str(36, 'data'); b.setUint32(40, data, true);
  return b.buffer;
}

// Interleave + quantise a block. `gain(i)` returns the fade multiplier for absolute frame index.
function pcm(l, r, n, bits, first, total, sr) {
  const bytes = bits / 8, out = new DataView(new ArrayBuffer(n * 2 * bytes)), fadeN = Math.min(FADE * sr, total / 4);
  const max = bits === 16 ? 32767 : 8388607;
  for (let i = 0; i < n; i++) {
    const left = total - (first + i), g = left < fadeN ? Math.max(0, left / fadeN) : 1;
    for (let ch = 0; ch < 2; ch++) {
      const v = Math.round(Math.max(-1, Math.min(1, (ch ? r : l)[i] * g)) * max), o = (i * 2 + ch) * bytes;
      if (bits === 16) out.setInt16(o, v, true);
      else { out.setUint8(o, v & 255); out.setUint8(o + 1, (v >> 8) & 255); out.setInt8(o + 2, v >> 16); }
    }
  }
  return out.buffer;
}

export function encodeWav(buffer, bits = 16, fade = false) {
  const n = buffer.length, l = buffer.getChannelData(0), r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
  const total = fade ? n : Number.MAX_SAFE_INTEGER;
  return new Blob([wavHeader(n, buffer.sampleRate, bits), pcm(l, r, n, bits, 0, total, buffer.sampleRate)], { type: 'audio/wav' });
}

// Live recorder: taps `node`, stops itself after `seconds`, resolves with a WAV Blob.
export class LiveRecorder {
  static async create(ctx, node) {
    if (!ctx._whRec) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      ctx._whRec = ctx.audioWorklet.addModule(url);
    }
    await ctx._whRec;
    const rec = new LiveRecorder();
    rec.ctx = ctx;
    rec.node = new AudioWorkletNode(ctx, 'wh-rec', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
    node.connect(rec.node);
    rec.src = node;
    return rec;
  }
  start(seconds, bits, onProgress) {
    const sr = this.ctx.sampleRate;
    Object.assign(this, { total: Math.round(seconds * sr), got: 0, bits, parts: [], pending: [], active: true });
    return new Promise((resolve) => {
      this.finish = () => {
        if (!this.active) return;
        this.active = false;
        this.node.port.postMessage({ on: false });
        if (this.pending.length) this.parts.push(new Blob(this.pending));
        resolve(new Blob([wavHeader(this.got, sr, bits), ...this.parts], { type: 'audio/wav' }));
      };
      this.node.port.onmessage = (e) => {
        if (!this.active) return;
        const n = Math.min(e.data.l.length, this.total - this.got);
        this.pending.push(pcm(e.data.l, e.data.r, n, bits, this.got, this.total, sr));
        this.got += n;
        // fold finished chunks into Blobs so long takes do not sit in JS memory
        if (this.pending.length >= 128) { this.parts.push(new Blob(this.pending)); this.pending = []; }
        if (onProgress) onProgress(this.got / this.total);
        if (this.got >= this.total) this.finish();
      };
      this.node.port.postMessage({ on: true });
    });
  }
  // stop early: keeps what was recorded so far (no fade)
  stop() { if (this.finish) this.finish(); }
}

export const canRenderOffline = () => typeof OfflineAudioContext !== 'undefined' && 'suspend' in OfflineAudioContext.prototype;

// Offline render of a project for `seconds`, running the same engine against an OfflineAudioContext.
export async function renderOffline(project, store, seconds, bits = 16, onProgress) {
  const sr = 44100, STEP = 0.05;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const eng = new Engine(ctx, structuredClone(project), store);
  eng.control(0); eng.start(); eng.advance(STEP + 0.005);
  const loop = (T) => {
    if (T >= seconds) return;
    ctx.suspend(T).then(() => {
      const now = ctx.currentTime;
      eng.control(now); eng.advance(now + STEP + 0.005);
      if (onProgress) onProgress(now / seconds);
      loop(T + STEP);
      ctx.resume();
    });
  };
  loop(STEP);
  const buffer = await ctx.startRendering();
  return encodeWav(buffer, bits, true);
}
