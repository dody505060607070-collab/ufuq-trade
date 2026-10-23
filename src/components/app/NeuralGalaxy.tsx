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
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <mesh scale={n.kind === "core" ? 2.4 : 2}>
        <sphereGeometry args={[n.size, 12, 12]} />
        <meshBasicMaterial color={c} transparent opacity={active ? 0.35 : 0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {(n.kind === "symbol" || n.kind === "core") && (
        <Html center distanceFactor={14} position={[0, n.size + 0.7, 0]} style={{ pointerEvents: "none" }}>
          <span className="whitespace-nowrap rounded-full bg-background/80 px-2 py-0.5 text-xs font-bold text-foreground">{n.label}</span>
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

export default function NeuralGalaxy({ nodes, edges, labels, onPick }: { nodes: GNode[]; edges: GEdge[]; labels: Record<string, string>; onPick: (n: GNode | null) => void }) {
  const [hover, setHover] = useState<GNode | null>(null);
  const [picked, setPicked] = useState<GNode | null>(null);
  const focusNode = hover ?? picked;
  const focus = focusNode ? nodes.indexOf(focusNode) : null;
  const pick = (n: GNode | null) => { setPicked(n); onPick(n); };
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 6, 20], fov: 55 }} onPointerMissed={() => pick(null)}>
      <color attach="background" args={["#07060d"]} />
      <fog attach="fog" args={["#07060d", 22, 55]} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 0]} intensity={40} color="#a78bfa" />
      <Stars radius={80} depth={40} count={2500} factor={3} fade speed={0.6} />
      <Edges nodes={nodes} edges={edges} focus={focus === -1 ? null : focus} />
      {nodes.map((n) => <Node key={n.id} n={n} active={focusNode === n} onHover={setHover} onPick={pick} />)}
      {hover && hover.kind !== "symbol" && hover.kind !== "core" && (
        <Html position={hover.pos} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div className="w-56 -translate-y-10 rounded-lg border border-border bg-popover/95 p-2 text-xs text-popover-foreground shadow-lg">
            <p className="font-semibold">{labels[hover.kind]}</p>
            <p className="mt-1 line-clamp-3">{hover.label}</p>
          </div>
        </Html>
      )}
      <OrbitControls enableDamping dampingFactor={0.06} autoRotate={!picked} autoRotateSpeed={0.5} minDistance={5} maxDistance={40} />
    </Canvas>
  );
}
