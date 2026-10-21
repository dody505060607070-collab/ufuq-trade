import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Building2 } from "lucide-react";
import { PageHeader, Empty } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/brokers")({
  head: () => ({ meta: [{ title: "Brokers | Arrissa AI" }] }),
  component: Brokers,
});

function Brokers() {
  const { data, isLoading } = useQuery({ queryKey: ["brokers"], queryFn: async () => (await supabase.from("brokers").select("*").eq("is_active", true).order("sort_order")).data ?? [] });
  return (
    <div>
      <PageHeader title="Brokers" subtitle="Partner brokers supported on the Arrissa platform. Open an account through our partner link to connect." />
      {isLoading ? <p className="text-sm text-muted-foreground">Loading brokers…</p> : !data?.length ? <Empty title="No brokers available at this time." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((b) => (
            <div key={b.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                {b.logo_url ? <img src={b.logo_url} alt={b.name} className="h-10 w-10 rounded-lg object-contain" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-secondary"><Building2 className="h-5 w-5" /></span>}
                <div><p className="font-medium">{b.name}</p><p className="text-xs uppercase text-muted-foreground">{b.platforms.join(" · ")}</p></div>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{b.description}</p>
              {b.partner_url ? (
                <Button asChild variant="hero" className="mt-4"><a href={b.partner_url} target="_blank" rel="noreferrer">Open account <ExternalLink /></a></Button>
              ) : <Button disabled className="mt-4">No partner link</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
