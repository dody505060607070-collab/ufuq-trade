// Server-only helpers for free public market data (Yahoo Finance chart API, RSS feeds, ForexFactory calendar).
const UA = { "User-Agent": "Mozilla/5.0 (compatible; ArrissaBot/1.0)" };

export type Candle = { t: number; o: number; h: number; l: number; c: number };
export type Quote = { symbol: string; price: number | null; change_pct: number | null; time: number | null };

const TF_PARAMS: Record<string, { interval: string; range: string; group: number }> = {
  M5: { interval: "5m", range: "2d", group: 1 },
  M15: { interval: "15m", range: "5d", group: 1 },
  H1: { interval: "60m", range: "1mo", group: 1 },
  H4: { interval: "60m", range: "3mo", group: 4 },
  D1: { interval: "1d", range: "1y", group: 1 },
};

async function yahooChart(yahoo: string, interval: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`price source ${res.status}`);
  const j = (await res.json()) as {
    chart: { result?: Array<{ meta: { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketTime?: number }; timestamp?: number[]; indicators: { quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[] }> } }> };
  };
  const r = j.chart.result?.[0];
  if (!r) throw new Error("no data");
  return r;
}

export async function fetchQuote(symbol: string, yahoo: string): Promise<Quote> {
  try {
    const r = await yahooChart(yahoo, "1m", "1d");
    const price = r.meta.regularMarketPrice ?? null;
    const prev = r.meta.chartPreviousClose ?? null;
    return { symbol, price, change_pct: price && prev ? ((price - prev) / prev) * 100 : null, time: r.meta.regularMarketTime ?? null };
  } catch {
    return { symbol, price: null, change_pct: null, time: null };
  }
}

export async function fetchCandles(yahoo: string, tf: string, limit = 80): Promise<Candle[]> {
  const p = TF_PARAMS[tf] ?? TF_PARAMS["H1"]!;
  const r = await yahooChart(yahoo, p.interval, p.range);
  const q = r.indicators.quote[0]!;
  const raw: Candle[] = [];
  (r.timestamp ?? []).forEach((t, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o != null && h != null && l != null && c != null) raw.push({ t, o, h, l, c });
  });
  let out = raw;
  if (p.group > 1) {
    out = [];
    for (let i = 0; i < raw.length; i += p.group) {
      const g = raw.slice(i, i + p.group);
      out.push({ t: g[0]!.t, o: g[0]!.o, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), c: g[g.length - 1]!.c });
    }
  }
  return out.slice(-limit);
}

export type NewsItem = { title: string; source: string; url: string; published: string };

const FEEDS: Array<[string, string]> = [
  ["BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["The Guardian", "https://www.theguardian.com/world/rss"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"],
  ["CNBC", "https://www.cnbc.com/id/100727362/device/rss/rss.html"],
];

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8217;/g, "’").replace(/&#8216;/g, "‘").trim();

export async function fetchNews(limit = 40): Promise<NewsItem[]> {
  const lists = await Promise.all(
    FEEDS.map(async ([source, url]) => {
      try {
        const res = await fetch(url, { headers: UA });
        if (!res.ok) return [];
        const xml = await res.text();
        return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].slice(0, 15).map((m) => {
          const it = m[0];
          const pick = (tag: string) => decode(it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
          const d = new Date(pick("pubDate"));
          return { title: pick("title"), source, url: pick("link"), published: Number.isNaN(d.getTime()) ? "" : d.toISOString() };
        }).filter((x) => x.title && x.published);
      } catch {
        return [];
      }
    }),
  );
  return lists.flat().sort((a, b) => b.published.localeCompare(a.published)).slice(0, limit);
}

export type CalendarEvent = { title: string; country: string; date: string; impact: string; forecast: string; previous: string };

export async function fetchCalendar(): Promise<CalendarEvent[]> {
  return (await fetchCalendarStatus()).events;
}

/** Distinguishes "no events" (ok: true, events: []) from "calendar failed to load" (ok: false). */
export async function fetchCalendarStatus(): Promise<{ ok: boolean; events: CalendarEvent[] }> {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { headers: UA });
    if (!res.ok) return { ok: false, events: [] };
    const j = (await res.json()) as CalendarEvent[];
    if (!Array.isArray(j)) return { ok: false, events: [] };
    return { ok: true, events: j.map((e) => ({ title: e.title, country: e.country, date: new Date(e.date).toISOString(), impact: e.impact, forecast: e.forecast ?? "", previous: e.previous ?? "" })) };
  } catch {
    return { ok: false, events: [] };
  }
}
