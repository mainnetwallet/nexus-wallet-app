/**
 * Exchange request signing ported from the legacy adapters (index.html
 * 86257–86668). Each scheme returns a ready-to-send request; the caller only
 * needs a fetch implementation. No secret is logged.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { encodeBase64, decodeBase64 } from 'ethers';
import type { ExchangeConfig, ExchangeCredentials } from './config.js';

const enc = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type CHash = Parameters<typeof hmac>[0];

function hmacHex(algo: CHash, secret: string | Uint8Array, message: string | Uint8Array): string {
  const key = typeof secret === 'string' ? enc.encode(secret) : secret;
  const msg = typeof message === 'string' ? enc.encode(message) : message;
  return bytesToHex(hmac(algo, key, msg));
}

function hmacB64(algo: CHash, secret: string | Uint8Array, message: string | Uint8Array): string {
  const key = typeof secret === 'string' ? enc.encode(secret) : secret;
  const msg = typeof message === 'string' ? enc.encode(message) : message;
  return encodeBase64(hmac(algo, key, msg));
}

function base64Secret(secret: string): Uint8Array {
  return decodeBase64(secret);
}

function qs(params: Record<string, string | number>, encodeValues = true): string {
  return Object.keys(params)
    .map((k) => `${k}=${encodeValues ? encodeURIComponent(String(params[k])) : String(params[k])}`)
    .join('&');
}

export interface SignedRequestInput {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
  path: string;
  params?: Record<string, string | number>;
  body?: Record<string, unknown>;
  /** Milliseconds; injected for deterministic tests. */
  now?: number;
  /** Kraken/Bitfinex nonce seed, injected for tests. */
  nonceSeed?: number;
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export function signRequest(
  config: ExchangeConfig,
  creds: ExchangeCredentials,
  input: SignedRequestInput,
): SignedRequest {
  const method = input.method ?? 'GET';
  const params = { ...(input.params ?? {}) };
  const now = input.now ?? Date.now();
  const base = config.baseUrl;
  const isGet = method === 'GET' || method === 'DELETE';
  const bodyStr = input.body ? JSON.stringify(input.body) : '';

  switch (config.sign) {
    case 'binance':
    case 'mexc': {
      const p = { ...params, timestamp: now, recvWindow: 10000 };
      const query = qs(p);
      const sig = hmacHex(sha256, creds.secret, query);
      const header = config.sign === 'binance' ? 'X-MBX-APIKEY' : 'X-MEXC-APIKEY';
      return { url: `${base}${input.path}?${query}&signature=${sig}`, method, headers: { [header]: creds.apiKey }, body: input.body ? bodyStr : undefined };
    }

    case 'bingx': {
      const p = { ...params, timestamp: now };
      const query = qs(p);
      const sig = hmacHex(sha256, creds.secret, query);
      return {
        url: `${base}${input.path}?${query}&signature=${sig}`,
        method,
        headers: { 'X-BX-APIKEY': creds.apiKey, 'Content-Type': 'application/json' },
        body: isGet ? undefined : bodyStr,
      };
    }

    case 'kucoin': {
      const query = isGet ? qs(params) : '';
      const path = input.path + (query ? `?${query}` : '');
      const strToSign = `${now}${method}${input.path}${query ? `?${query}` : ''}${bodyStr}`;
      const sig = hmacB64(sha256, creds.secret, strToSign);
      const ppSig = hmacB64(sha256, creds.secret, creds.passphrase ?? '');
      return {
        url: `${base}${path}`,
        method,
        headers: {
          'KC-API-KEY': creds.apiKey,
          'KC-API-SIGN': sig,
          'KC-API-TIMESTAMP': String(now),
          'KC-API-PASSPHRASE': ppSig,
          'KC-API-KEY-VERSION': '2',
          'Content-Type': 'application/json',
        },
        body: bodyStr || undefined,
      };
    }

    case 'bybit': {
      const query = isGet
        ? Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')
        : '';
      const payload = isGet ? query : bodyStr;
      const sig = hmacHex(sha256, creds.secret, `${now}${creds.apiKey}5000${payload}`);
      return {
        url: `${base}${input.path}${query ? `?${query}` : ''}`,
        method,
        headers: {
          'X-BAPI-API-KEY': creds.apiKey,
          'X-BAPI-SIGN': sig,
          'X-BAPI-TIMESTAMP': String(now),
          'X-BAPI-RECV-WINDOW': '5000',
          'Content-Type': 'application/json',
        },
        body: isGet ? undefined : bodyStr,
      };
    }

    case 'bitmart': {
      const query = isGet ? qs(params) : '';
      const payload = isGet ? query : bodyStr;
      const sig = hmacHex(sha256, creds.secret, `${now}#${creds.passphrase ?? ''}#${payload}`);
      return {
        url: `${base}${input.path}${query ? `?${query}` : ''}`,
        method,
        headers: { 'X-BM-KEY': creds.apiKey, 'X-BM-SIGN': sig, 'X-BM-TIMESTAMP': String(now), 'Content-Type': 'application/json' },
        body: isGet ? undefined : bodyStr,
      };
    }

    case 'bitget': {
      const query = isGet ? qs(params) : '';
      const path = input.path + (query ? `?${query}` : '');
      const sig = hmacB64(sha256, creds.secret, `${now}${method}${path}${bodyStr}`);
      return {
        url: `${base}${path}`,
        method,
        headers: {
          'ACCESS-KEY': creds.apiKey,
          'ACCESS-SIGN': sig,
          'ACCESS-TIMESTAMP': String(now),
          'ACCESS-PASSPHRASE': creds.passphrase ?? '',
          'Content-Type': 'application/json',
        },
        body: isGet ? undefined : bodyStr,
      };
    }

    case 'kraken': {
      const nonce = String(now * 1000 + ((input.nonceSeed ?? 0) % 1000));
      const p = { ...params, nonce };
      const postdata = qs(p);
      const digest = sha256(enc.encode(nonce + postdata));
      const pathBytes = enc.encode(input.path);
      const combined = new Uint8Array(pathBytes.length + digest.length);
      combined.set(pathBytes, 0);
      combined.set(digest, pathBytes.length);
      const sig = hmacB64(sha512, base64Secret(creds.secret), combined);
      return {
        url: `${base}${input.path}`,
        method: 'POST',
        headers: { 'API-Key': creds.apiKey, 'API-Sign': sig, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postdata,
      };
    }

    case 'gateio': {
      const query = isGet ? qs(params) : '';
      const bodyHash = bytesToHex(sha512(enc.encode(bodyStr)));
      const ts = Math.floor(now / 1000).toString();
      const sig = hmacHex(sha512, creds.secret, `${method}\n${input.path}\n${query}\n${bodyHash}\n${ts}`);
      return {
        url: `${base}${input.path}${query ? `?${query}` : ''}`,
        method,
        headers: { KEY: creds.apiKey, SIGN: sig, Timestamp: ts, 'Content-Type': 'application/json' },
        body: isGet ? undefined : bodyStr,
      };
    }

    case 'coinbase': {
      const query = isGet ? qs(params) : '';
      const ts = Math.floor(now / 1000).toString();
      const sig = hmacB64(sha256, base64Secret(creds.secret), `${ts}${method}${input.path}${query ? `?${query}` : ''}${isGet ? '' : bodyStr}`);
      return {
        url: `${base}${input.path}${query ? `?${query}` : ''}`,
        method,
        headers: {
          'CB-ACCESS-KEY': creds.apiKey,
          'CB-ACCESS-SIGN': sig,
          'CB-ACCESS-TIMESTAMP': ts,
          'CB-ACCESS-PASSPHRASE': creds.passphrase ?? '',
          'Content-Type': 'application/json',
        },
        body: isGet ? undefined : bodyStr || undefined,
      };
    }

    case 'htx': {
      const ts = new Date(now).toISOString().slice(0, 19);
      const all = {
        ...params,
        AccessKeyId: creds.apiKey,
        SignatureMethod: 'HmacSHA256',
        SignatureVersion: '2',
        Timestamp: ts,
      };
      const host = base.replace(/^https?:\/\//, '');
      const sorted = Object.keys(all).sort();
      const map = all as Record<string, string | number>;
      const query = sorted.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(map[k] ?? ''))}`).join('&');
      const sig = hmacB64(sha256, creds.secret, `${method}\n${host}\n${input.path}\n${query}`);
      return {
        url: `${base}${input.path}?${query}&Signature=${encodeURIComponent(sig)}`,
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? bodyStr : undefined,
      };
    }

    case 'phemex': {
      const query = isGet ? qs(params) : '';
      const expiry = Math.floor(now / 1000) + 60;
      const sig = hmacHex(sha256, creds.secret, `${input.path}${query}${expiry}${isGet ? '' : bodyStr}`);
      return {
        url: `${base}${input.path}${query ? `?${query}` : ''}`,
        method,
        headers: {
          'x-phemex-access-token': creds.apiKey,
          'x-phemex-request-signature': sig,
          'x-phemex-request-expiry': String(expiry),
          'Content-Type': 'application/json',
        },
        body: isGet ? undefined : bodyStr,
      };
    }

    case 'digifinex': {
      const query = qs(params);
      const ts = Math.floor(now / 1000).toString();
      const sig = hmacHex(sha256, creds.secret, query);
      return {
        url: `${base}${input.path}${query ? `?${query}` : ''}`,
        method,
        headers: {
          'ACCESS-KEY': creds.apiKey,
          'ACCESS-SIGN': sig,
          'ACCESS-TIMESTAMP': ts,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: isGet ? undefined : query,
      };
    }

    case 'lbank':
      // LBank requires MD5(qs) before HMAC-SHA256; no MD5 in the audited noble
      // build. Listed as PARTIAL rather than shipping an untested digest.
      throw new Error('LBank signing is not enabled in this build');

    case 'bitfinex': {
      const nonce = String(now * 1000 + ((input.nonceSeed ?? 0) % 1000));
      const sig = hmacHex(sha384, creds.secret, `/api/${input.path}${nonce}${bodyStr}`);
      return {
        url: `${base}${input.path}`,
        method: 'POST',
        headers: { 'bfx-apikey': creds.apiKey, 'bfx-nonce': nonce, 'bfx-signature': sig, 'Content-Type': 'application/json' },
        body: bodyStr,
      };
    }
  }
}
