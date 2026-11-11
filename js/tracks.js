// Track strips: header + type-specific editor (drum grid, synth + sequencer, granular, audio clips).
import { h, clamp } from './core.js';
import { LANES, DRUM_PATTERNS, ENGINES, evolveDrums, mutateSeq } from './defs.js';
import { setPattern, applySynthPreset, regenerate } from './project.js';
import { getTexture } from './sounds.js';
import { knob, sel, btn, field, drawWave, dropZone, presetSelect } from './ui.js';

const TYPE = { drum: 'Drum machine', synth: 'Synth', gran: 'Granular', audio: 'Audio track' };
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const filePicker = (fn) => { const i = h('input', { type: 'file', accept: 'audio/*', onchange: () => { for (const f of i.files) fn(f); } }); i.click(); };
const plainSelect = (options, value, onchange, title) => {
  const s = h('select', { title, onchange: () => onchange(s.value) }, options.map((o) => h('option', { value: o, selected: o === value }, o)));
  return s;
};

export function renderTrack(app, tr) {
  const P = app.project, p = 't' + tr.id, ui = { refresh() {}, playhead() {}, tick() {} };
  const rest = h('span', { class: 'badge rest', title: 'Arrangement drift has faded this track out for now' }, 'resting');
  const body = h('div', { class: 'body' });
  const mute = btn('M', () => { tr.mute = !tr.mute; app.mixChanged(); }, { class: 'sq' + (tr.mute ? ' on' : ''), title: 'Mute' });
  const solo = btn('S', () => { tr.solo = !tr.solo; app.mixChanged(); }, { class: 'sq solo' + (tr.solo ? ' on' : ''), title: 'Solo' });
  app.msSync.push(() => { mute.classList.toggle('on', tr.mute); solo.classList.toggle('on', tr.solo); });
  const fold = btn(tr.open ? '▾' : '▸', () => { tr.open = !tr.open; fold.textContent = tr.open ? '▾' : '▸'; body.hidden = !tr.open; if (tr.open) ui.refresh(); app.changed(); }, { class: 'sq ghost', title: 'Show / hide editor' });
  const head = h('div', { class: 'head' },
    fold,
    h('input', { class: 'name', value: tr.name, 'aria-label': 'Track name', onchange: (e) => { tr.name = e.target.value; app.changed(); app.renderSide(); } }),
    h('span', { class: 'badge' }, TYPE[tr.type]), rest,
    h('div', { class: 'strip' }, mute, solo,
      ...['vol', 'pan', 'fx', 'space', 'drift'].map((k) => knob(app, `${p}.${k}`, { small: true })),
      btn('↑', () => app.moveTrack(tr, -1), { class: 'sq ghost', title: 'Move track up' }), btn('↓', () => app.moveTrack(tr, 1), { class: 'sq ghost', title: 'Move track down' }),
      btn('⧉', () => app.dupTrack(tr), { class: 'sq ghost', title: 'Duplicate track' }),
      btn('✕', () => { if (confirm(`Delete "${tr.name}"?`)) app.removeTrack(tr); }, { class: 'sq ghost', title: 'Delete track' })));
  body.hidden = !tr.open;
  ({ drum: drumBody, synth: synthBody, gran: granBody, audio: audioBody })[tr.type](app, tr, ui, body);
  ui.rest = (on) => rest.classList.toggle('show', on);
  ui.el = h('section', { class: 'track ' + tr.type }, head, body);
  app.trackUI.set(tr.id, ui);
  return ui.el;
}

// ---------------- drum machine ----------------
function drumBody(app, tr, ui, body) {
  const p = 't' + tr.id;
  const draw = () => {
    const cells = [];
    const rows = LANES.map((name, l) => {
      const label = () => (tr.samples[l] && app.store.get(tr.samples[l]) ? '♪ ' + app.store.get(tr.samples[l]).name : name);
      const lab = h('button', { class: 'lane-name', title: 'Click to audition. Drop an audio file here to replace this sound (right-click to restore).',
        onclick: () => app.audition(tr, l), oncontextmenu: (e) => { e.preventDefault(); delete tr.samples[l]; lab.textContent = label(); app.changed(); } }, label());
      dropZone(lab, async (f) => { const id = await app.loadSample(f); if (id) { tr.samples[l] = id; lab.textContent = label(); app.changed(); } });
      const lock = btn(tr.locks[l] ? '■' : '∿', () => { tr.locks[l] = !tr.locks[l]; lock.textContent = tr.locks[l] ? '■' : '∿'; lock.classList.toggle('on', !tr.locks[l]); app.changed(); },
        { class: 'sq ghost' + (tr.locks[l] ? '' : ' on'), title: '∿ = this lane evolves over time, ■ = locked' });
      cells[l] = tr.pattern[l].map((_, i) => h('i', { class: 'c', onpointerdown: (e) => {
        e.preventDefault();
        const v = e.button === 2 ? 0 : [2, 0, 3, 1][tr.pattern[l][i]];
        tr.pattern[l][i] = v; tr.base[l][i] = v; e.currentTarget.dataset.v = v; app.changed();
      }, oncontextmenu: (e) => e.preventDefault() }));
      return h('div', { class: 'lane' }, lab, lock,
        h('div', { class: 'lane-knobs' }, ['level', 'tune', 'decay'].map((k) => knob(app, `${p}.l${l}.${k}`, { small: true }))),
        h('div', { class: 'steps', style: { '--n': tr.len } }, cells[l]));
    });
    ui.refresh = () => { for (let l = 0; l < 8; l++) for (let i = 0; i < tr.len; i++) cells[l][i].dataset.v = tr.pattern[l][i]; };
    let cur = -1;
    ui.playhead = (s) => {
      const i = s < 0 ? -1 : s % tr.len;
      if (i === cur) return;
      for (let l = 0; l < 8; l++) { if (cur >= 0) cells[l][cur].classList.remove('cur'); if (i >= 0) cells[l][i].classList.add('cur'); }
      cur = i;
    };
    const setLen = (n) => {
      for (const k of ['pattern', 'base']) tr[k] = tr[k].map((r) => (n === 32 ? [...r.slice(0, 16), ...r.slice(0, 16)] : r.slice(0, 16)));
      tr.len = n; app.changed(); draw();
    };
    body.replaceChildren(
      h('div', { class: 'row' },
        sel(app, p + '.kit'),
        field('Pattern', plainSelect(Object.keys(DRUM_PATTERNS), tr.patternName, (v) => { setPattern(tr, v); app.changed(); draw(); }, 'Preset rhythm')),
        field('Steps', plainSelect(['16', '32'], String(tr.len), (v) => setLen(+v))),
        sel(app, p + '.evoBars'), knob(app, p + '.evo'), knob(app, p + '.fill'),
        btn('Mutate now', () => { evolveDrums(tr, Math.max(0.3, app.project.params[p + '.evo']), Math.random); ui.refresh(); app.changed(); }),
        btn('Back to base', () => { tr.pattern = tr.base.map((r) => r.slice()); ui.refresh(); app.changed(); }, { title: 'Undo all evolution; your own edits are the base' }),
        h('span', { class: 'hint' }, 'Click: on → accent → ghost → off')),
      h('div', { class: 'grid' }, rows));
    ui.refresh();
  };
  draw();
}

// ---------------- synth + evolving sequencer ----------------
const ROW_NAMES = ['root', '2nd', '3rd', '4th', '5th', '6th', '7th', 'oct', '9th', '10th'];
const INV_NAMES = ['root pos', '1st inv', '2nd inv', '3rd inv'];

function synthBody(app, tr, ui, body) {
  const P = app.project, p = 't' + tr.id, g = (k) => P.params[`${p}.${k}`];
  const draw = () => {
    const engine = g('engine'), role = g('role'), len = role === 'pad' ? 1 : g('len'), chordal = role === 'chords' || role === 'pad';
    const rows = chordal ? [3, 2, 1, 0] : [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], cells = {};
    const grid = rows.map((d) => {
      cells[d] = Array.from({ length: len }, (_, i) => h('i', { class: 'c', onpointerdown: (e) => {
        e.preventDefault();
        const st = tr.seq[i];
        if (e.button === 2 || e.shiftKey) { if (st && st.d === d) st.l = { 1: 2, 2: 3, 3: 4, 4: 6, 6: 8, 8: 1 }[st.l] || 1; }
        else if (st && st.d === d) { if (role !== 'pad') tr.seq[i] = null; }
        else tr.seq[i] = { d, v: 0.85, l: st ? st.l : role === 'lead' ? 2 : 1 };
        ui.refresh(); app.changed();
      }, oncontextmenu: (e) => e.preventDefault() }));
      return h('div', { class: 'lane' }, h('span', { class: 'row-name' }, (chordal ? INV_NAMES : ROW_NAMES)[d]), h('div', { class: 'steps', style: { '--n': Math.max(len, 4) } }, cells[d]));
    });
    ui.refresh = () => {
      for (const d of rows) {
        let tail = 0;
        for (let i = 0; i < len; i++) {
          const st = tr.seq[i], on = st && st.d === d;
          if (on) tail = st.l;
          cells[d][i].dataset.v = on ? 3 : tail > 0 ? 1 : 0;
          cells[d][i].classList.toggle('tail', !on && tail > 0);
          tail--;
        }
      }
    };
    let cur = -1;
    ui.playhead = (s) => {
      const i = s < 0 ? -1 : s % len;
      if (i === cur) return;
      for (const d of rows) { if (cur >= 0 && cells[d][cur]) cells[d][cur].classList.remove('cur'); if (i >= 0) cells[d][i].classList.add('cur'); }
      cur = i;
    };
    const regen = () => { regenerate(P, tr); ui.refresh(); app.changed(); };
    body.replaceChildren(
      h('div', { class: 'row' },
        field('Preset', presetSelect(tr.preset, (v) => { applySynthPreset(P, tr, v); app.refreshParams(p); draw(); app.changed(); })),
        sel(app, p + '.engine', { onchange: draw }),
        ...ENGINES[engine].map((d) => (d.kind === 'num' ? knob(app, `${p}.${engine}.${d.key}`) : sel(app, `${p}.${engine}.${d.key}`)))),
      h('div', { class: 'row seq' },
        sel(app, p + '.role', { onchange: () => { regenerate(P, tr); draw(); } }),
        role !== 'pad' && sel(app, p + '.len', { onchange: draw }),
        sel(app, p + '.oct'), chordal && sel(app, p + '.voicing'),
        sel(app, p + '.evoBars'), knob(app, p + '.evo'),
        role !== 'pad' && [knob(app, p + '.density'), knob(app, p + '.prob')],
        knob(app, p + '.gate'), knob(app, p + '.human'),
        role !== 'pad' && btn('Regenerate', regen, { title: 'New pattern from the density setting' }),
        btn('Mutate now', () => { mutateSeq(tr.seq, role, g('len'), g('density'), Math.max(0.4, g('evo')), Math.random); ui.refresh(); app.changed(); }),
        role !== 'pad' && btn('Clear', () => { tr.seq.fill(null); ui.refresh(); app.changed(); }),
        h('span', { class: 'hint' }, role === 'pad' ? 'Holds every chord; rows pick the inversion' : 'Click: note on/off · shift-click: note length')),
      h('div', { class: 'grid' }, grid));
    ui.refresh();
  };
  draw();
}

// ---------------- granular ----------------
function granBody(app, tr, ui, body) {
  const P = app.project, p = 't' + tr.id;
  const wave = h('canvas', { class: 'wave' }), over = h('canvas', { class: 'wave over' });
  const name = h('span', { class: 'hint' });
  const entry = () => (P.params[p + '.src'] === 'sample' && app.store.get(tr.sample)) || getTexture(P.params[p + '.src']);
  const redraw = () => { const e = entry(); drawWave(wave, e.buffer, 0, e.buffer.duration, css('--gran')); name.textContent = `${e.name} · ${e.buffer.duration.toFixed(1)} s — drag on the waveform to move the grain position, or drop an audio file`; };
  const load = async (f) => { const id = await app.loadSample(f); if (id) { tr.sample = id; app.setParam(p + '.src', 'sample'); redraw(); } };
  const box = h('div', { class: 'wavebox' }, wave, over);
  const seek = (e) => { const r = box.getBoundingClientRect(); app.setParam(p + '.pos', clamp((e.clientX - r.left) / r.width)); };
  box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); seek(e); box.onpointermove = seek; });
  box.addEventListener('pointerup', () => { box.onpointermove = null; });
  dropZone(body, load);
  ui.refresh = redraw;
  ui.tick = (engine) => {
    if (!tr.open) return;
    const w = over.clientWidth, ht = over.clientHeight, dpr = window.devicePixelRatio || 1;
    if (over.width !== Math.round(w * dpr)) { over.width = Math.round(w * dpr); over.height = Math.round(ht * dpr); }
    const c = over.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, ht);
    const a = engine && engine.tr.get(tr.id), pos = engine ? engine.v(p + '.pos') : P.params[p + '.pos'], spray = P.params[p + '.spray'];
    const center = (((pos + (a ? a.rt.drift : 0)) % 1) + 1) % 1;
    c.fillStyle = 'rgba(255,255,255,.09)'; c.fillRect((center - spray / 2) * w, 0, spray * w, ht);
    c.fillStyle = css('--accent'); c.fillRect(center * w - 1, 0, 2, ht);
    if (a && engine.playing) {
      const now = engine.ctx.currentTime;
      for (const [gp, t] of a.rt.recent) { const age = now - t; if (age < 0 || age > 0.6) continue; c.globalAlpha = 1 - age / 0.6; c.beginPath(); c.arc(gp * w, ht * (0.25 + 0.5 * ((gp * 97) % 1)), 3, 0, 7); c.fill(); }
      c.globalAlpha = 1;
    }
  };
  const k = (key) => knob(app, `${p}.${key}`);
  body.append(
    h('div', { class: 'row' }, sel(app, p + '.src', { onchange: redraw }), btn('Load file…', () => filePicker(load)), name),
    box,
    h('div', { class: 'row' },
      h('div', { class: 'group' }, h('b', null, 'Grains'), k('pos'), k('scan'), k('spray'), k('size'), k('density'), k('jitter'), sel(app, p + '.window')),
      h('div', { class: 'group' }, h('b', null, 'Pitch'), k('pitch'), sel(app, p + '.pmode'), k('range'), k('fine'), k('reverse')),
      h('div', { class: 'group' }, h('b', null, 'Tone'), k('hp'), k('cutoff'), k('res'), k('spread'), k('level')),
      h('div', { class: 'group' }, h('b', null, 'Evolve'), sel(app, p + '.evoBars'), k('evo'))));
  requestAnimationFrame(redraw);
}

// ---------------- audio track with clip editing ----------------
function audioBody(app, tr, ui, body) {
  const P = app.project, p = 't' + tr.id;
  let selId = null, cursor = 0;
  const lane = h('div', { class: 'clips' }), tools = h('div', { class: 'row' });
  const spb = () => 60 / P.params['g.bpm'], beats = () => P.params[p + '.loopBars'] * 4;
  const rateOf = (c) => c.rate * Math.pow(2, c.pitch / 12), lenOf = (c) => c.dur / rateOf(c) / spb();
  const snap = (b, e) => (e && e.shiftKey ? b : Math.round(b * 4) / 4);
  const selected = () => tr.clips.find((c) => c.id === selId);
  const commit = () => { app.changed(); draw(); };

  const addClip = async (file, e) => {
    const id = await app.loadSample(file);
    if (!id) return;
    const buf = app.store.get(id).buffer, r = lane.getBoundingClientRect();
    const start = e && r.width ? clamp(snap(((e.clientX - r.left) / r.width) * beats()), 0, beats() - 0.25) : 0;
    const clip = { id: P.nextId++, sample: id, start, off: 0, dur: buf.duration, rate: 1, pitch: 0, gain: 1, fi: 0, fo: 0.01, rev: false };
    if (!tr.clips.length) { // first clip: grow the loop so it fits
      let bars = 1;
      while (bars < 64 && bars * 4 < start + lenOf(clip) - 0.01) bars *= 2;
      if (bars > P.params[p + '.loopBars']) app.setParam(p + '.loopBars', bars);
      if (tr.name === 'Audio') tr.name = file.name.replace(/\.\w+$/, '').slice(0, 28);
    }
    tr.clips.push(clip); selId = clip.id; app.changed(); app.renderTracks();
  };
  ui.addFile = addClip;
  dropZone(body, addClip);

  const draw = () => {
    const total = beats(), els = [];
    lane.style.setProperty('--bars', total / 4);
    for (const c of tr.clips) {
      const entry = app.store.get(c.sample), cv = h('canvas');
      const el = h('div', { class: 'clip' + (c.id === selId ? ' sel' : '') + (entry ? '' : ' missing'), style: { left: (c.start / total) * 100 + '%', width: (lenOf(c) / total) * 100 + '%' } },
        cv, h('span', null, entry ? entry.name : 'missing — drop the file again'));
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        const r = el.getBoundingClientRect(), lw = lane.getBoundingClientRect().width, x0 = e.clientX, o = { ...c }, len0 = lenOf(c);
        const mode = e.clientX - r.left < 8 ? 'l' : r.right - e.clientX < 8 ? 'r' : 'm';
        const max = entry ? entry.buffer.duration : c.off + c.dur, k = spb() * rateOf(c); // buffer seconds per beat
        selId = c.id; cursor = snap(c.start + ((e.clientX - r.left) / r.width) * len0, e);
        el.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const db = ((ev.clientX - x0) / lw) * total;
          if (mode === 'm') c.start = clamp(snap(o.start + db, ev), 0, total - 0.25);
          else if (mode === 'r') c.dur = clamp(snap(len0 + db, ev) * k, 0.02, max - c.off);
          else { const d = clamp(snap(db, ev), Math.max(-o.off / k, -o.start), len0 - 0.125); c.start = o.start + d; c.off = o.off + d * k; c.dur = o.dur - d * k; }
          el.style.left = (c.start / total) * 100 + '%'; el.style.width = (lenOf(c) / total) * 100 + '%';
        };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); commit(); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
      });
      els.push(el);
      if (entry) requestAnimationFrame(() => drawWave(cv, entry.buffer, c.rev ? entry.buffer.duration - c.off - c.dur : c.off, c.rev ? entry.buffer.duration - c.off : c.off + c.dur, css('--audio'), c.rev));
    }
    ui.ph = h('div', { class: 'ph' });
    lane.replaceChildren(...els, h('div', { class: 'cursor', style: { left: (cursor / total) * 100 + '%' } }), ui.ph,
      !tr.clips.length && h('div', { class: 'empty' }, 'Drop audio files here (WAV, MP3, AIFF, OGG, FLAC…)'));
    drawTools();
  };
  lane.addEventListener('pointerdown', (e) => { const r = lane.getBoundingClientRect(); cursor = clamp(snap(((e.clientX - r.left) / r.width) * beats(), e), 0, beats()); selId = null; draw(); });

  const slider = (label, key, min, max, step) => {
    const c = selected(), out = h('output', null, String(c[key]));
    return field(label, h('span', { class: 'slide' }, h('input', { type: 'range', min, max, step, value: c[key], oninput: (e) => { c[key] = +e.target.value; out.textContent = e.target.value; }, onchange: commit }), out));
  };
  const drawTools = () => {
    const c = selected();
    tools.replaceChildren(
      sel(app, p + '.loopBars', { onchange: draw }),
      btn('Add file…', () => filePicker(addClip)),
      ...(c ? [
        btn('Split', () => {
          const at = cursor > c.start && cursor < c.start + lenOf(c) ? cursor : c.start + lenOf(c) / 2, cut = (at - c.start) * spb() * rateOf(c);
          tr.clips.push({ ...c, id: P.nextId++, start: at, off: c.off + cut, dur: c.dur - cut, fi: 0 });
          c.dur = cut; commit();
        }, { title: 'Split the selected clip at the cursor (click in the lane to place it)' }),
        btn('Duplicate', () => { const n = { ...c, id: P.nextId++, start: Math.min(beats() - 0.25, c.start + lenOf(c)) }; tr.clips.push(n); selId = n.id; commit(); }),
        btn('Reverse', () => { c.rev = !c.rev; commit(); }, { class: c.rev ? 'on' : '' }),
        btn('Delete', () => { tr.clips = tr.clips.filter((x) => x !== c); selId = null; commit(); }),
        field('Fit to', plainSelect(['—', '1 beat', '2 beats', '1 bar', '2 bars', '4 bars', '8 bars'], '—', (v) => {
          const b = { '1 beat': 1, '2 beats': 2, '1 bar': 4, '2 bars': 8, '4 bars': 16, '8 bars': 32 }[v];
          if (b) { c.pitch = 0; c.rate = clamp(c.dur / (b * spb()), 0.1, 8); commit(); }
        }, 'Change playback speed so the clip lasts exactly this long at the current tempo')),
        slider('Gain', 'gain', 0, 2, 0.01), slider('Pitch (st)', 'pitch', -24, 24, 1), slider('Fade in (s)', 'fi', 0, 4, 0.01), slider('Fade out (s)', 'fo', 0, 4, 0.01),
      ] : [h('span', { class: 'hint' }, tr.clips.length ? 'Select a clip to edit it: drag to move, drag its edges to trim (shift = no snap).' : 'The lane loops in time with the song.')]));
  };
  ui.refresh = draw;
  ui.playhead = (s) => { if (ui.ph) { const n = beats() * 4; ui.ph.style.display = s < 0 ? 'none' : 'block'; ui.ph.style.left = (((s % n) + 0) / n) * 100 + '%'; } };
  body.append(tools, lane);
  draw();
}
