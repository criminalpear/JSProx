import assert from 'node:assert/strict';
import test from 'node:test';
import { createResilientTransport } from '../public/resilient-transport.mjs';

function retryableError() {
  return Object.assign(new Error('SSL connect error'), { code: 35 });
}

function makeHarness({ libcurlRequest, epoxyRequest, libcurlInit, epoxyInit, now = () => 0 } = {}) {
  const calls = { libcurl: [], epoxy: [], libcurlInit: 0, epoxyInit: 0, messages: [] };
  class Libcurl {
    constructor(options) { this.options = options; }
    async init() { calls.libcurlInit++; return libcurlInit && libcurlInit(); }
    async request(...args) { calls.libcurl.push(args); return libcurlRequest ? libcurlRequest(...args) : { status: 200 }; }
    connect(...args) { calls.libcurl.push(['connect', ...args]); return ['send', 'close']; }
  }
  class Epoxy {
    constructor(options) { this.options = options; }
    async init() { calls.epoxyInit++; return epoxyInit && epoxyInit(); }
    async request(...args) { calls.epoxy.push(args); return epoxyRequest ? epoxyRequest(...args) : { status: 200 }; }
  }
  class Channel {
    constructor(name) { this.name = name; }
    postMessage(message) { calls.messages.push(message); }
  }
  const Transport = createResilientTransport({ loadLibcurl: async () => Libcurl, loadEpoxy: async () => Epoxy, BroadcastChannel: Channel, now });
  return { Transport, calls };
}

test('retries a bodyless GET once on the alternate transport and caches it per origin', async () => {
  const { Transport, calls } = makeHarness({ libcurlRequest: async () => { throw retryableError(); } });
  const transport = new Transport({ primary: 'libcurl', wisp: 'wss://example.test/' });
  const remote = new URL('https://games.example.test/path?q=private');
  assert.deepEqual(await transport.request(remote, 'GET', null, {}, undefined), { status: 200 });
  assert.equal(calls.libcurl.length, 1);
  assert.equal(calls.epoxy.length, 1);
  assert.deepEqual(calls.messages[0], { type: 'fallback', host: 'games.example.test', from: 'libcurl', to: 'epoxy', reason: 'tls-handshake' });
  await transport.request(new URL('https://games.example.test/next'), 'GET', undefined, {}, undefined);
  assert.equal(calls.libcurl.length, 1, 'cached alternate is used first');
  assert.equal(calls.epoxy.length, 2);
});

test('never retries POST requests, even when the error looks retryable', async () => {
  const { Transport, calls } = makeHarness({ libcurlRequest: async () => { throw retryableError(); } });
  const transport = new Transport({ primary: 'libcurl' });
  await assert.rejects(() => transport.request(new URL('https://example.test/'), 'POST', 'x', {}, undefined));
  assert.equal(calls.libcurl.length, 1);
  assert.equal(calls.epoxy.length, 0);
});

test('retries a bodyless HEAD but never retries a GET carrying a body', async () => {
  const { Transport, calls } = makeHarness({ libcurlRequest: async () => { throw retryableError(); } });
  const transport = new Transport({ primary: 'libcurl' });
  await transport.request(new URL('https://head.example.test/'), 'HEAD', null, {}, undefined);
  assert.equal(calls.libcurl.length, 1);
  assert.equal(calls.epoxy.length, 1);

  await assert.rejects(() => transport.request(new URL('https://body.example.test/'), 'GET', 'not-safe-to-repeat', {}, undefined));
  assert.equal(calls.libcurl.length, 2);
  assert.equal(calls.epoxy.length, 1);
});

test('does not retry arbitrary failures or certificate verification errors', async () => {
  for (const message of ['HTTP 503 Service Unavailable', 'certificate verification failed']) {
    const { Transport, calls } = makeHarness({ libcurlRequest: async () => { throw new Error(message); } });
    const transport = new Transport({ primary: 'libcurl' });
    await assert.rejects(() => transport.request(new URL('https://example.test/'), 'GET', null, {}, undefined));
    assert.equal(calls.libcurl.length, 1);
    assert.equal(calls.epoxy.length, 0);
  }
});

test('deduplicates concurrent primary initialization', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { Transport, calls } = makeHarness({ libcurlInit: () => waiting });
  const transport = new Transport({ primary: 'libcurl' });
  assert.equal(transport.ready, false);
  const first = transport.init();
  const second = transport.init();
  release();
  await Promise.all([first, second]);
  assert.equal(calls.libcurlInit, 1);
  assert.equal(transport.ready, true);
});

test('alternate cache has a hard bound and requests never exceed two attempts', async () => {
  const { Transport, calls } = makeHarness({ libcurlRequest: async () => { throw retryableError(); } });
  const transport = new Transport({ primary: 'libcurl' });
  for (let index = 0; index < 65; index++) {
    await transport.request(new URL(`https://host${index}.example.test/`), 'GET', null, {}, undefined);
  }
  assert.equal(calls.libcurl.length, 65);
  assert.equal(calls.epoxy.length, 65);
  assert.ok(transport._originAlternates.size <= 64);
});

test('expires an origin alternate after its TTL', async () => {
  let now = 100;
  const { Transport, calls } = makeHarness({ libcurlRequest: async () => { throw retryableError(); }, now: () => now });
  const transport = new Transport({ primary: 'libcurl' });
  await transport.request(new URL('https://expiry.example.test/first'), 'GET', null, {}, undefined);
  now += 10 * 60 * 1000 + 1;
  await transport.request(new URL('https://expiry.example.test/second'), 'GET', null, {}, undefined);
  assert.equal(calls.libcurl.length, 2, 'expired entry returns to the primary transport');
  assert.equal(calls.epoxy.length, 2);
});

test('passes WebSocket connections directly to the initialized primary transport', async () => {
  const { Transport, calls } = makeHarness();
  const transport = new Transport({ primary: 'libcurl' });
  await transport.init();
  const args = [new URL('wss://socket.example.test/'), ['chat'], { x: 'y' }, () => {}, () => {}, () => {}, () => {}];
  assert.deepEqual(transport.connect(...args), ['send', 'close']);
  assert.equal(calls.libcurl.length, 1);
  assert.equal(calls.libcurl[0][0], 'connect');
  assert.equal(calls.epoxy.length, 0);
});

test('stops after the alternate attempt fails', async () => {
  const { Transport, calls } = makeHarness({
    libcurlRequest: async () => { throw retryableError(); },
    epoxyRequest: async () => { throw retryableError(); }
  });
  const transport = new Transport({ primary: 'libcurl' });
  await assert.rejects(
    () => transport.request(new URL('https://example.test/'), 'HEAD', null, {}, undefined),
    error => error.code === 'JSPROX_BOTH_TRANSPORTS_FAILED' &&
      error.message === 'Both JSProx transports failed: SSL connect error' &&
      error.cause && error.cause.message === 'SSL connect error'
  );
  assert.equal(calls.libcurl.length, 1);
  assert.equal(calls.epoxy.length, 1);
});
