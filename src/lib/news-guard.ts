// Pure news gate: which calendar events should pause trading on a symbol.
// Idea taken from the crude-oil bots: oil reacts hard to its own weekly reports
// (EIA/API inventories) and OPEC decisions, which ForexFactory often rates only
// "Medium", so for oil those events block even when they are not "High".
export type CalEvent = { title: string; country: string; date: string; impact: string };

export const NEWS_WINDOW_MIN = 30;
const OIL_EVENT = /crude oil inventor|cushing|eia |api weekly|opec|oil production|petroleum/i;

export const isOil = (symbol: string) => /OIL|XTI|XBR|WTI|BRENT/i.test(symbol);

/** Currencies whose events move the symbol. */
export function symbolCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("XAG") || isOil(s) || s.includes("US30") || s.includes("USTEC") || s.includes("NAS") || s.includes("SPX") || s.includes("US500")) return ["USD"];
  if (s.includes("DE30") || s.includes("GER")) return ["EUR"];
  if (s.includes("UK100")) return ["GBP"];
  if (s.includes("BTC") || s.includes("ETH")) return ["USD"];
  return [s.slice(0, 3), s.slice(3, 6)];
}

/** True when this event should pause new trades on the symbol. */
export function eventBlocks(symbol: string, e: CalEvent): boolean {
  if (isOil(symbol) && OIL_EVENT.test(e.title) && e.impact !== "Low" && e.impact !== "Holiday") return true;
  return e.impact === "High" && symbolCurrencies(symbol).includes(e.country);
}

/** The first blocking event within ±windowMin minutes of now, or null. */
export function blockingEvent(symbol: string, events: CalEvent[], nowMs: number, windowMin = NEWS_WINDOW_MIN): CalEvent | null {
  return events.find((e) => eventBlocks(symbol, e) && Math.abs(new Date(e.date).getTime() - nowMs) < windowMin * 60_000) ?? null;
}
