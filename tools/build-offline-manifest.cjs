#!/usr/bin/env node
'use strict';

// Run only after the release HTML/CSS/JS, application manifest and icons are final.
// Usage: node work/build-offline-manifest.cjs [mobile-offline-directory] [--verify]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const targetRoot = path.resolve(args.find((arg) => !arg.startsWith('--')) || path.join(__dirname, '..', 'mobile-offline'));
const manifestPath = path.join(targetRoot, 'offline-manifest.json');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const rootRuntimeExtension = /\.(?:html|css|js|json|webmanifest)$/i;
const exclusions = new Set(['sw.js', 'offline-manifest.json', '_headers', '_redirects']);

function enumerate(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const url = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Release must not include symlinks: ${url}`);
    if (entry.isDirectory()) {
      if (prefix || entry.name === 'assets' || entry.name === 'icons') files.push(...enumerate(path.join(directory, entry.name), url));
    } else if (entry.isFile() && !exclusions.has(url) && (prefix || rootRuntimeExtension.test(entry.name))) {
      if (/[/\\](?:\.\.|\.)[/\\]/.test(url) || url.includes('\\')) throw new Error(`Unsafe release URL: ${url}`);
      const content = fs.readFileSync(path.join(directory, entry.name));
      files.push({ url, bytes: content.length, sha256: sha256(content) });
    }
  }
  return files;
}

const files = enumerate(targetRoot).sort((left, right) => left.url < right.url ? -1 : left.url > right.url ? 1 : 0);
for (const required of ['index.html', 'styles.css', 'app.js', 'audio.js', 'data.js', 'mystery-data.js', 'scene-audio.js']) {
  if (!files.some((file) => file.url === required)) throw new Error(`Missing release runtime: ${required}`);
}
if (!files.some((file) => /(?:\.webmanifest|^manifest\.json)$/.test(file.url))) throw new Error('The application manifest is not ready. Finish the release before generating offline-manifest.json.');
const manifest = {
  version: sha256(Buffer.from(JSON.stringify(files), 'utf8')),
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
};
if (args.includes('--verify')) {
  const saved = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (JSON.stringify(saved) !== JSON.stringify(manifest)) throw new Error('The saved offline manifest does not match the current release. Rebuild it after finishing edits.');
  console.log(`Verified offline manifest ${saved.version}: ${saved.files.length} files, ${saved.totalBytes} bytes.`);
} else {
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ path: manifestPath, version: manifest.version, files: manifest.files.length, totalBytes: manifest.totalBytes }, null, 2));
}
