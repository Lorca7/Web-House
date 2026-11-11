// Mixer page: one channel strip per track (fader, meter, pan, sends, mute/solo) plus the master strip.
import { h } from './core.js';
import { knob, fader, btn } from './ui.js';

const TYPE = { drum: 'Drums', synth: 'Synth', gran: 'Granular', audio: 'Audio' };
const dB = (v) => (v <= 0.0005 ? '−∞' : (20 * Math.log10(v)).toFixed(1)) + ' dB';

// Peak meter on a dB scale (−54…+3) with a slow-falling bar and peak-hold line.
function meter(getAnalyser) {
  const cv = h('canvas', { class: 'vu', width: 10, height: 180, 'aria-hidden': 'true' });
  const buf = new Float32Array(256);
  let level = 0, hold = 0, held = 0;
  const draw = (eng) => {
    const an = eng && getAnalyser(eng);
    let pk = 0;
    if (an) { an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; } }
    level = Math.max(pk, level * 0.9);
    if (pk >= hold) { hold = pk; held = 45; } else if (--held < 0) hold *= 0.95;
    const y = (v) => 180 * (1 - Math.min(1, Math.max(0, (20 * Math.log10(Math.max(v, 1e-5)) + 54) / 57)));
    const c = cv.getContext('2d'), cs = getComputedStyle(cv);
    c.clearRect(0, 0, 10, 180);
    c.fillStyle = level > 1 ? cs.caretColor : cs.color; c.fillRect(0, y(level), 10, 180 - y(level));
    if (hold > 0.002) { c.fillStyle = hold > 1 ? cs.caretColor : cs.outlineColor; c.fillRect(0, y(hold), 10, 2); }
  };
  return { cv, draw };
}

export function renderMixer(app, root) {
  const P = app.project;
  app.mixUI = [];
  const strip = (cls, color, head, knobs, buttons, faderId, getAnalyser) => {
    const out = h('output', null), m = meter(getAnalyser);
    app.mixUI.push(m.draw);
    return h('div', { class: 'ch ' + cls, style: { '--tc': color } }, head, h('div', { class: 'ch-knobs' }, knobs), h('div', { class: 'ch-btns' }, buttons),
      h('div', { class: 'ch-fader' }, fader(app, faderId, { onvalue: (v) => { out.textContent = dB(v); } }), m.cv), out);
  };
  const strips = P.tracks.map((tr, i) => {
    const p = 't' + tr.id;
    const mute = btn('M', () => { tr.mute = !tr.mute; app.mixChanged(); }, { class: 'sq' + (tr.mute ? ' on' : ''), title: 'Mute' });
    const solo = btn('S', () => { tr.solo = !tr.solo; app.mixChanged(); }, { class: 'sq solo' + (tr.solo ? ' on' : ''), title: 'Solo' });
    app.msSync.push(() => { mute.classList.toggle('on', tr.mute); solo.classList.toggle('on', tr.solo); });
    return strip(tr.type, `var(--${tr.type})`,
      [h('span', { class: 'ch-num' }, `${i + 1} · ${TYPE[tr.type]}`),
        h('input', { class: 'name', value: tr.name, 'aria-label': 'Track name', onchange: (e) => { tr.name = e.target.value; app.changed(); app.renderTracks(); app.renderSide(); } })],
      ['pan', 'fx', 'space', 'drift'].map((k) => knob(app, `${p}.${k}`, { small: true })),
      [mute, solo], p + '.vol', (eng) => eng.tr.get(tr.id) && eng.tr.get(tr.id).meter);
  });
  root.replaceChildren(
    h('div', { class: 'mixer' }, strips,
      !strips.length && h('p', { class: 'hint' }, 'No tracks yet — add some on the Studio page.'),
      strip('master', 'var(--accent)', [h('span', { class: 'ch-num' }, 'Output'), h('span', { class: 'name' }, 'Master')],
        [knob(app, 'g.pump', { small: true }), knob(app, 'fx.wet', { small: true, label: 'FX wet' }), knob(app, 'g.spaceSize', { small: true, label: 'Space' }), knob(app, 'g.spaceTone', { small: true, label: 'Tone' })],
        [], 'g.vol', (eng) => eng.an)),
    h('p', { class: 'hint' }, 'Faders set track volume; FX send feeds the effects pad, Space feeds the shared reverb, Drift lets a track fade in and out over a long take. LFOs can be dropped on faders too.'));
}
