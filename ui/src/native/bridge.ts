/**
 * Typed access to the Kotlin modules. Every call degrades to an in-memory
 * fallback so the JS layer can be exercised in a dev client without the
 * native build; the fallback is loudly logged and never used in release
 * (AndroidManifest ships the modules in the APK).
 */
import { NativeModules, Platform } from 'react-native';
import type { EncryptedStore, LegacyReader } from '@nexus/core';

interface SecureStoreNative {
  setItem(key: string, value: string, pin: string): Promise<void>;
  getItem(key: string, pin: string): Promise<string | null>;
  deleteItem(key: string): Promise<void>;
  rewrap(oldPin: string, newPin: string): Promise<boolean>;
  hasPin(): Promise<boolean>;
  isStrongBoxAvailable(): Promise<boolean>;
}

interface LegacyStoreNative {
  readAll(): Promise<Record<string, string>>;
  deleteKeys(keys: string[]): Promise<void>;
  probe(): Promise<{ present: boolean; versionCode: number | null; keyCount: number }>;
}

interface DeviceSecurityNative {
  setSecureFlag(on: boolean): Promise<void>;
  getClipboard(): Promise<string>;
  setClipboard(text: string): Promise<void>;
  clearClipboard(): Promise<void>;
  isBiometricAvailable(): Promise<boolean>;
  promptBiometric(title: string, subtitle: string): Promise<boolean>;
}

interface AppControlNative {
  startForegroundService(title: string, text: string): Promise<void>;
  stopForegroundService(): Promise<void>;
  setOrientation(portrait: boolean): Promise<void>;
  appVersion(): Promise<{ versionCode: number; versionName: string }>;
}

const native = NativeModules as Record<string, unknown>;

function isNative(): boolean {
  return Platform.OS === 'android' && Boolean(native.NexusSecureStore);
}

export const secureStoreNative = native.NexusSecureStore as SecureStoreNative | undefined;
export const legacyStoreNative = native.NexusLegacyStore as LegacyStoreNative | undefined;
export const deviceSecurityNative = native.NexusDeviceSecurity as DeviceSecurityNative | undefined;
export const appControlNative = native.NexusAppControl as AppControlNative | undefined;

class MemoryEncryptedStore implements EncryptedStore {
  private readonly map = new Map<string, string>();
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

const memoryStore = new MemoryEncryptedStore();
const memoryLegacy = new Map<string, string>();

let unlockedPin: string | null = null;

/** The PIN is held only for the unlock session; clearing it locks the vault. */
export function setSessionPin(pin: string | null): void {
  unlockedPin = pin;
}

export function hasSessionPin(): boolean {
  return unlockedPin !== null;
}

/** Re-encrypts every vault entry after a PIN change (session PIN → new PIN). */
export async function rewrapVault(newPin: string): Promise<boolean> {
  if (!secureStoreNative || !unlockedPin) return false;
  try {
    return await secureStoreNative.rewrap(unlockedPin, newPin);
  } catch {
    return false;
  }
}

export function makeEncryptedStore(): EncryptedStore {
  if (!isNative() || !secureStoreNative) {
    console.warn('[native] NexusSecureStore missing — using in-memory store (dev only)');
    return memoryStore;
  }
  return {
    async set(key, value) {
      if (!unlockedPin) throw new Error('Vault is locked');
      await secureStoreNative.setItem(key, value, unlockedPin);
    },
    async get(key) {
      if (!unlockedPin) throw new Error('Vault is locked');
      return secureStoreNative.getItem(key, unlockedPin);
    },
    async delete(key) {
      await secureStoreNative.deleteItem(key);
    },
  };
}

export function makeLegacyReader(): LegacyReader {
  if (!isNative() || !legacyStoreNative) {
    console.warn('[native] NexusLegacyStore missing — legacy migration unavailable');
    return {
      async readAll() {
        return Object.fromEntries(memoryLegacy);
      },
      async deleteKeys(keys) {
        for (const k of keys) memoryLegacy.delete(k);
      },
    };
  }
  return {
    readAll: () => legacyStoreNative.readAll(),
    deleteKeys: (keys) => legacyStoreNative.deleteKeys(keys),
  };
}

export async function probeLegacy(): Promise<{ present: boolean; keyCount: number }> {
  try {
    if (legacyStoreNative) {
      const r = await legacyStoreNative.probe();
      return { present: r.present, keyCount: r.keyCount };
    }
  } catch {
    /* fall through */
  }
  return { present: false, keyCount: 0 };
}

export async function setSecureFlag(on: boolean): Promise<void> {
  try {
    await deviceSecurityNative?.setSecureFlag(on);
  } catch {
    /* non-fatal */
  }
}

export async function clearClipboard(): Promise<void> {
  try {
    await deviceSecurityNative?.clearClipboard();
  } catch {
    /* non-fatal */
  }
}

export async function copySecret(text: string): Promise<void> {
  const mod = deviceSecurityNative;
  if (!mod) {
    console.warn('[native] clipboard module missing');
    return;
  }
  await mod.setClipboard(text);
  setTimeout(() => {
    mod.clearClipboard().catch(() => undefined);
  }, 30_000);
}

export async function biometricUnlock(reason: string): Promise<boolean> {
  try {
    if (!deviceSecurityNative) return false;
    return await deviceSecurityNative.promptBiometric('Nexus Wallet', reason);
  } catch {
    return false;
  }
}

export async function setOrientation(portrait: boolean): Promise<void> {
  try {
    await appControlNative?.setOrientation(portrait);
  } catch {
    /* non-fatal */
  }
}

export async function startForegroundService(title: string, text: string): Promise<void> {
  await appControlNative?.startForegroundService(title, text);
}

export async function stopForegroundService(): Promise<void> {
  await appControlNative?.stopForegroundService();
}
