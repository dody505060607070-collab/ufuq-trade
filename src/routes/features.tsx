import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteLayout, SectionHead, FeaturesGrid, PlatformsStrip } from "@/components/site/SiteChrome";
import { useT } from "@/lib/i18n";
import { seo } from "@/lib/seo";
import dashImg from "@/assets/features-dashboard.jpg";
import brainImg from "@/assets/f-brain.jpg";
import sessionsImg from "@/assets/f-sessions.jpg";
import modelsImg from "@/assets/f-models.jpg";
import vpsImg from "@/assets/vps-server.jpg";
import sleepImg from "@/assets/sleep-trader.jpg";

export const Route = createFileRoute("/features")({
  head: () => seo("Features", "AI market analysis, automated MT5 execution, smart risk management and an AI Brain that learns from every trade."),
  component: Features,
});

const steps: [string, string, string][] = [
  ["1", "Connect MetaTrader 5", "Attach the Ufuq Trade EA to one chart. Your funds stay with your broker."],
  ["2", "The AI analyses every 5 minutes", "Six AI experts read price, ICT levels, news and whale positioning."],
  ["3", "Trades run on their own", "Entries, stop loss, take profit and profit lock are handled automatically."],
];

const deep: { img: string; tag: string; h: string; p: string; pts: string[] }[] = [
  { img: brainImg, tag: "AI BRAIN", h: "An AI Brain that teaches itself", p: "Every closed trade is reviewed by the AI. It writes a lesson, turns repeated lessons into rules, and every Monday it reviews the whole week.", pts: ["One lesson per closed trade", "Weekly self-review every Monday", "Rules that stop working are retired automatically"] },
  { img: sessionsImg, tag: "MARKET HOURS", h: "Knows when the market opens and closes", p: "The system follows the global sessions. On weekends it rests and spends nothing, and it resumes scanning the moment the market reopens on Sunday.", pts: ["Pauses Friday 21:00 → Sunday 22:00 UTC", "Avoids high-impact news automatically", "Reads London, New York and Asia sessions"] },
  { img: modelsImg, tag: "AI MODELS", h: "Powered by some of the world's strongest AI models", p: "Analysis runs on premium, top-tier AI models combined with open-source research in technical analysis, smart money concepts and price action.", pts: ["Premium AI models for every analysis", "Open-source trading research built in", "Seven expert views combined into one decision"] },
  { img: vpsImg, tag: "INFRASTRUCTURE", h: "Running on powerful cloud servers", p: "Your MetaTrader runs on a dedicated server and our platform runs on fast cloud infrastructure, so trading continues even when your computer is off.", pts: ["Dedicated Windows trading servers", "Fast global cloud platform", "Encrypted connection, no broker passwords stored"] },
  { img: sleepImg, tag: "24/7", h: "24/7 development and support", p: "Our team keeps improving the system around the clock and is always available to help you set up and grow.", pts: ["24-hour continuous development", "24/7 support team", "Free updates for every subscriber"] },
];

function Features() {
  const t = useT();
  return (
    <SiteLayout>
      <section className="mx-auto max-w-7xl px-4 py-20">
        <SectionHead tag="POWERFUL FEATURES" title={<>{t("Everything You Need to Trade with")} <span className="text-gradient-violet">{t("Precision")}</span></>} sub="From market analysis to automated execution, our AI handles every step of the trading process." />
        <img src={dashImg} alt={t("Ufuq Trade dashboard")} width={1536} height={768} className="mt-12 w-full rounded-3xl border border-border/60 shadow-glow" />
        <div className="mt-12"><FeaturesGrid /></div>
      </section>
      <section className="mx-auto max-w-6xl space-y-16 px-4 py-12">
        <SectionHead tag="INSIDE THE SYSTEM" title="How Ufuq Trade Works Behind the Scenes" sub="Everything the platform does for you — from learning to infrastructure." />
        {deep.map((d, i) => (
          <div key={d.h} className="grid items-center gap-8 md:grid-cols-2">
            <img src={d.img} alt={t(d.h)} loading="lazy" width={1024} height={640} className={`w-full rounded-3xl border border-border/60 shadow-glow ${i % 2 ? "md:order-2" : ""}`} />
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-glow">{t(d.tag)}</p>
              <h3 className="mt-2 text-2xl font-bold">{t(d.h)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(d.p)}</p>
              <ul className="mt-4 space-y-2 text-sm">{d.pts.map((x) => <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{t(x)}</li>)}</ul>
            </div>
          </div>
        ))}
      </section>
      <section className="mx-auto max-w-5xl px-4 py-12">
        <SectionHead tag="HOW IT WORKS" title="Three Steps to Autonomous Trading" sub="Set it once. The platform keeps working while you rest." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(([n, h, d]) => (
            <div key={n} className="rounded-2xl border border-border/70 bg-card/50 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 font-bold text-primary-glow">{n}</span>
              <p className="mt-4 font-semibold">{t(h)}</p><p className="mt-2 text-sm text-muted-foreground">{t(d)}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-12">
        <SectionHead tag="PLATFORMS" title="One AI Brain, Every Platform" sub="The same safety rules apply wherever you trade." />
        <div className="mt-8"><PlatformsStrip /></div>
        <div className="mt-10 text-center"><Button asChild variant="hero" size="lg" className="rounded-xl"><Link to="/register">{t("Start Trading Now")} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Button></div>
      </section>
    </SiteLayout>
  );
}
