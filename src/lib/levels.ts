/** Drop SL/TP that are on the wrong side of entry so a bad AI answer can never be copied into an order. */
export function sanitizeLevels<T extends { direction: string; entry: number | null; stop_loss: number | null; take_profit: number | null }>(r: T): T {
  const { direction, entry, stop_loss, take_profit } = r;
  if (direction === "neutral") return { ...r, entry: null, stop_loss: null, take_profit: null };
  if (entry == null) return r;
  const okSl = stop_loss == null || (direction === "buy" ? stop_loss < entry : stop_loss > entry);
  const okTp = take_profit == null || (direction === "buy" ? take_profit > entry : take_profit < entry);
  return { ...r, stop_loss: okSl ? stop_loss : null, take_profit: okTp ? take_profit : null };
}
