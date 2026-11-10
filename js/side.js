// Side panel: XY effects pad and the eight LFOs.
import { DEFS, h, clamp } from './core.js';
import { FX } from './defs.js';
import { labelOf } from './project.js';
import { knob, sel, btn, field } from './ui.js';

export function renderFx(app, root) {
  const P = app.project;
  const puck = h('div', { class: 'puck' }), ghost = h('div', { class: 'puck ghost' });
  const lx = h('span', { class: 'ax x' }), ly = h('span', { class: 'ax y' });
  const pad = h('div', { class: 'xypad', title: 'Drag to play both effects at once' }, lx, ly, ghost, puck);
  const place = (el, x, y) => { el.style.left = x * 100 + '%'; el.style.top = (1 - y) * 100 + '%'; };
  const sync = () => place(puck, P.params['fx.x'], P.params['fx.y']);
  const drag = (e) => { const r = pad.getBoundingClientRect(); app.setParam('fx.x', clamp((e.clientX - r.left) / r.width)); app.setParam('fx.y', clamp(1 - (e.clientY - r.top) / r.height)); sync(); };
  pad.addEventListener('pointerdown', (e) => {
    if (app.armedLfo != null) return;
    pad.setPointerCapture(e.pointerId); drag(e); pad.onpointermove = drag;
  });
  pad.addEventListener('pointerup', () => { pad.onpointermove = null; });
  app.xyTick = (engine) => { if (engine) place(ghost, engine.v('fx.x'), engine.v('fx.y')); };
  app.xySync = sync;

  const slot = (s, axis) => {
    const type = P.params[`fx.${s}.type`], defs = FX[type].params.filter((d) => d.kind === 'num');
    const map = (P.fx[s].map = [0, 1].map((i) => (defs.some((d) => d.key === P.fx[s].map[i]) ? P.fx[s].map[i] : null)));
    const typeSel = h('select', { title: 'Effect', onchange: () => { const t = typeSel.value; P.fx[s].map = FX[t].xy.slice(); app.setParam(`fx.${s}.type`, t); if (app.engine) app.engine.updateXY(); app.renderSide(); } },
      Object.entries(FX).map(([k, f]) => h('option', { value: k, selected: k === type }, f.label)));
    const mapSel = (i) => {
      const m = h('select', { title: `Parameter ${i + 1} controlled by the ${axis} axis`, onchange: () => { map[i] = m.value || null; if (app.engine) app.engine.updateXY(); app.changed(); app.renderSide(); } },
        h('option', { value: '' }, '—'), defs.map((d) => h('option', { value: d.key, selected: map[i] === d.key }, d.label)));
      return m;
    };
    (axis === 'X' ? lx : ly).textContent = `${axis} → ${FX[type].label}: ${map.filter(Boolean).map((k) => defs.find((d) => d.key === k).label).join(' + ') || 'nothing'}`;
    return h('div', { class: 'slot' },
      h('div', { class: 'row' }, h('b', null, `${axis} axis`), typeSel, field('controls', mapSel(0)), field('and', mapSel(1))),
      h('div', { class: 'row' }, FX[type].params.map((d) => (d.kind === 'num' ? knob(app, `fx.${s}.${type}.${d.key}`) : sel(app, `fx.${s}.${type}.${d.key}`)))));
  };
  root.replaceChildren(
    h('h2', null, 'Effects pad'),
    h('div', { class: 'xywrap' }, pad, h('div', { class: 'col' }, knob(app, 'fx.wet'), knob(app, 'fx.x', { label: 'X' }), knob(app, 'fx.y', { label: 'Y' }))),
    slot('a', 'X'), slot('b', 'Y'),
    h('p', { class: 'hint' }, 'Signal flow: tracks (FX send) → effect A → effect B → Dry/Wet. Mapped knobs follow the pad; drop an LFO on X or Y to automate it.'));
  sync();
}

const SHAPES = {
  sine: (f) => Math.sin(2 * Math.PI * f), tri: (f) => 1 - 4 * Math.abs(f - 0.5), up: (f) => 2 * f - 1, down: (f) => 1 - 2 * f,
  square: (f) => (f < 0.5 ? 1 : -1), sh: (f) => [0.3, -0.7, 0.8, -0.2][Math.floor(f * 4) % 4], drift: (f) => Math.sin(2 * Math.PI * f) * 0.6 + Math.sin(5.3 * f + 1) * 0.35,
};

export function renderLfos(app, root) {
  const P = app.project, meters = [];
  const cards = P.lfos.map((lfo, i) => {
    const id = 'lfo' + i, cv = h('canvas', { class: 'scope', width: 96, height: 36 });
    const handle = h('div', { class: 'handle' + (app.armedLfo === i ? ' armed' : ''), draggable: true, title: 'Drag onto any knob to modulate it — or click here, then click a knob' }, `LFO ${i + 1}`, cv);
    handle.addEventListener('dragstart', (e) => { app.dragLfo = i; e.dataTransfer.setData('text/plain', 'lfo' + i); e.dataTransfer.effectAllowed = 'link'; document.body.classList.add('lfo-drag'); });
    handle.addEventListener('dragend', () => { app.dragLfo = null; document.body.classList.remove('lfo-drag'); });
    handle.addEventListener('click', () => { app.armedLfo = app.armedLfo === i ? null : i; document.body.classList.toggle('lfo-drag', app.armedLfo != null); app.renderSide(); });
    meters.push(() => {
      const c = cv.getContext('2d'), fn = SHAPES[P.params[id + '.shape']] || SHAPES.sine, style = getComputedStyle(cv);
      c.clearRect(0, 0, 96, 36); c.strokeStyle = style.color; c.lineWidth = 1.5; c.beginPath();
      for (let x = 0; x <= 96; x += 2) c[x ? 'lineTo' : 'moveTo'](x, 18 - fn(x / 96) * 13);
      c.stroke();
      if (app.engine) { c.fillStyle = style.caretColor; c.fillRect(0, 34, 48 + app.engine.lfoVals[i] * 48 * P.params[id + '.depth'], 2); }
    });
    const targets = lfo.targets.map((t) => h('div', { class: 'target' },
      h('span', { title: t.id }, labelOf(P, t.id)),
      h('input', { type: 'range', min: -1, max: 1, step: 0.01, value: t.amt, title: 'Modulation amount (negative inverts)', oninput: (e) => { t.amt = +e.target.value; app.changed(); } }),
      btn('✕', () => { lfo.targets = lfo.targets.filter((x) => x !== t); app.changed(); app.refreshParams(t.id); app.renderSide(); }, { class: 'sq ghost', title: 'Remove mapping' })));
    const free = P.params[id + '.sync'] === 'free';
    return h('div', { class: 'lfo' + (lfo.targets.length ? ' used' : '') },
      h('div', { class: 'row' }, handle, sel(app, id + '.shape', { bare: true }), sel(app, id + '.sync', { bare: true, onchange: () => app.renderSide() }),
        h('div', { class: free ? '' : 'dim' }, knob(app, id + '.rate', { small: true })), knob(app, id + '.depth', { small: true })),
      targets.length ? targets : h('div', { class: 'hint' }, 'not mapped'));
  });
  app.lfoTick = () => meters.forEach((m) => m());
  root.replaceChildren(h('h2', null, 'LFOs'), h('p', { class: 'hint' }, app.armedLfo != null ? `LFO ${app.armedLfo + 1} armed — now click any knob.` : 'Drag an LFO onto any knob (or tap the LFO, then tap a knob).'), ...cards);
}

export function assignLfo(app, i, id) {
  const d = DEFS.get(id), lfo = app.project.lfos[i];
  if (!d || d.kind !== 'num' || id.startsWith(`lfo${i}.`)) return;
  if (!lfo.targets.some((t) => t.id === id)) lfo.targets.push({ id, amt: 0.3 });
  app.armedLfo = null; app.dragLfo = null;
  document.body.classList.remove('lfo-drag');
  app.changed(); app.refreshParams(id); app.renderSide();
}
