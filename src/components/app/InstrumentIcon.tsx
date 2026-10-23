import { cn } from "@/lib/utils";
import mt5 from "@/assets/logos/mt5.jpg.asset.json";
import tradelocker from "@/assets/logos/tradelocker.png.asset.json";
import hyperliquid from "@/assets/logos/hyperliquid.png.asset.json";
import exness from "@/assets/logos/exness.png.asset.json";
import fxpro from "@/assets/logos/fxpro.png.asset.json";
import apple from "@/assets/logos/apple.svg.asset.json";
import tesla from "@/assets/logos/tesla.svg.asset.json";
import nvidia from "@/assets/logos/nvidia.svg.asset.json";
import bitcoin from "@/assets/logos/bitcoin.svg.asset.json";
import ethereum from "@/assets/logos/ethereum.svg.asset.json";
import solana from "@/assets/logos/solana.svg.asset.json";

/** Real brand logos, keyed by a short name. */
export const LOGOS = {
  mt5: mt5.url, tradelocker: tradelocker.url, hyperliquid: hyperliquid.url, exness: exness.url, fxpro: fxpro.url,
  apple: apple.url, tesla: tesla.url, nvidia: nvidia.url, btc: bitcoin.url, eth: ethereum.url, sol: solana.url,
} as const;
export type LogoKey = keyof typeof LOGOS;

/** Round logo tile. Coloured SVG marks sit on a light disc so their real colours stay visible. */
export function BrandLogo({ name, className, alt = "" }: { name: LogoKey; className?: string; alt?: string }) {
  const svg = LOGOS[name].endsWith(".svg");
  return (
    <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full", svg && "bg-foreground p-1.5", className)}>
      <img src={LOGOS[name]} alt={alt} loading="lazy" className="h-full w-full object-contain" />
    </span>
  );
}

/** Coin / flag badge for an instrument. */
export function InstrumentIcon({ flag, className }: { flag: string | null | undefined; className?: string }) {
  const base = cn("inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold", className);
  if (flag === "xau") return <span className={cn(base, "bg-gold text-background")}>Au</span>;
  if (flag === "btc" || flag === "eth" || flag === "sol") return <span className={cn(base, "bg-foreground p-[3px]")}><img src={LOGOS[flag]} alt="" className="h-full w-full object-contain" /></span>;
  if (flag && /^[a-z]{2}$/.test(flag)) return <img src={`https://flagcdn.com/w80/${flag}.png`} alt="" className={cn(base, "object-cover")} loading="lazy" />;
  return <span className={cn(base, "bg-muted text-muted-foreground")}>•</span>;
}

export function BrokerLogo({ name, color, className }: { name: string | null | undefined; color?: string | null | undefined; className?: string }) {
  const n = name ?? "";
  const key: LogoKey | null = /exness/i.test(n) ? "exness" : /fxpro/i.test(n) ? "fxpro" : null;
  if (key) return <BrandLogo name={key} alt={n} className={cn("h-11 w-11", className)} />;
  return (
    <span className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground", className)} style={color ? { backgroundColor: color } : undefined}>
      {n.slice(0, 2)}
    </span>
  );
}
