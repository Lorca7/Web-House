#!/usr/bin/env node
// Headless "cloud" render: runs the real app in headless Chromium and writes a WAV file.
//   node tools/render.mjs --minutes 10 --template "Ambient House — Chill Out Room" --out take.wav
//   node tools/render.mjs --minutes 20 --session my-session.json --bits 24
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { serve } from './serve.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map((a) => { const i = a.indexOf(' '); return i < 0 ? [a, true] : [a.slice(0, i), a.slice(i + 1).trim()]; }));
const minutes = Math.min(60, +args.minutes || 5), out = args.out || 'web-house.wav', port = 8700 + Math.floor(Math.random() * 200);
const { chromium } = createRequire(import.meta.url)('playwright');

const server = await serve(port);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('dialog', (d) => { console.error('dialog:', d.message()); d.accept(); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.webhouse);
  const templates = await page.evaluate(() => window.webhouse.templates);
  if (args.template && !templates.includes(args.template)) throw new Error(`Unknown template. Choose one of:\n  ${templates.join('\n  ')}`);
  const session = args.session ? await readFile(args.session, 'utf8') : null;
  console.log(`Rendering ${minutes} min of ${session ? args.session : args.template || templates[0]} …`);
  const download = page.waitForEvent('download', { timeout: 0 });
  const timer = setInterval(async () => { try { process.stdout.write(`\r${Math.round((await page.evaluate(() => window.webhouse.progress || 0)) * 100)}% `); } catch { /* page busy */ } }, 2000);
  const job = page.evaluate((o) => window.webhouse.render(o), { session, template: session ? null : args.template || templates[0], seconds: minutes * 60, bits: +args.bits || 16 });
  await (await download).saveAs(out);
  const bytes = await job;
  clearInterval(timer);
  console.log(`\rWrote ${out} (${(bytes / 1048576).toFixed(1)} MB)`);
} finally {
  await browser.close(); server.close();
}
