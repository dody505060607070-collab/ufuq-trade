export const DEFAULT_TRADE_LOT = 0.02;
export function validAutopilotLot(lot: number) {
  return Number.isFinite(lot) && lot >= 0.01 && lot <= 10;
}