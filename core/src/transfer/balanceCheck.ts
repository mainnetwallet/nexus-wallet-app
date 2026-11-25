/**
 * Balance check (card 8): native balances for pasted addresses plus optional
 * ERC-20 balances. Legacy used a deployed checker contract for one call; this
 * uses batched `eth_getBalance` + `balanceOf` calls, which returns the same
 * numbers and avoids a third-party contract.
 */
import type { RpcClient } from '../rpc/client.js';
import { readErc20Balance } from '../tokens/erc20.js';
import { assertAddress } from './types.js';

export interface BalanceCheckResult {
  address: string;
  native: bigint | null;
  tokens: Record<string, bigint | null>;
  error?: string;
}

export async function checkBalances(
  rpc: RpcClient,
  addresses: string[],
  tokenAddresses: string[] = [],
): Promise<BalanceCheckResult[]> {
  const results: BalanceCheckResult[] = [];
  for (const raw of addresses) {
    let address: string;
    try {
      address = assertAddress(raw);
    } catch {
      results.push({ address: raw.slice(0, 42), native: null, tokens: {}, error: 'invalid address' });
      continue;
    }
    try {
      const nativeHex = await rpc.getBalance(address);
      const tokens: Record<string, bigint | null> = {};
      for (const token of tokenAddresses) {
        try {
          tokens[token] = await readErc20Balance(rpc, token, address);
        } catch {
          tokens[token] = null;
        }
      }
      results.push({ address, native: BigInt(nativeHex), tokens });
    } catch (err) {
      results.push({
        address,
        native: null,
        tokens: {},
        error: err instanceof Error ? err.message.slice(0, 80) : 'failed',
      });
    }
  }
  return results;
}

export function parseAddressList(text: string): { addresses: string[]; invalid: string[] } {
  const addresses: string[] = [];
  const invalid: string[] = [];
  for (const line of text.split(/\r?\n|,|\s+/)) {
    const v = line.trim();
    if (!v) continue;
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) addresses.push(v);
    else invalid.push(v.slice(0, 42));
  }
  return { addresses: [...new Set(addresses)], invalid };
}
