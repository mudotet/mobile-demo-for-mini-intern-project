import assert from 'node:assert/strict';
import test from 'node:test';
import { isBattlePassState, type BattlePassReceipt, type BattlePassState } from '../src/battlepass';
import { GameClient, GameError, type Storage } from '../src/game';

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const player = { player_id: 'player-1', account_id: 'account-1', resources: [{ resource_id: 'gold', quantity: '1000' }, { resource_id: 'gem', quantity: '100' }] };
const passId = 'weekly:1794157200';
function pass(): BattlePassState {
  return {
    pass_id: passId, name: 'Emberbound Covenant', starts_at: '1794157200', ends_at: '1794762000',
    server_time: '1794247200', quests_reset_at: '1794330000', expbp: 0, premium_owned: false,
    premium_price: { currency: { gem: 50 } },
    milestones: Array.from({ length: 6 }, (_, index) => ({
      step: index + 1, required_expbp: (index + 1) * 100,
      free: { node_id: `free_${index + 1}`, items: { gold: 100 }, claimed: false, claimable: false },
      premium: { node_id: `premium_${index + 1}`, items: { gem: 10 }, claimed: false, claimable: false },
    })),
    quests: [{ quest_id: 'trade_once:1794243600', title: 'First Trade', description: 'Purchase any shop offer.', progress: 0, target: 1, expbp_reward: 100, claimed: false, claimable: false }],
  };
}
function premiumReceipt(): BattlePassReceipt {
  return { pass: { ...pass(), premium_owned: true }, items: [], resources: [{ resource_id: 'gold', quantity: '1000' }, { resource_id: 'gem', quantity: '50' }] };
}
const shopReceipt = { offer_id: 'static:xp_gold', items: [{ resource_id: 'xp', quantity: '100' }], resources: [{ resource_id: 'gold', quantity: '900' }] };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
type Call = { path: string; body: Record<string, unknown>; requestId: string | null; authorization: string | null };
let clientSequence = 0;
function setup(respond?: (call: Call) => Response | Promise<Response> | undefined, storage = new MemoryStorage()) {
  const calls: Call[] = [];
  const instance = ++clientSequence;
  let sequence = 0;
  const client = new GameClient('http://localhost:8080', {
    storage, requestId: () => `client-${instance}-operation-${++sequence}`,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      const call = { path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) as Record<string, unknown>, requestId: headers.get('X-Request-Id'), authorization: headers.get('Authorization') };
      calls.push(call);
      const custom = respond?.(call);
      if (custom) return custom;
      if (call.path === '/api/001002') return reply({ ...player, device_id: call.body.device_id, access_token: `session-${instance}-${calls.length}`, session_expires_at: '2000000000', new_account: false });
      if (call.path === '/api/002007') return reply(player);
      if (call.path === '/api/004001') return reply(pass());
      if (call.path === '/api/003002') return reply(shopReceipt);
      return reply(premiumReceipt());
    },
  });
  return { client, calls, storage };
}
const pendingError = (error: GameError) => error.code === 'PURCHASE_PENDING';

test('Battle Pass state loads through the authenticated API without changing saved Device identity', async () => {
  const { client, calls, storage } = setup();
  await client.connect();
  assert.deepEqual(await client.loadBattlePass(), pass());
  const stateCall = calls.find(call => call.path === '/api/004001')!;
  assert.deepEqual(stateCall.body, {});
  assert.ok(stateCall.authorization?.startsWith('Bearer session-'));
  const persisted = JSON.parse([...storage.values.values()][0]);
  assert.equal(persisted.deviceId, calls[0].body.device_id);
  assert.equal(persisted.passOperation, undefined);
});

test('lost Premium response survives restart with the same body and Request ID, blocking other mutations', async () => {
  const first = setup(call => {
    if (call.path === '/api/004003') throw new TypeError('Response was lost after committing');
  });
  await first.client.connect();
  await assert.rejects(first.client.battlePassAction('premium', passId), (error: GameError) => error.retryable);
  const original = first.calls.find(call => call.path === '/api/004003')!;
  const pending = first.client.pendingBattlePass;
  assert.equal(pending?.action, 'premium');
  const restarted = setup(undefined, first.storage);
  await restarted.client.connect();
  assert.deepEqual(restarted.client.pendingBattlePass, pending);
  assert.equal(restarted.calls[0].body.device_id, first.calls[0].body.device_id);
  await assert.rejects(restarted.client.purchase('static:xp_gold'), pendingError);
  await assert.rejects(restarted.client.battlePassAction('claim', passId, 'free_1'), pendingError);
  assert.equal(restarted.calls.filter(call => ['/api/003002', '/api/004002'].includes(call.path)).length, 0);
  assert.deepEqual(await restarted.client.retryBattlePass(), premiumReceipt());
  const replay = restarted.calls.find(call => call.path === '/api/004003')!;
  assert.equal(replay.requestId, original.requestId);
  assert.deepEqual(replay.body, original.body);
  assert.deepEqual(replay.body, { pass_id: passId });
  assert.equal(restarted.client.pendingBattlePass, null);
});

test('terminal quest rejection clears pending state and permits a later action', async () => {
  const { client, calls } = setup(call => {
    if (call.path === '/api/004004') return reply({ code: 'QUEST_INCOMPLETE', message: 'Complete the quest first' }, 409);
  });
  await client.connect();
  await assert.rejects(client.battlePassAction('quest', passId, 'trade_once:1794243600'), (error: GameError) => error.code === 'QUEST_INCOMPLETE' && !error.retryable);
  assert.equal(client.pendingBattlePass, null);
  assert.deepEqual(calls.find(call => call.path === '/api/004004')?.body, { pass_id: passId, quest_id: 'trade_once:1794243600' });
  await client.battlePassAction('premium', passId);
  assert.equal(client.pendingBattlePass, null);
});

test('repeated 401 responses renew the session once and retain the original Battle Pass Request ID', async () => {
  const { client, calls } = setup(call => {
    if (call.path === '/api/004002') return reply({ code: 'AUTH_INVALID', message: 'Session was replaced' }, 401);
  });
  await client.connect();
  await assert.rejects(client.battlePassAction('claim', passId, 'free_1'), (error: GameError) => error.code === 'AUTH_INVALID' && error.retryable);
  const claims = calls.filter(call => call.path === '/api/004002');
  assert.equal(calls.filter(call => call.path === '/api/001002').length, 2);
  assert.equal(claims.length, 2);
  assert.deepEqual(claims[0].body, { pass_id: passId, node_id: 'free_1' });
  assert.deepEqual(claims[0].body, claims[1].body);
  assert.equal(claims[0].requestId, claims[1].requestId);
  assert.notEqual(claims[0].authorization, claims[1].authorization);
  assert.equal(client.pendingBattlePass?.requestId, claims[0].requestId);
});

test('identical concurrent claims coalesce while another Battle Pass action and Shop wait', async () => {
  let release!: (response: Response) => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const { client, calls } = setup(call => {
    if (call.path === '/api/004002') return new Promise<Response>(resolve => { release = resolve; entered(); });
  });
  await client.connect();
  const first = client.battlePassAction('claim', passId, 'free_1');
  const second = client.battlePassAction('claim', passId, 'free_1');
  assert.equal(first, second);
  await assert.rejects(client.battlePassAction('premium', passId), pendingError);
  await assert.rejects(client.purchase('static:xp_gold'), pendingError);
  await started;
  const claimed = premiumReceipt();
  claimed.pass.premium_owned = false;
  claimed.pass.expbp = 100;
  claimed.pass.milestones[0].free.claimed = true;
  claimed.items = [{ resource_id: 'gold', quantity: '100' }];
  release(reply(claimed));
  assert.deepEqual(await first, claimed);
  assert.equal(calls.filter(call => call.path === '/api/004002').length, 1);
  assert.equal(client.pendingBattlePass, null);
});

test('ambiguous server failures preserve the operation for safe retry', async t => {
  const cases = [
    { name: 'server 500', response: () => reply({ code: 'INTERNAL_ERROR', message: 'Unavailable' }, 500), code: 'INTERNAL_ERROR' },
    { name: 'malformed pass', response: () => reply({ ...premiumReceipt(), pass: { ...pass(), expbp: '100' } }), code: 'INVALID_RESPONSE' },
    { name: 'wrong season receipt', response: () => reply({ ...premiumReceipt(), pass: { ...pass(), pass_id: 'weekly:other-season' } }), code: 'INVALID_RESPONSE' },
    { name: 'non-JSON response', response: () => new Response('<html>gateway error</html>', { status: 502 }), code: 'INVALID_RESPONSE' },
  ];
  for (const sample of cases) {
    await t.test(sample.name, async () => {
      const { client, calls } = setup(call => { if (call.path === '/api/004003') return sample.response(); });
      await client.connect();
      await assert.rejects(client.battlePassAction('premium', passId), (error: GameError) => error.code === sample.code && error.retryable);
      assert.equal(client.pendingBattlePass?.requestId, calls.find(call => call.path === '/api/004003')?.requestId);
    });
  }
});

test('legacy saved Device and pending Shop purchase survive the client extension and block Battle Pass mutations', async () => {
  const storage = new MemoryStorage();
  storage.values.set('fantasy-game:http://localhost:8080', JSON.stringify({
    deviceId: 'legacy-device-uuid-0001',
    purchase: { offerId: 'static:xp_gold', requestId: 'legacy-shop-request-0001' },
  }));
  const { client, calls } = setup(undefined, storage);
  await client.connect();
  assert.equal(calls[0].body.device_id, 'legacy-device-uuid-0001');
  assert.equal(client.pendingPurchase?.requestId, 'legacy-shop-request-0001');
  await client.loadBattlePass();
  await assert.rejects(client.battlePassAction('premium', passId), pendingError);
  assert.equal(client.pendingBattlePass, null);
  assert.equal(calls.filter(call => call.path === '/api/004003').length, 0);
  await client.retryPurchase();
  assert.equal(calls.find(call => call.path === '/api/003002')?.requestId, 'legacy-shop-request-0001');
  await client.battlePassAction('premium', passId);
  assert.equal(client.pendingPurchase, null);
});

test('Battle Pass validation rejects malformed fields used by the UI', () => {
  assert.ok(isBattlePassState(pass()));
  const malformed: { name: string; change: (value: any) => void }[] = [
    { name: 'negative EXPBP', change: value => { value.expbp = -1; } },
    { name: 'string EXPBP', change: value => { value.expbp = '100'; } },
    { name: 'missing premium flag', change: value => { delete value.premium_owned; } },
    { name: 'numeric timestamp', change: value => { value.ends_at = 1794762000; } },
    { name: 'invalid timestamp', change: value => { value.quests_reset_at = 'tomorrow'; } },
    { name: 'negative timestamp', change: value => { value.server_time = '-1'; } },
    { name: 'unsafe timestamp', change: value => { value.ends_at = '9007199254740992'; } },
    { name: 'end before start', change: value => { value.ends_at = String(Number(value.starts_at) - 1); } },
    { name: 'negative Premium price', change: value => { value.premium_price.currency.gem = -50; } },
    { name: 'zero Premium price', change: value => { value.premium_price.currency.gem = 0; } },
    { name: 'multiple Premium currencies', change: value => { value.premium_price.currency.gold = 100; } },
    { name: 'string Premium price', change: value => { value.premium_price.currency.gem = '50'; } },
    { name: 'invalid node claim flag', change: value => { value.milestones[0].free.claimable = 'yes'; } },
    { name: 'missing node items', change: value => { value.milestones[0].premium.items = {}; } },
    { name: 'negative reward', change: value => { value.milestones[0].free.items.gold = -1; } },
    { name: 'missing quests', change: value => { delete value.quests; } },
    { name: 'invalid quest flag', change: value => { value.quests[0].claimed = 1; } },
    { name: 'zero quest target', change: value => { value.quests[0].target = 0; } },
    { name: 'negative quest progress', change: value => { value.quests[0].progress = -1; } },
  ];
  for (const sample of malformed) {
    const value = pass();
    sample.change(value);
    assert.equal(isBattlePassState(value), false, sample.name);
  }
});
