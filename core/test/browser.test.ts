import { describe, expect, it, jest } from '@jest/globals';
import {
  Eip1193Provider,
  ProviderRpcError,
  parseChainId,
  parseInjectedMessage,
  validateChain,
  type ChainInfo,
  type WalletBackend,
} from '../src/browser/index.js';

const ADDR = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

function makeBackend(overrides: Partial<WalletBackend> = {}): WalletBackend {
  return {
    getAccounts: jest.fn(async () => [ADDR]),
    getChainId: jest.fn(async () => 1),
    requestAccounts: jest.fn(async () => [ADDR]),
    signMessage: jest.fn(async () => '0xsig'),
    signTypedData: jest.fn(async () => '0xtyped'),
    signTransaction: jest.fn(async () => '0xraw'),
    sendTransaction: jest.fn(async () => '0xhash'),
    switchChain: jest.fn(async () => {}),
    addChain: jest.fn(async () => {}),
    watchAsset: jest.fn(async () => true),
    rpcRequest: jest.fn(async () => '0x1'),
    ...overrides,
  } as WalletBackend;
}

describe('Eip1193Provider', () => {
  it('hides accounts until the origin is connected', async () => {
    const p = new Eip1193Provider(makeBackend(), { origin: 'https://dapp.test' });
    expect(p.isConnected()).toBe(false);
    expect(await p.request({ method: 'eth_accounts' })).toEqual([]);
    expect(await p.request({ method: 'eth_chainId' })).toBe('0x1');
  });

  it('connects on eth_requestAccounts and fires events once', async () => {
    const backend = makeBackend();
    const p = new Eip1193Provider(backend, { origin: 'https://dapp.test' });
    const accountsChanged = jest.fn();
    const connect = jest.fn();
    p.on('accountsChanged', accountsChanged);
    p.on('connect', connect);

    const accounts = await p.request({ method: 'eth_requestAccounts' });
    expect(accounts).toEqual([ADDR]);
    expect(p.isConnected()).toBe(true);
    expect(backend.requestAccounts).toHaveBeenCalledWith('https://dapp.test');
    expect(connect).toHaveBeenCalledWith({ chainId: '0x1' });
    expect(accountsChanged).toHaveBeenCalledWith([ADDR]);
    expect(await p.request({ method: 'eth_accounts' })).toEqual([ADDR]);
  });

  it('maps an empty account grant to 4001 and stays disconnected', async () => {
    const p = new Eip1193Provider(makeBackend({ requestAccounts: async () => [] }), { origin: 'https://dapp.test' });
    await expect(p.request({ method: 'eth_requestAccounts' })).rejects.toMatchObject({ code: 4001 });
    expect(p.isConnected()).toBe(false);
  });

  it('rejects methods outside the allowlist with 4200', async () => {
    const p = new Eip1193Provider(makeBackend(), { origin: 'https://dapp.test', connected: true });
    await expect(p.request({ method: 'eth_signTypedData_v3' })).rejects.toMatchObject({ code: 4200 });
  });

  it('blocks wallet methods for a disconnected origin with 4900', async () => {
    const p = new Eip1193Provider(makeBackend(), { origin: 'https://dapp.test' });
    await expect(p.request({ method: 'personal_sign', params: ['0x00', ADDR] })).rejects.toMatchObject({ code: 4900 });
  });

  it('switches chains and emits chainChanged as hex', async () => {
    const backend = makeBackend();
    const p = new Eip1193Provider(backend, { origin: 'https://dapp.test', connected: true });
    const changed = jest.fn();
    p.on('chainChanged', changed);
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa4b1' }] });
    expect(backend.switchChain).toHaveBeenCalledWith('https://dapp.test', 42161);
    expect(changed).toHaveBeenCalledWith('0xa4b1');
  });

  it('rejects a chain proposal with http RPC urls', async () => {
    const chain: ChainInfo = {
      chainId: '0x89',
      chainName: 'Polygon',
      nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
      rpcUrls: ['http://insecure.example'],
    };
    const p = new Eip1193Provider(makeBackend(), { origin: 'https://dapp.test', connected: true });
    await expect(p.request({ method: 'wallet_addEthereumChain', params: [chain] })).rejects.toMatchObject({ code: -32602 });
    expect(() => validateChain(chain)).toThrow(ProviderRpcError);
  });

  it('signs messages, decoding 0x-prefixed payloads to utf8', async () => {
    const backend = makeBackend();
    const p = new Eip1193Provider(backend, { origin: 'https://dapp.test', connected: true });
    await p.request({ method: 'personal_sign', params: ['0x68656c6c6f', ADDR] });
    expect(backend.signMessage).toHaveBeenCalledWith('https://dapp.test', ADDR, 'hello');
    await p.request({ method: 'eth_sign', params: [ADDR, 'plain'] });
    expect(backend.signMessage).toHaveBeenLastCalledWith('https://dapp.test', ADDR, 'plain');
  });

  it('parses typed data JSON before signing', async () => {
    const backend = makeBackend();
    const p = new Eip1193Provider(backend, { origin: 'https://dapp.test', connected: true });
    const typed = { domain: {}, types: {}, primaryType: 'Mail', message: {} };
    await p.request({ method: 'eth_signTypedData_v4', params: [ADDR, JSON.stringify(typed)] });
    expect(backend.signTypedData).toHaveBeenCalledWith('https://dapp.test', ADDR, typed);
    await expect(p.request({ method: 'eth_signTypedData_v4', params: [ADDR, '{bad'] })).rejects.toMatchObject({ code: -32602 });
  });

  it('validates transactions before reaching the backend', async () => {
    const backend = makeBackend();
    const p = new Eip1193Provider(backend, { origin: 'https://dapp.test', connected: true });
    const hash = await p.request({
      method: 'eth_sendTransaction',
      params: [{ from: ADDR, to: OTHER, value: '0x1' }],
    });
    expect(hash).toBe('0xhash');
    expect(backend.sendTransaction).toHaveBeenCalledTimes(1);

    await expect(
      p.request({ method: 'eth_sendTransaction', params: [{ from: ADDR, to: '0x1234' }] }),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      p.request({ method: 'eth_sendTransaction', params: [{ from: 'nope', to: OTHER }] }),
    ).rejects.toMatchObject({ code: -32602 });
    await expect(
      p.request({ method: 'eth_sendTransaction', params: [{ from: ADDR, to: OTHER, data: 'zz' }] }),
    ).rejects.toMatchObject({ code: -32602 });
    expect(backend.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('converts backend rejections into 4001 and other failures into -32603', async () => {
    const reject = new Eip1193Provider(
      makeBackend({ sendTransaction: async () => { throw new Error('User rejected the request'); } }),
      { origin: 'https://dapp.test', connected: true },
    );
    await expect(reject.request({ method: 'eth_sendTransaction', params: [{ from: ADDR, to: OTHER }] })).rejects.toMatchObject({
      code: 4001,
    });

    const boom = new Eip1193Provider(
      makeBackend({ sendTransaction: async () => { throw new Error('node exploded'); } }),
      { origin: 'https://dapp.test', connected: true },
    );
    await expect(boom.request({ method: 'eth_sendTransaction', params: [{ from: ADDR, to: OTHER }] })).rejects.toMatchObject({
      code: -32603,
    });
  });

  it('passes unknown read-only methods to rpcRequest and disconnects', async () => {
    const backend = makeBackend({ rpcRequest: jest.fn(async () => '0xabc') });
    const p = new Eip1193Provider(backend, {
      origin: 'https://dapp.test',
      connected: true,
      allowedMethods: [...['eth_getLogs', 'eth_feeHistory', 'personal_sign']],
    });
    expect(await p.request({ method: 'eth_feeHistory', params: [4, 'latest', []] })).toBe('0xabc');
    expect(backend.rpcRequest).toHaveBeenCalledWith('eth_feeHistory', [4, 'latest', []]);

    const gone = jest.fn();
    p.on('disconnect', gone);
    p.disconnect();
    expect(p.isConnected()).toBe(false);
    expect(gone).toHaveBeenCalled();
    await expect(p.request({ method: 'personal_sign', params: ['0x00', ADDR] })).rejects.toMatchObject({ code: 4900 });
  });
});

describe('provider helpers', () => {
  it('parses decimal and hex chain ids and rejects junk', () => {
    expect(parseChainId(1)).toBe(1);
    expect(parseChainId('0x38')).toBe(56);
    expect(parseChainId('8453')).toBe(8453);
    expect(() => parseChainId('0xzz')).toThrow(ProviderRpcError);
    expect(() => parseChainId(0)).toThrow(ProviderRpcError);
  });

  it('parses injected page messages', () => {
    expect(parseInjectedMessage('{"id":7,"method":"eth_chainId","params":[]}')).toEqual({
      id: 7,
      method: 'eth_chainId',
      params: [],
    });
    expect(parseInjectedMessage('{"method":"x"}')).toBeNull();
    expect(parseInjectedMessage('not json')).toBeNull();
  });
});
