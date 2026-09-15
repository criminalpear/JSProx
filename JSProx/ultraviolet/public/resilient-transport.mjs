/*
 * A small BareMux2 transport wrapper which changes transport only after a
 * connection-level failure. It deliberately never retries requests that could
 * change server state.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ORIGIN_ALTERNATES = 64;

function defaultLoadLibcurl() {
  return import('/libcurl-adapter.mjs').then(module => module.default);
}

function defaultLoadEpoxy() {
  // Keep Epoxy out of the initial transport load. Its WASM is sizeable.
  return import('/epoxy/index.mjs').then(module => module.default);
}

function errorText(error) {
  const cause = error && error.cause;
  return [error && error.message, error && error.code, cause && cause.message, cause && cause.code, error]
    .filter(value => value != null)
    .map(value => String(value))
    .join(' ');
}

export function isRetryableTransportError(error) {
  const text = errorText(error);
  // Certificate failures are intentionally never retried or bypassed.
  if (/cert(?:ificate)?|verification|peer[_ -]?failed/i.test(text)) return false;
  const codes = [error && error.code, error && error.cause && error.cause.code];
  if (codes.some(code => Number(code) === 35 || String(code) === 'CURLE_SSL_CONNECT_ERROR')) return true;
  return /\b(?:error|code)\s*[:#=]?\s*35\b|\bCURLE_SSL_CONNECT_ERROR\b|\bSSL\s+connect\s+error\b|\bMuxTaskEnded\b|\bMultiplexor\s+task\s+ended\b/i.test(text);
}

function retryReason(error) {
  const text = errorText(error);
  return /MuxTaskEnded|Multiplexor\s+task\s+ended/i.test(text) ? 'mux-ended' : 'tls-handshake';
}

function asUrl(remote) {
  return remote instanceof URL ? remote : new URL(remote && remote.href ? remote.href : String(remote));
}

/**
 * Dependency injection keeps this browser module unit-testable without loading
 * libcurl WASM or Epoxy's browser-only implementation.
 */
export function createResilientTransport(dependencies = {}) {
  const deps = {
    loadLibcurl: defaultLoadLibcurl,
    loadEpoxy: defaultLoadEpoxy,
    now: () => Date.now(),
    BroadcastChannel: typeof BroadcastChannel === 'function' ? BroadcastChannel : null,
    ...dependencies
  };

  return class ResilientTransport {
    constructor(options = {}) {
      this.primary = options.primary === 'epoxy' ? 'epoxy' : 'libcurl';
      this.wisp = options.wisp;
      this._instances = new Map();
      this._loading = new Map();
      this._initializing = new Map();
      this._originAlternates = new Map();
      this._statusChannel = null;
      this.ready = false;
    }

    _other(name) {
      return name === 'epoxy' ? 'libcurl' : 'epoxy';
    }

    _optionsFor(name) {
      // Both current transports accept wisp. The JSProx libcurl adapter passes
      // it through to the underlying client's websocket option.
      return { wisp: this.wisp };
    }

    _loadTransport(name) {
      if (this._instances.has(name)) return Promise.resolve(this._instances.get(name));
      if (this._loading.has(name)) return this._loading.get(name);
      const load = name === 'libcurl' ? deps.loadLibcurl : deps.loadEpoxy;
      const promise = Promise.resolve().then(load).then(Transport => {
        const instance = new Transport(this._optionsFor(name));
        this._instances.set(name, instance);
        return instance;
      });
      this._loading.set(name, promise);
      promise.catch(() => {
        if (this._loading.get(name) === promise) this._loading.delete(name);
      });
      return promise;
    }

    _initialize(name) {
      if (this._initializing.has(name)) return this._initializing.get(name);
      const promise = this._loadTransport(name).then(transport => Promise.resolve(transport.init()).then(() => transport));
      this._initializing.set(name, promise);
      promise.catch(() => {
        if (this._initializing.get(name) === promise) this._initializing.delete(name);
      });
      return promise;
    }

    init() {
      return this._initialize(this.primary).then(() => {
        this.ready = true;
      });
    }

    async meta() {
      const transport = await this._initialize(this.primary);
      return typeof transport.meta === 'function' ? transport.meta() : undefined;
    }

    _cachedTransport(origin) {
      const entry = this._originAlternates.get(origin);
      if (!entry) return null;
      if (entry.expiresAt <= deps.now()) {
        this._originAlternates.delete(origin);
        return null;
      }
      // Refresh insertion order for bounded LRU eviction without extending TTL.
      this._originAlternates.delete(origin);
      this._originAlternates.set(origin, entry);
      return entry.transport;
    }

    _rememberAlternate(origin, transport) {
      this._originAlternates.delete(origin);
      while (this._originAlternates.size >= MAX_ORIGIN_ALTERNATES) {
        this._originAlternates.delete(this._originAlternates.keys().next().value);
      }
      this._originAlternates.set(origin, { transport, expiresAt: deps.now() + CACHE_TTL_MS });
    }

    _emitFallback(host, from, to, reason) {
      const message = { type: 'fallback', host, from, to, reason };
      try {
        if (!this._statusChannel && deps.BroadcastChannel) this._statusChannel = new deps.BroadcastChannel('jsprox:transport-status');
        if (this._statusChannel) this._statusChannel.postMessage(message);
      } catch (_) {
        // BroadcastChannel is informational; a blocked channel must not break browsing.
      }
      if (typeof deps.onFallback === 'function') deps.onFallback(message);
    }

    async request(remote, method, body, headers, signal) {
      const url = asUrl(remote);
      const verb = String(method || 'GET').toUpperCase();
      const canRetry = (verb === 'GET' || verb === 'HEAD') && (body === undefined || body === null);
      const cached = this._cachedTransport(url.origin);
      const first = cached || this.primary;
      const second = this._other(first);

      try {
        const transport = await this._initialize(first);
        return await transport.request(remote, method, body, headers, signal);
      } catch (error) {
        if (!canRetry || !isRetryableTransportError(error)) throw error;

        try {
          const transport = await this._initialize(second);
          const response = await transport.request(remote, method, body, headers, signal);
          if (first === this.primary) this._rememberAlternate(url.origin, second);
          else this._originAlternates.delete(url.origin);
          this._emitFallback(url.host, first, second, retryReason(error));
          return response;
        } catch (fallbackError) {
          // Give callers a stable way to distinguish a completed two-transport
          // attempt from a single request failure. The original remains causal.
          const combined = new Error('Both JSProx transports failed: ' + (error && error.message ? error.message : String(error)), { cause: error });
          combined.code = 'JSPROX_BOTH_TRANSPORTS_FAILED';
          combined.fallbackError = fallbackError;
          throw combined;
        }
      }
    }

    connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
      // WebSockets have side effects and connection state, so never retry them.
      const transport = this._instances.get(this.primary);
      if (!transport) throw new Error('Resilient transport must be initialized before connect().');
      return transport.connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror);
    }
  };
}

export default createResilientTransport();
