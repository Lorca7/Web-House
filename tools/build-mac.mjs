#!/usr/bin/env node
// Builds the stand-alone macOS app into dist/:  npm install && npm run build:mac
// Produces "Web House.app" for Apple Silicon (arm64) and Intel (x64). On a Mac the apps are ad-hoc signed.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { packager } = createRequire(import.meta.url)('@electron/packager');
const arch = process.argv[2] ? [process.argv[2]] : ['arm64', 'x64'];

const out = await packager({
  dir: root, out: join(root, 'dist'), name: 'Web House', platform: 'darwin', arch, overwrite: true, asar: false, prune: true,
  appBundleId: 'house.web.studio', appCategoryType: 'public.app-category.music',
  ignore: [/^\/(dist|tools|\.github|node_modules|README\.md|\.gitignore|package-lock\.json)($|\/)/],
});
for (const dir of out) {
  if (process.platform === 'darwin') execFileSync('codesign', ['--force', '--deep', '--sign', '-', join(dir, 'Web House.app')], { stdio: 'inherit' });
  console.log('Built', join(dir, 'Web House.app'));
}
