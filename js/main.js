// Web House — application shell: state, transport, recording, persistence, top-level rendering.
import { DEFS, h, unregister } from './core.js';
import { NOTE_NAMES, SCALES, PROGS, SYNTH_PRESETS, degToSemi } from './defs.js';
import { Engine } from './engine.js';
import { newProject, rebuildDefs, addTrack, TEMPLATES } from './project.js';
import { LiveRecorder, renderOffline, canRenderOffline, encodeWav } from './recorder.js';
import { knob, sel, btn, field, isFileDrag } from './ui.js';
import { renderTrack } from './tracks.js';
import { renderFx, renderLfos, assignLfo } from './side.js';

const SAVE_KEY = 'webhouse.project.v1';
const $ = (id) => document.getElementById(id);

const app = {
  project: null, engine: null, ctx: null, store: new Map(), ctrls: new Map(), trackUI: new Map(),
  armedLfo: null, dragLfo: null, busy: null, takes: [],

  setParam(id, v) {
    this.project.params[id] = v;
    if (this.engine) this.engine.touch(id);
    this.refreshParams(id);
    this.changed();
  },
  refreshParams(prefix) {
    for (const [id, set] of this.ctrls) {
      if (id !== prefix && !id.startsWith(prefix + '.')) continue;
      for (const c of set) { if (c.el.isConnected) c.update(); else set.delete(c); }
    }
  },
  isMapped(id) { return this.project.lfos.some((l) => l.targets.some((t) => t.id === id)) || !!(this.engine && this.engine.xy[id]); },
  assignLfo(i, id) { assignLfo(this, i, id); },
  changed() { clearTimeout(this.saveT); this.saveT = setTimeout(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.project)); } catch { /* storage full or blocked */ } }, 800); },
  mixChanged() { if (this.engine) this.engine.updateMix(); this.changed(); },

  async ensureAudio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.makeEngine();
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),25)'], { type: 'application/javascript' })));
      w.onmessage = () => { const e = this.engine, now = this.ctx.currentTime; e.control(now); e.advance(now + (document.hidden ? 1.2 : 0.2)); };
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  },
  makeEngine() {
    if (this.engine) this.engine.destroy();
    this.engine = new Engine(this.ctx, this.project, this.store, {
      onChange: (kind, id) => {
        if (kind === 'track') { const ui = this.trackUI.get(id); if (ui) ui.refresh(); }
        else if (kind === 'param') this.refreshParams(id);
        else if (kind === 'harmony') this.showProg();
        this.changed();
      },
    });
  },
  setProject(P) {
    if (this.busy) return;
    rebuildDefs(P);
    this.project = P; this.ctrls.clear();
    if (this.ctx) this.makeEngine();
    renderTop(); this.renderTracks(); this.renderSide(); setPlayUI(); this.changed();
  },

  async toggle() {
    if (this.busy) return;
    await this.ensureAudio();
    if (this.engine.playing) this.engine.stop(); else this.engine.start();
    setPlayUI();
  },
  async audition(tr, lane) { await this.ensureAudio(); this.engine.hit(tr, this.engine.tr.get(tr.id), lane, this.ctx.currentTime + 0.01, 0.8); },

  addTrack(type, o) {
    const tr = addTrack(this.project, type, o);
    if (this.engine) this.engine.addTrack(tr);
    this.renderTracks(); this.changed();
    const ui = this.trackUI.get(tr.id);
    ui.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return tr;
  },
  removeTrack(tr) {
    if (this.engine) this.engine.removeTrack(tr.id);
    this.project.tracks = this.project.tracks.filter((t) => t !== tr);
    unregister(this.project, 't' + tr.id);
    this.renderTracks(); this.renderSide(); this.changed();
  },
  dupTrack(tr) {
    const P = this.project, n = structuredClone(tr), from = `t${tr.id}.`;
    n.id = P.nextId++; n.name = tr.name + ' copy';
    if (n.clips) for (const c of n.clips) c.id = P.nextId++;
    for (const id of Object.keys(P.params)) if (id.startsWith(from)) P.params[`t${n.id}.` + id.slice(from.length)] = P.params[id];
    P.tracks.splice(P.tracks.indexOf(tr) + 1, 0, n);
    rebuildDefs(P);
    if (this.engine) this.engine.addTrack(n);
    this.renderTracks(); this.changed();
  },

  async loadSample(file) {
    try {
      const buffer = await decode(await file.arrayBuffer());
      const id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      this.store.set(id, { name: file.name.replace(/\.\w+$/, ''), buffer });
      return id;
    } catch { alert(`Could not read "${file.name}" as audio.`); return null; }
  },

  renderTracks() {
    this.trackUI.clear();
    const P = this.project;
    const preset = h('select', { title: 'Add a synth track', onchange: () => { if (preset.value) this.addTrack('synth', { preset: preset.value }); preset.selectedIndex = 0; } },
      h('option', { value: '' }, '+ Synth…'), Object.keys(SYNTH_PRESETS).map((k) => h('option', { value: k }, `${k} (${SYNTH_PRESETS[k].engine})`)));
    $('tracks').replaceChildren(
      ...P.tracks.map((tr) => renderTrack(this, tr)),
      h('div', { class: 'add' },
        btn('+ Drum machine', () => this.addTrack('drum')), preset,
        btn('+ Granular', () => this.addTrack('gran')), btn('+ Audio track', () => this.addTrack('audio')),
        h('span', { class: 'hint' }, 'or drop audio files anywhere on this column to create audio tracks')));
  },
  renderSide() { renderFx(this, $('fx')); renderLfos(this, $('lfos')); },
  showProg() { const i = $('prog'); if (i) i.value = this.project.harmony.prog.map((d) => d + 1).join(' '); },
};

const decodeCtx = () => new OfflineAudioContext(2, 1, 44100);
const decode = (ab) => decodeCtx().decodeAudioData(ab);

// ---------------- top bar ----------------
function setPlayUI() {
  const on = !!(app.engine && app.engine.playing), b = $('play');
  if (b) { b.textContent = on ? '■ Stop' : '▶ Play'; b.classList.toggle('on', on); }
}

function renderTop() {
  const P = app.project, R = P.rec;
  const progSel = h('select', { title: 'Chord progression preset', onchange: () => { const pr = PROGS[progSel.selectedIndex - 1]; if (pr) { P.harmony = { prog: pr[1].slice(), base: pr[1].slice() }; app.showProg(); app.changed(); } } },
    h('option', null, 'Progression…'), PROGS.map(([n]) => h('option', null, n)));
  const prog = h('input', { id: 'prog', class: 'prog', title: 'Chord roots as scale degrees (1–7), separated by spaces', onchange: () => {
    const list = prog.value.split(/[\s,]+/).map((x) => parseInt(x, 10) - 1).filter((x) => x >= 0 && x < 7);
    P.harmony = list.length ? { prog: list, base: list.slice() } : P.harmony; app.showProg(); app.changed();
  } });
  const tmpl = h('select', { title: 'Start a new session from a template', onchange: () => {
    if (tmpl.value && confirm('Replace the current session with a new one from this template?')) { if (app.engine) app.engine.stop(); app.setProject(newProject(tmpl.value)); }
    tmpl.selectedIndex = 0;
  } }, h('option', { value: '' }, 'New session…'), Object.keys(TEMPLATES).map((k) => h('option', null, k)));
  const k = (id, o) => knob(app, id, o);

  $('top').replaceChildren(
    h('div', { class: 'bar' },
      h('h1', null, 'Web House'),
      h('button', { id: 'play', class: 'btn play', onclick: () => app.toggle(), title: 'Space bar' }, '▶ Play'),
      h('div', { id: 'status', class: 'status' }, 'stopped'),
      h('div', { class: 'group' }, k('g.bpm'), k('g.swing'), k('g.pump'), k('g.spaceSize'), k('g.spaceTone'), k('g.vol')),
      h('canvas', { id: 'meter', width: 120, height: 10, title: 'Output level' }),
      h('div', { class: 'group' }, sel(app, 'g.root'), sel(app, 'g.scale'), sel(app, 'g.bpc'), field('Chords', h('span', { class: 'inline' }, progSel, prog)), k('g.hevo')),
      h('div', { class: 'group end' }, tmpl, btn('Save file', exportProject, { title: 'Download the session (including loaded samples) as a .json file' }),
        btn('Open file', () => { const i = h('input', { type: 'file', accept: '.json,application/json', onchange: () => i.files[0] && i.files[0].text().then(importProject) }); i.click(); }))),
    h('div', { class: 'bar rec' },
      h('b', null, 'Record'),
      field('Length (min)', h('input', { type: 'number', min: 0.25, max: 180, step: 0.25, value: R.minutes, onchange: (e) => { R.minutes = Math.min(180, Math.max(0.1, +e.target.value || 10)); e.target.value = R.minutes; app.changed(); } })),
      field('Format', h('select', { onchange: (e) => { R.bits = +e.target.value; app.changed(); } }, [16, 24].map((b) => h('option', { value: b, selected: R.bits === b }, `WAV ${b}-bit`)))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: R.auto, onchange: (e) => { R.auto = e.target.checked; app.changed(); } }), 'Download automatically when finished'),
      h('button', { id: 'recLive', class: 'btn rec', onclick: recordLive, title: 'Restart the song and record it in real time for the chosen length. You can keep tweaking while it records; the tab may be in the background.' }, '● Record live'),
      h('button', { id: 'recFast', class: 'btn', onclick: recordFast, title: 'Render the chosen length as fast as your computer can, without listening' }, '⚡ Fast render'),
      h('button', { id: 'recStop', class: 'btn', hidden: true, onclick: () => app.rec && app.rec.stop() }, 'Finish now'),
      h('progress', { id: 'recBar', max: 1, value: 0, hidden: true }), h('span', { id: 'recMsg', class: 'hint' }),
      h('div', { id: 'takes', class: 'takes' })));
  app.showProg(); renderTakes();
}

// ---------------- recording ----------------
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function recUI(active, live) {
  app.busy = active ? (live ? 'live' : 'fast') : null;
  $('recLive').disabled = $('recFast').disabled = active;
  $('recStop').hidden = !(active && live); $('recBar').hidden = !active;
  if (!active) $('recBar').value = 0;
}
function deliver(blob, kind) {
  const P = app.project, stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const name = `web-house-${P.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${stamp}.wav`;
  const take = { name, url: URL.createObjectURL(blob), mb: (blob.size / 1048576).toFixed(1), kind };
  app.takes.unshift(take); renderTakes();
  if (P.rec.auto) h('a', { href: take.url, download: name }).click();
  $('recMsg').textContent = `Done — ${name} (${take.mb} MB)`;
  document.title = '✓ Recording ready — Web House';
  return take;
}
function renderTakes() {
  $('takes').replaceChildren(...app.takes.map((t) => h('a', { class: 'take', href: t.url, download: t.name, title: 'Download WAV' }, `⬇ ${t.name} · ${t.mb} MB`)));
}
async function recordLive() {
  if (app.busy) return;
  const R = app.project.rec, secs = R.minutes * 60;
  await app.ensureAudio();
  app.engine.stop();
  const eng = app.engine, rec = await LiveRecorder.create(app.ctx, eng.out);
  app.rec = rec; recUI(true, true);
  let lock = null;
  try { lock = await navigator.wakeLock.request('screen'); } catch { /* optional */ }
  eng.start(); setPlayUI();
  const blob = await rec.start(secs, R.bits, (f) => { $('recBar').value = f; $('recMsg').textContent = `Recording ${clock(f * secs)} / ${clock(secs)} — keep this tab open`; });
  eng.stop(); setPlayUI();
  try { rec.src.disconnect(rec.node); } catch { /* engine was replaced */ }
  if (lock) lock.release();
  app.rec = null; recUI(false);
  deliver(blob, 'live');
}
async function recordFast() {
  if (app.busy) return;
  const R = app.project.rec;
  if (!canRenderOffline()) return alert('Fast render needs a browser with OfflineAudioContext.suspend (Chrome, Edge or Safari). Use "Record live" instead.');
  if (R.minutes > 30 && !confirm('Fast renders hold the whole take in memory; over 30 minutes may fail on some machines. "Record live" has no such limit. Continue?')) return;
  recUI(true, false);
  const t0 = performance.now();
  try {
    const blob = await renderOffline(app.project, app.store, R.minutes * 60, R.bits, (f) => { $('recBar').value = f; $('recMsg').textContent = `Rendering… ${Math.round(f * 100)}%`; });
    recUI(false);
    deliver(blob, 'fast');
    $('recMsg').textContent += ` in ${((performance.now() - t0) / 1000).toFixed(0)} s`;
  } catch (e) { recUI(false); $('recMsg').textContent = 'Render failed: ' + e.message; }
}

// ---------------- persistence ----------------
const toDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
function usedSamples(P) {
  const ids = new Set();
  for (const t of P.tracks) { for (const k in t.samples || {}) ids.add(t.samples[k]); if (t.sample) ids.add(t.sample); for (const c of t.clips || []) ids.add(c.sample); }
  return [...ids].filter((id) => app.store.has(id));
}
async function exportProject() {
  const samples = {};
  for (const id of usedSamples(app.project)) { const e = app.store.get(id); samples[id] = { name: e.name, wav: await toDataURL(encodeWav(e.buffer, 16)) }; }
  const blob = new Blob([JSON.stringify({ app: 'web-house', project: app.project, samples })], { type: 'application/json' });
  h('a', { href: URL.createObjectURL(blob), download: 'web-house-session.json' }).click();
}
async function importProject(text) {
  try {
    const data = JSON.parse(text), P = data.project || data;
    if (!P.params || !P.tracks) throw new Error('not a Web House session');
    for (const id in data.samples || {}) {
      const s = data.samples[id];
      app.store.set(id, { name: s.name, buffer: await decode(await (await fetch(s.wav)).arrayBuffer()) });
    }
    if (app.engine) app.engine.stop();
    app.setProject(P);
    return true;
  } catch (e) { alert('Could not open session: ' + e.message); return false; }
}

// ---------------- animation loop ----------------
let shown = new Set();
function frame() {
  requestAnimationFrame(frame);
  const eng = app.engine, P = app.project;
  const s = eng && eng.playing ? eng.pos() : -1;
  for (const tr of P.tracks) {
    const ui = app.trackUI.get(tr.id);
    if (!ui) continue;
    ui.playhead(s); ui.tick(eng);
    ui.rest(!!(eng && eng.playing && eng.tr.get(tr.id) && eng.tr.get(tr.id).rt.resting));
  }
  const ids = new Set(eng ? [...Object.keys(eng.mods), ...Object.keys(eng.xy)] : []);
  for (const id of ids) { const set = app.ctrls.get(id); if (set) for (const c of set) c.showEff(eng.eff[id]); }
  for (const id of shown) if (!ids.has(id)) { const set = app.ctrls.get(id); if (set) for (const c of set) c.showEff(null); }
  shown = ids;
  if (app.xyTick) app.xyTick(eng);
  if (app.lfoTick) app.lfoTick();
  const st = $('status'), m = $('meter');
  if (eng && eng.playing && s >= 0) {
    const scale = SCALES[P.params['g.scale']], root = degToSemi(scale, eng.chord);
    const minor = degToSemi(scale, eng.chord + 2) - root === 3;
    st.textContent = `bar ${Math.floor(s / 16) + 1}.${Math.floor((s % 16) / 4) + 1} · ${NOTE_NAMES[(P.params['g.root'] + root) % 12]}${minor ? 'm' : ''}`;
  } else st.textContent = app.busy === 'fast' ? 'rendering' : 'stopped';
  if (eng && m) {
    const buf = frame.buf || (frame.buf = new Float32Array(1024));
    eng.an.getFloatTimeDomainData(buf);
    let pk = 0;
    for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
    const c = m.getContext('2d'), cs = getComputedStyle(m);
    c.clearRect(0, 0, 120, 10); c.fillStyle = pk > 0.98 ? cs.caretColor : cs.color; c.fillRect(0, 0, Math.min(1, pk) * 120, 10);
  }
}

// ---------------- boot ----------------
function boot() {
  let P = null;
  try { P = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* ignore */ }
  if (!P || !P.params || !P.tracks) P = newProject();
  app.setProject(P);

  // Dropping audio outside a specific target creates a new audio track.
  window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    for (const f of e.dataTransfer.files) { const tr = app.addTrack('audio'); await app.trackUI.get(tr.id).addFile(f); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) { e.preventDefault(); app.toggle(); }
    if (e.code === 'Escape' && app.armedLfo != null) { app.armedLfo = null; document.body.classList.remove('lfo-drag'); app.renderSide(); }
  });
  requestAnimationFrame(frame);
}

// Scripting hook used by tools/render.mjs (headless cloud render) — also handy from the console.
window.webhouse = {
  app, templates: Object.keys(TEMPLATES),
  async render({ template, session, seconds = 60, bits = 16 } = {}) {
    if (session) { if (!(await importProject(session))) throw new Error('bad session'); }
    else if (template) app.setProject(newProject(template));
    const blob = await renderOffline(app.project, app.store, seconds, bits, (f) => { window.webhouse.progress = f; });
    h('a', { href: URL.createObjectURL(blob), download: 'web-house.wav' }).click();
    return blob.size;
  },
};

boot();
