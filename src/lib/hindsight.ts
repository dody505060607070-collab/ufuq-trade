// Hindsight: grade every analysis (taken or skipped) by what price did afterwards.
export type Bar = { t: number; h: number; l: number };
export type Outcome = "tp_first" | "sl_first" | "open";

/** Which level price touched first after the decision. A bar touching both counts as sl_first (conservative). */
export function gradePath(dir: string, entry: number, sl: number, tp: number, bars: Bar[]): { outcome: Outcome; move: number } {
  const buy = dir === "buy";
  let best = 0;
  for (const b of bars) {
    const fav = buy ? b.h - entry : entry - b.l;
    best = Math.max(best, fav);
    const hitSl = buy ? b.l <= sl : b.h >= sl;
    const hitTp = buy ? b.h >= tp : b.l <= tp;
    if (hitSl) return { outcome: "sl_first", move: Math.round(best * 100) / 100 };
    if (hitTp) return { outcome: "tp_first", move: Math.round(best * 100) / 100 };
  }
  return { outcome: "open", move: Math.round(best * 100) / 100 };
}

export type Graded = { risk_verdict: string; risk_reason: string | null; ai_confidence: number | null; outcome: string | null };

/** Compact per-reason stats for the AI prompt: how often skipped ideas would have won, and how taken ones did. */
export function hindsightText(rows: Graded[]): string {
  const done = rows.filter((r) => r.outcome === "tp_first" || r.outcome === "sl_first");
  if (!done.length) return "not enough graded analyses yet";
  const groups = new Map<string, { w: number; l: number }>();
  for (const r of done) {
    const k = r.risk_verdict === "approved" ? "TAKEN trades" : `SKIPPED (${(r.risk_reason ?? "?").slice(0, 60)})`;
    const g = groups.get(k) ?? { w: 0, l: 0 };
    r.outcome === "tp_first" ? g.w++ : g.l++;
    groups.set(k, g);
  }
  const band = (lo: number, hi: number) => {
    const s = done.filter((r) => (r.ai_confidence ?? 0) >= lo && (r.ai_confidence ?? 0) < hi);
    return s.length ? `${lo}-${hi - 1}%: ${Math.round((100 * s.filter((r) => r.outcome === "tp_first").length) / s.length)}% hit target (${s.length})` : null;
  };
  const lines = [...groups].sort((a, b) => b[1].w + b[1].l - (a[1].w + a[1].l)).slice(0, 8)
    .map(([k, g]) => `- ${k}: ${g.w} would reach target first, ${g.l} stop first`);
  const bands = [band(50, 60), band(60, 70), band(70, 101)].filter(Boolean).join("; ");
  return `${lines.join("\n")}\nBy confidence: ${bands}\nUse this: if skipped ideas of a kind mostly win, be less strict there; if a confidence band mostly loses, demand more confirmation.`;
}
