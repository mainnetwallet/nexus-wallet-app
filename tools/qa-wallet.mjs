#!/usr/bin/env node
// Deeper runtime QA: creates wallet groups through the Profile sheet, verifies
// the Keystore vault round-trip across lock/unlock and process restart.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADB = process.env.ADB || 'adb';
const SHOTS = join(root, 'docs/screenshots');
const REPORTS = join(root, 'docs/PHASE_REPORTS');
const PIN = '135791';

function adb(args) {
  return execFileSync(ADB, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function screenshot(name) {
  adb(['shell', 'screencap', '-p', '/sdcard/nexus-shot.png']);
  adb(['pull', '/sdcard/nexus-shot.png', join(SHOTS, name)]);
  console.log(`  screenshot -> docs/screenshots/${name}`);
}
function tryScreenshot(name) {
  try {
    screenshot(name);
  } catch {
    console.log(`  screenshot ${name} blocked (FLAG_SECURE)`);
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
      x: (Number(b[1]) + Number(b[3])) / 2,
      y: (Number(b[2]) + Number(b[4])) / 2,
    });
  }
  return nodes;
}
async function findText(text, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = parseNodes(dumpUi()).find((n) => n.text === text || n.desc === text);
    if (hit) return hit;
    await sleep(500);
  }
  throw new Error(`text not found: ${JSON.stringify(text)}`);
}
async function tapText(text, timeoutMs = 20_000) {
  const node = await findText(text, timeoutMs);
  adb(['shell', 'input', 'tap', String(Math.round(node.x)), String(Math.round(node.y))]);
  await sleep(500);
}
async function enterPin(pin = PIN) {
  for (const d of pin) await tapText(d);
  await sleep(300);
}
async function waitForLock(timeoutMs = 60_000) {
  return findText('Welcome back', timeoutMs);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  console.log('[1/8] open Profile');
  await tapText('Profile');
  await findText('Wallets, tools and automation');

  console.log('[2/8] generate wallets');
  await tapText('Generate');
  await findText('Generate wallets');
  tryScreenshot('runtime-06-generate-sheet.png');
  await tapText('Confirm');
  await findText('5 address(es) · 5 key(s)', 120_000);
  await sleep(800);
  screenshot('runtime-07-wallet-created.png');
  writeFileSync(join(REPORTS, 'runtime-wallet-created-ui.xml'), dumpUi());

  console.log('[3/8] home with wallet');
  await tapText('Home');
  await sleep(1500);
  screenshot('runtime-08-home-wallet.png');

  console.log('[4/8] lock from settings');
  await tapText('Settings');
  await findText('Lock now');
  screenshot('runtime-09-settings-lock.png');
  await tapText('Lock now');
  await waitForLock();
  writeFileSync(join(REPORTS, 'runtime-lock-ui.xml'), dumpUi());

  console.log('[5/8] wrong PIN');
  await enterPin('111111');
  await tapText('Unlock');
  await findText('Wrong PIN', 15_000);

  console.log('[6/8] correct PIN unlocks');
  await enterPin(PIN);
  await tapText('Unlock');
  await findText('TOTAL BALANCE', 30_000);
  screenshot('runtime-10-unlocked.png');

  console.log('[7/8] restart app keeps lock + wallet');
  adb(['shell', 'am', 'force-stop', 'com.nexus.wallet']);
  adb(['shell', 'am', 'start', '-W', '-n', 'com.nexus.wallet/.MainActivity']);
  await waitForLock(90_000);
  await enterPin(PIN);
  await tapText('Unlock');
  await findText('TOTAL BALANCE', 30_000);
  await tapText('Profile');
  await findText('5 address(es) · 5 key(s)', 30_000);
  screenshot('runtime-11-persisted-profile.png');

  const log = adb(['logcat', '-d', '-t', '6000']);
  writeFileSync(join(REPORTS, 'runtime-wallet-logcat.txt'), log);
  const issues = log
    .split(/\r?\n/)
    .filter((l) => /FATAL EXCEPTION|E AndroidRuntime|ReactNativeJS.*(Error|error)/.test(l));
  if (issues.length) {
    console.log('logcat issues:');
    for (const line of issues.slice(0, 15)) console.log('  ' + line);
    process.exit(1);
  }
  console.log('WALLET QA OK');
}

main().catch((err) => {
  console.error('WALLET QA FAILED:', err.message);
  try {
    tryScreenshot('runtime-failure.png');
    writeFileSync(join(REPORTS, 'runtime-ui-failure.xml'), dumpUi());
    writeFileSync(join(REPORTS, 'runtime-logcat.txt'), adb(['logcat', '-d', '-t', '4000']));
  } catch {}
  process.exit(1);
});
