import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createProxyServer } from '../src/server.mjs';
import { hostAllowed } from '../src/providers.mjs';

const NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function withServer({ env = {}, handler = () => jsonResponse({ ok: true }) } = {}, fn) {
  const fetchImpl = mockFetch(handler);
  const server = createProxyServer({ env, fetchImpl, now: () => NOW });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn({ port, fetchImpl });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function forward(port, payload) {
  return fetch(`http://127.0.0.1:${port}/v1/forward`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

test('health reports ok and provider readiness without values', async () => {
  await withServer({ env: { LIFI_API_KEY: 'test-lifi' } }, async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.providers.lifi, true);
    assert.equal(body.providers.odos, false);
    assert.equal(JSON.stringify(body).includes('test-lifi'), false);
  });
});

test('rejects unknown providers and unknown routes', async () => {
  await withServer({}, async ({ port }) => {
    const res = await forward(port, { provider: 'evil', url: 'https://li.quest/v1/quote' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'unknown_provider');

    const missing = await fetch(`http://127.0.0.1:${port}/v1/nope`);
    assert.equal(missing.status, 404);
  });
});

test('rejects non-POST and non-https and off-allowlist hosts', async () => {
  await withServer({}, async ({ port }) => {
    const get = await fetch(`http://127.0.0.1:${port}/v1/forward`);
    assert.equal(get.status, 405);

    const httpUrl = await forward(port, { provider: 'lifi', url: 'http://li.quest/v1/quote' });
    assert.equal(httpUrl.status, 400);

    const offHost = await forward(port, { provider: 'lifi', url: 'https://evil.example/steal' });
    assert.equal(offHost.status, 403);
    const offBody = await offHost.text();
    assert.equal(offBody.includes('evil.example'), false);

    const creds = await forward(port, { provider: 'lifi', url: 'https://user:pass@li.quest/v1/quote' });
    assert.equal(creds.status, 400);
  });
});

test('host allowlist accepts exact hosts and subdomains only', () => {
  assert.equal(hostAllowed('lifi', 'li.quest'), true);
  assert.equal(hostAllowed('lifi', 'api.li.quest'), true);
  assert.equal(hostAllowed('lifi', 'li.quest.evil.com'), false);
  assert.equal(hostAllowed('odos', 'api.odos.xyz'), true);
  assert.equal(hostAllowed('odos', 'odos.xyz'), false);
  assert.equal(hostAllowed('nope', 'li.quest'), false);
});

test('injects lifi key and strips client credential headers', async () => {
  await withServer({ env: { LIFI_API_KEY: 'test-lifi' } }, async ({ port, fetchImpl }) => {
    const res = await forward(port, {
      provider: 'lifi',
      url: 'https://li.quest/v1/quote?fromChain=1',
      headers: { accept: 'application/json', authorization: 'Bearer client-secret', 'x-api-key': 'client-key' },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 200, body: { ok: true } });
    const [call] = fetchImpl.calls;
    assert.equal(call.url, 'https://li.quest/v1/quote?fromChain=1');
    assert.equal(call.init.headers['x-lifi-api-key'], 'test-lifi');
    assert.equal(call.init.headers.authorization, undefined);
    assert.equal(call.init.headers['x-api-key'], undefined);
    assert.equal(call.init.redirect, 'manual');
  });
});

test('injects oneInch bearer and squid integrator id', async () => {
  const env = { ONEINCH_API_KEY: 'test-1inch', SQUID_INTEGRATOR_ID: 'test-squid' };
  await withServer({ env }, async ({ port, fetchImpl }) => {
    await forward(port, { provider: 'oneInch', url: 'https://api.1inch.dev/swap/v6.0/1/quote?src=a' });
    await forward(port, { provider: 'squid', url: 'https://v2.api.squidrouter.com/v2/route', method: 'POST', body: { fromChain: '1' } });
    const [oneInch, squid] = fetchImpl.calls;
    assert.equal(oneInch.init.headers.authorization, 'Bearer test-1inch');
    assert.equal(squid.init.headers['x-integrator-id'], 'test-squid');
    assert.equal(squid.init.headers['content-type'], 'application/json');
    assert.equal(squid.init.body, JSON.stringify({ fromChain: '1' }));
  });
});

test('adds Nansen apiKey header and merges query without duplicating URL params', async () => {
  await withServer({ env: { NANSEN_API_KEY: 'test-nansen' } }, async ({ port, fetchImpl }) => {
    const res = await forward(port, {
      provider: 'nansen',
      url: 'https://api.nansen.ai/api/v1/token/flow?chain=ethereum&token=0xabc',
      method: 'GET',
      headers: {},
      query: { chain: 'ethereum', token: '0xabc' },
    });
    assert.equal(res.status, 200);
    const [call] = fetchImpl.calls;
    assert.equal(call.init.headers.apiKey, 'test-nansen');
    assert.equal(call.url, 'https://api.nansen.ai/api/v1/token/flow?chain=ethereum&token=0xabc');
  });
});

test('adds rango and dodo keys as query parameters, not headers', async () => {
  await withServer({ env: { RANGO_API_KEY: 'test-rango', DODO_API_KEY: 'test-dodo' } }, async ({ port, fetchImpl }) => {
    await forward(port, { provider: 'rango', url: 'https://api.rango.exchange/routing/bests?limit=20', method: 'POST', body: {} });
    await forward(port, { provider: 'dodo', url: 'https://api.dodoex.io/route-service/developer/swap?chainId=1' });
    const [rango, dodo] = fetchImpl.calls;
    assert.match(rango.url, /[?&]apiKey=test-rango/);
    assert.match(dodo.url, /[?&]apikey=test-dodo/);
    assert.equal(rango.init.headers.apiKey, undefined);
    assert.equal(dodo.init.headers.apikey, undefined);
  });
});

test('signs OKX requests with HMAC-SHA256 over timestamp+method+path', async () => {
  const env = { OKX_API_KEY: 'test-okx-key', OKX_SECRET_KEY: 'test-okx-secret', OKX_PASSPHRASE: 'test-okx-pass' };
  await withServer({ env }, async ({ port, fetchImpl }) => {
    const target = 'https://www.okx.com/api/v6/dex/aggregator/quote?chainIndex=1&baseAsset=0xabc';
    const res = await forward(port, { provider: 'okx', url: target, method: 'GET' });
    assert.equal(res.status, 200);
    const [call] = fetchImpl.calls;
    const url = new URL(call.url);
    const timestamp = call.init.headers['ok-access-timestamp'];
    assert.equal(timestamp, new Date(NOW).toISOString().replace(/\.\d{3}Z$/, '.000Z'));
    assert.equal(call.init.headers['ok-access-key'], 'test-okx-key');
    assert.equal(call.init.headers['ok-access-passphrase'], 'test-okx-pass');
    const expected = createHmac('sha256', 'test-okx-secret')
      .update(timestamp + 'GET' + url.pathname + url.search)
      .digest('base64');
    assert.equal(call.init.headers['ok-access-sign'], expected);
  });
});

test('returns upstream errors as an envelope and never leaks keys', async () => {
  const handler = () => jsonResponse({ error: 'boom' }, 500);
  await withServer({ env: { LIFI_API_KEY: 'test-lifi' }, handler }, async ({ port }) => {
    const res = await forward(port, { provider: 'lifi', url: 'https://li.quest/v1/quote' });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(JSON.parse(text).status, 500);
    assert.equal(text.includes('test-lifi'), false);
  });
});

test('returns text bodies and handles redirects without following', async () => {
  let mode = 'text';
  const handler = () => (mode === 'text'
    ? new Response('plain ok', { status: 200, headers: { 'content-type': 'text/plain' } })
    : new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));
  await withServer({ env: { LIFI_API_KEY: 'test-lifi' }, handler }, async ({ port, fetchImpl }) => {
    const textRes = await forward(port, { provider: 'lifi', url: 'https://li.quest/v1/quote' });
    assert.deepEqual(await textRes.json(), { status: 200, body: 'plain ok' });

    mode = 'redirect';
    const redirectRes = await forward(port, { provider: 'lifi', url: 'https://li.quest/v1/quote' });
    assert.deepEqual(await redirectRes.json(), { status: 302, body: '' });
    assert.equal(fetchImpl.calls[1].init.redirect, 'manual');
  });
});

test('refuses unconfigured required providers', async () => {
  await withServer({ env: {} }, async ({ port }) => {
    const res = await forward(port, { provider: 'odos', url: 'https://api.odos.xyz/sor/quote/v2', method: 'POST', body: {} });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'provider_not_configured');
    assert.equal(JSON.stringify(body).includes('ODOS_API_KEY'), false);
  });
});

test('enforces the request body limit', async () => {
  await withServer({ env: { PROXY_MAX_BODY_BYTES: '16' } }, async ({ port }) => {
    const res = await forward(port, { provider: 'lifi', url: 'https://li.quest/v1/quote', body: { padding: 'x'.repeat(64) } });
    assert.equal(res.status, 413);
  });
});

test('rejects malformed JSON payloads', async () => {
  await withServer({}, async ({ port }) => {
    const res = await fetch(`http://127.0.0.1:${port}/v1/forward`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_json');
  });
});

test('maps upstream network failures to 502 without detail leakage', async () => {
  const handler = () => {
    throw new Error('connect ECONNREFUSED 10.0.0.1 with key test-lifi');
  };
  await withServer({ env: { LIFI_API_KEY: 'test-lifi' }, handler }, async ({ port }) => {
    const res = await forward(port, { provider: 'lifi', url: 'https://li.quest/v1/quote' });
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.equal(text.includes('test-lifi'), false);
    assert.equal(text.includes('ECONNREFUSED'), false);
  });
});
