import * as THREE from 'three';

export type DealerInteraction = {
  pointerX: number;
  pointerY: number;
  greeting: number;
  celebration: number;
  shop: boolean;
  reducedMotion: boolean;
};

/** Original, texture-free character and set, shared by native and web renderers. */
export function createDealerWorld(softwareRenderer = false) {
  const root = new THREE.Group();
  root.name = 'ember-rune-dealer-world';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const instances: THREE.InstancedMesh[] = [];
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => {
    geometries.add(value);
    return value;
  };
  const material = (color: number, roughness = 0.65, metalness = 0) => {
    const value = softwareRenderer
      ? new THREE.MeshLambertMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(value);
    return value;
  };
  const skin = material(0xd99b72, 0.75);
  const blush = material(0xc77d61, 0.8);
  const beard = material(0xead6b4, 0.8);
  const beardLight = material(0xffedca, 0.7);
  const teal = material(0x14676a, 0.8);
  const tealLight = material(0x288989, 0.72);
  const midnight = material(0x142e3b, 0.85);
  const copper = material(0xb67b3d, 0.35, 0.72);
  const gold = material(0xf0bd60, 0.3, 0.75);
  const leather = material(0x53372b, 0.9);
  const wood = material(0x503326, 0.85);
  const woodLight = material(0x855336, 0.8);
  const woodDark = material(0x281d20, 0.9);
  const stone = material(0x28353c, 0.95);
  const mortar = material(0x182830, 0.95);
  const ivory = material(0xfff3d9, 0.45);
  const iris = material(0x198f73, 0.36, 0.1);
  const pupil = material(0x10262a, 0.35);
  const crystalMaterial = material(0x67eadc, 0.2, 0.3);
  crystalMaterial.emissive.setHex(0x15968b);
  crystalMaterial.emissiveIntensity = 0.8;
  const glow = material(0x73f1dc, 0.5);
  glow.emissive.setHex(0x48e9ce);
  glow.emissiveIntensity = 2;
  const flame = material(0xffd995, 0.5);
  flame.emissive.setHex(0xff9f38);
  flame.emissiveIntensity = 2.3;
  const windowMaterial = material(0x3d8792, 0.75);
  windowMaterial.emissive.setHex(0x286b82);
  windowMaterial.emissiveIntensity = 0.5;

  const sphere = geometry(new THREE.SphereGeometry(1, 20, 14));
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 20));
  const torus = geometry(new THREE.TorusGeometry(1, 0.09, 6, 28));
  const drop = geometry(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -0.55),
        new THREE.Vector2(0.08, -0.38),
        new THREE.Vector2(0.16, -0.06),
        new THREE.Vector2(0.17, 0.12),
        new THREE.Vector2(0.12, 0.27),
        new THREE.Vector2(0, 0.33),
      ],
      14,
    ),
  );
  const mesh = (
    name: string,
    shape: THREE.BufferGeometry,
    surface: THREE.Material,
    parent = root,
    position: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ) => {
    const value = new THREE.Mesh(shape, surface);
    value.name = name;
    value.position.set(...position);
    value.scale.set(...scale);
    value.castShadow = true;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  };
  const orb = (
    name: string,
    surface: THREE.Material,
    parent: THREE.Group,
    position: [number, number, number],
    scale: [number, number, number],
  ) => mesh(name, sphere, surface, parent, position, scale);
  const beam = (
    name: string,
    surface: THREE.Material,
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    parent = root,
  ) => {
    const value = mesh(name, cylinder, surface, parent);
    value.position.copy(from).add(to).multiplyScalar(0.5);
    value.scale.set(radius, from.distanceTo(to), radius);
    value.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    return value;
  };
  const curve = (
    name: string,
    surface: THREE.Material,
    points: THREE.Vector3[],
    radius: number,
    parent = root,
  ) =>
    mesh(
      name,
      geometry(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          22,
          radius,
          6,
          false,
        ),
      ),
      surface,
      parent,
    );
  const instance = (
    name: string,
    shape: THREE.BufferGeometry,
    surface: THREE.Material,
    transforms: {
      position: [number, number, number];
      scale: [number, number, number];
      rotation?: number;
    }[],
    parent = root,
  ) => {
    const value = new THREE.InstancedMesh(shape, surface, transforms.length);
    value.name = name;
    const transform = new THREE.Object3D();
    transforms.forEach((item, index) => {
      transform.position.set(...item.position);
      transform.scale.set(...item.scale);
      transform.rotation.set(0, item.rotation ?? 0, 0);
      transform.updateMatrix();
      value.setMatrixAt(index, transform.matrix);
    });
    instances.push(value);
    value.castShadow = true;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  };

  // The round forms overlap like a hand-sculpted character, with deliberately oversized facial features.
  const merchant = new THREE.Group();
  merchant.name = 'merchant';
  root.add(merchant);
  const torso = geometry(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.67, 0),
        new THREE.Vector2(0.75, 0.18),
        new THREE.Vector2(0.7, 0.55),
        new THREE.Vector2(0.57, 0.92),
        new THREE.Vector2(0.3, 1.03),
        new THREE.Vector2(0, 1.04),
      ],
      26,
    ),
  );
  mesh('tailored-teal-coat', torso, teal, merchant, [0, 0.88, 0], [1, 1, 0.72]);
  orb(
    'leather-waistcoat',
    leather,
    merchant,
    [0, 1.43, 0.34],
    [0.43, 0.55, 0.19],
  );
  for (const side of [-1, 1]) {
    const lapel = orb(
      `embroidered-lapel-${side}`,
      tealLight,
      merchant,
      [side * 0.31, 1.63, 0.41],
      [0.14, 0.39, 0.1],
    );
    lapel.rotation.z = side * -0.25;
    curve(
      `lapel-gold-seam-${side}`,
      copper,
      [
        new THREE.Vector3(side * 0.4, 1.9, 0.44),
        new THREE.Vector3(side * 0.35, 1.67, 0.52),
        new THREE.Vector3(side * 0.22, 1.34, 0.51),
      ],
      0.017,
      merchant,
    );
  }
  instance(
    'waistcoat-buttons',
    sphere,
    gold,
    [1.18, 1.37, 1.56].map((y) => ({
      position: [0, y, 0.55],
      scale: [0.037, 0.037, 0.027],
    })),
    merchant,
  );
  const pendant = mesh(
    'merchant-guild-pendant',
    geometry(new THREE.OctahedronGeometry(0.09)),
    gold,
    merchant,
    [0, 1.72, 0.64],
  );
  pendant.rotation.z = 0.3;
  curve(
    'pendant-chain',
    copper,
    [
      new THREE.Vector3(-0.18, 1.92, 0.38),
      new THREE.Vector3(0, 1.72, 0.6),
      new THREE.Vector3(0.18, 1.92, 0.38),
    ],
    0.013,
    merchant,
  );

  const head = new THREE.Group();
  head.name = 'expressive-head';
  head.position.set(0, 2.45, 0.12);
  merchant.add(head);
  orb('rounded-face', skin, head, [0, 0, 0], [0.57, 0.59, 0.46]);
  orb('jaw', skin, head, [0, -0.3, 0.06], [0.47, 0.33, 0.4]);
  for (const side of [-1, 1]) {
    const ear = orb(
      `pointed-ear-${side}`,
      skin,
      head,
      [side * 0.57, 0.02, -0.02],
      [0.21, 0.25, 0.115],
    );
    ear.rotation.z = side * -0.45;
    const innerEar = orb(
      `ear-inner-${side}`,
      blush,
      head,
      [side * 0.61, 0.025, 0.075],
      [0.105, 0.15, 0.025],
    );
    innerEar.rotation.z = side * -0.45;
    orb(
      `rosy-cheek-${side}`,
      blush,
      head,
      [side * 0.34, -0.12, 0.35],
      [0.2, 0.14, 0.095],
    );
    orb(
      `bushy-sideburn-${side}`,
      beard,
      head,
      [side * 0.44, -0.24, 0.17],
      [0.16, 0.3, 0.23],
    );
  }
  const eyes: THREE.Group[] = [];
  const pupils: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.name = `blinking-eye-${side}`;
    eye.position.set(side * 0.215, 0.09, 0.405);
    head.add(eye);
    eyes.push(eye);
    orb('eye-socket', blush, eye, [0, 0.002, -0.028], [0.187, 0.162, 0.073]);
    orb('eye-white', ivory, eye, [0, 0, 0], [0.159, 0.13, 0.062]);
    const gaze = new THREE.Group();
    gaze.name = 'tracking-iris';
    eye.add(gaze);
    pupils.push(gaze);
    orb('emerald-iris', iris, gaze, [0, 0, 0.052], [0.078, 0.094, 0.027]);
    orb('deep-pupil', pupil, gaze, [0, 0, 0.075], [0.034, 0.058, 0.012]);
    orb(
      'eye-catchlight',
      ivory,
      gaze,
      [-0.025, 0.031, 0.085],
      [0.02, 0.024, 0.008],
    );
    curve(
      `upper-eyelid-${side}`,
      skin,
      [
        new THREE.Vector3(-0.16, 0.01, 0.01),
        new THREE.Vector3(0, 0.13, 0.02),
        new THREE.Vector3(0.16, 0.01, 0.01),
      ],
      0.026,
      eye,
    );
    const brow = curve(
      `sculpted-eyebrow-${side}`,
      beardLight,
      [
        new THREE.Vector3(side * 0.08, 0.265, 0.37),
        new THREE.Vector3(side * 0.23, 0.3, 0.405),
        new THREE.Vector3(side * 0.39, 0.24, 0.33),
      ],
      0.065,
      head,
    );
    brow.rotation.z = side * -0.025;
  }
  orb('proud-round-nose', skin, head, [0, -0.055, 0.53], [0.17, 0.2, 0.18]);
  for (const side of [-1, 1])
    orb(
      `nose-wing-${side}`,
      skin,
      head,
      [side * 0.12, -0.13, 0.49],
      [0.085, 0.07, 0.085],
    );
  orb(
    'smiling-mouth',
    woodDark,
    head,
    [0, -0.285, 0.415],
    [0.24, 0.105, 0.055],
  );
  orb(
    'friendly-smile-teeth',
    ivory,
    head,
    [0, -0.25, 0.457],
    [0.17, 0.037, 0.021],
  );
  orb('beard-base', beard, head, [0, -0.44, 0.18], [0.47, 0.35, 0.33]);
  for (let index = -3; index <= 3; index++) {
    const strand = mesh(
      `swept-beard-lock-${index}`,
      drop,
      index % 2 ? beardLight : beard,
      head,
      [
        index * 0.105,
        -0.43 + Math.abs(index) * 0.028,
        0.39 - Math.abs(index) * 0.04,
      ],
      [1 - Math.abs(index) * 0.07, index === 0 ? 0.94 : 0.78, 0.8],
    );
    strand.rotation.z = index * -0.16 + 0.07;
    strand.rotation.x = -0.14;
  }
  for (const side of [-1, 1]) {
    const moustache = mesh(
      `swept-moustache-${side}`,
      drop,
      beardLight,
      head,
      [side * 0.18, -0.2, 0.51],
      [0.7, 0.7, 0.48],
    );
    moustache.rotation.z = side * 1.05;
    moustache.rotation.x = -0.25;
  }

  const hat = new THREE.Group();
  hat.name = 'crooked-wizard-hat';
  hat.position.set(0, 0.43, -0.03);
  head.add(hat);
  mesh(
    'broad-hat-brim',
    cylinder,
    midnight,
    hat,
    [0, 0, 0],
    [0.78, 0.095, 0.61],
  );
  const brimEdge = mesh(
    'brim-copper-piping',
    torus,
    copper,
    hat,
    [0, 0.035, 0],
    [0.755, 0.59, 0.55],
  );
  brimEdge.rotation.x = Math.PI / 2;
  const hatProfile = geometry(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.53, 0),
        new THREE.Vector2(0.51, 0.17),
        new THREE.Vector2(0.43, 0.43),
        new THREE.Vector2(0.32, 0.68),
        new THREE.Vector2(0.2, 0.86),
        new THREE.Vector2(0.08, 1.01),
        new THREE.Vector2(0, 1.06),
      ],
      26,
    ),
  );
  const vertices = hatProfile.attributes.position;
  for (let index = 0; index < vertices.count; index++) {
    const y = vertices.getY(index);
    vertices.setX(index, vertices.getX(index) + 0.48 * y * y);
    vertices.setY(index, y - 0.22 * y * y);
  }
  hatProfile.computeVertexNormals();
  mesh('bent-felt-crown', hatProfile, teal, hat);
  mesh(
    'leather-hat-band',
    cylinder,
    leather,
    hat,
    [0.008, 0.14, 0],
    [0.515, 0.19, 0.515],
  );
  const buckle = mesh(
    'hat-buckle',
    torus,
    gold,
    hat,
    [0.03, 0.15, 0.51],
    [0.115, 0.09, 0.4],
  );
  buckle.rotation.z = Math.PI / 4;
  mesh(
    'hat-buckle-center',
    geometry(new THREE.OctahedronGeometry(0.062)),
    crystalMaterial,
    hat,
    [0.03, 0.15, 0.54],
  );
  curve(
    'hat-stitched-seam',
    copper,
    [
      new THREE.Vector3(-0.36, 0.27, 0.34),
      new THREE.Vector3(-0.2, 0.56, 0.27),
      new THREE.Vector3(0.04, 0.76, 0.16),
    ],
    0.012,
    hat,
  );

  const arm = (side: number, raised: boolean) => {
    const group = new THREE.Group();
    group.name = raised ? 'crystal-hand-arm' : 'greeting-arm';
    group.position.set(side * 0.54, 1.78, 0);
    merchant.add(group);
    const elbow = new THREE.Vector3(side * 0.36, -0.32, 0.15);
    const wrist = new THREE.Vector3(
      side * 0.52,
      raised ? -0.02 : -0.63,
      raised ? 0.55 : 0.7,
    );
    beam('padded-upper-sleeve', teal, new THREE.Vector3(), elbow, 0.23, group);
    orb('round-shoulder', teal, group, [0, 0, 0], [0.25, 0.27, 0.25]);
    beam('forearm-sleeve', tealLight, elbow, wrist, 0.19, group);
    const cuffFrom = wrist.clone().lerp(elbow, 0.15);
    beam('brass-embroidered-cuff', copper, cuffFrom, wrist, 0.2, group);
    const hand = new THREE.Group();
    hand.name = raised ? 'open-crystal-palm' : 'resting-hand';
    hand.position.copy(wrist);
    hand.rotation.z = raised ? -0.12 : -0.12 * side;
    group.add(hand);
    orb('rounded-palm', skin, hand, [0, 0.01, 0.1], [0.18, 0.075, 0.17]);
    for (let finger = 0; finger < 4; finger++) {
      const x = (finger - 1.5) * 0.08;
      const digit = orb(
        `finger-${finger}`,
        skin,
        hand,
        [x, raised ? 0.02 : -0.04, 0.23],
        [0.043, 0.05, 0.11 - Math.abs(finger - 1.5) * 0.012],
      );
      digit.rotation.x = raised ? -0.35 : 0.3;
    }
    const thumb = orb(
      'curled-thumb',
      skin,
      hand,
      [-side * 0.17, 0.065, 0.14],
      [0.058, 0.065, 0.1],
    );
    thumb.rotation.z = side * -0.6;
    const ring = mesh(
      'merchant-ring',
      torus,
      gold,
      hand,
      [0.035, 0, 0.22],
      [0.045, 0.045, 0.045],
    );
    ring.rotation.x = Math.PI / 2;
    return group;
  };
  const greetingArm = arm(-1, false);
  const crystalArm = arm(1, true);

  const magic = new THREE.Group();
  magic.name = 'floating-rune';
  magic.position.set(1.05, 2.23, 0.77);
  merchant.add(magic);
  const crystal = mesh(
    'levitating-faceted-crystal',
    geometry(new THREE.OctahedronGeometry(0.23)),
    crystalMaterial,
    magic,
    [0, 0, 0],
    [0.8, 1.5, 0.8],
  );
  const runeRings: THREE.Mesh[] = [];
  for (let index = 0; index < 2; index++) {
    const ring = mesh(
      `orbiting-brass-ring-${index}`,
      torus,
      index ? glow : gold,
      magic,
      [0, 0, 0],
      [0.33 + index * 0.07, 0.33 + index * 0.07, 0.16],
    );
    ring.rotation.set(0.7 + index * 0.8, index * 0.9, 0.5);
    runeRings.push(ring);
  }
  const magicLight = new THREE.PointLight(0x3ef5d5, 1.8, 3, 2);
  magicLight.name = 'crystal-bounce-light';
  magic.add(magicLight);

  const counter = new THREE.Group();
  counter.name = 'curved-apothecary-counter';
  counter.position.z = -1.65;
  root.add(counter);
  mesh(
    'curved-wood-counter-front',
    geometry(new THREE.CylinderGeometry(2.65, 2.65, 0.75, 40, 1, true, -1, 2)),
    wood,
    counter,
    [0, 0.43, 0],
  );
  mesh(
    'solid-polished-countertop',
    geometry(new THREE.CylinderGeometry(2.73, 2.73, 0.12, 40, 1, false, -1, 2)),
    woodLight,
    counter,
    [0, 0.87, 0],
  );
  for (const y of [0.08, 0.76, 0.94]) {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 30; index++) {
      const angle = -1 + index / 15;
      points.push(
        new THREE.Vector3(Math.sin(angle) * 2.68, y, Math.cos(angle) * 2.68),
      );
    }
    curve(
      `counter-copper-trim-${y}`,
      copper,
      points,
      y === 0.94 ? 0.025 : 0.035,
      counter,
    );
  }
  instance(
    'counter-panel-dividers',
    box,
    woodDark,
    Array.from({ length: 9 }, (_, index) => {
      const angle = -0.9 + index * 0.225;
      return {
        position: [Math.sin(angle) * 2.66, 0.42, Math.cos(angle) * 2.66],
        scale: [0.025, 0.64, 0.035],
        rotation: angle,
      };
    }),
    counter,
  );
  const counterEmblem = mesh(
    'counter-guild-medallion',
    cylinder,
    copper,
    root,
    [0, 0.43, 1.03],
    [0.2, 0.035, 0.2],
  );
  counterEmblem.rotation.x = Math.PI / 2;
  const guildGem = mesh(
    'guild-medallion-gem',
    geometry(new THREE.OctahedronGeometry(0.105)),
    tealLight,
    root,
    [0, 0.43, 1.065],
    [0.75, 1, 0.4],
  );
  guildGem.rotation.z = Math.PI / 4;

  // Shelves, arch stones and coins are instanced to keep the mobile draw count modest.
  mesh('alcove-back-wall', box, mortar, root, [0, 2, -2.3], [6.4, 4.6, 0.25]);
  const arch = new THREE.Shape();
  arch.moveTo(-0.62, 0);
  arch.lineTo(0.62, 0);
  arch.lineTo(0.62, 1.15);
  arch.absarc(0, 1.15, 0.62, 0, Math.PI, false);
  arch.lineTo(-0.62, 0);
  mesh(
    'arched-moonlit-window',
    geometry(new THREE.ShapeGeometry(arch, 24)),
    windowMaterial,
    root,
    [0, 1.7, -2.14],
  );
  beam(
    'window-center-mullion',
    copper,
    new THREE.Vector3(0, 1.68, -2.1),
    new THREE.Vector3(0, 3.46, -2.1),
    0.025,
  );
  beam(
    'window-crossbar',
    copper,
    new THREE.Vector3(-0.6, 2.65, -2.1),
    new THREE.Vector3(0.6, 2.65, -2.1),
    0.025,
  );
  const archStones: {
    position: [number, number, number];
    scale: [number, number, number];
    rotation?: number;
  }[] = [];
  for (let index = 0; index < 11; index++) {
    const angle = (index / 10) * Math.PI;
    const block = mesh(
      `arch-keystone-${index}`,
      box,
      stone,
      root,
      [Math.cos(angle) * 0.79, 2.85 + Math.sin(angle) * 0.79, -2.05],
      [0.28, 0.28, 0.22],
    );
    block.rotation.z = angle - Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index++)
      archStones.push({
        position: [side * 0.79, 1.81 + index * 0.28, -2.05],
        scale: [0.28, 0.25, 0.22],
      });
    mesh(
      `shelf-side-back-${side}`,
      box,
      woodDark,
      root,
      [side * 1.85, 2, -2.04],
      [1.5, 3.4, 0.15],
    );
    for (const y of [1.2, 2.1, 3.05]) {
      mesh(
        `wood-shelf-${side}-${y}`,
        box,
        woodLight,
        root,
        [side * 1.85, y, -1.74],
        [1.55, 0.09, 0.65],
      );
      for (const offset of [-0.54, 0.54]) {
        beam(
          'shelf-bracket',
          copper,
          new THREE.Vector3(side * 1.85 + offset, y - 0.23, -1.98),
          new THREE.Vector3(side * 1.85 + offset, y - 0.04, -1.5),
          0.025,
        );
      }
    }
  }
  instance('window-jamb-stones', box, stone, archStones);
  const bottleColors = [
    material(0x247d75, 0.25, 0.12),
    material(0x8b4f70, 0.3, 0.1),
    material(0x927237, 0.3, 0.15),
  ];
  const bottleNecks: {
    position: [number, number, number];
    scale: [number, number, number];
  }[] = [];
  const bottleCorks: typeof bottleNecks = [];
  const bottleLabels: typeof bottleNecks = [];
  for (let index = 0; index < 12; index++) {
    const side = index < 6 ? -1 : 1;
    const local = index % 6;
    const x = side * 1.85 + ((local % 3) - 1) * 0.42;
    const y = local < 3 ? 2.1 : 3.05;
    const height = 0.25 + (index % 3) * 0.045;
    orb(
      `potion-bottle-${index}`,
      bottleColors[index % 3],
      root,
      [x, y + height * 0.65, -1.66],
      [0.12, height * 0.65, 0.12],
    );
    bottleNecks.push({
      position: [x, y + height * 1.35, -1.66],
      scale: [0.047, 0.14, 0.047],
    });
    bottleCorks.push({
      position: [x, y + height * 1.35 + 0.08, -1.66],
      scale: [0.052, 0.05, 0.052],
    });
    bottleLabels.push({
      position: [x, y + height * 0.58, -1.54],
      scale: [0.13, 0.1, 0.012],
    });
  }
  instance('potion-bottle-necks', cylinder, bottleColors[0], bottleNecks);
  instance('potion-corks', cylinder, leather, bottleCorks);
  instance('potion-parchment-labels', box, ivory, bottleLabels);
  for (let index = 0; index < 5; index++) {
    const book = mesh(
      `antique-spellbook-${index}`,
      box,
      index % 2 ? leather : midnight,
      root,
      [-2.12 + index * 0.16, 1.47, -1.68],
      [0.13, 0.47 + (index % 3) * 0.05, 0.3],
    );
    book.rotation.z = index === 4 ? -0.15 : 0;
  }
  instance(
    'book-spine-bands',
    box,
    copper,
    Array.from({ length: 10 }, (_, index) => ({
      position: [
        -2.12 + Math.floor(index / 2) * 0.16,
        1.34 + (index % 2) * 0.22,
        -1.52,
      ],
      scale: [0.135, 0.02, 0.015],
    })),
  );
  mesh(
    'small-treasure-chest',
    box,
    wood,
    root,
    [1.8, 1.44, -1.65],
    [0.7, 0.4, 0.42],
  );
  const chestLid = mesh(
    'chest-rounded-lid',
    cylinder,
    woodLight,
    root,
    [1.8, 1.65, -1.65],
    [0.23, 0.7, 0.23],
  );
  chestLid.rotation.z = Math.PI / 2;
  for (const x of [1.55, 2.05])
    mesh(
      'chest-brass-strap',
      box,
      copper,
      root,
      [x, 1.47, -1.425],
      [0.055, 0.4, 0.025],
    );
  mesh('chest-lock', box, gold, root, [1.8, 1.5, -1.4], [0.09, 0.1, 0.035]);

  const candleFlames: THREE.Mesh[] = [];
  for (const [index, x] of [-1.75, 1.8].entries()) {
    const y = index ? 1.2 : 0.95;
    const z = index ? -1.55 : 0.28;
    mesh(
      'candle-brass-base',
      cylinder,
      copper,
      root,
      [x, y, z],
      [0.13, 0.05, 0.13],
    );
    mesh(
      'wax-candle',
      cylinder,
      ivory,
      root,
      [x, y + 0.18, z],
      [0.065, 0.32, 0.065],
    );
    const wick = mesh(
      'candle-flame',
      drop,
      flame,
      root,
      [x, y + 0.42, z],
      [0.32, 0.2, 0.32],
    );
    wick.rotation.z = Math.PI + 0.12;
    candleFlames.push(wick);
    const light = new THREE.PointLight(0xffa650, 2.1, 3.5, 2);
    light.name = 'warm-candle-light';
    light.position.set(x, y + 0.4, z);
    root.add(light);
  }
  const coinTransforms: {
    position: [number, number, number];
    scale: [number, number, number];
    rotation: number;
  }[] = [];
  for (let index = 0; index < 13; index++) {
    coinTransforms.push({
      position: [
        -0.53 + Math.sin(index * 2.4) * 0.19,
        0.965 + Math.floor(index / 4) * 0.018,
        0.54 + Math.cos(index * 1.7) * 0.1,
      ],
      scale: [0.07, 0.018, 0.07],
      rotation: index,
    });
  }
  instance('scattered-counter-gold', cylinder, gold, coinTransforms);
  const scroll = mesh(
    'rolled-counter-scroll',
    cylinder,
    ivory,
    root,
    [0.48, 1, 0.65],
    [0.065, 0.48, 0.065],
  );
  scroll.rotation.z = Math.PI / 2;
  const scrollTie = mesh(
    'scroll-copper-tie',
    torus,
    copper,
    root,
    [0.48, 1, 0.65],
    [0.072, 0.072, 0.072],
  );
  scrollTie.rotation.y = Math.PI / 2;

  const particleCount = 28;
  const particleGeometry = geometry(new THREE.BufferGeometry());
  const particlePositions = new Float32Array(particleCount * 3);
  particleGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(particlePositions, 3),
  );
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x88f6dd,
    size: 0.035,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.add(particleMaterial);
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.name = 'floating-magic-motes';
  particles.frustumCulled = false;
  root.add(particles);

  const burstCount = 48;
  const burstGeometry = geometry(new THREE.BufferGeometry());
  const burstPositions = new Float32Array(burstCount * 3);
  const burstColors = new Float32Array(burstCount * 3);
  for (let index = 0; index < burstCount; index++) {
    const color = new THREE.Color(index % 3 ? 0xffd78a : 0x80f1dd);
    color.toArray(burstColors, index * 3);
  }
  burstGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(burstPositions, 3),
  );
  burstGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(burstColors, 3),
  );
  const burstMaterial = new THREE.PointsMaterial({
    size: 0.065,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.add(burstMaterial);
  const rewardBurst = new THREE.Points(burstGeometry, burstMaterial);
  rewardBurst.name = 'purchase-reward-spark-burst';
  rewardBurst.frustumCulled = false;
  rewardBurst.visible = false;
  root.add(rewardBurst);
  const smile = head.getObjectByName('smiling-mouth')!;
  const teeth = head.getObjectByName('friendly-smile-teeth')!;

  let lastGreeting = 0;
  let lastCelebration = 0;
  let greetingStarted = -100;
  let celebrationStarted = -100;
  let elapsed = 0;
  let disposed = false;
  const update = (
    timeSeconds: number,
    deltaSeconds: number,
    interaction: DealerInteraction,
  ) => {
    if (disposed) return;
    const time = Number.isFinite(timeSeconds)
      ? Math.max(0, timeSeconds)
      : elapsed;
    const delta = Number.isFinite(deltaSeconds)
      ? THREE.MathUtils.clamp(deltaSeconds, 0, 0.1)
      : 0;
    elapsed = time;
    if (interaction.greeting !== lastGreeting) {
      lastGreeting = interaction.greeting;
      greetingStarted = time;
    }
    if (interaction.celebration !== lastCelebration) {
      lastCelebration = interaction.celebration;
      celebrationStarted = time;
    }
    const still = interaction.reducedMotion;
    const idle = still ? 0 : time;
    const greetingAge = time - greetingStarted;
    const greeting =
      !still && greetingAge < 2 ? Math.sin((greetingAge / 2) * Math.PI) : 0;
    const celebrationAge = time - celebrationStarted;
    const celebration =
      !still && celebrationAge < 3
        ? Math.sin((celebrationAge / 3) * Math.PI)
        : 0;
    const pointerX = Number.isFinite(interaction.pointerX)
      ? THREE.MathUtils.clamp(interaction.pointerX, -1, 1)
      : 0;
    const pointerY = Number.isFinite(interaction.pointerY)
      ? THREE.MathUtils.clamp(interaction.pointerY, -1, 1)
      : 0;
    const ease = still ? 1 : 1 - Math.exp(-delta * 5);
    head.rotation.y = THREE.MathUtils.lerp(
      head.rotation.y,
      still ? 0 : pointerX * 0.12 + Math.sin(idle * 0.47) * 0.025,
      ease,
    );
    head.rotation.x = THREE.MathUtils.lerp(
      head.rotation.x,
      still ? 0 : pointerY * 0.07 + greeting * 0.18 - celebration * 0.13,
      ease,
    );
    head.rotation.z = still
      ? 0
      : Math.sin(idle * 0.65) * 0.025 -
        greeting * 0.065 +
        celebration * Math.sin(celebrationAge * 7) * 0.06;
    merchant.position.y = still
      ? 0
      : Math.sin(idle * 1.6) * 0.014 +
        celebration * Math.abs(Math.sin(celebrationAge * 5)) * 0.13;
    merchant.rotation.y = THREE.MathUtils.lerp(
      merchant.rotation.y,
      interaction.shop && !still ? -0.035 : 0,
      ease,
    );
    greetingArm.rotation.z = still
      ? 0
      : -greeting * 0.28 -
        celebration * (1.4 + Math.sin(celebrationAge * 11) * 0.25);
    greetingArm.rotation.x = still ? 0 : -greeting * 0.25 - celebration * 0.18;
    crystalArm.rotation.x = still
      ? 0
      : Math.sin(idle * 1.3) * 0.025 - celebration * 0.35;
    crystalArm.rotation.z = still ? 0 : celebration * 0.65;
    smile.scale.y = 0.105 * (1 + celebration * 0.65);
    teeth.scale.y = 0.037 * (1 + celebration * 0.3);
    hat.rotation.z = still
      ? 0
      : Math.sin(idle * 1.1 + 0.5) * 0.012 + greeting * 0.09;
    const blinkPhase = idle % 4.7;
    const blink = still
      ? 1
      : blinkPhase > 4.48
        ? Math.max(0.06, Math.abs(blinkPhase - 4.59) / 0.11)
        : 1;
    eyes.forEach((eye) => {
      eye.scale.y = blink;
    });
    pupils.forEach((gaze) => {
      gaze.position.set(
        still ? 0 : pointerX * 0.022,
        still ? 0 : -pointerY * 0.015,
        0,
      );
    });
    magic.position.y =
      2.23 + (still ? 0 : Math.sin(idle * 1.7) * 0.07) + celebration * 0.18;
    crystal.rotation.y = still ? 0.35 : idle * 0.55;
    crystal.rotation.z = still ? 0.12 : Math.sin(idle * 0.8) * 0.13;
    magic.scale.setScalar(1 + celebration * 0.38);
    runeRings.forEach((ring, index) => {
      ring.rotation.y =
        (index ? 0.9 : 0) + (still ? 0 : idle * (index ? -0.35 : 0.45));
      ring.rotation.x =
        0.7 + index * 0.8 + (still ? 0 : Math.sin(idle * 0.7) * 0.18);
    });
    magicLight.intensity = 1.8 + celebration * 2;
    candleFlames.forEach((value, index) => {
      value.scale.y = 0.2 * (still ? 1 : 1 + Math.sin(idle * 9 + index) * 0.1);
      value.rotation.z =
        Math.PI + 0.12 + (still ? 0 : Math.sin(idle * 6 + index) * 0.1);
    });
    for (let index = 0; index < particleCount; index++) {
      const phase = index * 2.39996;
      const spread = index < 16 ? 0.4 + (index % 4) * 0.06 : 1.6;
      const centerX = index < 16 ? 1.05 : 0;
      particlePositions[index * 3] =
        centerX + Math.sin(phase + idle * 0.35) * spread * (1 + celebration);
      particlePositions[index * 3 + 1] =
        1 + ((index * 0.137 + idle * 0.12) % 2.4) + celebration * 0.25;
      particlePositions[index * 3 + 2] =
        0.3 + Math.cos(phase + idle * 0.35) * spread * 0.5;
    }
    particleGeometry.attributes.position.needsUpdate = true;
    rewardBurst.visible = celebration > 0.01;
    burstMaterial.opacity = Math.max(0, 1 - celebrationAge / 3) * 0.95;
    if (rewardBurst.visible) {
      const life = celebrationAge / 3;
      for (let index = 0; index < burstCount; index++) {
        const angle = index * 2.39996;
        const radius = 0.15 + Math.pow(life, 0.65) * (1.1 + (index % 7) * 0.12);
        burstPositions[index * 3] = Math.sin(angle) * radius;
        burstPositions[index * 3 + 1] =
          2.1 + (0.4 + (index % 5) / 5) * life * 2.8 - life * life * 1.6;
        burstPositions[index * 3 + 2] = 0.9 + Math.cos(angle) * radius * 0.6;
      }
      burstGeometry.attributes.position.needsUpdate = true;
    }
  };
  update(0, 0, {
    pointerX: 0,
    pointerY: 0,
    greeting: 0,
    celebration: 0,
    shop: false,
    reducedMotion: false,
  });
  return {
    root,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      instances.forEach((value) => value.dispose());
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      root.clear();
    },
  };
}
