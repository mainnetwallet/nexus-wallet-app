#!/usr/bin/env node
// Navigation smoke test for the main wallet flows: unlock if needed, then
// Send (FLAG_SECURE expected), Receive, and Exchange mode.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADB = process.env.ADB || 'adb';
const SHOTS = join(root, 'docs/screenshots');
const REPORTS = join(root, 'docs/PHASE_REPORTS');
const PIN = '135791';

const adb = (args) => execFileSync(ADB, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dumpUi() {
  try {
    adb(['shell', 'rm', '-f', '/sdcard/ui.xml']);
    adb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], { stdio: 'pipe' });
    return adb(['shell', 'cat', '/sdcard/ui.xml']);
  } catch {
    return '<hierarchy/>';
  }
}
function parseNodes(xml) {
  const out = [];
  for (const m of xml.matchAll(/<node\b([^>]*)>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a.bounds || '');
    if (b) out.push({ text: a.text || '', desc: a['content-desc'] || '', x: (+b[1] + +b[3]) / 2, y: (+b[2] + +b[4]) / 2 });
  }
  return out;
}
async function find(text, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const hit = parseNodes(dumpUi()).find((n) => n.text === text || n.desc === text);
    if (hit) return hit;
    await sleep(500);
  }
  throw new Error(`missing ${JSON.stringify(text)}`);
}
async function tap(text, timeoutMs = 20_000) {
  const node = await find(text, timeoutMs);
  adb(['shell', 'input', 'tap', String(Math.round(node.x)), String(Math.round(node.y))]);
  await sleep(700);
}
async function enterPin() {
  for (const d of PIN) await tap(d);
  await sleep(300);
}
function shot(name) {
  try {
    adb(['shell', 'screencap', '-p', '/sdcard/nexus-shot.png']);
    adb(['pull', '/sdcard/nexus-shot.png', join(SHOTS, name)]);
    console.log(`  screenshot -> docs/screenshots/${name}`);
  } catch {
    console.log(`  screenshot ${name} blocked (FLAG_SECURE expected on key screens)`);
  }
}

async function main() {
  adb(['shell', 'logcat', '-c']);
  adb(['shell', 'am', 'force-stop', 'com.nexus.wallet']);
  await sleep(1500);
  adb(['shell', 'am', 'start', '-W', '-n', 'com.nexus.wallet/.MainActivity']);
  let locked = true;
  await find('Welcome back', 90_000).catch(() => {
    locked = false;
  });
  if (locked) {
    await enterPin();
    await tap('Unlock');
  }
  await find('TOTAL BALANCE', 60_000);

  console.log('[1/3] Send screen');
  await tap('Send');
  await find('RECIPIENT');
  writeFileSync(join(REPORTS, 'runtime-send-ui.xml'), dumpUi());
  shot('runtime-12-send.png');
  await tap('‹');
  await sleep(900);

  console.log('[2/3] Receive screen');
  await tap('Receive');
  await find('Receive');
  writeFileSync(join(REPORTS, 'runtime-receive-ui.xml'), dumpUi());
  shot('runtime-13-receive.png');
  await tap('‹');
  await sleep(900);

  console.log('[3/3] Exchange screen');
  await tap('Profile');
  let found = false;
  for (let i = 0; i < 4 && !found; i++) {
    found = parseNodes(dumpUi()).some((n) => n.text === 'Open exchange mode');
    if (!found) { adb(['shell','input','swipe','540','1900','540','500','350']); await sleep(800); }
  }
  await tap('Open exchange mode');
  await find('Exchange');
  await find('Binance', 30_000);
  shot('runtime-14-exchange.png');

  const log = adb(['logcat', '-d', '-t', '4000']);
  const loops = log.split(/\r?\n/).filter((l) => /Maximum update depth exceeded/.test(l));
  if (loops.length) {
    console.log(`logcat: ${loops.length} render-loop errors`);
    process.exit(1);
  }
  const fatal = log.split(/\r?\n/).filter((l) => /FATAL EXCEPTION|E AndroidRuntime/.test(l));
  if (fatal.length) {
    console.log('logcat fatal:');
    for (const l of fatal.slice(0, 10)) console.log('  ' + l);
    process.exit(1);
  }
  console.log('NAV QA OK');
}

main().catch((err) => {
  console.error('NAV QA FAILED:', err.message);
  try {
    shot('runtime-failure.png');
    writeFileSync(join(REPORTS, 'runtime-ui-failure.xml'), dumpUi());
    writeFileSync(join(REPORTS, 'runtime-logcat.txt'), adb(['logcat', '-d', '-t', '4000']));
  } catch {}
  process.exit(1);
});
