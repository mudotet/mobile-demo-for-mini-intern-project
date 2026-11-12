import React, {
  Component,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ACESFilmicToneMapping,
  Color,
  FogExp2,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { Canvas, useFrame, useThree } from './fiber';
import { createDealerWorld } from './world';

// A refreshed module needs a new Expo GL context after native root cleanup.
const sceneRevision = Date.now();

export type DealerPointer = {
  x: number;
  y: number;
  invalidate?: () => void;
};

type SceneProps = {
  shop: boolean;
  greeting: number;
  celebration: number;
  celebrating?: boolean;
  pointer: MutableRefObject<DealerPointer>;
};
type Metrics = {
  frames: number;
  animationTime: number;
  drawCalls: number;
  triangles: number;
  greetings: number;
  celebrations: number;
  contextLost: boolean;
  reducedMotion: boolean;
  paused: boolean;
  mode: 'home' | 'shop' | 'celebration';
  camera: number[];
};
const diagnostics = globalThis as typeof globalThis & {
  __dealerMetrics?: Metrics;
};

class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function World({
  input,
  reducedMotion,
  softwareRenderer,
  metrics,
}: {
  input: MutableRefObject<SceneProps>;
  reducedMotion: boolean;
  softwareRenderer: boolean;
  metrics: Metrics;
}) {
  const world = useMemo(() => {
    const value = createDealerWorld(softwareRenderer);
    value.root.traverse((object) => {
      object.castShadow = false;
    });
    value.root.getObjectByName('merchant')?.traverse((object) => {
      object.castShadow = true;
    });
    return value;
  }, [softwareRenderer]);
  const { invalidate } = useThree();
  const elapsed = useRef(0);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const cameraFocus = useMemo(() => new Vector3(), []);

  useEffect(() => () => world.dispose(), [world]);
  useEffect(() => {
    const pointer = input.current.pointer.current;
    pointer.invalidate = invalidate;
    return () => {
      if (pointer.invalidate === invalidate) delete pointer.invalidate;
    };
  }, [input, invalidate]);
  useEffect(() => {
    invalidate();
  }, [
    input.current.greeting,
    input.current.celebration,
    input.current.shop,
    input.current.celebrating,
    reducedMotion,
  ]);
  useFrame(({ camera, gl }, delta) => {
    const frameTime = Math.min(delta, 1);
    const dt = Math.min(frameTime, 0.05);
    // Keep celebrations on real time when the simulator renders fewer frames.
    if (!reducedMotion) elapsed.current += frameTime;
    metrics.animationTime = elapsed.current;
    const state = input.current;
    world.update(elapsed.current, dt, {
      pointerX: state.pointer.current.x,
      pointerY: state.pointer.current.y,
      greeting: state.greeting,
      celebration: state.celebration,
      shop: state.shop,
      reducedMotion,
    });
    const orbitAngle = 0.12 + state.pointer.current.x * 0.35;
    cameraPosition.set(
      state.celebrating
        ? 0
        : state.shop
          ? 1.15
          : 0.15 + Math.sin(orbitAngle) * 8.7,
      state.celebrating
        ? 2.6
        : state.shop
          ? 2.6
          : 2.45 + state.pointer.current.y * 0.4,
      state.celebrating ? 6.5 : state.shop ? 9.9 : Math.cos(orbitAngle) * 8.7,
    );
    cameraFocus.set(
      state.celebrating ? 0 : state.shop ? -0.55 : 0.15,
      state.celebrating ? 2.25 : 2.42,
      0,
    );
    camera.position.lerp(
      cameraPosition,
      reducedMotion ? 1 : 1 - Math.exp(-frameTime * 3),
    );
    camera.lookAt(cameraFocus);
    metrics.frames += 1;
    metrics.greetings = state.greeting;
    metrics.celebrations = state.celebration;
    metrics.mode = state.celebrating
      ? 'celebration'
      : state.shop
        ? 'shop'
        : 'home';
    if (metrics.frames % 15 === 0 || reducedMotion) {
      metrics.drawCalls = gl.info.render.calls;
      metrics.triangles = gl.info.render.triangles;
      metrics.camera = camera.position.toArray();
    }
  });
  return <primitive object={world.root} dispose={null} />;
}

export default function DealerScene(props: SceneProps) {
  const input = useRef(props);
  input.current = props;
  const [active, setActive] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  const [softwareRenderer, setSoftwareRenderer] = useState(false);
  const [supported, setSupported] = useState(Platform.OS !== 'web');
  const [generation, setGeneration] = useState(0);
  const contextCleanup = useRef<(() => void) | null>(null);
  const metrics = useMemo<Metrics>(
    () => ({
      frames: 0,
      animationTime: 0,
      drawCalls: 0,
      triangles: 0,
      greetings: 0,
      celebrations: 0,
      contextLost: false,
      reducedMotion: false,
      paused: false,
      mode: 'home',
      camera: [],
    }),
    [generation],
  );
  metrics.paused = !active;
  metrics.reducedMotion = reducedMotion;
  const renderScale = softwareRenderer ? PixelRatio.get() : 1;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2');
    if (context) {
      context.getExtension('WEBGL_lose_context')?.loseContext();
      setSupported(true);
    } else {
      metrics.contextLost = true;
      setFailed(true);
    }
  }, [generation]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      diagnostics.__dealerMetrics = metrics;
      const visibility = () => setActive(!document.hidden);
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      const motion = () => setReducedMotion(media.matches);
      visibility();
      motion();
      document.addEventListener('visibilitychange', visibility);
      media.addEventListener('change', motion);
      return () => {
        document.removeEventListener('visibilitychange', visibility);
        media.removeEventListener('change', motion);
        contextCleanup.current?.();
        if (diagnostics.__dealerMetrics === metrics)
          delete diagnostics.__dealerMetrics;
      };
    }
    setActive(AppState.currentState !== 'background');
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    });
    const app = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    const motion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      mounted = false;
      app.remove();
      motion.remove();
      contextCleanup.current?.();
    };
  }, [metrics]);

  useEffect(() => {
    if (Platform.OS === 'web' || failed || !active) return;
    let previousFrame = metrics.frames;
    const watchdog = setInterval(() => {
      if (
        !metrics.frames ||
        (!reducedMotion && metrics.frames === previousFrame)
      )
        fail();
      previousFrame = metrics.frames;
    }, 10000);
    return () => clearInterval(watchdog);
  }, [metrics, failed, active, reducedMotion]);

  function fail() {
    if (Platform.OS === 'web') {
      contextCleanup.current?.();
      contextCleanup.current = null;
    }
    metrics.contextLost = true;
    setFailed(true);
  }

  const fallback = (
    <View style={s.unavailable}>
      <Text style={s.message}>The portal needs a moment.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry 3D scene"
        style={s.retry}
        onPress={() => {
          setFailed(false);
          setSupported(Platform.OS !== 'web');
          setGeneration((value) => value + 1);
        }}
      >
        <Text style={s.retryText}>RETRY SCENE</Text>
      </Pressable>
    </View>
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, failed && { zIndex: 2 }]}
      testID="dealer-canvas"
      pointerEvents="box-none"
    >
      {failed
        ? fallback
        : supported && (
            <SceneBoundary
              key={`${sceneRevision}:${generation}`}
              onError={fail}
            >
              <View
                style={{
                  width: `${100 / renderScale}%`,
                  height: `${100 / renderScale}%`,
                  transform: [{ scale: renderScale }],
                  transformOrigin: 'top left',
                }}
              >
                <Canvas
                  style={{ width: '100%', height: '100%' }}
                  camera={{
                    position: [
                      0.15 + Math.sin(0.12) * 8.7,
                      2.45,
                      Math.cos(0.12) * 8.7,
                    ],
                    fov: 40,
                    near: 0.1,
                    far: 28,
                  }}
                  shadows={!softwareRenderer}
                  frameloop={
                    active ? (reducedMotion ? 'demand' : 'always') : 'never'
                  }
                  gl={{
                    antialias: Platform.OS === 'web',
                    alpha: false,
                    powerPreference: 'high-performance',
                  }}
                  {...(Platform.OS === 'web'
                    ? { dpr: [1, 1.5] as [number, number], fallback }
                    : {})}
                  onCreated={({ gl, scene }) => {
                    gl.toneMapping = ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.1;
                    gl.outputColorSpace = SRGBColorSpace;
                    scene.background = new Color('#0c1822');
                    scene.fog = new FogExp2('#0c1822', 0.055);
                    if (Platform.OS !== 'web') {
                      const context = gl.getContext();
                      const software = /software|swiftshader|llvmpipe/i.test(
                        String(context.getParameter(context.RENDERER)),
                      );
                      setSoftwareRenderer(software);
                      gl.shadowMap.enabled = !software;
                    }
                    if (Platform.OS === 'web') {
                      const element = gl.domElement;
                      const lost = (event: Event) => {
                        event.preventDefault();
                        fail();
                      };
                      element.addEventListener('webglcontextlost', lost);
                      contextCleanup.current = () =>
                        element.removeEventListener('webglcontextlost', lost);
                    } else {
                      const renderFrame = gl.render.bind(gl);
                      gl.render = (renderScene, camera) => {
                        if (metrics.contextLost) return;
                        try {
                          renderFrame(renderScene, camera);
                        } catch {
                          fail();
                        }
                      };
                      contextCleanup.current = () => {
                        gl.render = renderFrame;
                      };
                    }
                  }}
                >
                  <hemisphereLight args={['#b4dde0', '#604334', 0.85]} />
                  <directionalLight
                    position={[-3.5, 5, 6]}
                    intensity={3}
                    color="#ffe2be"
                    castShadow
                    shadow-mapSize={[512, 512]}
                    shadow-camera-near={0.1}
                    shadow-camera-far={16}
                    shadow-camera-left={-3}
                    shadow-camera-right={3}
                    shadow-camera-top={5}
                    shadow-camera-bottom={-1}
                    shadow-normalBias={0.035}
                  />
                  <directionalLight
                    position={[3, 3, -2]}
                    intensity={2}
                    color="#59d8d1"
                  />
                  <pointLight
                    position={[-2.3, 2.2, 1.1]}
                    intensity={7}
                    color="#ffb768"
                    distance={7}
                  />
                  <World
                    input={input}
                    reducedMotion={reducedMotion}
                    softwareRenderer={softwareRenderer}
                    metrics={metrics}
                  />
                </Canvas>
              </View>
            </SceneBoundary>
          )}
    </View>
  );
}

const s = StyleSheet.create({
  unavailable: {
    position: 'absolute',
    top: '35%',
    left: 30,
    right: 30,
    alignItems: 'center',
    gap: 12,
  },
  message: { color: '#efcf94', fontSize: 14 },
  retry: {
    minHeight: 44,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#bc9259',
    borderRadius: 10,
    backgroundColor: '#162c31',
  },
  retryText: { color: '#f6dcad', fontSize: 15, fontFamily: 'Barlow' },
});
