import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HelpNote } from "@/lib/i18n";
import { vpsStatus, parseReport, SYNC_FRESH_MIN, type Check } from "@/lib/vps-status";

export const Route = createFileRoute("/_authenticated/admin/vps")({
  head: () => ({ meta: [{ title: "VPS diagnostics | Ufuq Trade Admin" }, { name: "description", content: "Admin view of Windows VPS, MT5 and EA connection status." }] }),
  component: VpsPage,
});

type Probe = { result: "PASS" | "FAIL" | "NOT VERIFIED"; detail: string };

function VpsPage() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["vps-accounts"], queryFn: async () => (await supabase.from("trading_accounts").select("id,login,server,ea_version,last_seen_at").order("last_seen_at", { ascending: false })).data ?? [] });
  const reports = useQuery({ queryKey: ["vps-reports"], queryFn: async () => (await supabase.from("vps_reports").select("*").order("created_at", { ascending: false }).limit(10)).data ?? [] });
  const [probe, setProbe] = useState<Probe | null>(null);
  const [msg, setMsg] = useState("");

  const lastSync = accounts.data?.[0]?.last_seen_at ?? null;
  const latest = reports.data?.[0];
  const status = vpsStatus({ reportOverall: latest?.overall ?? null, lastSyncAt: lastSync });
  const fresh = lastSync ? Date.now() - new Date(lastSync).getTime() < SYNC_FRESH_MIN * 60_000 : false;

  async function runProbe() {
    try {
      const r = await fetch("/api/public/ea/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setProbe(r.status === 401 ? { result: "PASS", detail: "Endpoint answered 401 to an unauthenticated probe (expected)." } : { result: "FAIL", detail: `Unexpected HTTP ${r.status}` });
    } catch (e) { setProbe({ result: "FAIL", detail: String(e).slice(0, 200) }); }
  }

  async function upload(file: File) {
    setMsg("");
    try {
      const rep = parseReport(await file.text());
      const { error } = await supabase.from("vps_reports").insert({ hostname: rep.hostname, report_time: rep.report_time, overall: rep.overall, checks: rep.checks });
      if (error) throw error;
      setMsg(`Saved report: ${rep.overall}`);
      qc.invalidateQueries({ queryKey: ["vps-reports"] });
    } catch (e) { setMsg(`Could not read report: ${(e as Error).message}`); }
  }

  const missing: string[] = [];
  if (!latest) missing.push("Run diagnose-network.ps1 on the VPS and upload ufuq-report.json here.");
  if (!fresh) missing.push("No authenticated EA sync in the last 5 minutes — check MT5 is open, Algo Trading is on, and the WebRequest URL is allowed.");
  if (latest?.overall === "FAIL") missing.push("Fix the FAIL items in the latest report, then run verify-mt5-connection.ps1 and upload again.");

  const badge = status === "Verified" ? "text-primary" : status === "Failed" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="space-y-6">
      <HelpNote>{"This page only trusts two things: real authenticated EA syncs recorded by the server, and reports you upload from the VPS scripts. It cannot see the VPS directly."}</HelpNote>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="VPS setup status" value={status} cls={badge} />
        <Card label="Last diagnostic report" value={latest ? new Date(latest.created_at).toLocaleString() : "—"} />
        <Card label="Last authenticated EA sync" value={lastSync ? new Date(lastSync).toLocaleString() : "—"} cls={fresh ? "text-primary" : "text-destructive"} />
        <Card label="EA version (last recorded)" value={accounts.data?.[0]?.ea_version ?? "unknown"} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Endpoint reachability (no credentials)</div>
          <div className="mt-1 text-sm">{probe ? `${probe.result} — ${probe.detail}` : "Not checked yet"}</div>
          <button onClick={runProbe} className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">Check endpoint</button>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">EA authentication</div>
          <div className="mt-1 text-sm">{fresh ? "PASS — server accepted an authenticated sync recently" : "NOT VERIFIED — no recent authenticated sync"}</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-medium">Next administrator action</div>
        <ul className="mt-2 list-disc ps-5 text-sm text-muted-foreground">{missing.length ? missing.map((m) => <li key={m}>{m}</li>) : <li>Nothing missing.</li>}</ul>
        <label className="mt-4 block text-sm">Upload sanitized report (ufuq-report.json)
          <input type="file" accept=".json,application/json" className="mt-2 block text-sm" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </div>
      {latest && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-start text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start">Check ({latest.hostname ?? "?"})</th><th className="text-start">Result</th><th className="text-start">Detail</th></tr></thead>
            <tbody>{(latest.checks as Check[]).map((c, i) => (
              <tr key={i} className="border-t border-border"><td className="px-4 py-2">{c.name}</td><td className={c.result === "PASS" ? "text-primary" : c.result === "FAIL" ? "text-destructive" : "text-muted-foreground"}>{c.result}</td><td className="text-xs text-muted-foreground">{c.detail}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-2 text-start">MT5 login</th><th className="text-start">Server</th><th className="text-start">Last sync</th></tr></thead>
          <tbody>{(accounts.data ?? []).map((a) => (
            <tr key={a.id} className="border-t border-border"><td className="px-4 py-2 font-mono">{a.login}</td><td>{a.server ?? "—"}</td><td>{a.last_seen_at ? new Date(a.last_seen_at).toLocaleString() : "never"}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-sm font-medium ${cls}`}>{value}</div></div>;
}
