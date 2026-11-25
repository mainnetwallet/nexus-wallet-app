import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  FORWARDED_REQUEST_HEADERS,
  PROVIDER_IDS,
  ProxyError,
  injectCredentials,
  validateTargetUrl,
} from './providers.mjs';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MAX_BODY = 256 * 1024;
const DEFAULT_MAX_RESPONSE = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const ALLOWED_METHODS = new Set(['GET', 'POST']);

function readEnvInt(env, name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      total += chunk.length;
      if (total > limit) {
        failed = true;
        reject(new ProxyError(413, 'body_too_large', 'Request body is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!failed) {
        failed = true;
        reject(err);
      }
    });
  });
}

function normalizeHeaders(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [name, value] of Object.entries(input)) {
    if (typeof value !== 'string') continue;
    const key = name.toLowerCase();
    if (!FORWARDED_REQUEST_HEADERS.includes(key)) continue;
    out[key] = value;
  }
  if (!out.accept) out.accept = 'application/json';
  return out;
}

function applyQuery(url, query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (url.searchParams.has(key)) continue;
    url.searchParams.set(key, String(value));
  }
}

function parsePayload(buffer) {
  let payload;
  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new ProxyError(400, 'invalid_json', 'Request body must be JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ProxyError(400, 'invalid_payload', 'Request body must be a JSON object.');
  }
  const { provider, url, method = 'GET', headers, body, query } = payload;
  if (typeof provider !== 'string' || !PROVIDER_IDS.includes(provider)) {
    throw new ProxyError(400, 'unknown_provider', 'Unknown provider.');
  }
  if (typeof url !== 'string' || url === '') {
    throw new ProxyError(400, 'invalid_url', 'A target URL is required.');
  }
  if (typeof method !== 'string' || !ALLOWED_METHODS.has(method.toUpperCase())) {
    throw new ProxyError(405, 'invalid_method', 'Only GET and POST are forwarded.');
  }
  return { provider, url, method: method.toUpperCase(), headers, body, query };
}

async function decodeUpstream(response, maxResponseBytes) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const text = await response.text();
  if (Buffer.byteLength(text) > maxResponseBytes) {
    throw new ProxyError(502, 'upstream_too_large', 'Upstream response exceeded the size limit.');
  }
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

export function createProxyServer(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now;
  const maxBody = readEnvInt(env, 'PROXY_MAX_BODY_BYTES', DEFAULT_MAX_BODY);
  const maxResponse = readEnvInt(env, 'PROXY_MAX_RESPONSE_BYTES', DEFAULT_MAX_RESPONSE);
  const timeoutMs = readEnvInt(env, 'UPSTREAM_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const allowOrigin = env.PROXY_ALLOW_ORIGIN || '';

  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required.');
  }

  const corsHeaders = allowOrigin ? { 'access-control-allow-origin': allowOrigin } : {};

  const handler = async (req, res) => {
    const method = (req.method || 'GET').toUpperCase();

    if (allowOrigin) {
      res.setHeader('access-control-allow-origin', allowOrigin);
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    }

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (req.url === '/health' && method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        providers: Object.fromEntries(PROVIDER_IDS.map((id) => [id, providerConfigured(env, id)])),
      }, corsHeaders);
      return;
    }

    if (req.url !== '/v1/forward') {
      sendJson(res, 404, { error: 'not_found', message: 'Not found.' }, corsHeaders);
      return;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { error: 'invalid_method', message: 'Use POST.' }, { ...corsHeaders, allow: 'POST' });
      return;
    }

    let provider = 'unknown';
    try {
      const raw = await readBody(req, maxBody);
      const payload = parsePayload(raw);
      provider = payload.provider;

      const url = validateTargetUrl(payload.provider, payload.url);
      applyQuery(url, payload.query);

      const headers = normalizeHeaders(payload.headers);
      injectCredentials({ provider: payload.provider, env, url, headers, method: payload.method, now });

      let upstreamBody;
      if (payload.method !== 'GET' && payload.body !== undefined && payload.body !== null) {
        upstreamBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body);
        if (!headers['content-type']) headers['content-type'] = 'application/json';
      }

      const response = await fetchImpl(url.toString(), {
        method: payload.method,
        headers,
        body: upstreamBody,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });

      const body = response.status === 304 ? '' : await decodeUpstream(response, maxResponse);
      sendJson(res, 200, { status: response.status, body }, corsHeaders);
      console.log(`[proxy] ${provider} ${payload.method} -> ${response.status}`);
    } catch (err) {
      if (err instanceof ProxyError) {
        const headers = err.status === 413 ? { ...corsHeaders, connection: 'close' } : corsHeaders;
        sendJson(res, err.status, { error: err.code, message: err.message }, headers);
        if (err.status === 413) res.once('finish', () => req.destroy());
        console.log(`[proxy] ${provider} error ${err.status} ${err.code}`);
        return;
      }
      sendJson(res, 502, { error: 'upstream_unreachable', message: 'Upstream request failed.' }, corsHeaders);
      console.log(`[proxy] ${provider} error 502 upstream_unreachable`);
    }
  };

  return http.createServer((req, res) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error', message: 'Internal proxy error.' }, corsHeaders);
      } else {
        res.end();
      }
    });
  });
}

function providerConfigured(env, id) {
  const names = {
    lifi: ['LIFI_API_KEY'],
    odos: ['ODOS_API_KEY'],
    oneInch: ['ONEINCH_API_KEY'],
    enso: ['ENSO_API_KEY'],
    rango: ['RANGO_API_KEY'],
    squid: ['SQUID_INTEGRATOR_ID'],
    dodo: ['DODO_API_KEY'],
    nansen: ['NANSEN_API_KEY'],
    okx: ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'],
  }[id] ?? [];
  return names.every((name) => typeof env[name] === 'string' && env[name].trim() !== '');
}

export function startFromEnv(env = process.env) {
  const host = env.PROXY_HOST || DEFAULT_HOST;
  const port = readEnvInt(env, 'PROXY_PORT', DEFAULT_PORT);
  const server = createProxyServer({ env });
  server.listen(port, host, () => {
    const configured = PROVIDER_IDS.filter((id) => providerConfigured(env, id));
    console.log(`[proxy] listening on http://${host}:${port}`);
    console.log(`[proxy] configured providers: ${configured.length ? configured.join(', ') : 'none'}`);
  });
  return server;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  startFromEnv();
}
