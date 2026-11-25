#!/usr/bin/env node
/**
 * Indexes legacy index.html into machine-readable reports under docs/index/.
 * Read-only over legacy/. Deterministic output.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const src = path.join(root, 'legacy', 'app', 'src', 'main', 'assets', 'index.html');
const outDir = path.join(root, 'docs', 'index');
fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(src, 'utf8');
const lines = raw.split(/\r?\n/);

const lineCount = lines.length;
const results = {
  meta: { file: 'legacy/app/src/main/assets/index.html', lines: lineCount, bytes: Buffer.byteLength(raw) },
  functions: [],
  storageKeys: [],
  storageDynamicPrefixes: [],
  hosts: [],
  domIds: [],
  nativeCalls: [],
  cssVars: [],
  globals: [],
  sections: [],
  network: [],
};

const seen = (set, value) => {
  if (!value || set.has(value)) return false;
  set.add(value);
  return true;
};

// ---- functions with line ranges -------------------------------------------
const fnSeen = new Set();
const fnPatterns = [
  /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
  /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\()/,
  /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/,
  /^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/,
];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (const re of fnPatterns) {
    const m = l.match(re);
    if (!m) continue;
    const name = m[1];
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'Promise'].includes(name)) continue;
    if (!seen(fnSeen, name)) results.functions.push({ name, line: i + 1 });
    break;
  }
}

// ---- localStorage keys ----------------------------------------------------
const keySeen = new Set();
const localRe = /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g;
let m;
while ((m = localRe.exec(raw))) {
  if (seen(keySeen, m[1])) {
    const line = raw.slice(0, m.index).split('\n').length;
    results.storageKeys.push({ key: m[1], line, count: 1 });
  } else {
    const entry = results.storageKeys.find(k => k.key === m[1]);
    if (entry) entry.count++;
  }
}
const prefixRe = /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]*?)['"`]\s*\+/g;
const prefSeen = new Set();
while ((m = prefixRe.exec(raw))) {
  if (seen(prefSeen, m[1])) results.storageDynamicPrefixes.push({ prefix: m[1], line: raw.slice(0, m.index).split('\n').length });
}

// ---- hosts ---------------------------------------------------------------
const hostSeen = new Set();
const urlRe = /https?:\/\/([a-zA-Z0-9._-]+(?::\d+)?)/g;
while ((m = urlRe.exec(raw))) {
  const host = m[1].toLowerCase();
  if (!seen(hostSeen, host)) results.hosts.push(host);
}

// ---- network endpoints (absolute URLs) -----------------------------------
const urlFullSeen = new Set();
const fullRe = /(?:https?:)?\/\/[a-zA-Z0-9._-]+(?::\d+)?(?:\/[^\s'"`)<>\]]*)?/g;
while ((m = fullRe.exec(raw))) {
  const u = m[0].replace(/[.,;]+$/, '');
  if (u.length > 10 && !seen(urlFullSeen, u)) results.network.push(u);
}

// ---- DOM ids (declared) ---------------------------------------------------
const idSeen = new Set();
const idRe = /\bid=["']([A-Za-z_$][\w$-]*)["']/g;
while ((m = idRe.exec(raw))) {
  if (seen(idSeen, m[1])) results.domIds.push({ id: m[1], line: raw.slice(0, m.index).split('\n').length });
}

// ---- NexusAndroid / NexusBridge calls ------------------------------------
const callSeen = new Set();
const nativeRe = /(?:NexusAndroid|NexusBridge)\.([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = nativeRe.exec(raw))) {
  const fn = m[1];
  const entry = results.nativeCalls.find(c => c.fn === fn);
  if (entry) { entry.count++; }
  else results.nativeCalls.push({ fn, line: raw.slice(0, m.index).split('\n').length, count: 1 });
}
results.nativeCalls.sort((a, b) => a.fn.localeCompare(b.fn));

// ---- CSS variables --------------------------------------------------------
const cssSeen = new Set();
const cssRe = /(--[A-Za-z0-9-]+)\s*:\s*([^;}{]+)[;}]/g;
while ((m = cssRe.exec(raw))) {
  if (seen(cssSeen, m[1])) results.cssVars.push({ name: m[1], sample: m[2].trim(), line: raw.slice(0, m.index).split('\n').length });
}

// ---- window globals -------------------------------------------------------
const globalSeen = new Set();
const globRe = /window\.([A-Za-z_$][\w$]*)\s*=/g;
while ((m = globRe.exec(raw))) {
  if (seen(globalSeen, m[1])) results.globals.push({ name: m[1], line: raw.slice(0, m.index).split('\n').length });
}

// ---- top-level banners/sections ------------------------------------------
const bannerRe = /^\s*(?:\/\/|<!--|\/\*)\s*(?:═+|╔|╚|──|─|\[)?\s*(.{3,120}?)(?:═+|╗|╝|──|─|\s*-->)?\s*$/;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/[═╔╚]{3,}/.test(l) && l.trim().length > 6) {
    results.sections.push({ line: i + 1, text: l.trim().replace(/<[^>]+>/g, '').slice(0, 140) });
  }
}

// ---- write ----------------------------------------------------------------
fs.writeFileSync(path.join(outDir, 'functions.json'), JSON.stringify(results.functions, null, 2));
fs.writeFileSync(path.join(outDir, 'storage-keys.json'), JSON.stringify({
  keys: results.storageKeys.sort((a, b) => a.key.localeCompare(b.key)),
  dynamicPrefixes: results.storageDynamicPrefixes,
}, null, 2));
fs.writeFileSync(path.join(outDir, 'hosts.json'), JSON.stringify(results.hosts.sort(), null, 2));
fs.writeFileSync(path.join(outDir, 'network-endpoints.json'), JSON.stringify(results.network.sort(), null, 2));
fs.writeFileSync(path.join(outDir, 'dom-ids.json'), JSON.stringify(results.domIds, null, 2));
fs.writeFileSync(path.join(outDir, 'native-calls.json'), JSON.stringify(results.nativeCalls, null, 2));
fs.writeFileSync(path.join(outDir, 'css-vars.json'), JSON.stringify(results.cssVars, null, 2));
fs.writeFileSync(path.join(outDir, 'globals.json'), JSON.stringify(results.globals, null, 2));
fs.writeFileSync(path.join(outDir, 'sections.json'), JSON.stringify(results.sections, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(results.meta, null, 2));

console.log(JSON.stringify({
  ...results.meta,
  functions: results.functions.length,
  storageKeys: results.storageKeys.length,
  dynamicPrefixes: results.storageDynamicPrefixes.length,
  hosts: results.hosts.length,
  endpoints: results.network.length,
  domIds: results.domIds.length,
  nativeCalls: results.nativeCalls.length,
  cssVars: results.cssVars.length,
  globals: results.globals.length,
  sections: results.sections.length,
}, null, 2));
