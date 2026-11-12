import assert from 'node:assert/strict';
import test from 'node:test';
import { GameClient, GameError, normalizeServerUrl, type Storage } from '../src/game';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const player = { player_id: 'player-1', account_id: 'account-1', resources: [{ resource_id: 'gold', quantity: '1000' }] };
const receipt = { items: [{ resource_id: 'xp', quantity: '100' }], resources: [{ resource_id: 'gold', quantity: '900' }], offer_id: 'static:xp_gold' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Call = { url: string; body: any; id: string | null; authorization: string | null };

function setup(respond?: (call: Call) => Response | Promise<Response>, storage = new MemoryStorage()) {
  const calls: Call[] = [];
  let sequence = 0;
  const client = new GameClient('http://localhost:8080/', {
    storage,
    requestId: () => `random-request-id-${++sequence}`,
    platform: 'ios',
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      const call = { url: String(input), body: JSON.parse(String(init?.body)), id: headers.get('X-Request-Id'), authorization: headers.get('Authorization') };
      calls.push(call);
      if (respond) return respond(call);
      if (call.url.endsWith('001002')) return reply({ ...player, device_id: call.body.device_id, access_token: 'session-token', session_expires_at: '2000000000', new_account: false });
      if (call.url.endsWith('003002')) return reply(receipt);
      return reply(player);
    },
  });
  return { client, calls, storage };
}

test('server URL accepts only a bare HTTP(S) origin', () => {
  assert.equal(normalizeServerUrl(' http://192.168.1.2:8080/// '), 'http://192.168.1.2:8080');
  for (const url of ['file:///tmp', 'http://user:pass@host', 'http://host/api', 'http://host?token=a', 'http://host#fragment']) {
    assert.throws(() => normalizeServerUrl(url), GameError);
  }
});

test('device is stored before first login and reused by a restarted client', async () => {
  const first = setup();
  assert.deepEqual(await first.client.connect(), player);
  const deviceId = first.calls[0].body.device_id;
  assert.ok([...first.storage.values.values()].some(value => value.includes(deviceId)));
  assert.equal(first.calls[0].body.client.platform, 'ios');
  assert.equal(first.calls[1].authorization, 'Bearer session-token');
  const restarted = setup(undefined, first.storage);
  await restarted.client.connect();
  assert.equal(restarted.calls[0].body.device_id, deviceId);
});

test('lost login response retries the identical persisted body and request ID after restart', async () => {
  const first = setup(() => { throw new TypeError('Network request failed'); });
  await assert.rejects(first.client.connect(), (error: GameError) => error.retryable);
  const restarted = setup(undefined, first.storage);
  await restarted.client.connect();
  assert.deepEqual(restarted.calls[0].body, first.calls[0].body);
  assert.equal(restarted.calls[0].id, first.calls[0].id);
});

test('lost purchase response remains pending, blocks different offers and retries safely after restart', async () => {
  const first = setup();
  await first.client.connect();
  const unavailable = setup(call => {
    if (call.url.endsWith('003002')) throw new TypeError('Lost response');
    if (call.url.endsWith('001002')) return reply({ ...player, device_id: call.body.device_id, access_token: 'token', session_expires_at: '2000000000', new_account: false });
    return reply(player);
  }, first.storage);
  await unavailable.client.connect();
  await assert.rejects(unavailable.client.purchase('static:xp_gold'), (error: GameError) => error.retryable);
  const pending = unavailable.client.pendingPurchase;
  assert.equal(pending?.offerId, 'static:xp_gold');
  await assert.rejects(unavailable.client.purchase('static:gem_small'), (error: GameError) => error.code === 'PURCHASE_PENDING');
  const restarted = setup(undefined, first.storage);
  await restarted.client.connect();
  assert.deepEqual(restarted.client.pendingPurchase, pending);
  assert.deepEqual(await restarted.client.retryPurchase(), receipt);
  const purchase = restarted.calls.find(call => call.url.endsWith('003002'))!;
  assert.equal(purchase.id, pending?.requestId);
  assert.deepEqual(purchase.body, { id: 'static:xp_gold', amount: 1 });
  assert.equal(restarted.client.pendingPurchase, null);
});

test('terminal purchase rejection clears pending state and allows a new purchase', async () => {
  let purchases = 0;
  const { client } = setup(call => {
    if (call.url.endsWith('001002')) return reply({ ...player, device_id: call.body.device_id, access_token: 'token', session_expires_at: '2000000000', new_account: false });
    if (call.url.endsWith('003002')) return ++purchases === 1 ? reply({ code: 'INSUFFICIENT_FUNDS', message: 'Not enough gold' }, 409) : reply(receipt);
    return reply(player);
  });
  await client.connect();
  await assert.rejects(client.purchase('static:xp_gold'), (error: GameError) => error.code === 'INSUFFICIENT_FUNDS' && !error.retryable);
  assert.equal(client.pendingPurchase, null);
  assert.deepEqual(await client.purchase('static:xp_gold'), receipt);
});

test('expired session logs in once and retries purchase with the same request ID', async () => {
  let loginCount = 0;
  let purchaseCount = 0;
  const { client, calls } = setup(call => {
    if (call.url.endsWith('001002')) return reply({ ...player, device_id: call.body.device_id, access_token: `token-${++loginCount}`, session_expires_at: '2000000000', new_account: false });
    if (call.url.endsWith('003002')) return ++purchaseCount === 1 ? reply({ code: 'AUTH_INVALID', message: 'Expired' }, 401) : reply(receipt);
    return reply(player);
  });
  await client.connect();
  await client.purchase('static:xp_gold');
  const purchases = calls.filter(call => call.url.endsWith('003002'));
  assert.equal(loginCount, 2);
  assert.equal(purchases[0].id, purchases[1].id);
  assert.equal(purchases[1].authorization, 'Bearer token-2');
});

test('malformed successful purchase response keeps the request pending', async () => {
  const { client } = setup(call => {
    if (call.url.endsWith('001002')) return reply({ ...player, device_id: call.body.device_id, access_token: 'token', session_expires_at: '2000000000', new_account: false });
    if (call.url.endsWith('003002')) return reply({ success: true });
    return reply(player);
  });
  await client.connect();
  await assert.rejects(client.purchase('static:xp_gold'), (error: GameError) => error.code === 'INVALID_RESPONSE' && error.retryable);
  assert.equal(client.pendingPurchase?.offerId, 'static:xp_gold');
});

test('credentials cannot leak to a different server origin', async () => {
  const { client, storage, calls } = setup();
  await client.connect();
  let deviceId = '';
  const second = new GameClient('http://localhost:8081', {
    storage,
    requestId: () => 'other-origin-random-id',
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(input).endsWith('001002')) {
        deviceId = body.device_id;
        return reply({ ...player, device_id: deviceId, access_token: 'token', session_expires_at: '2000000000', new_account: false });
      }
      return reply(player);
    },
  });
  await second.connect();
  assert.notEqual(deviceId, calls[0].body.device_id);
});

test('failed credential persistence prevents login from reaching the server', async () => {
  let requests = 0;
  const client = new GameClient('http://localhost:8080', {
    storage: { getItem: async () => null, setItem: async () => { throw new Error('Storage full'); }, removeItem: async () => {} },
    requestId: () => 'persist-before-request',
    fetch: async () => { requests++; return reply(player); },
  });
  await assert.rejects(client.connect(), (error: GameError) => error.code === 'STORAGE_ERROR');
  assert.equal(requests, 0);
});

test('concurrent taps for the same offer share one purchase and block another offer', async () => {
  let release!: (response: Response) => void;
  const { client, calls } = setup(call => {
    if (call.url.endsWith('001002')) return reply({ ...player, device_id: call.body.device_id, access_token: 'token', session_expires_at: '2000000000', new_account: false });
    if (call.url.endsWith('003002')) return new Promise<Response>(resolve => { release = resolve; });
    return reply(player);
  });
  await client.connect();
  const first = client.purchase('static:xp_gold');
  const second = client.purchase('static:xp_gold');
  assert.equal(first, second);
  await assert.rejects(client.purchase('static:gem_small'), (error: GameError) => error.code === 'PURCHASE_PENDING');
  await new Promise(resolve => setTimeout(resolve, 0));
  release(reply(receipt));
  assert.deepEqual(await first, receipt);
  assert.equal(calls.filter(call => call.url.endsWith('003002')).length, 1);
});

test('repeated authentication rejection retries login only once and preserves pending purchase', async () => {
  let logins = 0;
  let purchases = 0;
  const { client } = setup(call => {
    if (call.url.endsWith('001002')) {
      logins++;
      return reply({ ...player, device_id: call.body.device_id, access_token: 'token', session_expires_at: '2000000000', new_account: false });
    }
    if (call.url.endsWith('003002')) {
      purchases++;
      return reply({ code: 'AUTH_INVALID', message: 'Session unavailable' }, 401);
    }
    return reply(player);
  });
  await client.connect();
  await assert.rejects(client.purchase('static:xp_gold'), (error: GameError) => error.code === 'AUTH_INVALID');
  assert.equal(logins, 2);
  assert.equal(purchases, 2);
  assert.equal(client.pendingPurchase?.offerId, 'static:xp_gold');
});
