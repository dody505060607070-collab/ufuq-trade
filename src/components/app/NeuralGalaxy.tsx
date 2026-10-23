import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Billboard, OrbitControls, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";

/** One labelled data point on the globe (real platform data). */
export type Callout = { id: string; kind: "symbol" | "rule" | "win" | "loss" | "layer"; title: string; sub?: string | undefined; value?: string | undefined; tone?: "up" | "down" | undefined };

const R = 9;
const KIND_COLOR: Record<Callout["kind"], string> = { symbol: "#fbbf24", rule: "#a855f7", layer: "#a855f7", win: "#10e0a0", loss: "#ff3b5c" };
const PALETTE = ["#7c3aed", "#8b5cf6", "#a855f7", "#c026d3", "#e879f9", "#3b82f6", "#60a5fa", "#22d3ee", "#c4b5fd"];

/* deterministic random so the globe looks the same every visit */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function fib(i: number, n: number) {
  const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
  return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
}

/* ---------- glowing sprite points (soft core + halo, optional ring, twinkle) ---------- */
const spriteVS = `
  attribute float size; attribute float phase; attribute vec3 color;
  uniform float uTime; uniform float uPR; varying vec3 vColor; varying float vTw;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    float tw = 0.75 + 0.35 * sin(uTime * (1.2 + fract(phase) * 2.0) + phase * 6.2831);
    vTw = tw; vColor = color;
    gl_PointSize = size * tw * uPR * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const spriteFS = `
  uniform float uRing; uniform float uCore; varying vec3 vColor; varying float vTw;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float halo = pow(1.0 - d * 2.0, 2.2);
    float core = smoothstep(0.12, 0.0, d);
    float ring = uRing * smoothstep(0.035, 0.0, abs(d - 0.36)) * 0.9;
    vec3 c = vColor * (halo * 0.55 + ring) + mix(vColor, vec3(1.0), 0.7) * core * 1.4 * uCore;
    gl_FragColor = vec4(c * vTw, clamp(halo * 0.8 + core * uCore + ring, 0.0, 1.0));
  }`;

function useSpriteMaterial(ring = 0, coreK = 1) {
  const { gl } = useThree();
  return useMemo(() => new THREE.ShaderMaterial({
    vertexShader: spriteVS, fragmentShader: spriteFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(gl.getPixelRatio(), 2) }, uRing: { value: ring }, uCore: { value: coreK } },
  }), [gl, ring, coreK]);
}

function Sprites({ pos, col, size, ring = 0, core = 1 }: { pos: number[]; col: number[]; size: number[]; ring?: number; core?: number }) {
  const mat = useSpriteMaterial(ring, core);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("size", new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute("phase", new THREE.Float32BufferAttribute(size.map((_, i) => (i * 0.6180339) % 1), 1));
    return g;
  }, [pos, col, size]);
  useFrame(({ clock }) => { mat.uniforms["uTime"]!.value = clock.elapsedTime; });
  return <points geometry={geo} material={mat} />;
}

function Lines({ pos, col, opacity }: { pos: number[]; col: number[]; opacity: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [pos, col]);
  return <lineSegments geometry={geo}><lineBasicMaterial vertexColors transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} /></lineSegments>;
}

/* ---------- the globe body ---------- */
function buildGlobe() {
  const rand = rng(20261023), c = new THREE.Color();
  const pick = (w: number[] = [3, 3, 3, 2, 1, 2, 2, 1, 2]) => { let t = rand() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { t -= w[i]!; if (t <= 0) return PALETTE[i]!; } return PALETTE[0]!; };

  // 1) inner nebula: clustered soft clouds (purple / magenta / blue)
  const neb = { pos: [] as number[], col: [] as number[], size: [] as number[] };
  const clouds = Array.from({ length: 12 }, () => ({ c: new THREE.Vector3().randomDirection().multiplyScalar(R * (0.25 + rand() * 0.55)), r: R * (0.16 + rand() * 0.22), color: ["#c026d3", "#7c3aed", "#9333ea", "#2563eb", "#db2777", "#6d28d9", "#a21caf", "#1d4ed8", "#8b5cf6"][Math.floor(rand() * 9)]! }));
  for (let i = 0; i < 3600; i++) {
    const cl = clouds[i % clouds.length]!;
    const v = new THREE.Vector3((rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 2).multiplyScalar(cl.r * Math.pow(rand(), 0.6)).add(cl.c);
    if (v.length() > R * 0.96) v.setLength(R * (0.6 + rand() * 0.35));
    neb.pos.push(v.x, v.y, v.z);
    c.set(rand() < 0.75 ? cl.color : pick()).multiplyScalar(0.28 + rand() * 0.32); neb.col.push(c.r, c.g, c.b);
    neb.size.push(rand() < 0.85 ? 0.8 + rand() * 2.2 : 0.3 + rand() * 0.4);
  }
  // 2) surface dust (dense shell, bright rim through additive overlap)
  const dust = { pos: [] as number[], col: [] as number[], size: [] as number[] };
  for (let i = 0; i < 3200; i++) {
    const v = fib(i, 3200).multiplyScalar(R * (0.975 + rand() * 0.05));
    dust.pos.push(v.x, v.y, v.z);
    c.set(pick([2, 3, 2, 1, 1, 3, 3, 2, 3])).multiplyScalar(0.15 + rand() * 0.3); dust.col.push(c.r, c.g, c.b);
    dust.size.push(0.1 + rand() * 0.22);
  }
  // 3) neural web: nodes on the shell + inner layer, joined to nearest neighbours
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < 620; i++) nodes.push(new THREE.Vector3().randomDirection().multiplyScalar(R * (0.95 + rand() * 0.05)));
  for (let i = 0; i < 160; i++) nodes.push(new THREE.Vector3().randomDirection().multiplyScalar(R * (0.45 + rand() * 0.45)));
  const web = { pos: [] as number[], col: [] as number[] };
  const webNodes = { pos: [] as number[], col: [] as number[], size: [] as number[] };
  nodes.forEach((a, i) => {
    const near = nodes.map((b, j) => ({ j, d: a.distanceToSquared(b) })).filter((x) => x.j !== i).sort((x, y) => x.d - y.d).slice(0, i < 620 ? 3 : 2);
    for (const { j, d } of near) {
      if (j < i && near.length > 1) continue;
      if (d > (R * 0.42) ** 2) continue;
      const b = nodes[j]!;
      web.pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      c.set(pick([3, 3, 3, 1, 1, 3, 3, 2, 2])).multiplyScalar(0.8 + rand() * 0.6); web.col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    webNodes.pos.push(a.x, a.y, a.z);
    c.set(pick([1, 2, 2, 1, 2, 2, 3, 2, 4])).multiplyScalar(1.0 + rand() * 0.5); webNodes.col.push(c.r, c.g, c.b);
    webNodes.size.push(0.35 + rand() * 0.75);
  });
  // 4) long filament arcs across the volume + orbit rings around the globe
  const arcs = { pos: [] as number[], col: [] as number[] };
  const pushCurve = (pts: THREE.Vector3[], color: string, k = 1) => {
    c.set(color).multiplyScalar(k);
    for (let i = 0; i < pts.length - 1; i++) { const p = pts[i]!, q = pts[i + 1]!; arcs.pos.push(p.x, p.y, p.z, q.x, q.y, q.z); arcs.col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
  };
  for (let i = 0; i < 26; i++) {
    const a = nodes[Math.floor(rand() * 620)]!, b = nodes[Math.floor(rand() * 620)]!;
    const mid = a.clone().add(b).multiplyScalar(0.5).multiplyScalar(0.55 + rand() * 0.5);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    pushCurve(curve.getPoints(40), rand() < 0.4 ? "#fbbf24" : pick([1, 2, 3, 2, 3, 2, 2, 1, 2]), 0.6 + rand() * 0.5);
  }
  for (let i = 0; i < 7; i++) {
    const rx = R * (1.0 + rand() * 0.16), ry = rx * (0.55 + rand() * 0.45);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI));
    const pts = Array.from({ length: 161 }, (_, k) => { const t = (k / 160) * Math.PI * 2; return new THREE.Vector3(Math.cos(t) * rx, Math.sin(t) * ry, 0).applyQuaternion(q); });
    pushCurve(pts, i % 3 === 0 ? "#fbbf24" : i % 3 === 1 ? "#a78bfa" : "#60a5fa", 0.55);
  }
  // 5) bright hubs with rings
  const hubs = { pos: [] as number[], col: [] as number[], size: [] as number[] };
  const hubColors = ["#22d3ee", "#fbbf24", "#e879f9", "#ffffff", "#ff3b5c", "#10e0a0", "#a78bfa"];
  for (let i = 0; i < 34; i++) {
    const v = nodes[Math.floor(rand() * nodes.length)]!;
    hubs.pos.push(v.x, v.y, v.z);
    c.set(hubColors[i % hubColors.length]!); hubs.col.push(c.r, c.g, c.b);
    hubs.size.push(1.6 + rand() * 1.8);
  }
  return { neb, dust, web, webNodes, arcs, hubs };
}

const fresnelVS = "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }";

function Atmosphere() {
  const rim = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: fresnelVS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: "varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(vN,vV)); vec3 a = vec3(0.55,0.2,1.0); vec3 b = vec3(0.55,0.8,1.0); vec3 c = mix(a, b, pow(f,6.0)); gl_FragColor = vec4(c, pow(f,7.0)*0.6); }",
  }), []);
  const halo = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "varying vec2 vUv; void main(){ float d = length(vUv-0.5)*2.0*1.5; float out_ = smoothstep(0.93,1.0,d); float g = out_*exp(-(d-1.0)*5.0); float inner = smoothstep(0.55,1.0,d)*(1.0-out_)*0.12; vec3 c = mix(vec3(0.35,0.25,1.0), vec3(0.6,0.75,1.0), exp(-(d-1.0)*12.0)); gl_FragColor = vec4(c*(g*0.9+inner), g*0.9+inner); }",
  }), []);
  const core = useMemo(() => new THREE.MeshBasicMaterial({ color: "#0d0733", transparent: true, opacity: 0.5, depthWrite: false }), []);
  return (
    <>
      <Billboard><mesh material={halo} renderOrder={-1}><planeGeometry args={[R * 3, R * 3]} /></mesh></Billboard>
      <mesh material={rim}><sphereGeometry args={[R * 1.005, 96, 96]} /></mesh>
    </>
  );
}

/* data nodes + screen-space callouts */
type Overlay = { labels: (HTMLDivElement | null)[]; lines: (SVGPathElement | null)[]; dots: (SVGCircleElement | null)[] };

function DataNodes({ items, globe, overlay }: { items: Callout[]; globe: MutableRefObject<THREE.Group | null>; overlay: MutableRefObject<Overlay> }) {
  const { camera, size } = useThree();
  const local = useMemo(() => {
    const n = Math.max(items.length, 1);
    return items.map((_, i) => fib(i, n).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35).multiplyScalar(R * 0.99));
  }, [items]);
  const sprite = useMemo(() => {
    const pos: number[] = [], col: number[] = [], sz: number[] = [], c = new THREE.Color();
    items.forEach((it, i) => { const v = local[i]!; pos.push(v.x, v.y, v.z); c.set(KIND_COLOR[it.kind]); col.push(c.r, c.g, c.b); sz.push(it.kind === "symbol" ? 4.2 : 3.4); });
    return { pos, col, sz };
  }, [items, local]);
  const tmp = useMemo(() => ({ w: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Vector3(), r: new THREE.Vector3(), cam: new THREE.Vector3() }), []);

  useFrame(() => {
    const g = globe.current; if (!g) return;
    const { w, p, c, r, cam } = tmp;
    cam.copy(camera.position).normalize();
    c.set(0, 0, 0).project(camera);
    const cx = (c.x + 1) / 2 * size.width, cy = (1 - c.y) / 2 * size.height;
    r.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(R).project(camera);
    const discR = Math.hypot((r.x + 1) / 2 * size.width - cx, (1 - r.y) / 2 * size.height - cy);
    items.forEach((_, i) => {
      const label = overlay.current.labels[i], line = overlay.current.lines[i], dot = overlay.current.dots[i];
      if (!label || !line || !dot) return;
      w.copy(local[i]!).applyMatrix4(g.matrixWorld);
      const facing = w.clone().normalize().dot(cam);
      const o = Math.min(1, Math.max(0, (facing - 0.08) / 0.25));
      p.copy(w).project(camera);
      const sx = (p.x + 1) / 2 * size.width, sy = (1 - p.y) / 2 * size.height;
      let dx = sx - cx, dy = sy - cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const reach = discR * 1.1 + 20 - d * 0.75;
      const lx = sx + dx * Math.max(reach, 34), ly = sy + dy * Math.max(reach, 34);
      const lxC = Math.min(size.width - 170, Math.max(170, lx)), lyC = Math.min(size.height - 30, Math.max(24, ly));
      const left = dx < 0;
      label.style.opacity = String(o);
      label.style.pointerEvents = o > 0.4 ? "auto" : "none";
      label.style.transform = `translate(${lxC + (left ? -10 : 10)}px, ${lyC}px) translate(${left ? "-100%" : "0"}, -50%)`;
      label.dataset["side"] = left ? "left" : "right";
      line.setAttribute("d", `M${sx},${sy} L${lxC - dx * 6},${lyC - dy * 6} L${lxC},${lyC}`);
      line.style.opacity = String(o * 0.85);
      dot.setAttribute("cx", String(sx)); dot.setAttribute("cy", String(sy)); dot.style.opacity = String(o);
    });
  });
  return <Sprites pos={sprite.pos} col={sprite.col} size={sprite.sz} ring={1} />;
}

function Globe({ items, overlay, spin }: { items: Callout[]; overlay: MutableRefObject<Overlay>; spin: boolean }) {
  const g = useMemo(buildGlobe, []);
  const group = useRef<THREE.Group>(null);
  useFrame((_, d) => { if (group.current && spin) group.current.rotation.y += Math.min(d, 0.05) * 0.05; });
  return (
    <>
      <Atmosphere />
      <group ref={group} rotation={[0.25, 0, 0.08]}>
        <Sprites pos={g.neb.pos} col={g.neb.col} size={g.neb.size} core={0.15} />
        <Sprites pos={g.dust.pos} col={g.dust.col} size={g.dust.size} core={0.5} />
        <Lines pos={g.web.pos} col={g.web.col} opacity={0.32} />
        <Lines pos={g.arcs.pos} col={g.arcs.col} opacity={0.38} />
        <Sprites pos={g.webNodes.pos} col={g.webNodes.col} size={g.webNodes.size} />
        <Sprites pos={g.hubs.pos} col={g.hubs.col} size={g.hubs.size} ring={0.8} />
        <DataNodes items={items} globe={group} overlay={overlay} />
      </group>
    </>
  );
}

export default function NeuralGalaxy({ items, onPick, spin = true }: { items: Callout[]; onPick?: (c: Callout) => void; spin?: boolean }) {
  const overlay = useRef<Overlay>({ labels: [], lines: [], dots: [] });
  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0, 30], fov: 45 }}>
        <Stars radius={90} depth={50} count={3500} factor={3.2} saturation={0.6} fade speed={0.5} />
        <Globe items={items} overlay={overlay} spin={spin} />
        <OrbitControls enablePan={false} enableDamping dampingFactor={0.06} rotateSpeed={0.6} minDistance={14} maxDistance={45} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.3} radius={0.75} />
        </EffectComposer>
      </Canvas>

      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {items.map((it, i) => (
          <g key={it.id}>
            <path ref={(el) => { overlay.current.lines[i] = el; }} fill="none" stroke={KIND_COLOR[it.kind]} strokeWidth={1} style={{ opacity: 0 }} />
            <circle ref={(el) => { overlay.current.dots[i] = el; }} r={3} fill={KIND_COLOR[it.kind]} style={{ opacity: 0 }} />
          </g>
        ))}
      </svg>
      {items.map((it, i) => (
        <div key={it.id} ref={(el) => { overlay.current.labels[i] = el; }} onClick={() => onPick?.(it)}
          className="group absolute left-0 top-0 cursor-pointer data-[side=left]:text-right select-none whitespace-nowrap rounded-lg px-2 py-1 transition-colors hover:bg-card/60"
          style={{ opacity: 0 }}>
          <div className="flex items-center gap-2 group-data-[side=left]:flex-row-reverse">
            <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2" style={{ borderColor: KIND_COLOR[it.kind], boxShadow: `0 0 10px ${KIND_COLOR[it.kind]}`, background: `radial-gradient(circle, ${KIND_COLOR[it.kind]} 35%, transparent 40%)` }} />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: it.kind === "win" ? KIND_COLOR.win : it.kind === "loss" ? KIND_COLOR.loss : undefined }}>{it.title}</span>
          </div>
          {it.sub && <p className="px-5 text-[11px] text-muted-foreground">{it.sub}</p>}
          {it.value && <p className={`px-5 text-[11px] font-medium ${it.tone === "down" ? "text-destructive" : "text-success"}`}>{it.value}</p>}
        </div>
      ))}
    </div>
  );
}
