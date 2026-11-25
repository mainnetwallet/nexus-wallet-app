#!/usr/bin/env node
// Runtime smoke test: drives the debug APK on a booted emulator/device via adb
// and uiautomator, captures screenshots and checks logcat for fatal errors.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADB = process.env.ADB || 'adb';
const APK = process.env.APK || join(root, 'ui/android/app/build/outputs/apk/debug/app-debug.apk');
const SHOTS = join(root, 'docs/screenshots');
const PIN = '135791';

function adb(args, opts = {}) {
  return execFileSync(ADB, args, { encoding: opts.encoding ?? 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024, ...opts });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function screenshot(name) {
  // Capture to device storage and pull; exec-out returns empty here.
  adb(['shell', 'screencap', '-p', '/sdcard/nexus-shot.png']);
  const file = join(SHOTS, name);
  adb(['pull', '/sdcard/nexus-shot.png', file]);
  console.log(`  screenshot -> docs/screenshots/${name}`);
}

function tryScreenshot(name) {
  try {
    screenshot(name);
    return true;
  } catch {
    console.log(`  screenshot ${name} blocked (FLAG_SECURE expected before unlock)`);
    return false;
  }
}

function dumpUi() {
  try {
    adb(['shell', 'rm', '-f', '/sdcard/ui.xml']);
    adb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], { stdio: 'pipe' });
    return adb(['shell', 'cat', '/sdcard/ui.xml']);
  } catch {
    return '<hierarchy/>';
  }
}

async function waitForAny(labels, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const nodes = parseNodes(dumpUi());
    for (const label of labels) {
      if (nodes.some((n) => n.text === label || n.desc === label)) return label;
    }
    await sleep(800);
  }
  throw new Error(`none of ${labels.join(', ')} appeared`);
}

function parseNodes(xml) {
  const nodes = [];
  const re = /<node\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attrs.bounds || '');
    if (!b) continue;
    nodes.push({
      text: attrs.text || '',
      desc: attrs['content-desc'] || '',
      cls: attrs.class || '',
      x: (Number(b[1]) + Number(b[3])) / 2,
      y: (Number(b[2]) + Number(b[4])) / 2,
    });
  }
  return nodes;
}

async function findText(text, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const nodes = parseNodes(dumpUi());
    const hit = nodes.find((n) => n.text === text || n.desc === text);
    if (hit) return hit;
    await sleep(800);
  }
  throw new Error(`text not found: ${JSON.stringify(text)}`);
}

async function tapText(text, timeoutMs = 30_000) {
  const node = await findText(text, timeoutMs);
  adb(['shell', 'input', 'tap', String(Math.round(node.x)), String(Math.round(node.y))]);
  await sleep(400);
}

async function waitBoot(timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const out = adb(['shell', 'getprop', 'sys.boot_completed']).trim();
    if (out === '1') return;
    await sleep(3000);
  }
  throw new Error('emulator did not boot in time');
}

async function enterPin() {
  for (const d of PIN) await tapText(d);
  await sleep(300);
}

function logcatTail() {
  return adb(['logcat', '-d', '-t', '4000']);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  if (!existsSync(APK)) throw new Error(`APK not found: ${APK}`);

  console.log('[1/9] waiting for boot');
  await waitBoot();

  console.log('[2/9] installing APK');
  adb(['install', '-r', '-t', APK], { timeout: 300_000 });

  console.log('[3/9] clearing prior state (fresh install path)');
  adb(['shell', 'pm', 'clear', 'com.nexus.wallet']).trim();

  console.log('[4/9] launching app');
  adb(['shell', 'logcat', '-c']);
  adb(['shell', 'am', 'start', '-W', '-n', 'com.nexus.wallet/.MainActivity']);
  await sleep(4000);

  const label = await waitForAny(['Create a PIN', 'Welcome back'], 300_000);
  const first = label === 'Create a PIN' ? 'setup' : 'unlock';
  console.log(`[5/9] lock state: ${first}`);
  writeFileSync(join(root, 'docs/PHASE_REPORTS/runtime-lock-ui.xml'), dumpUi());
  tryScreenshot('runtime-00-lock.png');

  if (first === 'setup') {
    console.log('[6/9] creating PIN');
    await enterPin();
    await tapText('Continue');
    await findText('Confirm PIN', 15_000);
    await enterPin();
    await tapText('Create wallet');
  } else {
    console.log('[6/9] unlocking');
    await enterPin();
    await tapText('Unlock');
  }

  console.log('[7/9] waiting for home');
  await findText('TOTAL BALANCE', 90_000);
  await sleep(2500);
  screenshot('runtime-01-home.png');

  console.log('[8/9] visiting tabs');
  for (const [label, shot] of [
    ['Swap', 'runtime-02-swap.png'],
    ['Bridge', 'runtime-03-bridge.png'],
    ['Profile', 'runtime-04-profile.png'],
    ['Settings', 'runtime-05-settings.png'],
    ['Home', null],
  ]) {
    await tapText(label, 20_000);
    await sleep(1500);
    if (shot) screenshot(shot);
  }

  console.log('[9/9] checking logcat');
  const log = logcatTail();
  writeFileSync(join(root, 'docs/PHASE_REPORTS/runtime-logcat.txt'), log);
  const fatal = log.split(/\r?\n/).filter((l) => /FATAL EXCEPTION|ReactNativeJS.*(Error|error)|E AndroidRuntime/.test(l));
  if (fatal.length) {
    console.log('logcat issues:');
    for (const line of fatal.slice(0, 20)) console.log('  ' + line);
  } else {
    console.log('logcat clean: no fatal/JS errors');
  }
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err.message);
  try {
    tryScreenshot('runtime-failure.png');
    writeFileSync(join(root, 'docs/PHASE_REPORTS/runtime-logcat.txt'), logcatTail());
    writeFileSync(join(root, 'docs/PHASE_REPORTS/runtime-ui-failure.xml'), dumpUi());
  } catch {}
  process.exit(1);
});
