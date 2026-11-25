/**
 * Minimal ERC-20 reader (no ABI dependency): selectors are fixed, arguments
 * are 32-byte words. Mirrors what the legacy app did through ethers
 * `Contract.balanceOf/symbol/name/decimals`.
 */
import type { RpcClient } from '../rpc/client.js';

export const ERC20 = {
  balanceOf: '0x70a08231',
  transfer: '0xa9059cbb',
  transferFrom: '0x23b872dd',
  approve: '0x095ea7b3',
  allowance: '0xdd62ed3e',
  symbol: '0x95d89b41',
  name: '0x06fdde03',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
} as const;

export function encodeAddress(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(clean)) throw new Error(`bad address: ${address}`);
  return clean.padStart(64, '0');
}

export function encodeUint(value: bigint | number | string): string {
  const v = BigInt(value);
  if (v < 0n) throw new Error('uint underflow');
  const hex = v.toString(16);
  if (hex.length > 64) throw new Error('uint overflow');
  return hex.padStart(64, '0');
}

export function encodeCall(selector: string, words: string[] = []): string {
  return selector + words.join('');
}

export function decodeUint(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  const clean = hex.replace(/^0x/, '');
  return clean.length ? BigInt('0x' + clean) : 0n;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Decodes `string`, with bytes32 fallback used by legacy tokens (e.g. MKR). */
export function decodeAbiString(hex: string): string | null {
  if (!hex || hex === '0x') return null;
  const body = hex.replace(/^0x/, '');
  try {
    if (body.length >= 128) {
      const offset = Number(BigInt('0x' + body.slice(0, 64)));
      if (offset === 32) {
        const len = Number(BigInt('0x' + body.slice(64, 128)));
        if (len > 0 && body.length >= 128 + len * 2) {
          const bytes = hexToBytes(body.slice(128, 128 + len * 2));
          const text = new TextDecoder().decode(bytes);
          let end = text.length;
          while (end > 0 && text.charCodeAt(end - 1) === 0) end--;
          return text.slice(0, end);
        }
      }
    }
    // bytes32
    const word = body.slice(0, 64);
    const bytes = hexToBytes(word).filter((b) => b !== 0);
    if (!bytes.length) return null;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export interface TokenMeta {
  symbol: string;
  name: string;
  decimals: number;
}

export async function readTokenMeta(rpc: RpcClient, address: string): Promise<TokenMeta | null> {
  const to = address;
  const [symHex, nameHex, decHex] = await Promise.all([
    rpc.call({ to, data: ERC20.symbol }).catch(() => null),
    rpc.call({ to, data: ERC20.name }).catch(() => null),
    rpc.call({ to, data: ERC20.decimals }).catch(() => null),
  ]);
  const symbol = symHex ? decodeAbiString(symHex) : null;
  if (!symbol) return null;
  const name = (nameHex ? decodeAbiString(nameHex) : null) || symbol;
  const decimals = decHex ? Number(decodeUint(decHex)) : 18;
  return { symbol: symbol.toUpperCase(), name, decimals: Number.isFinite(decimals) ? decimals : 18 };
}

export async function readErc20Balance(rpc: RpcClient, token: string, holder: string): Promise<bigint> {
  const data = encodeCall(ERC20.balanceOf, [encodeAddress(holder)]);
  return decodeUint(await rpc.call({ to: token, data }));
}

export async function readAllowance(rpc: RpcClient, token: string, owner: string, spender: string): Promise<bigint> {
  const data = encodeCall(ERC20.allowance, [encodeAddress(owner), encodeAddress(spender)]);
  return decodeUint(await rpc.call({ to: token, data }));
}

/** approve(spender, amount) calldata. */
export function encodeApprove(spender: string, amount: bigint): string {
  return encodeCall(ERC20.approve, [encodeAddress(spender), encodeUint(amount)]);
}

/** transfer(to, amount) calldata. */
export function encodeTransfer(to: string, amount: bigint): string {
  return encodeCall(ERC20.transfer, [encodeAddress(to), encodeUint(amount)]);
}

/** transferFrom(from, to, amount) calldata. */
export function encodeTransferFrom(from: string, to: string, amount: bigint): string {
  return encodeCall(ERC20.transferFrom, [encodeAddress(from), encodeAddress(to), encodeUint(amount)]);
}
