/**
 * EIP-7702 delegation, ported from legacy `delDelegateSingle` (index.html
 * 43981–44097): auth hash = keccak256(0x05 || RLP([chainId, address, nonce])),
 * manual type-0x04 RLP transaction, gas limit 350000, initialize(bytes[])
 * calldata when the account is not initialized.
 */
import { concat, hexlify, keccak256, SigningKey } from 'ethers';

export const EIP7702_GAS_LIMIT = 350_000n;
export const INITIALIZE_SELECTOR = '0x6f2de70e';
export const DEL_EIP1559_CHAINS = [
  1, 5, 11155111, 17000, 10, 11155420, 42161, 421614, 8453, 84532, 137, 80002,
  43114, 43113, 42220, 1101, 59144, 534352, 534351, 81457, 5000, 169, 34443,
];

/** Legacy `delToHex`: empty for 0, otherwise minimal hex. */
export function toRlpHex(value: bigint | number): string {
  const v = BigInt(value);
  return v === 0n ? '0x' : `0x${v.toString(16)}`;
}

function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex === '0x') return new Uint8Array();
  let body = hex.replace(/^0x/i, '');
  if (body.length % 2) body = '0' + body;
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) return new Uint8Array([len + offset]);
  let h = len.toString(16);
  if (h.length % 2) h = '0' + h;
  const ll = h.length / 2;
  return new Uint8Array([offset + 55 + ll, ...hexToBytes(h)]);
}

function rlpEncodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0]! < 128) return bytes;
  return new Uint8Array([...encodeLength(bytes.length, 128), ...bytes]);
}

export type RlpInput = string | bigint | number | RlpInput[];

export function rlpEncode(input: RlpInput): Uint8Array {
  if (Array.isArray(input)) {
    const parts = input.map((item) => rlpEncode(item));
    const total = parts.reduce((acc, p) => acc + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return new Uint8Array([...encodeLength(out.length, 192), ...out]);
  }
  const bytes = typeof input === 'string' ? hexToBytes(input) : hexToBytes(toRlpHex(input));
  return rlpEncodeBytes(bytes);
}

export function rlpHex(input: RlpInput): string {
  return hexlify(rlpEncode(input));
}

export interface AuthorizationTuple {
  chainId: bigint;
  address: string;
  nonce: bigint;
}

export function authorizationHash(tuple: AuthorizationTuple): string {
  return keccak256(concat(['0x05', rlpHex([toRlpHex(tuple.chainId), tuple.address.toLowerCase(), toRlpHex(tuple.nonce)])]));
}

export interface SignedAuthorization {
  chainId: string;
  address: string;
  nonce: string;
  yParity: string;
  r: string;
  s: string;
}

export function signAuthorization(
  privateKey: string,
  tuple: AuthorizationTuple,
): SignedAuthorization {
  const sig = new SigningKey(privateKey).sign(authorizationHash(tuple));
  return {
    chainId: toRlpHex(tuple.chainId),
    address: tuple.address.toLowerCase(),
    nonce: toRlpHex(tuple.nonce),
    yParity: toRlpHex(sig.yParity),
    r: sig.r,
    s: sig.s,
  };
}

export function initializeCalldata(ownerAddress: string): string {
  const owner = ownerAddress.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(owner)) throw new Error('Invalid owner address');
  const word = (value: bigint) => value.toString(16).padStart(64, '0');
  // initialize(bytes[]): offset(0x20) | array len 1 | elem offset 0x20 | bytes len 32 | owner
  return INITIALIZE_SELECTOR + word(32n) + word(1n) + word(32n) + word(32n) + owner.padStart(64, '0');
}

export interface DelegationFees {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
}

/** Legacy fee derivation: +5% on base, priority 5% floor 1 gwei; fallback 1.1 gwei. */
export function delegationFees(
  chainId: number,
  input: { baseFee?: bigint | null; gasPrice?: bigint | null; eip1559Chains?: number[] },
): DelegationFees {
  const eip1559 = (input.eip1559Chains ?? DEL_EIP1559_CHAINS).includes(chainId);
  if (eip1559 && input.baseFee && input.baseFee > 0n) {
    const base = input.baseFee;
    let maxPriority = (base * 5n) / 100n;
    if (maxPriority < 1_000_000n) maxPriority = 1_000_000n;
    let maxFee = (base * 105n) / 100n;
    if (maxFee < maxPriority) maxFee = maxPriority;
    return { maxPriorityFeePerGas: maxPriority, maxFeePerGas: maxFee };
  }
  if (input.gasPrice && input.gasPrice > 0n) {
    let maxPriority = (input.gasPrice * 5n) / 100n;
    if (maxPriority < 1_000_000n) maxPriority = 1_000_000n;
    let maxFee = (input.gasPrice * 105n) / 100n;
    if (maxFee < maxPriority) maxFee = maxPriority;
    return { maxPriorityFeePerGas: maxPriority, maxFeePerGas: maxFee };
  }
  return { maxPriorityFeePerGas: 0n, maxFeePerGas: 1_100_000_000n };
}

export interface DelegationTxInput {
  privateKey: string;
  chainId: number;
  nonce: bigint;
  delegationAddress: string;
  ownerAddress: string;
  fees: DelegationFees;
  /** False when nextOwnerIndex() is 0; true skips initialize calldata. */
  alreadyInitialized: boolean;
  extraData?: string;
  gasLimit?: bigint;
}

export interface DelegationTx {
  authorization: SignedAuthorization;
  rawTransaction: string;
  hash: string;
}

export function buildDelegationTransaction(input: DelegationTxInput): DelegationTx {
  const authTuple: AuthorizationTuple = {
    chainId: BigInt(input.chainId),
    address: input.delegationAddress,
    // Legacy auth nonce is the post-transaction nonce (nonce + 1).
    nonce: input.nonce + 1n,
  };
  const authorization = signAuthorization(input.privateKey, authTuple);

  const data = input.extraData && input.extraData !== '0x'
    ? input.extraData
    : input.alreadyInitialized
      ? '0x'
      : initializeCalldata(input.ownerAddress);

  const authList: RlpInput[] = [[
    authorization.chainId,
    authorization.address,
    authorization.nonce,
    authorization.yParity,
    authorization.r,
    authorization.s,
  ]];

  const fields: RlpInput[] = [
    toRlpHex(input.chainId),
    toRlpHex(input.nonce),
    toRlpHex(input.fees.maxPriorityFeePerGas),
    toRlpHex(input.fees.maxFeePerGas),
    toRlpHex(input.gasLimit ?? EIP7702_GAS_LIMIT),
    input.ownerAddress.toLowerCase(),
    '0x',
    data,
    [],
    authList,
  ];

  const signingHash = keccak256(concat(['0x04', rlpHex(fields)]));
  const sig = new SigningKey(input.privateKey).sign(signingHash);
  const signedFields: RlpInput[] = [...fields, toRlpHex(sig.yParity), sig.r, sig.s];
  const rawTransaction = '0x04' + rlpHex(signedFields).slice(2);
  return { authorization, rawTransaction, hash: keccak256(rawTransaction) };
}

/** Delegation designator check: bytecode starts with 0xef0100. */
export function isDelegatedCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.toLowerCase().startsWith('0xef0100');
}

export function delegatedTarget(code: string): string | null {
  if (!isDelegatedCode(code)) return null;
  const body = code.slice(8, 48);
  return body.length === 40 ? `0x${body}` : null;
}
