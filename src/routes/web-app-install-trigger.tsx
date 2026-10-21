import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Smartphone, Share, PlusSquare, MonitorDown } from "lucide-react";
import { AuthCard } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/web-app-install-trigger")({
  head: () => seo("Install the app", "Add Arrissa AI to your home screen for quick access."),
  component: Install,
});

type PromptEvent = Event & { prompt: () => Promise<void> };

function Install() {
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return (
    <AuthCard title="Install Arrissa AI" subtitle="Add the app to your home screen for one-tap access.">
      <div className="space-y-5 text-sm">
        {evt && <Button variant="hero" className="w-full" onClick={() => evt.prompt()}><MonitorDown /> Install now</Button>}
        <div className="rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 font-medium"><Smartphone className="h-4 w-4" /> iPhone / iPad (Safari)</p>
          <p className="mt-2 flex items-center gap-2 text-muted-foreground">Tap <Share className="h-4 w-4" /> Share, then <PlusSquare className="h-4 w-4" /> Add to Home Screen.</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 font-medium"><Smartphone className="h-4 w-4" /> Android (Chrome)</p>
          <p className="mt-2 text-muted-foreground">Open the browser menu ⋮ and choose "Install app" or "Add to Home screen".</p>
        </div>
        <Button asChild variant="outline" className="w-full"><Link to="/dashboard">Go to dashboard</Link></Button>
      </div>
    </AuthCard>
  );
}
