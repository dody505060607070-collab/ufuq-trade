export type VpsStatus = "Not configured" | "Awaiting verification" | "Verified" | "Failed";

/** EA sync is "fresh" when an authenticated sync landed within this many minutes. */
export const SYNC_FRESH_MIN = 5;

export type Check = { name: string; result: "PASS" | "FAIL" | "NOT VERIFIED"; detail?: string };

/**
 * Verified needs BOTH an admin-submitted VPS report that passed AND a fresh authenticated EA sync
 * (the only trustworthy server-side signal). A report alone is never proof of live health.
 */
export function vpsStatus(input: { reportOverall: string | null; lastSyncAt: string | null; now?: number }): VpsStatus {
  const now = input.now ?? Date.now();
  const fresh = input.lastSyncAt ? now - new Date(input.lastSyncAt).getTime() < SYNC_FRESH_MIN * 60_000 : false;
  if (!input.reportOverall && !input.lastSyncAt) return "Not configured";
  if (input.reportOverall === "FAIL") return "Failed";
  if (input.reportOverall === "PASS" && fresh) return "Verified";
  return "Awaiting verification";
}

const SECRET = /(api[_-]?key|password|passwd|token|secret|x-api-key|x-ea-key)\s*[:=]\s*\S+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Strip anything that looks like a credential or UUID key before storing/displaying. */
export function sanitize(s: string): string {
  return s.replace(SECRET, "[redacted]").slice(0, 500);
}

/** Parse the JSON written by diagnose-network.ps1 / verify-mt5-connection.ps1. */
export function parseReport(text: string): { hostname: string | null; report_time: string | null; overall: "PASS" | "FAIL" | "NOT VERIFIED"; checks: Check[] } {
  const raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  const list: unknown[] = Array.isArray(raw?.checks) ? raw.checks.slice(0, 100) : [];
  const checks: Check[] = list.map((c) => {
    const o = c as { result?: unknown; name?: unknown; detail?: unknown };
    const r = String(o.result ?? "NOT VERIFIED").toUpperCase();
    const out: Check = { name: sanitize(String(o.name ?? "?")).slice(0, 80), result: r === "PASS" || r === "FAIL" ? r : "NOT VERIFIED" };
    if (o.detail) out.detail = sanitize(String(o.detail));
    return out;
  });
  if (!checks.length) throw new Error("Report has no checks");
  const overall = checks.some((c) => c.result === "FAIL") ? "FAIL" : checks.every((c) => c.result === "PASS") ? "PASS" : "NOT VERIFIED";
  return { hostname: raw?.hostname ? sanitize(String(raw.hostname)).slice(0, 80) : null, report_time: raw?.time ? String(raw.time) : null, overall, checks };
}
