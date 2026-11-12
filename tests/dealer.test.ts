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

test('software rendering keeps the 3D model with vertex-lit materials', () => {
  const world = createDealerWorld(true);
  let lambertMeshes = 0;
  world.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      assert.ok(!(material instanceof THREE.MeshStandardMaterial));
      if (material instanceof THREE.MeshLambertMaterial) lambertMeshes++;
    }
  });
  assert.ok(lambertMeshes > 50);
  const crystal = world.root.getObjectByName('floating-rune')!;
  world.update(0, 0.016, idle);
  world.update(1, 0.016, idle);
  assert.notEqual(crystal.position.y, 2.23);
  world.dispose();
});

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

test('confirmed celebration visibly raises both arms and emits a finite three-second reward burst', () => {
  const world = createDealerWorld();
  const left = world.root.getObjectByName('greeting-arm')!;
  const right = world.root.getObjectByName('crystal-hand-arm')!;
  const burst = world.root.getObjectByName(
    'purchase-reward-spark-burst',
  ) as THREE.Points;
  world.update(1, 0.016, idle);
  assert.equal(burst.visible, false);
  world.update(2, 0.016, { ...idle, celebration: 1 });
  world.update(3.5, 0.016, { ...idle, celebration: 1 });
  assert.ok(left.rotation.z < -1, 'left hand lifts into the clear stage');
  assert.ok(right.rotation.z > 0.6, 'crystal hand joins the cheer');
  assert.equal(burst.visible, true);
  const positions = burst.geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    assert.ok(Number.isFinite(positions.getX(index)));
    assert.ok(Number.isFinite(positions.getY(index)));
    assert.ok(Number.isFinite(positions.getZ(index)));
  }
  world.update(5.1, 0.016, { ...idle, celebration: 1 });
  assert.equal(burst.visible, false);
  assert.equal(right.rotation.z, 0);
  world.update(6, 0.016, { ...idle, celebration: 2, reducedMotion: true });
  assert.equal(burst.visible, false);
  assert.equal(left.rotation.z, 0);
  assert.equal(right.rotation.z, 0);
  world.dispose();
});

test('four greeting reactions visibly wave, bow, laugh and lift the crystal without purchase rewards', () => {
  for (const reaction of ['wave', 'bow', 'chuckle', 'flourish'] as const) {
    const world = createDealerWorld();
    const reference = createDealerWorld();
    const input = { ...idle, greeting: 1, reaction };
    world.update(0, 0.016, input);
    for (let frame = 1; frame <= 72; frame++)
      world.update(frame / 60, 1 / 60, input);
    const arm = world.root.getObjectByName('greeting-arm')!;
    const head = world.root.getObjectByName('expressive-head')!;
    const smile = world.root.getObjectByName('smiling-mouth')!;
    const rune = world.root.getObjectByName('floating-rune')!;
    if (reaction === 'wave') {
      assert.ok(arm.rotation.z < -0.7, 'wave raises the greeting hand');
      world.root.updateMatrixWorld(true);
      const hand = world.root
        .getObjectByName('resting-hand')!
        .getWorldPosition(new THREE.Vector3());
      assert.ok(
        hand.x > -1 && hand.y > 2.3,
        'wave stays upright inside the portrait stage',
      );
    }
    if (reaction === 'bow')
      assert.ok(head.rotation.x > 0.3, 'bow noticeably lowers his head');
    if (reaction === 'chuckle')
      assert.ok(smile.scale.y > 0.14, 'laugh visibly opens his smile');
    if (reaction === 'flourish')
      assert.ok(rune.position.y > 2.5, 'magic lifts the rune above his palm');
    assert.equal(
      world.root.getObjectByName('purchase-reward-spark-burst')!.visible,
      false,
      `${reaction} is not a purchase`,
    );
    for (let frame = 73; frame <= 240; frame++) {
      world.update(frame / 60, 1 / 60, input);
      reference.update(frame / 60, 1 / 60, idle);
    }
    const settled = pose(world);
    pose(reference).forEach((value, index) => {
      assert.ok(
        Math.abs(settled[index] - value) < 0.002,
        `${reaction} transform ${index} settled`,
      );
    });
    world.dispose();
    reference.dispose();
  }
});

test('talking cycles the mouth and beard, then settles without a reward burst', () => {
  const world = createDealerWorld();
  const input = { ...idle, greeting: 1, reaction: 'wave' as const };
  const mouth = world.root.getObjectByName('smiling-mouth')!;
  const beard = world.root.getObjectByName('jaw-attached-beard')!;
  const restingBeard = beard.position.y;
  const openings: number[] = [];
  world.update(0, 1 / 60, input);
  for (let frame = 1; frame <= 144; frame++) {
    world.update(frame / 60, 1 / 60, input);
    if (frame >= 45 && frame <= 90) openings.push(mouth.scale.y);
    if (frame === 72)
      assert.ok(
        beard.position.y < restingBeard - 0.02,
        'beard follows the speaking jaw',
      );
  }
  assert.ok(
    Math.max(...openings) - Math.min(...openings) > 0.04,
    'syllables visibly open and close the mouth',
  );
  assert.equal(mouth.scale.y, 0.105);
  assert.equal(beard.position.y, restingBeard);
  assert.equal(
    world.root.getObjectByName('purchase-reward-spark-burst')!.visible,
    false,
  );
  world.dispose();
});

function pose(world: ReturnType<typeof createDealerWorld>) {
  const values: number[] = [];
  world.root.traverse((part) =>
    values.push(
      ...part.position,
      part.rotation.x,
      part.rotation.y,
      part.rotation.z,
      ...part.scale,
    ),
  );
  return values;
}

test('rapid reaction switches stay finite and every changed mesh returns to idle', () => {
  const world = createDealerWorld();
  const reference = createDealerWorld();
  const reactions = ['wave', 'bow', 'chuckle', 'flourish'] as const;
  for (let frame = 0; frame < 300; frame++) {
    const tap = Math.min(23, Math.floor(frame / 3));
    const input = { ...idle, greeting: tap + 1, reaction: reactions[tap % 4] };
    world.update(frame / 60, 1 / 60, input);
    reference.update(frame / 60, 1 / 60, idle);
    assert.ok(pose(world).every(Number.isFinite), `finite frame ${frame}`);
    assert.equal(
      world.root.getObjectByName('purchase-reward-spark-burst')!.visible,
      false,
    );
  }
  const settled = pose(world);
  pose(reference).forEach((value, index) => {
    assert.ok(
      Math.abs(settled[index] - value) < 0.002,
      `transform ${index} settled`,
    );
  });
  world.dispose();
  reference.dispose();
});

test('reduced motion holds each expressive pose and consumes taps without replay', () => {
  const poses: number[][] = [];
  for (const reaction of ['wave', 'bow', 'chuckle', 'flourish'] as const) {
    const world = createDealerWorld();
    const input = { ...idle, greeting: 1, reaction, reducedMotion: true };
    world.update(0, 1 / 60, input);
    const settled = pose(world);
    poses.push(settled);
    world.update(50, 1 / 60, input);
    assert.deepEqual(pose(world), settled, `${reaction} stays still`);
    world.update(50.01, 1 / 60, { ...input, reducedMotion: false });
    assert.equal(world.root.getObjectByName('greeting-arm')!.rotation.z, 0);
    assert.equal(
      world.root.getObjectByName('crooked-wizard-hat')!.rotation.x,
      0,
    );
    assert.equal(world.root.getObjectByName('floating-rune')!.scale.x, 1);
    assert.equal(world.root.getObjectByName('smiling-mouth')!.scale.y, 0.105);
    world.dispose();
  }
  assert.equal(new Set(poses.map((value) => JSON.stringify(value))).size, 4);
});

test('confirmed celebration overrides taps and reduced-motion greetings work after collection', () => {
  const world = createDealerWorld();
  const reference = createDealerWorld();
  for (let frame = 0; frame < 220; frame++) {
    const input = { ...idle, celebration: 1, celebrating: true };
    world.update(frame / 60, 1 / 60, {
      ...input,
      greeting: frame + 1,
      reaction: 'flourish',
    });
    reference.update(frame / 60, 1 / 60, input);
    assert.deepEqual(pose(world), pose(reference));
  }
  world.update(4, 1 / 60, {
    ...idle,
    greeting: 220,
    reaction: 'flourish',
    celebration: 1,
  });
  assert.equal(
    world.root.getObjectByName('floating-rune')!.scale.x,
    1,
    'interrupted greeting does not resume',
  );
  world.update(4, 1 / 60, {
    ...idle,
    celebration: 2,
    celebrating: true,
    reducedMotion: true,
  });
  world.update(4, 1 / 60, {
    ...idle,
    greeting: 221,
    reaction: 'flourish',
    celebration: 2,
    reducedMotion: true,
  });
  assert.ok(
    world.root.getObjectByName('floating-rune')!.position.y > 2.4,
    'new tap works on the frozen clock after Collect',
  );
  world.update(4.01, 1 / 60, {
    ...idle,
    greeting: 221,
    reaction: 'flourish',
    celebration: 2,
  });
  assert.equal(
    world.root.getObjectByName('purchase-reward-spark-burst')!.visible,
    false,
    're-enabling motion does not replay a consumed celebration',
  );
  world.dispose();
  reference.dispose();
});

test('beard stays in front of the coat and waistcoat throughout expressive poses', () => {
  const world = createDealerWorld();
  const body = [
    'tailored-teal-coat',
    'leather-waistcoat',
    'embroidered-lapel--1',
    'embroidered-lapel-1',
    'merchant-guild-pendant',
  ].map((name) => world.root.getObjectByName(name)!);
  const beard: THREE.Mesh[] = [];
  world.root.traverse((part) => {
    if (
      part instanceof THREE.Mesh &&
      (part.name === 'beard-base' || part.name.startsWith('swept-beard-lock-'))
    )
      beard.push(part);
  });
  const point = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  ray.ray.direction.set(0, 0, -1);
  try {
    for (const mode of [
      'idle', 'shop', 'celebration', 'wave', 'bow', 'chuckle', 'flourish',
    ] as const) {
      const isGreeting = mode !== 'idle' && mode !== 'shop' && mode !== 'celebration';
      const reaction = isGreeting ? mode : 'wave';
      for (const reducedMotion of [false, true]) {
        const input = {
          ...idle,
          greeting: isGreeting ? 1 : 0,
          celebration: mode === 'celebration' ? 1 : 0,
          shop: mode === 'shop',
          reaction,
          reducedMotion,
        };
        world.update(0, 1 / 60, { ...input, greeting: 0, celebration: 0 });
        world.update(0, 1 / 60, input);
        for (let frame = 0; frame <= 180; frame++) {
          world.update(frame / 60, 1 / 60, {
            ...input,
            pointerX: Math.cos(frame / 30),
            pointerY: Math.sin(frame / 20),
          });
          if (frame % 30) continue;
          world.root.updateMatrixWorld(true);
          world.root.getObjectByName('smiling-mouth')!.getWorldPosition(point);
          ray.ray.origin.set(point.x, point.y, 3);
          const mouthOccluder = ray.intersectObjects(beard, false)[0];
          assert.ok(
            !mouthOccluder || mouthOccluder.point.z < point.z,
            `${mode} beard covers speaking mouth`,
          );
          for (const part of beard) {
            const vertices = part.geometry.attributes.position;
            for (let vertex = 0; vertex < vertices.count; vertex++) {
              point.fromBufferAttribute(vertices, vertex).applyMatrix4(part.matrixWorld);
              ray.ray.origin.set(point.x, point.y, 3);
              const hit = ray.intersectObjects(body, false)[0];
              assert.ok(
                !hit || point.z > hit.point.z + 0.005,
                `${mode} reduced=${reducedMotion} frame=${frame} ${part.name} enters chest at ${point.toArray()}`,
              );
            }
          }
        }
      }
    }
  } finally {
    world.dispose();
  }
});

test('candle illumination flickers gently and holds steady with reduced motion', () => {
  const world = createDealerWorld();
  const lights: THREE.PointLight[] = [];
  world.root.traverse((part) => {
    if (part instanceof THREE.PointLight && part.name === 'warm-candle-light')
      lights.push(part);
  });
  assert.equal(lights.length, 2);
  world.update(0, 1 / 60, idle);
  const initial = lights.map((light) => light.intensity);
  world.update(0.5, 1 / 60, idle);
  assert.notDeepEqual(lights.map((light) => light.intensity), initial);
  for (const light of lights)
    assert.ok(light.intensity >= 1.92 && light.intensity <= 2.28);
  world.update(1, 1 / 60, { ...idle, reducedMotion: true });
  const still = lights.map((light) => light.intensity);
  world.update(100, 1 / 60, { ...idle, reducedMotion: true });
  assert.deepEqual(lights.map((light) => light.intensity), still);
  world.dispose();
});

test('3D cloud clusters enter from the sides, stay bounded and hold a composed reduced-motion bank', () => {
  for (const software of [false, true]) {
    const world = createDealerWorld(software);
    const wall = world.root.getObjectByName('alcove-back-wall')!;
    assert.deepEqual(wall.position.toArray(), [0, 2, -2.3]);
    assert.deepEqual(wall.scale.toArray(), [6.4, 4.6, 0.25]);
    assert.equal(world.root.getObjectByName('midnight-wizard-sky'), undefined);
    const clouds = world.root.getObjectByName('drifting-three-dimensional-clouds') as THREE.InstancedMesh;
    assert.ok(clouds.geometry instanceof THREE.SphereGeometry);
    assert.equal(clouds.count, 30);
    const surface = clouds.material as THREE.MeshStandardMaterial;
    assert.equal(surface instanceof THREE.MeshLambertMaterial, software);
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    world.update(0, 1 / 60, idle);
    clouds.getMatrixAt(0, matrix);
    const startLeft = matrix.elements[12];
    clouds.getMatrixAt(6, matrix);
    const startRight = matrix.elements[12];
    assert.ok(startLeft < -3 && startRight > 3);
    world.update(6, 1 / 60, idle);
    clouds.getMatrixAt(0, matrix);
    assert.ok(matrix.elements[12] > startLeft + 1);
    clouds.getMatrixAt(6, matrix);
    assert.ok(matrix.elements[12] < startRight - 2);
    for (const time of [6, 100, 1000]) {
      world.update(time, 1 / 60, idle);
      for (let index = 0; index < clouds.count; index++) {
        clouds.getMatrixAt(index, matrix);
        point.setFromMatrixPosition(matrix);
        assert.ok(matrix.elements.every(Number.isFinite));
        assert.ok(Math.abs(point.x) < 2.5 && point.y > 4.2 && point.y < 5.2);
        assert.ok(point.z < -0.8 && point.z > -2.1);
      }
    }
    const moving = Array.from(clouds.instanceMatrix.array);
    world.update(1001, 1 / 60, idle);
    assert.notDeepEqual(Array.from(clouds.instanceMatrix.array), moving);
    world.update(0, 1 / 60, { ...idle, reducedMotion: true });
    const still = Array.from(clouds.instanceMatrix.array);
    for (let index = 0; index < clouds.count; index++) {
      clouds.getMatrixAt(index, matrix);
      assert.ok(Math.abs(matrix.elements[12]) < 2.5);
    }
    world.update(100, 1 / 60, { ...idle, reducedMotion: true });
    assert.deepEqual(Array.from(clouds.instanceMatrix.array), still);
    world.update(0.01, 1 / 60, idle);
    for (let index = 0; index < clouds.count; index++) {
      clouds.getMatrixAt(index, matrix);
      assert.ok(Math.abs(matrix.elements[12]) < 2.5, 'enabling motion does not replay side entry');
    }
    world.dispose();
  }
});

test('arcane cloud haze and slow spell shimmer follow entry, freeze and release their shared texture once', () => {
  const world = createDealerWorld();
  const clouds = world.root.getObjectByName('drifting-three-dimensional-clouds') as THREE.InstancedMesh;
  const haze = world.root.getObjectByName('cloud-ethereal-haze') as THREE.InstancedMesh;
  const motes = world.root.getObjectByName('cloud-spell-motes') as THREE.Points;
  const cloudSurface = clouds.material as THREE.MeshStandardMaterial;
  const hazeSurface = haze.material as THREE.MeshBasicMaterial;
  const moteSurface = motes.material as THREE.PointsMaterial;
  const filament = world.root.getObjectByName('cloud-flowing-filament-0')!;
  const filamentSurface = (filament.getObjectByName('flowing-arcane-filament') as THREE.Mesh).material as THREE.MeshBasicMaterial;
  assert.equal(hazeSurface.map, moteSurface.map);
  assert.ok(hazeSurface.transparent && !hazeSurface.depthWrite);
  let textureDisposals = 0;
  hazeSurface.map!.addEventListener('dispose', () => textureDisposals++);
  const coreMatrix = new THREE.Matrix4();
  const hazeMatrix = new THREE.Matrix4();
  const pulses: number[] = [];
  for (const time of [0, 2, 6, 12, 50]) {
    world.update(time, 1 / 60, idle);
    pulses.push(cloudSurface.emissiveIntensity);
    clouds.getMatrixAt(6, coreMatrix);
    assert.ok(Math.abs(filament.position.x - coreMatrix.elements[12]) < 0.00001);
    assert.ok(filamentSurface.opacity >= 0.419 && filamentSurface.opacity <= 0.581);
    assert.ok([...filament.position, ...filament.scale, ...filament.quaternion].every(Number.isFinite));
    assert.ok(cloudSurface.emissiveIntensity >= 0.779 && cloudSurface.emissiveIntensity <= 1.021);
    assert.ok(hazeSurface.opacity >= 0.399 && hazeSurface.opacity <= 0.501);
    for (let cluster = 0; cluster < 5; cluster++) {
      clouds.getMatrixAt(cluster * 6, coreMatrix);
      for (let wisp = 0; wisp < 4; wisp++) {
        const index = cluster * 4 + wisp;
        haze.getMatrixAt(index, hazeMatrix);
        assert.ok(hazeMatrix.elements.every(Number.isFinite));
        assert.ok(Math.abs(hazeMatrix.elements[12] - coreMatrix.elements[12]) < 0.4);
        assert.ok(Math.abs(motes.geometry.attributes.position.getX(index) - coreMatrix.elements[12]) < 0.7);
      }
    }
    assert.ok(Array.from(motes.geometry.attributes.position.array).every(Number.isFinite));
    assert.ok(Array.from(motes.geometry.attributes.color.array).every(value => value >= 0 && value <= 0.86));
  }
  assert.ok(Math.max(...pulses) - Math.min(...pulses) > 0.1);
  world.update(50, 1 / 60, { ...idle, reducedMotion: true });
  const still = {
    haze: Array.from(haze.instanceMatrix.array),
    motes: Array.from(motes.geometry.attributes.position.array),
    colors: Array.from(motes.geometry.attributes.color.array),
    pulse: cloudSurface.emissiveIntensity,
    opacity: hazeSurface.opacity,
    filament: [...filament.position, ...filament.scale, ...filament.quaternion],
    shimmer: filamentSurface.opacity,
  };
  world.update(100, 1 / 60, { ...idle, reducedMotion: true });
  assert.deepEqual({
    haze: Array.from(haze.instanceMatrix.array),
    motes: Array.from(motes.geometry.attributes.position.array),
    colors: Array.from(motes.geometry.attributes.color.array),
    pulse: cloudSurface.emissiveIntensity,
    opacity: hazeSurface.opacity,
    filament: [...filament.position, ...filament.scale, ...filament.quaternion],
    shimmer: filamentSurface.opacity,
  }, still);
  world.dispose();
  world.dispose();
  assert.equal(textureDisposals, 1);
});
