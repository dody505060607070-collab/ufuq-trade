import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ShieldAlert } from "lucide-react";
import { useAiText, useT } from "@/lib/i18n";
import { parseSummary, rewardRisk } from "@/lib/analysis-view";
import { fmt, priceDigits, timeAgo } from "@/lib/trading";
import { cn } from "@/lib/utils";

export type AnalysisRow = {
  id: string; symbol: string; timeframe?: string | null; provider?: string | null; direction: string; confidence?: number | null;
  entry: number | null; stop_loss: number | null; take_profit: number | null; summary: string | null; summary_ar?: string | null; created_at: string;
};

/** One AI analysis shown clearly: who wrote it, the decision, levels, reward/risk, why code blocked it, and every sentence. */
export function AiAnalysisCard({ a, tag, onUse, defaultOpen = false }: { a: AnalysisRow; tag?: string; onUse?: () => unknown; defaultOpen?: boolean }) {
  const t = useT();
  const ai = useAiText();
  const [open, setOpen] = useState(defaultOpen);
  const parts = parseSummary(ai(a.summary, a.summary_ar));
  const d = priceDigits(a.entry);
  const rr = rewardRisk(a.entry, a.stop_loss, a.take_profit);
  const dir = a.direction;
  const provider = a.provider === "openai" ? "ChatGPT" : a.provider === "gemini" ? "Gemini" : null;
  const shown = open ? parts.sentences : parts.sentences.slice(0, 2);
  return (
    <div className={cn("rounded-xl border border-border border-s-4 bg-background/40 p-3 text-sm", dir === "buy" ? "border-s-success" : dir === "sell" ? "border-s-destructive" : "border-s-warning")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {a.symbol}
          {(tag ?? a.timeframe) && <span className="ms-1 text-xs font-normal text-muted-foreground">{tag ?? a.timeframe}</span>}
          {provider && <span className={cn("ms-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold", provider === "ChatGPT" ? "border-primary/50 text-primary-glow" : "border-border text-muted-foreground")}>{provider}</span>}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", dir === "buy" ? "bg-success/15 text-success" : dir === "sell" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>
          {dir === "buy" ? <ArrowUpRight className="h-3 w-3" /> : dir === "sell" ? <ArrowDownRight className="h-3 w-3" /> : null}{t(dir.toUpperCase())}
        </span>
      </div>
      {a.confidence != null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-gradient-primary" style={{ width: `${Math.min(100, a.confidence)}%` }} /></div>
          <span className="text-xs font-semibold tabular-nums">{a.confidence}%</span>
        </div>
      )}
      {(a.entry != null || a.stop_loss != null || a.take_profit != null) && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          {([["Entry", fmt(a.entry, d)], ["SL", fmt(a.stop_loss, d)], ["TP", fmt(a.take_profit, d)], ["R/R", rr != null ? `1:${rr}` : "—"]] as const).map(([l, v]) => (
            <div key={l} className="rounded-md bg-muted/70 p-1.5"><p className="text-muted-foreground">{t(l)}</p><p className="font-mono">{v}</p></div>
          ))}
        </div>
      )}
      {parts.blocked && (
        <div className="mt-3 flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">{t("Blocked by the safety checks")}</p>
            <p className="text-muted-foreground">{parts.blocked}</p>
            {parts.aiView && <p className="mt-1">{t("What the AI wanted")}: <b>{parts.aiView}</b></p>}
          </div>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          {shown.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" /><span>{x}</span></li>)}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{timeAgo(a.created_at)}</span>
        <div className="flex items-center gap-2">
          {parts.sentences.length > 2 && (
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 hover:text-foreground">
              {open ? t("Show less") : t("Read full analysis")}<ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
            </button>
          )}
          {onUse && <button onClick={onUse} disabled={dir === "neutral"} className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground">{t("Use Signal")}</button>}
        </div>
      </div>
    </div>
  );
}
