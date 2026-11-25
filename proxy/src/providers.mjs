import { createHmac } from 'node:crypto';

export class ProxyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ProxyError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Upstream hosts a provider may reach. Exact host or a subdomain of a listed
 * base is accepted; everything else is rejected before a socket is opened.
 */
const HOSTS = Object.freeze({
  lifi: ['li.quest'],
  odos: ['api.odos.xyz'],
  oneInch: ['api.1inch.dev'],
  enso: ['api.enso.finance'],
  rango: ['api.rango.exchange'],
  squid: ['v2.api.squidrouter.com'],
  dodo: ['api.dodoex.io'],
  okx: ['www.okx.com'],
  nansen: ['api.nansen.ai'],
});

/** Client headers that are forwarded upstream. Everything else is dropped. */
export const FORWARDED_REQUEST_HEADERS = Object.freeze(['accept', 'content-type']);

export const PROVIDER_IDS = Object.freeze(Object.keys(HOSTS));

export function hostAllowed(provider, hostname) {
  const bases = HOSTS[provider];
  if (!bases) return false;
  const host = hostname.toLowerCase();
  return bases.some((base) => host === base || host.endsWith(`.${base}`));
}

function requireEnv(env, name) {
  const value = env[name];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function okxSign(secret, timestamp, method, path) {
  return createHmac('sha256', secret)
    .update(timestamp + method.toUpperCase() + path)
    .digest('base64');
}

/**
 * Provider table. `apply` mutates the upstream URL/headers in place and must
 * never copy a client-supplied credential (inbound credential headers are
 * stripped before this runs).
 */
const PROVIDERS = Object.freeze({
  lifi: {
    secretEnv: 'LIFI_API_KEY',
    required: false,
    apply({ key, headers }) {
      if (key) headers['x-lifi-api-key'] = key;
    },
  },
  odos: {
    secretEnv: 'ODOS_API_KEY',
    required: true,
    apply({ key, headers }) {
      headers['x-api-key'] = key;
    },
  },
  oneInch: {
    secretEnv: 'ONEINCH_API_KEY',
    required: true,
    apply({ key, headers }) {
      headers.authorization = `Bearer ${key}`;
    },
  },
  enso: {
    secretEnv: 'ENSO_API_KEY',
    required: true,
    apply({ key, headers }) {
      headers.authorization = `Bearer ${key}`;
    },
  },
  rango: {
    secretEnv: 'RANGO_API_KEY',
    required: false,
    apply({ key, url }) {
      if (key) url.searchParams.set('apiKey', key);
    },
  },
  squid: {
    secretEnv: 'SQUID_INTEGRATOR_ID',
    required: true,
    apply({ key, headers }) {
      headers['x-integrator-id'] = key;
    },
  },
  dodo: {
    secretEnv: 'DODO_API_KEY',
    required: false,
    apply({ key, url }) {
      if (key) url.searchParams.set('apikey', key);
    },
  },
  nansen: {
    secretEnv: 'NANSEN_API_KEY',
    required: true,
    apply({ key, headers }) {
      headers.apiKey = key;
    },
  },
  okx: {
    secretEnv: ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'],
    required: true,
    apply({ env, headers, url, method, now }) {
      const apiKey = requireEnv(env, 'OKX_API_KEY');
      const secret = requireEnv(env, 'OKX_SECRET_KEY');
      const passphrase = requireEnv(env, 'OKX_PASSPHRASE');
      if (!apiKey || !secret || !passphrase) {
        throw new ProxyError(503, 'provider_not_configured', 'Provider "okx" is not configured on this proxy.');
      }
      const timestamp = new Date(typeof now === 'function' ? now() : Date.now())
        .toISOString()
        .replace(/\.\d{3}Z$/, '.000Z');
      const requestPath = url.pathname + url.search;
      headers['ok-access-key'] = apiKey;
      headers['ok-access-sign'] = okxSign(secret, timestamp, method, requestPath);
      headers['ok-access-timestamp'] = timestamp;
      headers['ok-access-passphrase'] = passphrase;
    },
  },
});

export function injectCredentials({ provider, env, url, headers, method, now }) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new ProxyError(400, 'unknown_provider', `Unknown provider "${provider}".`);
  if (Array.isArray(spec.secretEnv)) {
    spec.apply({ env, url, headers, method, now });
    return;
  }
  const key = requireEnv(env, spec.secretEnv);
  if (!key && spec.required) {
    throw new ProxyError(503, 'provider_not_configured', `Provider "${provider}" is not configured on this proxy.`);
  }
  spec.apply({ key, url, headers, method, now, env });
}

export function validateTargetUrl(provider, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProxyError(400, 'invalid_url', 'The target URL is not valid.');
  }
  if (url.protocol !== 'https:') {
    throw new ProxyError(400, 'invalid_url', 'Only https upstream URLs are allowed.');
  }
  if (url.username || url.password) {
    throw new ProxyError(400, 'invalid_url', 'Credentials in the target URL are not allowed.');
  }
  if (url.port && url.port !== '443') {
    throw new ProxyError(403, 'host_not_allowed', `Upstream host is not allowed for provider "${provider}".`);
  }
  if (!hostAllowed(provider, url.hostname)) {
    throw new ProxyError(403, 'host_not_allowed', `Upstream host is not allowed for provider "${provider}".`);
  }
  return url;
}
