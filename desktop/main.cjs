// Desktop shell (Electron): runs Web House as a stand-alone app, keeps the computer awake while
// recording and streams takes straight to disk.
//
// Unattended use from Terminal:
//   open -a "Web House" --args --record 120 --quit
//   open -a "Web House" --args --record 60 --session ~/Desktop/my-session.json --out ~/Desktop --quit
// Options: --record <minutes>  --fast (offline render instead of real time)  --bits 16|24
//          --session <file.json> | --template "<name>"  --out <folder>  --quit (quit when finished)
const { app, BrowserWindow, protocol, net, ipcMain, powerSaveBlocker, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const ALLOWED = /^\/(index\.html|js\/[\w.-]+\.js|css\/[\w.-]+\.css)$/;

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(record|bits|session|template|out)(?:=(.*))?$/.exec(argv[i]);
    if (m) o[m[1]] = m[2] !== undefined ? m[2] : argv[++i];
    else if (argv[i] === '--fast' || argv[i] === '--quit') o[argv[i].slice(2)] = true;
  }
  return o;
}
const args = parseArgs(process.argv.slice(1));
const expand = (p) => path.resolve(p.replace(/^~(?=$|\/)/, app.getPath('home')));

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const settings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
const outDir = () => (args.out ? expand(args.out) : settings().outDir || path.join(app.getPath('music'), 'Web House'));

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const files = new Map(); // id -> { fd, file }
let blocker = null, nextId = 1, win = null;

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/') p = '/index.html';
    if (!ALLOWED.test(p)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(ROOT, p)).toString());
  });

  ipcMain.handle('config', () => {
    const cfg = { outDir: outDir(), record: +args.record || 0, fast: !!args.fast, quit: !!args.quit, bits: +args.bits || 0, template: args.template || null, session: null, error: null };
    if (args.session) { try { cfg.session = fs.readFileSync(expand(args.session), 'utf8'); } catch (e) { cfg.error = `Could not read session file: ${e.message}`; } }
    return cfg;
  });
  ipcMain.handle('begin', (_e, name) => {
    const dir = outDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(name)), id = nextId++;
    files.set(id, { fd: fs.openSync(file, 'w'), file });
    return { id, file };
  });
  ipcMain.on('chunk', (_e, id, data) => { const f = files.get(id); if (f) fs.writeSync(f.fd, Buffer.from(data)); });
  ipcMain.handle('end', (_e, id, header) => {
    const f = files.get(id);
    if (!f) return null;
    if (header) fs.writeSync(f.fd, Buffer.from(header), 0, header.byteLength, 0); // final WAV header with the real length
    fs.closeSync(f.fd); files.delete(id);
    return f.file;
  });
  ipcMain.handle('power', (_e, on) => {
    if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  });
  ipcMain.handle('reveal', (_e, file) => shell.showItemInFolder(file));
  ipcMain.handle('chooseFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: outDir() });
    if (r.canceled || !r.filePaths[0]) return outDir();
    delete args.out;
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...settings(), outDir: r.filePaths[0] }));
    return r.filePaths[0];
  });
  ipcMain.handle('quit', () => app.quit());

  win = new BrowserWindow({
    width: 1500, height: 980, minWidth: 420, minHeight: 500, backgroundColor: '#14110f', title: 'Web House',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadURL('app://webhouse/');
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { for (const f of files.values()) { try { fs.closeSync(f.fd); } catch { /* already closed */ } } });
