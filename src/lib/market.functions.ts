import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public market data (no user data involved).
export const getQuotes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ items: z.array(z.object({ symbol: z.string().max(20), yahoo: z.string().max(20) })).max(30) }).parse(d))
  .handler(async ({ data }) => {
    const { fetchQuote } = await import("./market.server");
    return Promise.all(data.items.map((i) => fetchQuote(i.symbol, i.yahoo)));
  });

export const getNews = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchNews } = await import("./market.server");
  return fetchNews(40);
});

export const getCalendar = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCalendar } = await import("./market.server");
  return fetchCalendar();
});

export const getCandlesPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ yahoo: z.string().max(20), tf: z.enum(["M5", "M15", "H1", "H4", "D1"]) }).parse(d))
  .handler(async ({ data }) => {
    const { fetchCandles } = await import("./market.server");
    return fetchCandles(data.yahoo, data.tf, 1000).catch(() => []);
  });
