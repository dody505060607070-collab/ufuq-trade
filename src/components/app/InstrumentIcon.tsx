import { cn } from "@/lib/utils";

/** Round flag / asset badge for an instrument. Country codes use free flag images; metals/crypto get a coloured coin. */
export function InstrumentIcon({ flag, className }: { flag: string | null | undefined; className?: string }) {
  const base = cn("inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold", className);
  if (flag === "xau") return <span className={cn(base, "bg-gold text-background")}>Au</span>;
  if (flag === "btc") return <span className={cn(base, "bg-btc text-background")}>₿</span>;
  if (flag === "eth") return <span className={cn(base, "bg-eth text-primary-foreground")}>Ξ</span>;
  if (flag && /^[a-z]{2}$/.test(flag)) return <img src={`https://flagcdn.com/w80/${flag}.png`} alt="" className={cn(base, "object-cover")} loading="lazy" />;
  return <span className={cn(base, "bg-muted text-muted-foreground")}>•</span>;
}

export function BrokerLogo({ name, color, className }: { name: string | null | undefined; color?: string | null | undefined; className?: string }) {
  const n = name ?? "";
  const text = /exness/i.test(n) ? "ex" : /fxpro/i.test(n) ? "FxPro" : n.slice(0, 2);
  return (
    <span
      className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground", text.length > 3 ? "text-[11px]" : "text-lg", className)}
      style={color ? { backgroundColor: color, color: /exness/i.test(n) ? "#111" : "#fff" } : undefined}
    >
      {text}
    </span>
  );
}
