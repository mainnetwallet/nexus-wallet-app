import { describe, expect, it } from '@jest/globals';
import { TokenStore, tokenStorageKey, customTokenId } from '../src/tokens/store.js';
import { DEFAULT_TOKENS } from '../src/tokens/defaults.js';
import { BalanceCache, balanceCacheKey, fetchTokenBalance } from '../src/tokens/balances.js';
import {
  decodeAbiString, decodeUint, encodeAddress, encodeApprove, encodeCall, encodeTransfer,
  ERC20, readTokenMeta, readErc20Balance,
} from '../src/tokens/erc20.js';
import type { RpcClient } from '../src/rpc/client.js';

function storage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    data,
    read: (k: string) => data[k] ?? null,
    write: (k: string, v: string) => { data[k] = v; },
    remove: (k: string) => { delete data[k]; },
  };
}

const ADDR = '0x1111111111111111111111111111111111111111';
const TOKEN_ADDR = '0x2222222222222222222222222222222222222222';

describe('TokenStore', () => {
  it('seeds defaults on first load and uses the group key', () => {
    const st = storage();
    const store = new TokenStore(st, 'group-a');
    const tokens = store.load();
    expect(tokens).toHaveLength(DEFAULT_TOKENS.length);
    expect(tokens.find((t) => t.id === 'base-eth-native')?.isNative).toBe(true);
    expect(st.data[tokenStorageKey('group-a')]).toContain('base-eth-native');
    expect(st.data[tokenStorageKey('group-a')]).toBeDefined();
  });

  it('purges removed ids and does not re-inject removed defaults', () => {
    const key = tokenStorageKey(null);
    const st = storage({
      [key]: JSON.stringify([{ id: 'eth1-eth' }, { id: 'usdc', chainId: 8453, name: 'old' }]),
      [`${key}_removed_defaults`]: JSON.stringify(['weth']),
    });
    const tokens = new TokenStore(st).load();
    expect(tokens.some((t) => t.id === 'eth1-eth')).toBe(false);
    expect(tokens.some((t) => t.id === 'weth')).toBe(false); // removed by user
    expect(tokens.find((t) => t.id === 'usdc')?.name).toBe('USD Coin'); // fixed from defaults
    expect(tokens.some((t) => t.id === 'eth1-usdc')).toBe(true); // other defaults injected
  });

  it('allows the same token on another chain but blocks real duplicates', () => {
    const store = new TokenStore(storage());
    expect(store.has({ id: 'usdc', chainId: 8453, contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', cgId: 'usd-coin' })).toBe(true);
    // Arbitrum already has arb-usdc (same cgId) → duplicate; an unknown chain is allowed.
    expect(store.has({ id: 'usdc', chainId: 42161, contract: '0xaf88', cgId: 'usd-coin' })).toBe(true);
    expect(store.has({ id: 'usdc', chainId: 999, contract: '0xaf88', cgId: 'usd-coin' })).toBe(false);

    const res = store.add({ id: customTokenId(TOKEN_ADDR), chainId: 8453, name: 'Foo', sub: 'FOO', contract: TOKEN_ADDR, decimals: 9, cgId: null });
    expect(res.added).toBe(true);
    expect(store.load().at(-1)?.contract).toBe(TOKEN_ADDR);

    expect(store.add({ id: 'other-id', chainId: 8453, name: 'Foo2', contract: TOKEN_ADDR.toUpperCase(), cgId: null }).added).toBe(false);
  });

  it('removing a default records it in _removed_defaults', () => {
    const st = storage();
    const store = new TokenStore(st);
    expect(store.remove('weth', 8453)).toBe(true);
    expect(JSON.parse(st.data[`${tokenStorageKey(null)}_removed_defaults`] ?? '[]')).toContain('weth');
    const reloaded = new TokenStore(st).load();
    expect(reloaded.some((t) => t.id === 'weth')).toBe(false);
  });
});

describe('ERC-20 encoding/decoding', () => {
  it('encodes calldata exactly', () => {
    expect(encodeAddress(ADDR)).toBe('0'.repeat(24) + '1'.repeat(40));
    expect(encodeCall(ERC20.balanceOf, [encodeAddress(ADDR)])).toBe('0x70a08231' + '0'.repeat(24) + '1'.repeat(40));
    expect(encodeTransfer(ADDR, 1000n)).toBe('0xa9059cbb' + '0'.repeat(24) + '1'.repeat(40) + (1000).toString(16).padStart(64, '0'));
    expect(encodeApprove(ADDR, 5n)).toBe('0x095ea7b3' + '0'.repeat(24) + '1'.repeat(40) + (5).toString(16).padStart(64, '0'));
    expect(decodeUint('0x10')).toBe(16n);
  });

  it('decodes dynamic and bytes32 strings', () => {
    const word = (hex: string) => hex.padStart(64, '0');
    const dynamic = '0x' + word('20') + word('3') + Buffer.from('USD').toString('hex').padEnd(64, '0');
    expect(decodeAbiString(dynamic)).toBe('USD');
    expect(decodeAbiString('0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0'))).toBe('MKR');
    expect(decodeAbiString('0x')).toBeNull();
  });

  it('reads metadata and balances through eth_call', async () => {
    const word = (hex: string) => hex.padStart(64, '0');
    const symbol = '0x' + word('20') + word('3') + Buffer.from('FOO').toString('hex').padEnd(64, '0');
    const name = '0x' + word('20') + word('7') + Buffer.from('FooCoin').toString('hex').padEnd(64, '0');
    const calls: string[] = [];
    const rpc = {
      call: async (tx: { to: string; data: string }) => {
        calls.push(tx.data);
        if (tx.data === ERC20.symbol) return symbol;
        if (tx.data === ERC20.name) return name;
        if (tx.data === ERC20.decimals) return '0x' + word('6');
        return '0x' + word('de0b6b3a7640000');
      },
    } as unknown as RpcClient;

    const meta = await readTokenMeta(rpc, TOKEN_ADDR);
    expect(meta).toEqual({ symbol: 'FOO', name: 'FooCoin', decimals: 6 });
    expect(calls).toHaveLength(3);

    const bal = await readErc20Balance(rpc, TOKEN_ADDR, ADDR);
    expect(bal).toBe(1_000_000_000_000_000_000n);
  });
});

describe('BalanceCache', () => {
  it('never expires and is keyed by address, not private key', () => {
    const st = storage();
    let now = 1000;
    const cache = new BalanceCache(st, ADDR, { now: () => now });
    cache.set('usdc', 8453, 12.5);
    expect(cache.get('usdc', 8453)).toBe(12.5);
    expect(cache.snapshot()[balanceCacheKey('usdc', 8453, ADDR.slice(-8))]).toBe(12.5);

    now += 10_000_000;
    const restored = new BalanceCache(st, ADDR, { now: () => now });
    expect(restored.get('usdc', 8453)).toBe(12.5);
    expect(restored.time('usdc', 8453)).toBe(1000);

    const payload = JSON.parse(st.data[balanceCacheStorageKeyForTest(ADDR)]!);
    expect(payload.walletId).toBe(ADDR);
    expect(payload.walletKey).toBeUndefined();
  });

  it('rejects legacy private-key payloads unless explicitly verified', () => {
    const st = storage({
      [balanceCacheStorageKeyForTest(ADDR)]: JSON.stringify({
        walletKey: '0xsecretkey', cache: { 'usdc:8453:deadbeef': 5 }, cacheTime: {}, saved: 1,
      }),
    });
    expect(new BalanceCache(st, ADDR).get('usdc', 8453)).toBeUndefined();
    const verified = new BalanceCache(st, ADDR, { legacyWalletKey: '0xsecretkey' });
    expect(verified.get('usdc', 8453)).toBeUndefined(); // key format differs; no crash
  });

  it('ignores payloads for another wallet', () => {
    const st = storage();
    new BalanceCache(st, ADDR).set('usdc', 8453, 1);
    const other = '0x3333333333333333333333333333333333333333';
    expect(new BalanceCache(st, other).get('usdc', 8453)).toBeUndefined();
  });
});

function balanceCacheStorageKeyForTest(walletId: string) {
  return 'nexus_bal_cache_' + walletId.slice(-8).toLowerCase();
}

describe('fetchTokenBalance', () => {
  it('sums native balances across addresses and returns null when all fail', async () => {
    const rpc = {
      getBalance: async (addr: string) => {
        if (addr.toLowerCase() === ADDR) return '0xde0b6b3a7640000'; // 1 ETH
        throw new Error('down');
      },
    } as unknown as RpcClient;
    expect(await fetchTokenBalance(rpc, { isNative: true, decimals: 18 }, [ADDR, TOKEN_ADDR])).toBe(1);

    const dead = { getBalance: async () => { throw new Error('down'); } } as unknown as RpcClient;
    expect(await fetchTokenBalance(dead, { isNative: true }, [ADDR])).toBeNull();
  });

  it('reads ERC-20 balanceOf for contract tokens', async () => {
    const rpc = {
      call: async () => '0x' + (2_500_000).toString(16).padStart(64, '0'),
    } as unknown as RpcClient;
    expect(await fetchTokenBalance(rpc, { contract: TOKEN_ADDR, decimals: 6 }, [ADDR])).toBe(2.5);
  });
});
