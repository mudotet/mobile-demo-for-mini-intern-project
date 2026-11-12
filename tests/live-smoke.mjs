import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.GAME_SERVER_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const deviceId = randomUUID();
let token;

async function post(path, body = {}, requestId = randomUUID(), expectedStatus = 200) {
  const response = await fetch(`${baseUrl}/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  assert.equal(response.status, expectedStatus, `${path} returned ${result.code || response.status}`);
  assert.equal(response.headers.get('X-Request-Id'), requestId);
  return result;
}

function resources(player) {
  return Object.fromEntries(player.resources.map(({ resource_id, quantity }) => [resource_id, BigInt(quantity)]));
}

const loginBody = { device_id: deviceId, client: { platform: 'ios', identifier: 'fantasy-demo-smoke', version: '1.0.0' } };
const loginId = randomUUID();
const login = await post('001002', loginBody, loginId);
assert.equal(login.new_account, true);
assert.deepEqual(await post('001002', loginBody, loginId), login);
token = login.access_token;
const initial = await post('002007');
assert.deepEqual(resources(initial), { gem: 100n, gold: 1000n, xp: 0n });
assert.deepEqual(await post('002007'), initial);

const staticShop = await post('003004');
assert.equal(staticShop.slots.length, 6);
const daily = await post('003005');
assert.equal(daily.slots.length, 3);
assert.equal(new Set(daily.slots.map(({ offer }) => offer.package_id)).size, 3);
assert.deepEqual((await post('003005')).slots, daily.slots);

const staticOffer = staticShop.slots.find(({ offer }) => offer.package_id === 'xp_gold').offer;
const purchaseId = randomUUID();
const purchaseBody = { id: staticOffer.offer_id, amount: 1 };
const receipt = await post('003002', purchaseBody, purchaseId);
assert.deepEqual(resources(receipt), { gem: 100n, gold: 900n, xp: 100n });
assert.deepEqual(await post('003002', purchaseBody, purchaseId), receipt);
assert.deepEqual(resources(await post('002007')), resources(receipt));
const conflict = await post('003002', { id: staticOffer.offer_id, amount: 2 }, purchaseId, 409);
assert.equal(conflict.code, 'REQUEST_ID_REUSED');

const dailyOffer = daily.slots[0].offer;
const dailyBody = { id: dailyOffer.offer_id, amount: 1 };
for (let count = 0; count < 3; count += 1) {
  await post('003002', dailyBody);
}
const exhaustedPlayer = await post('002007');
const limitError = await post('003002', dailyBody, randomUUID(), 409);
assert.equal(limitError.code, 'PURCHASE_LIMIT');
assert.deepEqual(await post('002007'), exhaustedPlayer);
const purchasedOffer = (await post('003005')).slots.find(({ offer }) => offer.offer_id === dailyOffer.offer_id).offer;
assert.equal(purchasedOffer.remaining, 0);
assert.equal(purchasedOffer.purchased, 3);
assert.deepEqual(purchasedOffer.items, dailyOffer.items);
assert.deepEqual(purchasedOffer.final_price, dailyOffer.final_price);

const recovered = await post('001002', loginBody);
assert.equal(recovered.new_account, false);
assert.equal(recovered.account_id, login.account_id);
assert.equal(recovered.player_id, login.player_id);
token = recovered.access_token;
assert.deepEqual(await post('002007'), exhaustedPlayer);
assert.deepEqual(await post('003002', purchaseBody, purchaseId), receipt);
assert.deepEqual(await post('002007'), exhaustedPlayer);

console.log(`Live JSON smoke passed against ${baseUrl}`);
console.log('Verified Login replay/recovery, Init without refill, Static/Daily, purchase replay/conflict, three daily purchases and fourth rejection.');
