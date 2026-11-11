// Shared UI widgets: knobs, selects, waveform drawing.
import { DEFS, h, clamp, toNorm, fromNorm, fmt } from './core.js';
import { SYNTH_PRESETS, PRESET_CATS } from './defs.js';

const R = 15, C = 2 * Math.PI * R, ARC = 0.75 * C;

function track(app, id, ctrl) {
  if (!app.ctrls.has(id)) app.ctrls.set(id, new Set());
  app.ctrls.get(id).add(ctrl);
}

// Rotary control bound to a numeric parameter. Drag vertically, shift = fine, double-click = default.
// Also a drop target for LFO handles.
export function knob(app, id, o = {}) {
  const d = DEFS.get(id);
  const el = h('div', { class: 'knob' + (o.small ? ' small' : ''), title: `${o.label || d.label} — drag to change, double-click to reset, drop an LFO here` });
  el.dataset.id = id;
  el.innerHTML = `<svg viewBox="0 0 40 40"><g transform="rotate(135 20 20)">
    <circle class="k-track" cx="20" cy="20" r="${R}" stroke-dasharray="${ARC} ${C}"/>
    <circle class="k-val" cx="20" cy="20" r="${R}"/><circle class="k-mod" cx="20" cy="20" r="${R}" stroke-dasharray="1.5 ${C}"/></g></svg>`;
  const lab = h('span', { class: 'k-label' }, o.label || d.label);
  el.append(lab);
  const val = el.querySelector('.k-val'), mod = el.querySelector('.k-mod');
  let hold = false;
  const ctrl = {
    el,
    update() {
      const v = app.project.params[id];
      val.setAttribute('stroke-dasharray', `${ARC * clamp(toNorm(d, v))} ${C}`);
      el.classList.toggle('mapped', app.isMapped(id));
      if (hold) lab.textContent = fmt(d, v);
    },
    showEff(v) {
      if (v == null) { mod.style.opacity = 0; return; }
      mod.style.opacity = 1;
      mod.setAttribute('stroke-dashoffset', -ARC * clamp(toNorm(d, v)));
    },
  };
  const show = (on) => { hold = on; lab.textContent = on ? fmt(d, app.project.params[id]) : o.label || d.label; };
  el.addEventListener('pointerenter', () => show(true));
  el.addEventListener('pointerleave', () => { if (!el.hasPointerCapture(0) && !el.classList.contains('drag')) show(false); });
  el.addEventListener('pointerdown', (e) => {
    if (app.armedLfo != null) { app.assignLfo(app.armedLfo, id); return; }
    e.preventDefault();
    el.setPointerCapture(e.pointerId); el.classList.add('drag'); show(true);
    let y = e.clientY, n = toNorm(d, app.project.params[id]);
    const move = (ev) => { n = clamp(n + (y - ev.clientY) / (ev.shiftKey ? 900 : 170)); y = ev.clientY; app.setParam(id, fromNorm(d, n)); };
    const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (!el.matches(':hover')) show(false); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', () => app.setParam(id, d.def));
  el.addEventListener('wheel', (e) => { e.preventDefault(); app.setParam(id, fromNorm(d, toNorm(d, app.project.params[id]) - Math.sign(e.deltaY) * 0.02)); }, { passive: false });
  lfoDrop(app, el, id);
  track(app, id, ctrl);
  ctrl.update();
  return el;
}

function lfoDrop(app, el, id) {
  el.addEventListener('dragover', (e) => { if (app.dragLfo != null) { e.preventDefault(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => { el.classList.remove('drop'); if (app.dragLfo != null) { e.preventDefault(); e.stopPropagation(); app.assignLfo(app.dragLfo, id); } });
}

// Vertical fader bound to a numeric parameter (mixer). Same gestures as a knob; also an LFO drop target.
export function fader(app, id, o = {}) {
  const d = DEFS.get(id), mod = h('i', { class: 'f-mod' });
  const el = h('div', { class: 'fader', role: 'slider', tabIndex: 0, 'aria-label': o.label || d.label, title: `${o.label || d.label} — drag, double-click to reset, drop an LFO here` },
    h('i', { class: 'f-slot' }), h('i', { class: 'f-fill' }), mod, h('i', { class: 'f-thumb' }));
  el.dataset.id = id;
  const norm = () => clamp(toNorm(d, app.project.params[id]));
  const ctrl = {
    el,
    update() { el.style.setProperty('--n', norm()); el.classList.toggle('mapped', app.isMapped(id)); if (o.onvalue) o.onvalue(app.project.params[id]); },
    showEff(v) { mod.style.opacity = v == null ? 0 : 1; if (v != null) el.style.setProperty('--m', clamp(toNorm(d, v))); },
  };
  el.addEventListener('pointerdown', (e) => {
    if (app.armedLfo != null) { app.assignLfo(app.armedLfo, id); return; }
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    let y = e.clientY, n = norm();
    const range = el.clientHeight - 22;
    const move = (ev) => { n = clamp(n + (y - ev.clientY) / (ev.shiftKey ? range * 5 : range)); y = ev.clientY; app.setParam(id, fromNorm(d, n)); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  el.addEventListener('dblclick', () => app.setParam(id, d.def));
  el.addEventListener('wheel', (e) => { e.preventDefault(); app.setParam(id, fromNorm(d, norm() - Math.sign(e.deltaY) * 0.02)); }, { passive: false });
  el.addEventListener('keydown', (e) => { const s = { ArrowUp: 0.02, ArrowDown: -0.02 }[e.key]; if (s) { e.preventDefault(); app.setParam(id, fromNorm(d, norm() + s)); } });
  lfoDrop(app, el, id);
  track(app, id, ctrl);
  ctrl.update();
  return el;
}

// Synth presets grouped by category.
export function presetSelect(value, onchange, first) {
  const s = h('select', { title: 'Sound + sequencer preset', onchange: () => onchange(s.value) },
    first && h('option', { value: '' }, first),
    PRESET_CATS.map((cat) => h('optgroup', { label: cat }, Object.keys(SYNTH_PRESETS).filter((k) => SYNTH_PRESETS[k].cat === cat).map((k) => h('option', { value: k, selected: k === value }, k)))));
  return s;
}

// <select> bound to a choice parameter.
export function sel(app, id, o = {}) {
  const d = DEFS.get(id);
  const s = h('select', { title: o.label || d.label, onchange: () => { app.setParam(id, d.options[s.selectedIndex][0]); if (o.onchange) o.onchange(); } },
    d.options.map(([, label]) => h('option', null, label)));
  const ctrl = { el: s, update() { s.selectedIndex = Math.max(0, d.options.findIndex((x) => x[0] === app.project.params[id])); }, showEff() {} };
  track(app, id, ctrl);
  ctrl.update();
  return o.bare ? s : h('label', { class: 'field' }, h('span', null, o.label || d.label), s);
}

export function field(label, control) { return h('label', { class: 'field' }, h('span', null, label), control); }
export function btn(label, onclick, o = {}) { return h('button', { class: 'btn ' + (o.class || ''), title: o.title, onclick }, label); }

// Draw min/max peaks of buffer seconds [t0, t1] into a canvas sized to its CSS box.
export function drawWave(canvas, buffer, t0, t1, color, reverse = false) {
  const dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(canvas.clientWidth * dpr)), ht = Math.max(1, Math.round(canvas.clientHeight * dpr));
  canvas.width = w; canvas.height = ht;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, ht);
  if (!buffer) return;
  const data = buffer.getChannelData(0), sr = buffer.sampleRate, a = Math.max(0, t0 * sr) | 0, b = Math.min(data.length, t1 * sr) | 0;
  const per = (b - a) / w, stride = Math.max(1, Math.floor(per / 40));
  g.fillStyle = color;
  for (let x = 0; x < w; x++) {
    const xi = reverse ? w - 1 - x : x;
    let lo = 0, hi = 0;
    for (let i = (a + xi * per) | 0, e = (a + (xi + 1) * per) | 0; i < e; i += stride) { const s = data[i]; if (s < lo) lo = s; else if (s > hi) hi = s; }
    g.fillRect(x, (0.5 - hi * 0.48) * ht, 1, Math.max(1, (hi - lo) * 0.48 * ht));
  }
}

export const isFileDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');

// Make `el` accept dropped audio files; calls fn(file, event) for each.
export function dropZone(el, fn) {
  el.addEventListener('dragover', (e) => { if (isFileDrag(e)) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => {
    el.classList.remove('drop');
    if (!isFileDrag(e)) return;
    e.preventDefault(); e.stopPropagation();
    for (const f of e.dataTransfer.files) fn(f, e);
  });
}
