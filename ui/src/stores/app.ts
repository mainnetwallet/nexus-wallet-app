import { create } from 'zustand';
import { AttemptLimiter, isValidPin, redact } from '@nexus/core';
import { prefs } from '../storage/prefs';
import { probeLegacy, setSecureFlag, setSessionPin } from '../native/bridge';
import { createPinHash, verifyPinHash } from '../native/pin';

export type ThemeMode = 'dark' | 'light';
export type Currency = 'USD' | 'BDT' | 'ETH' | 'BTC';
export type HomeMode = 'wallet' | 'exchange';

export interface Settings {
  theme: ThemeMode;
  currency: Currency;
  haptic: boolean;
  notifications: boolean;
  consoleLog: boolean;
  displayMode: HomeMode;
  proxyBaseUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  currency: 'USD',
  haptic: true,
  notifications: false,
  consoleLog: false,
  displayMode: 'wallet',
  proxyBaseUrl: '',
};

export interface ToastMessage {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface AppState {
  ready: boolean;
  locked: boolean;
  hasPin: boolean;
  biometric: boolean;
  migrationNeeded: boolean;
  settings: Settings;
  toast: ToastMessage | null;
  consoleLines: string[];
  bootstrap(): Promise<void>;
  createPin(pin: string): Promise<boolean>;
  unlock(pin: string): Promise<{ ok: boolean; waitMs: number }>;
  biometricUnlockSession(): Promise<void>;
  lock(): void;
  updateSettings(patch: Partial<Settings>): void;
  setMigrationNeeded(value: boolean): void;
  showToast(text: string, kind?: ToastMessage['kind']): void;
  log(line: string): void;
  clearConsole(): void;
}

const LIMITER_KEY = 'auth.limiter';

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  locked: true,
  hasPin: false,
  biometric: false,
  migrationNeeded: false,
  settings: DEFAULT_SETTINGS,
  toast: null,
  consoleLines: [],

  async bootstrap() {
    await prefs.hydrate();
    const pinHash = prefs.read('auth.pinHash');
    const settings = { ...DEFAULT_SETTINGS, ...prefs.json<Partial<Settings>>('settings', {}) };
    const biometric = prefs.read('auth.biometric') === '1';
    let migrationNeeded = false;
    try {
      const legacy = await probeLegacy();
      migrationNeeded = legacy.present && !prefs.read('migration.verified');
    } catch {
      migrationNeeded = false;
    }
    set({
      ready: true,
      hasPin: Boolean(pinHash),
      locked: Boolean(pinHash),
      settings,
      biometric,
      migrationNeeded,
    });
    await setSecureFlag(!pinHash);
  },

  async createPin(pin) {
    if (!isValidPin(pin)) return false;
    const hash = await createPinHash(pin);
    prefs.write('auth.pinHash', hash);
    prefs.remove(LIMITER_KEY);
    setSessionPin(pin);
    set({ hasPin: true, locked: false });
    await setSecureFlag(false);
    return true;
  },

  async unlock(pin) {
    const stored = prefs.read('auth.pinHash');
    if (!stored) return { ok: false, waitMs: 0 };
    const limiter = AttemptLimiter.restore(prefs.json(LIMITER_KEY, null));
    const waitMs = limiter.remainingMs();
    if (waitMs > 0) return { ok: false, waitMs };
    const ok = await verifyPinHash(pin, stored);
    if (!ok) {
      const remaining = limiter.recordFailure();
      prefs.setJson(LIMITER_KEY, limiter.export());
      return { ok: false, waitMs: remaining };
    }
    limiter.recordSuccess();
    prefs.setJson(LIMITER_KEY, limiter.export());
    setSessionPin(pin);
    set({ locked: false });
    await setSecureFlag(false);
    get().log('[lock] unlocked');
    return { ok: true, waitMs: 0 };
  },

  async biometricUnlockSession() {
    // Biometric only gates the UI; the vault PIN is still required to decrypt.
    set({ locked: false });
  },

  lock() {
    setSessionPin(null);
    set({ locked: true });
    setSecureFlag(true).catch(() => undefined);
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    prefs.setJson('settings', settings);
    set({ settings });
  },

  setMigrationNeeded(value) {
    set({ migrationNeeded: value });
  },

  showToast(text, kind = 'info') {
    const id = Date.now();
    set({ toast: { id, text: redact(text), kind } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 3200);
  },

  log(line) {
    const clean = redact(line);
    const next = [...get().consoleLines, `${new Date().toLocaleTimeString()}  ${clean}`];
    set({ consoleLines: next.length > 200 ? next.slice(-200) : next });
  },

  clearConsole() {
    set({ consoleLines: [] });
  },
}));
