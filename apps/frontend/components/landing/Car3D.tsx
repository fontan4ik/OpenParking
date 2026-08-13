'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Center, ContactShadows, Environment, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Box3, Vector3, type Group } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_URL = '/media/landing/bmw_m3_sedan_topaz_blue_car.web.glb';
// BMW M3 Sedan: 4.85 m x 1.83 m x 1.44 m. Length runs along the X axis once
// the model is oriented into Three.js Y-up, so the front-axle side is at +X.
// Calibrated from the rendered GLB: -0.62 is a side-biased three-quarter view,
// not the model's front. At -1.52 the hood/grille face the camera, so a cursor
// over the vehicle center now produces the expected head-on orientation.
const FRONT_YAW = -1.52;

// Follow the cursor around the actual model center. The range is wide enough
// to read as "looking at" the cursor, while the clamp prevents a full profile.
const FOLLOW_YAW_RANGE = 0.9;
const MANUAL_YAW_RANGE = 1.55;

type InputState = { x: number; y: number; yaw: number; dragging: boolean };
type CarModelProps = {
  reducedMotion: boolean;
  input: MutableRefObject<InputState>;
  drag: MutableRefObject<{ active: boolean; startX: number; startYaw: number }>;
  updateHeroPointer: (clientX: number, clientY: number) => void;
  onPresented: () => void;
};

function CarModel({ reducedMotion, input, drag, updateHeroPointer, onPresented }: CarModelProps) {
  const group = useRef<Group>(null);
  const hasPresented = useRef(false);
  const { scene } = useGLTF(MODEL_URL, true, true, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const model = useMemo(() => {
    const cloned = scene.clone(true);
    let meshCount = 0;
    cloned.traverse((node) => { if ((node as { isMesh?: boolean }).isMesh) meshCount += 1; });
    if (meshCount === 0) throw new Error('BMW GLB decoded without renderable meshes');
    cloned.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(cloned);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    cloned.position.sub(center);
    // Keep a deliberate breathing margin around the full silhouette; camera
    // framing must never crop the nose or rear wheel at the hero edge.
    return { model: cloned, scale: largest > 0 ? 2.7 / largest : 1 };
  }, [scene]);

  useFrame((_, delta) => {
    if (!hasPresented.current) {
      hasPresented.current = true;
      onPresented();
    }
    if (!group.current || reducedMotion) return;
    // There is one yaw source. Drag owns it while pressed; after release the
    // cursor owns the same absolute target. A manual offset must never remain
    // as a second additive layer over the cursor target.
    const followYaw = Math.max(-FOLLOW_YAW_RANGE, Math.min(FOLLOW_YAW_RANGE, input.current.x * FOLLOW_YAW_RANGE));
    const targetYaw = input.current.dragging ? input.current.yaw : FRONT_YAW + followYaw;
    const targetPitch = input.current.dragging ? 0 : input.current.y * 0.22;
    const ease = Math.min(1, delta * 6);
    group.current.rotation.y += (targetYaw - group.current.rotation.y) * ease;
    group.current.rotation.x += (targetPitch - group.current.rotation.x) * ease;
    input.current.yaw = group.current.rotation.y;
  });

  return (
    <group ref={group} rotation={[0, FRONT_YAW, 0]}>
      <Center top>
        <primitive
          object={model.model}
          scale={model.scale}
          onPointerDown={(event: ThreeEvent<PointerEvent>) => {
            if (reducedMotion) return;
            event.stopPropagation();
            drag.current = { active: true, startX: event.clientX, startYaw: input.current.yaw };
            input.current.dragging = true;
            (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event: ThreeEvent<PointerEvent>) => {
            if (!drag.current.active || reducedMotion) return;
            input.current.yaw = Math.max(
              FRONT_YAW - MANUAL_YAW_RANGE,
              Math.min(FRONT_YAW + MANUAL_YAW_RANGE, drag.current.startYaw + (event.clientX - drag.current.startX) * 0.006),
            );
          }}
          onPointerUp={(event: ThreeEvent<PointerEvent>) => {
            drag.current.active = false;
            input.current.dragging = false;
            updateHeroPointer(event.clientX, event.clientY);
            (event.target as unknown as { releasePointerCapture: (pointerId: number) => void }).releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event: ThreeEvent<PointerEvent>) => {
            drag.current.active = false;
            input.current.dragging = false;
            updateHeroPointer(event.clientX, event.clientY);
          }}
        />
      </Center>
    </group>
  );
}

class SceneErrorBoundary extends React.Component<{ children: React.ReactNode; onError: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.hasError ? null : this.props.children; }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function Car3D({ label }: { label?: string }) {
  const reducedMotion = useReducedMotion();
  const input = useRef<InputState>({ x: 0, y: 0, yaw: FRONT_YAW, dragging: false });
  const drag = useRef({ active: false, startX: 0, startYaw: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const markPresented = useMemo(() => () => setState('ready'), []);

  const updateHeroPointer = (clientX: number, clientY: number) => {
    const hero = document.querySelector('.hero-composition');
    const rect = hero?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    // The WebGL canvas extends far to the left of the visible BMW. Calibrate
    // against the rendered vehicle position inside the hero instead: on the
    // approved composition its visual center sits at about 64% of the hero.
    // Thus a cursor over the car produces the neutral front-quarter view.
    const anchorX = rect ? rect.left + rect.width * 0.64 : window.innerWidth * 0.64;
    const anchorY = rect ? rect.top + rect.height * 0.62 : window.innerHeight * 0.62;
    const rangeX = rect ? rect.width * 0.36 : window.innerWidth * 0.36;
    const rangeY = rect ? rect.height * 0.5 : window.innerHeight * 0.5;
    input.current.x = Math.max(-1, Math.min(1, (clientX - anchorX) / Math.max(1, rangeX)));
    input.current.y = Math.max(-1, Math.min(1, (clientY - anchorY) / Math.max(1, rangeY)));
  };

  useEffect(() => {
    if (reducedMotion) return;
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (input.current.dragging) return;
      const hero = document.querySelector('.hero-composition');
      const rect = hero?.getBoundingClientRect();
      // Cursor-follow belongs only to the hero. Lower landing sections should
      // not steer the car while the user is reading them.
      if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      // The visual target is the hood/front-quarter, not the center of the
      // canvas. Bias the normalized field toward that anchor so moving toward
      // the hood produces the strongest, most legible response.
      updateHeroPointer(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleWindowPointerMove);
  }, [reducedMotion]);

  return (
    <div
      className="car-3d"
      role="img"
      aria-label={label ?? 'OpenParking BMW M3 3D model'}
      data-media-state={state}
      data-model="bmw-m3-sedan-topaz-blue"
    >
      {state === 'loading' && <div className="car-3d__status" role="status">Loading BMW M3</div>}
      {state === 'error' && <div className="car-3d__status" role="alert">3D preview unavailable</div>}
      <SceneErrorBoundary onError={() => setState('error')}>
        <Canvas
          dpr={[1, 1.35]}
          frameloop={reducedMotion ? 'demand' : 'always'}
          shadows
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          fallback={<div className="car-3d__status" role="alert">3D preview unavailable</div>}
        >
          <PerspectiveCamera makeDefault position={[0, 1.25, 6.5]} fov={32} near={0.01} far={100} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[5, 7, 5]} intensity={4.2} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight position={[-5, 2, -3]} intensity={1.7} color="#9bc4ff" />
          <directionalLight position={[0, 2, -5]} intensity={1.2} color="#f6d6ad" />
          <Suspense fallback={null}>
            <Environment preset="city" environmentIntensity={0.9} />
            <CarModel reducedMotion={reducedMotion} input={input} drag={drag} updateHeroPointer={updateHeroPointer} onPresented={markPresented} />
          </Suspense>
          <ContactShadows position={[0, -0.04, 0]} opacity={0.5} scale={6.4} blur={2.4} far={4.2} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
export default Car3D;
