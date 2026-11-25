import { describe, expect, it } from '@jest/globals';
import { TxHistoryStore, BRIDGE_CLEARED_KEY, TX_HISTORY_KEY } from '../src/history/store.js';

function storage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    data,
    read: (k: string) => data[k] ?? null,
    write: (k: string, v: string) => { data[k] = v; },
    remove: (k: string) => { delete data[k]; },
  };
}

function makeStore(seed?: Record<string, string>) {
  let now = 1_700_000_000_000;
  let n = 0;
  const st = storage(seed);
  const store = new TxHistoryStore(st, { now: () => now, random: () => (n++) / 1000 });
  return { store, st, advance: (ms: number) => { now += ms; } };
}

describe('TxHistoryStore', () => {
  it('adds newest-first with a legacy-shaped id', () => {
    const { store } = makeStore();
    const e = store.add({ type: 'send', hash: '0xabc', pair: '1 ETH → 0x1234…' });
    expect(e.timestamp).toBe(1_700_000_000_000);
    expect(e.id).toMatch(/^1700000000000_/);
    expect(store.load()).toHaveLength(1);
  });

  it('trims bridge+swap to 15 but never trims other types', () => {
    const { store, advance } = makeStore();
    for (let i = 0; i < 4; i++) { store.add({ type: 'send', hash: `0xs${i}` }); advance(1); }
    for (let i = 0; i < 20; i++) { store.add({ type: i % 2 ? 'swap' : 'bridge', hash: `0xb${i}` }); advance(1); }

    const list = store.load();
    const bs = list.filter((t) => t.type === 'bridge' || t.type === 'swap');
    expect(bs).toHaveLength(15);
    expect(bs[0]?.hash).toBe('0xb19'); // newest first
    expect(list.filter((t) => t.type === 'send')).toHaveLength(4);
    expect(list[0]?.hash).toBe('0xb19'); // order preserved overall
    expect(list.at(-1)?.type).toBe('send');
  });

  it('keeps bridge tombstone out of the profile history', () => {
    const { store, advance } = makeStore();
    store.add({ type: 'bridge', hash: '0xold' });
    advance(1000);
    store.add({ type: 'swap', hash: '0xnew' });
    advance(1000);
    store.clearBridgeView();

    expect(store.load()).toHaveLength(2); // profile history intact
    expect(store.bridgeSwapPool()).toHaveLength(0);
    expect(store.recent('all')).toHaveLength(0);

    advance(1000);
    store.add({ type: 'swap', hash: '0xafter' });
    expect(store.bridgeSwapPool().map((t) => t.hash)).toEqual(['0xafter']);
  });

  it('filters recent by type and reverses the inline list', () => {
    const { store, advance } = makeStore();
    for (const t of ['bridge', 'swap', 'bridge'] as const) { store.add({ type: t, hash: `0x${t}${Math.random()}` }); advance(10); }
    expect(store.recent('bridge')).toHaveLength(2);
    expect(store.recent('swap')).toHaveLength(1);
    const inline = store.inlineRecent(5);
    expect(inline).toHaveLength(3);
    expect(inline[0]?.type).toBe('bridge'); // last of the 3 is oldest
    expect(inline.at(-1)?.type).toBe('bridge');
  });

  it('patches pending entries by id or hash and tracks pending state', () => {
    const { store } = makeStore();
    const e = store.add({ type: 'bridge', hash: '0xhash', pendingRecv: true });
    expect(store.hasPending()).toBe(true);

    expect(store.patch({ hash: '0xhash' }, { pendingRecv: false, recvHash: '0xrecv' })).toBe(true);
    expect(store.hasPending()).toBe(false);
    expect(store.load()[0]?.recvHash).toBe('0xrecv');

    expect(store.patch({ id: 'missing' }, { failed: true })).toBe(false);
    expect(store.patch({ id: e.id }, { failed: true })).toBe(true);
    expect(store.load()[0]?.failed).toBe(true);
  });

  it('clear removes storage and corrupt data loads as empty', () => {
    const { store, st } = makeStore({ [TX_HISTORY_KEY]: 'not-json' });
    expect(store.load()).toEqual([]);
    store.add({ type: 'send' });
    store.clear();
    expect(st.data[TX_HISTORY_KEY]).toBeUndefined();
    expect(store.bridgeViewClearedAt()).toBe(0);

    st.data[BRIDGE_CLEARED_KEY] = '12345';
    expect(store.bridgeViewClearedAt()).toBe(12345);
  });
});
