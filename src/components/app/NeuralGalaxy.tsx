import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { GEdge, GNode } from "@/lib/galaxy";

const COLOR: Record<GNode["kind"], string> = { core: "#a78bfa", symbol: "#facc15", rule: "#8b5cf6", win: "#22c55e", loss: "#ef4444", breakeven: "#94a3b8" };

function Node({ n, active, onHover, onPick }: { n: GNode; active: boolean; onHover: (n: GNode | null) => void; onPick: (n: GNode) => void }) {
  const ref = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => Math.random() * 6, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * (n.kind === "core" ? 1.5 : 2) + phase) * 0.08 + (active ? 0.35 : 0);
    ref.current.scale.setScalar(s);
  });
  const c = COLOR[n.kind];
  return (
    <group position={n.pos}>
      <mesh ref={ref} onPointerOver={(e) => { e.stopPropagation(); onHover(n); document.body.style.cursor = "pointer"; }} onPointerOut={() => { onHover(null); document.body.style.cursor = ""; }} onClick={(e) => { e.stopPropagation(); onPick(n); }}>
        <sphereGeometry args={[n.size, 20, 20]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={n.kind === "symbol" || n.kind === "core" ? 0.6 : 1.6} toneMapped={false} />
      </mesh>
      <mesh scale={n.kind === "core" ? 1.8 : 1.7}>
        <sphereGeometry args={[n.size, 12, 12]} />
        <meshBasicMaterial color={c} transparent opacity={active ? 0.35 : 0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {(n.kind === "symbol" || n.kind === "core") && (
        <Html center distanceFactor={14} position={[0, n.size + 0.7, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap rounded-full border border-warning/40 bg-background/70 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-foreground">{n.label}</span>
        </Html>
      )}
    </group>
  );
}

function Edges({ nodes, edges, focus }: { nodes: GNode[]; edges: GEdge[]; focus: number | null }) {
  const geo = useMemo(() => {
    const pos: number[] = [], col: number[] = [];
    const tmp = new THREE.Color();
    for (const e of edges) {
      const a = nodes[e.a]!, b = nodes[e.b]!;
      const lit = focus !== null && (e.a === focus || e.b === focus);
      tmp.set(e.kind === "rule" ? "#8b5cf6" : e.kind === "core" ? "#c4b5fd" : COLOR[b.kind]).multiplyScalar(lit ? 1.6 : focus !== null ? 0.25 : 0.6);
      pos.push(...a.pos, ...b.pos); col.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [nodes, edges, focus]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial vertexColors transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

function Shell({ r = 9 }: { r?: number }) {
  const { surface, inner, lines } = useMemo(() => {
    const N = 2200, sp: number[] = [], sc: number[] = [], c = new THREE.Color();
    const pal = ["#8b5cf6", "#a78bfa", "#60a5fa", "#e879f9", "#c4b5fd"];
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = i * 2.399963;
      const v = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(r * (0.985 + Math.random() * 0.03));
      pts.push(v); sp.push(v.x, v.y, v.z);
      c.set(pal[i % pal.length]!).multiplyScalar(0.7 + Math.random() * 0.8); sc.push(c.r, c.g, c.b);
    }
    const ip: number[] = [], ic: number[] = [];
    for (let i = 0; i < 1600; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(r * Math.cbrt(Math.random()) * 0.95);
      ip.push(v.x, v.y, v.z); c.set(pal[(i * 7) % pal.length]!).multiplyScalar(0.5 + Math.random()); ic.push(c.r, c.g, c.b);
    }
    const lp: number[] = [];
    for (let i = 0; i < N; i += 2) {
      const a = pts[i]!;
      for (const k of [1, 21, 34]) { const b = pts[(i + k) % N]!; if (a.distanceTo(b) < r * 0.35) lp.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    }
    const mk = (p: number[], col?: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); if (col) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); return g; };
    return { surface: mk(sp, sc), inner: mk(ip, ic), lines: mk(lp) };
  }, [r]);
  const glow = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { c: { value: new THREE.Color("#7c3aed") } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(c*1.6, f*0.9); }",
  }), []);
  const rim = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color("#a5b4fc") } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 3.5); gl_FragColor = vec4(c, f); }",
  }), []);
  const spin = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (spin.current) spin.current.rotation.y += Math.min(d, 0.05) * 0.03; });
  return (
    <group>
      <mesh scale={1.18} material={glow}><sphereGeometry args={[r, 64, 64]} /></mesh>
      <mesh material={rim}><sphereGeometry args={[r * 1.01, 64, 64]} /></mesh>
      <mesh><sphereGeometry args={[r * 0.99, 48, 48]} /><meshBasicMaterial color="#1e1b4b" transparent opacity={0.35} depthWrite={false} /></mesh>
      <group ref={spin}>
        <points geometry={surface}><pointsMaterial size={0.09} vertexColors transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation /></points>
        <points geometry={inner}><pointsMaterial size={0.06} vertexColors transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation /></points>
        <lineSegments geometry={lines}><lineBasicMaterial color="#8b5cf6" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} /></lineSegments>
      </group>
    </group>
  );
}

export default function NeuralGalaxy({ nodes, edges, labels, onPick }: { nodes: GNode[]; edges: GEdge[]; labels: Record<string, string>; onPick: (n: GNode | null) => void }) {
  const [hover, setHover] = useState<GNode | null>(null);
  const [picked, setPicked] = useState<GNode | null>(null);
  const focusNode = hover ?? picked;
  const focus = focusNode ? nodes.indexOf(focusNode) : null;
  const pick = (n: GNode | null) => { setPicked(n); onPick(n); };
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 3, 26], fov: 50 }} onPointerMissed={() => pick(null)}>
      <color attach="background" args={["#07060d"]} />
      <fog attach="fog" args={["#07060d", 40, 90]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={40} color="#a78bfa" />
      <Stars radius={80} depth={40} count={2500} factor={3} fade speed={0.6} />
      <Shell />
      <group scale={0.72}>
        <Edges nodes={nodes} edges={edges} focus={focus === -1 ? null : focus} />
        {nodes.map((n) => <Node key={n.id} n={n} active={focusNode === n} onHover={setHover} onPick={pick} />)}
      </group>
      {hover && hover.kind !== "symbol" && hover.kind !== "core" && (
        <Html position={hover.pos.map((v) => v * 0.72) as [number, number, number]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="w-56 -translate-y-10 rounded-lg border border-border bg-popover/95 p-2 text-xs text-popover-foreground shadow-lg">
            <p className="font-semibold">{labels[hover.kind]}</p>
            <p className="mt-1 line-clamp-3">{hover.label}</p>
          </div>
        </Html>
      )}
      <OrbitControls enableDamping dampingFactor={0.06} autoRotate={!picked} minDistance={8} maxDistance={45} autoRotateSpeed={0.35} />
    </Canvas>
  );
}
