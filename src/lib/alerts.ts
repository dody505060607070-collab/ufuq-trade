// Device-local voice alerts, alert sound and browser notifications.
const VOICE_KEY = "arrissa.voice";

export const getVoicePref = () => typeof window !== "undefined" && window.localStorage.getItem(VOICE_KEY) !== "off";
export const setVoicePref = (on: boolean) => window.localStorage.setItem(VOICE_KEY, on ? "on" : "off");

export function speak(text: string) {
  if (typeof window === "undefined" || !getVoicePref() || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  u.volume = 1;
  window.speechSynthesis.speak(u);
}

let ctx: AudioContext | null = null;
/** Loud "cash register" chime (kind=win) or a warning tone (kind=risk). */
export function playSound(kind: "win" | "risk" | "info" = "info") {
  if (typeof window === "undefined" || !getVoicePref()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const notes = kind === "win" ? [1318, 1760, 2093, 2637] : kind === "risk" ? [440, 330, 440, 330] : [880, 1320];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = kind === "risk" ? "square" : "triangle";
      o.frequency.value = f;
      const t0 = ctx!.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(ctx!.destination);
      o.start(t0);
      o.stop(t0 + 0.3);
    });
  } catch {
    /* audio not available */
  }
}

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico", requireInteraction: false });
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** One alert: sound + notification + spoken line. */
export function alertUser(title: string, body: string, kind: "win" | "risk" | "info" = "info") {
  playSound(kind);
  notify(title, body);
  speak(body);
}
