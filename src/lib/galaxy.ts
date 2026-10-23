/** Pure graph builder for the AI Brain 3D "Neural Galaxy". */
import { ruleKey } from "./brain";

export type GNodeKind = "core" | "symbol" | "rule" | "win" | "loss" | "breakeven";
export type GNode = { id: string; kind: GNodeKind; label: string; detail: string; size: number; pos: [number, number, number] };
export type GEdge = { a: number; b: number; kind: "core" | "lesson" | "rule" };

type Lesson = { id: string; symbol: string; side: string; profit: number | string; outcome: string; lesson: string | null; reason: string | null; rule: string | null };
type Rule = { id: string; rule: string; hits: number; symbol: string | null; is_active: boolean };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

export function buildGalaxy(lessons: Lesson[], rules: Rule[], defaultSymbols: string[] = ["XAUUSD"]) {
  const nodes: GNode[] = [{ id: "core", kind: "core", label: "AI Brain", detail: "", size: 1.2, pos: [0, 0, 0] }];
  const edges: GEdge[] = [];
  const syms = [...new Set([...defaultSymbols, ...lessons.map((l) => l.symbol), ...rules.map((r) => r.symbol).filter((s): s is string => !!s)])];
  const symIdx = new Map<string, number>();
  syms.forEach((s, i) => {
    const a = (i / syms.length) * Math.PI * 2;
    const y = (hash(s) - 0.5) * 3;
    symIdx.set(s, nodes.length);
    const n = lessons.filter((l) => l.symbol === s).length;
    nodes.push({ id: `s:${s}`, kind: "symbol", label: s, detail: `${n}`, size: 0.55 + Math.min(n, 40) * 0.012, pos: [Math.cos(a) * 7, y, Math.sin(a) * 7] });
    edges.push({ a: 0, b: symIdx.get(s)!, kind: "core" });
  });
  const ruleIdx = new Map<string, number>();
  rules.filter((r) => r.is_active).forEach((r, i) => {
    const hub = r.symbol ? symIdx.get(r.symbol) : undefined;
    const base = hub !== undefined ? nodes[hub]!.pos : ([0, 0, 0] as const);
    const a = hash(r.id) * Math.PI * 2, e = (hash(r.id + "e") - 0.5) * Math.PI * 0.8, rad = hub !== undefined ? 3.2 : 3.5 + (i % 3);
    ruleIdx.set(ruleKey(r.rule), nodes.length);
    nodes.push({ id: `r:${r.id}`, kind: "rule", label: r.rule, detail: `${r.hits}`, size: 0.28 + Math.min(r.hits, 10) * 0.04, pos: [base[0] + Math.cos(a) * Math.cos(e) * rad, base[1] + Math.sin(e) * rad, base[2] + Math.sin(a) * Math.cos(e) * rad] });
    edges.push({ a: hub ?? 0, b: nodes.length - 1, kind: "rule" });
  });
  lessons.slice(0, 200).forEach((l) => {
    const hub = symIdx.get(l.symbol)!;
    const b = nodes[hub]!.pos;
    const u = hash(l.id), v = hash(l.id + "v"), rad = 1.6 + hash(l.id + "r") * 2.2;
    const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
    const kind: GNodeKind = l.outcome === "win" ? "win" : l.outcome === "loss" ? "loss" : "breakeven";
    nodes.push({ id: `l:${l.id}`, kind, label: `${l.side.toUpperCase()} ${l.symbol} ${Number(l.profit) >= 0 ? "+" : ""}${Number(l.profit).toFixed(2)}$`, detail: l.lesson ?? l.reason ?? "", size: 0.12 + Math.min(Math.abs(Number(l.profit)), 50) * 0.004, pos: [b[0] + rad * Math.sin(ph) * Math.cos(th), b[1] + rad * Math.cos(ph), b[2] + rad * Math.sin(ph) * Math.sin(th)] });
    const me = nodes.length - 1;
    edges.push({ a: hub, b: me, kind: "lesson" });
    const rk = l.rule ? ruleIdx.get(ruleKey(l.rule)) : undefined;
    if (rk !== undefined) edges.push({ a: me, b: rk, kind: "rule" });
  });
  return { nodes, edges };
}
