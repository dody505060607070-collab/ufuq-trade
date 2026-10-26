import type { AutoSignal } from "./autopilot";

export const SCAN_INTERVAL_MS = 5 * 60_000;

/** Personalized output must never enter the shared signal cache. */
export async function selectAutopilotAnalysis<T extends AutoSignal>(userId: string, personal: boolean, io: {
  shared: () => Promise<T | null>;
  cachedPersonal: (owner: string) => Promise<T | null>;
  freshPersonal: (owner: string) => Promise<T>;
}) {
  if (!personal) return io.shared();
  return (await io.cachedPersonal(userId)) ?? io.freshPersonal(userId);
}