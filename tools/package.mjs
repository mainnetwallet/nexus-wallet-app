import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date();
const DATE = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const ZIP_NAME = `nexus-wallet-rebuild-${DATE}.zip`;
const ZIP_PATH = path.join(ROOT, ZIP_NAME);
const STAGING = path.join(os.tmpdir(), `nexus-staging-${process.pid}-${Date.now()}`);

const SKIP_DIRS = new Set(['node_modules', '.git', '.gradle', '.cxx', 'build', 'dist', 'coverage', 'Pods', 'legacy', '.qoder']);
const ROOT_FILES = ['README.md', 'package.json', 'package-lock.json', '.gitignore'];
const SOURCE_DIRS = ['core', 'ui', 'proxy', 'docs', 'tools', '.github'];

function relative(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function shouldCopy(abs) {
  const base = path.basename(abs);
  const rel = relative(abs);
  if (SKIP_DIRS.has(base)) return false;
  if (rel.startsWith('legacy/')) return false;
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return false;
  if (rel === 'ui/android/local.properties' || rel === 'ui/android/app/local.properties') return false;
  if (/\.(jks|p12|pem)$/i.test(base)) return false;
  if (/\.keystore$/i.test(base) && base !== 'debug.keystore') return false;
  if (/\.apk$/i.test(base)) return false;
  if (/^nexus-wallet-rebuild-.*\.zip$/.test(base)) return false;
  if (/\.log$/i.test(base)) return false;
  return true;
}

function copyInto(dest) {
  for (const file of ROOT_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dest, file));
  }
  for (const dir of SOURCE_DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(dest, dir), { recursive: true, filter: shouldCopy });
  }
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeChecksums(staging) {
  const files = walk(staging)
    .filter((file) => path.basename(file) !== 'SHA256SUMS.txt')
    .sort((a, b) => relativeFrom(staging, a).localeCompare(relativeFrom(staging, b)));
  const lines = files.map((file) => `${sha256(file)}  ${relativeFrom(staging, file)}`);
  fs.writeFileSync(path.join(staging, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  return files.length;
}

function relativeFrom(base, abs) {
  return path.relative(base, abs).split(path.sep).join('/');
}

function zipDirectory(staging, out) {
  if (process.platform === 'win32') {
    const script = path.join(os.tmpdir(), `nexus-zip-${process.pid}.ps1`);
    const ps = [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem',
      `$src = '${staging.replace(/'/g, "''")}'`,
      `$dst = '${out.replace(/'/g, "''")}'`,
      'if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }',
      '$zip = [System.IO.Compression.ZipFile]::Open($dst, [System.IO.Compression.ZipArchiveMode]::Create)',
      'try {',
      '  Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {',
      "    $rel = $_.FullName.Substring($src.Length + 1).Replace('\\', '/')",
      '    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null',
      '  }',
      '} finally { $zip.Dispose() }',
    ].join('\n');
    fs.writeFileSync(script, ps);
    try {
      const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'inherit' });
      if (res.status !== 0) throw new Error('PowerShell zip failed.');
    } finally {
      fs.rmSync(script, { force: true });
    }
    return;
  }
  const res = spawnSync('zip', ['-rq', out, '.'], { cwd: staging, stdio: 'inherit' });
  if (res.error || res.status !== 0) throw new Error('zip failed.');
}

function verifyArchive(out) {
  const test = spawnSync('unzip', ['-t', out], { encoding: 'utf8' });
  if (test.error) throw new Error('unzip is required for verification (unzip -t).');
  if (test.status !== 0) {
    process.stdout.write(`${test.stdout}\n${test.stderr}\n`);
    throw new Error('ZIP integrity check failed (unzip -t).');
  }
  const listing = spawnSync('unzip', ['-Z1', out], { encoding: 'utf8' });
  if (listing.status !== 0) throw new Error('Could not list ZIP entries.');
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  const badSeparators = entries.filter((entry) => entry.includes('\\'));
  if (badSeparators.length) {
    throw new Error(`ZIP entries must use forward slashes: ${badSeparators.slice(0, 3).join(', ')}`);
  }
  const forbidden = entries.filter((entry) => (
    entry.includes('node_modules/') ||
    entry.startsWith('legacy/') ||
    entry.startsWith('.git/') ||
    entry === 'ui/android/local.properties' ||
    (entry.includes('.env') && !entry.endsWith('.env.example')) ||
    (/\.keystore$/i.test(entry) && !entry.endsWith('debug.keystore'))
  ));
  if (forbidden.length) throw new Error(`Forbidden entries in ZIP: ${forbidden.slice(0, 5).join(', ')}`);
  return entries.length;
}

fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

try {
  copyInto(STAGING);

  const apk = path.join(ROOT, 'ui', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const apkName = `nexus-wallet-${DATE}-debug.apk`;
  if (fs.existsSync(apk)) {
    fs.copyFileSync(apk, path.join(STAGING, apkName));
    console.log(`[package] included APK (${(fs.statSync(apk).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    console.log('[package] no debug APK found; source-only archive');
  }

  const hashed = writeChecksums(STAGING);

  if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH);
  zipDirectory(STAGING, ZIP_PATH);
  const entries = verifyArchive(ZIP_PATH);
  const sizeMb = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(2);

  console.log(`[package] wrote ${ZIP_NAME} (${sizeMb} MB, ${entries} entries, ${hashed} checksums)`);
  console.log('[package] verified with unzip -t');
} finally {
  fs.rmSync(STAGING, { recursive: true, force: true });
}
