import { describe, expect, it } from '@jest/globals';
import {
  parseRecipients, buildBatchNative, buildBatchToken, batchTotals,
  buildMultiKeyTransfers, summarizeMultiKey,
  buildWalletToWallet, buildSelfTransfers,
  buildNftTransfer, buildNftDistribute,
  classifyAllowance, buildRevokeErc20, buildRevokeErc721, ERC721_APPROVAL,
  buildWithdrawals, splitRemainder,
  parseAddressList,
} from '../src/transfer/index.js';
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const TOKEN = '0x4444444444444444444444444444444444444444';

describe('transfer recipient parsing', () => {
  it('parses comma/space forms, ignores comments, flags bad lines', () => {
    const { recipients, invalid } = parseRecipients(`# airdrop\n${A},1.5\n${B} 2\nnot-an-address,3\n${C},x`, { requireAmount: true });
    expect(recipients.map((r) => r.address)).toEqual([A, B]);
    expect(recipients.map((r) => r.amount)).toEqual(['1.5', '2']);
    expect(invalid.map((i) => i.line)).toEqual([4, 5]);
  });
});

describe('batch transfer', () => {
  it('builds native steps and totals', () => {
    const steps = buildBatchNative({ chainId: 8453, sender: A, recipientsText: `${B},0.5\n${C},0.25` });
    expect(steps).toHaveLength(2);
    expect(steps[0]!.value).toBe(500000000000000000n);
    expect(batchTotals(steps).formatted).toBe('0.75');
  });

  it('encodes ERC-20 transfer calldata', () => {
    const steps = buildBatchToken({
      chainId: 8453,
      sender: A,
      token: { address: TOKEN, decimals: 6, symbol: 'USDC' },
      recipientsText: `${B},1.5`,
    });
    expect(steps[0]!.to).toBe(TOKEN);
    expect(steps[0]!.value).toBe(0n);
    expect(steps[0]!.data.slice(0, 10)).toBe('0xa9059cbb');
    expect(steps[0]!.data).toContain(B.slice(2).padStart(64, '0'));
  });
});

describe('multi-key and wallet-to-wallet', () => {
  const keys = [
    { address: A, keyId: 'k1' },
    { address: B, keyId: 'k2' },
  ];

  it('builds one step per key and flags insufficient balances', () => {
    const steps = buildMultiKeyTransfers({ chainId: 8453, keys, recipient: C, amount: '0.1' });
    expect(steps).toHaveLength(2);
    const summary = summarizeMultiKey(steps, { [A.toLowerCase()]: 1n });
    expect(summary.insufficient).toEqual([A, B]);
    expect(summary.total).toBe(200000000000000000n);
  });

  it('sweeps balance minus reserve and skips empty wallets', () => {
    const steps = buildWalletToWallet({
      chainId: 8453,
      keys,
      destination: C,
      amount: '0',
      sweep: { balances: { [A.toLowerCase()]: 1000n, [B.toLowerCase()]: 10n }, reserveWei: 10n },
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.value).toBe(990n);
  });

  it('self transfer targets the sender address', () => {
    const steps = buildSelfTransfers({ chainId: 8453, keys, amount: '0.01' });
    expect(steps.map((s) => s.to)).toEqual([A, B]);
  });
});

describe('NFT transfer', () => {
  it('encodes ERC-721 safeTransferFrom', () => {
    const step = buildNftTransfer({ chainId: 8453, contract: TOKEN, standard: 'erc721', tokenId: '7', from: A, to: B });
    expect(step.data.slice(0, 10)).toBe('0x42842e0e');
    expect(step.data).toContain('7'.padStart(64, '0'));
  });

  it('encodes ERC-1155 safeTransferFrom with empty data', () => {
    const step = buildNftTransfer({
      chainId: 8453, contract: TOKEN, standard: 'erc1155', tokenId: '2', from: A, to: B, amount: '3',
    });
    expect(step.data.slice(0, 10)).toBe('0xf242432a');
    expect(step.data.endsWith('0'.repeat(62) + 'a0' + '0'.repeat(64))).toBe(true);
  });

  it('distributes to each recipient', () => {
    const steps = buildNftDistribute({
      chainId: 8453, contract: TOKEN, standard: 'erc721', tokenId: '1', sender: A, recipients: [B, C],
    });
    expect(steps.map((s) => s.from)).toEqual([A, A]);
  });
});

describe('approvals and withdrawal', () => {
  it('classifies unlimited allowances and builds revoke calls', () => {
    expect(classifyAllowance(2n ** 256n - 1n).unlimited).toBe(true);
    expect(classifyAllowance(100n).label).toBe('100');
    const erc20 = buildRevokeErc20({ chainId: 8453, owner: A, token: TOKEN, spender: B });
    expect(erc20.data.slice(0, 10)).toBe('0x095ea7b3');
    expect(erc20.data.endsWith('0'.repeat(64))).toBe(true);
    const nft = buildRevokeErc721({ chainId: 8453, owner: A, contract: TOKEN, operator: B });
    expect(nft.data.slice(0, 10)).toBe(ERC721_APPROVAL.setApprovalForAll);
  });

  it('splits a total across keys', () => {
    expect(splitRemainder(100n, 3)).toEqual({ perKey: 33n, remainder: 1n });
    const steps = buildWithdrawals({
      chainId: 8453,
      keys: [{ address: A, keyId: 'k1' }, { address: B, keyId: 'k2' }],
      destination: C,
      mode: 'split',
      amount: '1',
    });
    expect(steps.map((s) => s.value)).toEqual([500000000000000000n, 500000000000000000n]);
  });
});

describe('balance check helpers', () => {
  it('dedupes addresses and reports invalid tokens', () => {
    const { addresses, invalid } = parseAddressList(`${A}\n${B},${A}\nxyz`);
    expect(addresses).toEqual([A, B]);
    expect(invalid).toEqual(['xyz']);
  });
});
