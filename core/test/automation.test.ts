import { describe, expect, it } from '@jest/globals';
import { keccak256 } from 'ethers';
import {
  rlpHex, authorizationHash, signAuthorization, buildDelegationTransaction,
  delegationFees, initializeCalldata, isDelegatedCode, delegatedTarget,
} from '../src/automation/eip7702.js';
import { validatePaymasterUrl, defaultUserOpGas, PAYMASTER_URL_KEY, loadPaymasterConfig, savePaymasterConfig } from '../src/automation/paymaster.js';
import { buildSupCycle, clampSupInterval, initialSupState, startSup } from '../src/automation/sup.js';
import { toSwapRequest, readBsbPm } from '../src/automation/bsb.js';

const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const DELEGATE = '0x3333333333333333333333333333333333333333';

describe('EIP-7702', () => {
  it('matches RLP reference vectors', () => {
    expect(rlpHex('0x')).toBe('0x80');
    expect(rlpHex([])).toBe('0xc0');
    expect(rlpHex(['0x', '0x'])).toBe('0xc28080');
    expect(rlpHex('0x7f')).toBe('0x7f');
    expect(rlpHex('0x80')).toBe('0x8180');
  });

  it('hashes and signs the authorization tuple', () => {
    const tuple = { chainId: 8453n, address: DELEGATE, nonce: 2n };
    const hash = authorizationHash(tuple);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    const sig = signAuthorization(PK, tuple);
    expect(sig.address).toBe(DELEGATE);
    expect(sig.chainId).toBe('0x2105');
    expect(sig.r).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('builds a type-0x04 tx with initialize calldata', () => {
    const tx = buildDelegationTransaction({
      privateKey: PK,
      chainId: 8453,
      nonce: 5n,
      delegationAddress: DELEGATE,
      ownerAddress: A,
      fees: { maxPriorityFeePerGas: 1_000_000n, maxFeePerGas: 1_100_000_000n },
      alreadyInitialized: false,
    });
    expect(tx.rawTransaction.startsWith('0x04')).toBe(true);
    expect(tx.authorization.nonce).toBe('0x6');
    expect(tx.hash).toBe(keccak256(tx.rawTransaction));
  });

  it('skips initialize when already delegated and detects designator', () => {
    const tx = buildDelegationTransaction({
      privateKey: PK, chainId: 8453, nonce: 0n, delegationAddress: DELEGATE,
      ownerAddress: A, fees: { maxPriorityFeePerGas: 0n, maxFeePerGas: 1_100_000_000n },
      alreadyInitialized: true,
    });
    expect(tx.rawTransaction.length).toBeGreaterThan(10);
    expect(isDelegatedCode('0xef0100' + DELEGATE.slice(2))).toBe(true);
    expect(delegatedTarget('0xef0100' + DELEGATE.slice(2))).toBe(DELEGATE);
    expect(isDelegatedCode('0x6080')).toBe(false);
  });

  it('derives legacy gas values', () => {
    const fees = delegationFees(8453, { baseFee: 1_000_000_000n });
    expect(fees.maxPriorityFeePerGas).toBe(50_000_000n);
    expect(fees.maxFeePerGas).toBe(1_050_000_000n);
    expect(delegationFees(999, {}).maxFeePerGas).toBe(1_100_000_000n);
    expect(initializeCalldata(A).startsWith('0x6f2de70e')).toBe(true);
  });
});

describe('paymaster', () => {
  it('validates URLs and builds default gas', () => {
    expect(validatePaymasterUrl('http://x.com/rpc')).toMatch(/https/);
    expect(validatePaymasterUrl('https://api.developer.coinbase.com/rpc/v1/base/x')).toBeNull();
    expect(defaultUserOpGas().verificationGasLimit).toBe('0x30d40');
  });

  it('loads and saves config without exposing values', () => {
    const mem = new Map<string, string>();
    const storage = { read: (k: string) => mem.get(k) ?? null, write: (k: string, v: string) => void mem.set(k, v) };
    savePaymasterConfig(storage, { url: 'https://p.example/rpc', enabled: true, swapEnabled: false });
    const cfg = loadPaymasterConfig(storage);
    expect(cfg.enabled).toBe(true);
    expect(cfg.swapEnabled).toBe(false);
    expect(mem.get(PAYMASTER_URL_KEY)).toBe('https://p.example/rpc');
  });
});

describe('bots', () => {
  it('runs a SUP cycle and clamps interval', async () => {
    const seen: string[] = [];
    const result = await buildSupCycle(
      { chainId: 8453, keys: [{ address: A, keyId: 'k1' }], recipient: B, amount: '0.1', intervalMs: 5000 },
      async (step) => { seen.push(step.to); },
    );
    expect(result).toEqual({ built: 1, failed: 0 });
    expect(seen).toEqual([B]);
    expect(clampSupInterval(100)).toBe(5000);
    expect(startSup(initialSupState()).running).toBe(true);
  });

  it('builds a Base Swap Bot request and reads legacy store', () => {
    const req = toSwapRequest({
      enabled: true, chainId: 8453,
      fromToken: { address: '0x0', symbol: 'ETH', decimals: 18 },
      toToken: { address: B, symbol: 'USDC', decimals: 6 },
      amount: '0.02', intervalMs: 60000, slippagePct: 0.5, walletKeyId: 'k1', userAddress: A,
    });
    expect(req.amountWei).toBe(20000000000000000n);
    expect(readBsbPm('{"' + A + '":{"amount":"0.1","intervalMs":1000,"slippagePct":0.5}}')[A]!.amount).toBe('0.1');
    expect(readBsbPm('bad')).toEqual({});
  });
});
