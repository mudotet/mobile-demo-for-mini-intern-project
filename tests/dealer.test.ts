import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createDealerWorld, type DealerInteraction } from '../src/dealer/world';

const idle: DealerInteraction = {
  pointerX: 0,
  pointerY: 0,
  greeting: 0,
  celebration: 0,
  shop: false,
  reducedMotion: false,
};

test('dealer has finite geometry and animated transforms within mobile budget', () => {
  const world = createDealerWorld();
  let draws = 0;
  let triangles = 0;
  world.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    draws++;
    const count =
      object.geometry.index?.count ?? object.geometry.attributes.position.count;
    triangles +=
      (count / 3) * (object instanceof THREE.InstancedMesh ? object.count : 1);
    const positions = object.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      assert.ok(Number.isFinite(positions.getX(index)));
      assert.ok(Number.isFinite(positions.getY(index)));
      assert.ok(Number.isFinite(positions.getZ(index)));
    }
  });
  assert.ok(draws < 190, `${draws} draw calls`);
  assert.ok(triangles < 100000, `${triangles} triangles`);
  for (let frame = 0; frame < 600; frame++)
    world.update(frame / 60, 1 / 60, {
      ...idle,
      pointerX: Math.sin(frame),
      greeting: 1,
      celebration: frame > 180 ? 1 : 0,
    });
  world.root.traverse((object) => {
    for (const value of [
      ...object.position,
      object.rotation.x,
      object.rotation.y,
      object.rotation.z,
      ...object.scale,
    ])
      assert.ok(Number.isFinite(value), object.name);
  });
  assert.ok(world.root.getObjectByName('expressive-head'));
  assert.ok(world.root.getObjectByName('open-crystal-palm'));
  assert.ok(world.root.getObjectByName('arched-moonlit-window'));
  world.dispose();
});

test('greeting, celebration and reduced motion produce deterministic bounded poses', () => {
  const world = createDealerWorld();
  const hat = world.root.getObjectByName('crooked-wizard-hat')!;
  const rune = world.root.getObjectByName('floating-rune')!;
  world.update(0, 0.016, { ...idle, greeting: 1 });
  world.update(1, 0.1, { ...idle, greeting: 1 });
  assert.ok(hat.rotation.z > 0.08);
  world.update(2, 0.016, { ...idle, greeting: 1, celebration: 1 });
  world.update(3.2, 0.1, { ...idle, greeting: 1, celebration: 1 });
  assert.ok(rune.scale.x > 1.2);
  world.update(10, 0.016, { ...idle, reducedMotion: true });
  const pose = hat.rotation.clone();
  const position = rune.position.clone();
  world.update(50, 0.016, { ...idle, reducedMotion: true, pointerX: 1 });
  assert.deepEqual(hat.rotation.toArray(), pose.toArray());
  assert.deepEqual(rune.position, position);
  world.update(Number.NaN, Number.NaN, {
    ...idle,
    pointerX: Number.NaN,
    pointerY: Infinity,
  });
  assert.ok(Number.isFinite(hat.rotation.z));
  world.dispose();
});

test('dispose releases each shared geometry and material once', () => {
  const world = createDealerWorld();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  world.root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      resources.add(object.geometry);
      const surfaces = Array.isArray(object.material)
        ? object.material
        : [object.material];
      surfaces.forEach((surface) => resources.add(surface));
    }
  });
  let disposed = 0;
  let instanceDisposals = 0;
  let instanceCount = 0;
  world.root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      instanceCount++;
      object.addEventListener('dispose', () => {
        instanceDisposals++;
      });
    }
  });
  resources.forEach((value) =>
    value.addEventListener('dispose', () => {
      disposed++;
    }),
  );
  world.dispose();
  world.dispose();
  assert.equal(disposed, resources.size);
  assert.equal(instanceDisposals, instanceCount);
  assert.equal(world.root.children.length, 0);
});
