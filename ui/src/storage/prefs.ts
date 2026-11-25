/**
 * AsyncStorage-backed preference mirror with a synchronous read interface for
 * the core stores (TokenStore, RpcStorage, PriceCacheStorage all read sync).
 * Only non-secret preferences live here; wallet material uses the Keystore
 * module through `makeEncryptedStore()`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'nexus2/pref/';

class PrefMirror {
  private readonly map = new Map<string, string>();

  async hydrate(): Promise<void> {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
      if (!keys.length) return;
      const pairs = await AsyncStorage.multiGet(keys);
      for (const [key, value] of pairs) {
        if (value != null) this.map.set(key.slice(PREFIX.length), value);
      }
    } catch {
      /* first run / storage unavailable */
    }
  }

  read(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.map.set(key, value);
    AsyncStorage.setItem(PREFIX + key, value).catch(() => undefined);
  }

  remove(key: string): void {
    this.map.delete(key);
    AsyncStorage.removeItem(PREFIX + key).catch(() => undefined);
  }

  json<T>(key: string, fallback: T): T {
    const raw = this.read(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  setJson(key: string, value: unknown): void {
    this.write(key, JSON.stringify(value));
  }
}

export const prefs = new PrefMirror();
