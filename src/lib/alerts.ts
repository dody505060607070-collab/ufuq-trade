// Device-local voice alerts and browser notifications.
const VOICE_KEY = "arrissa.voice";

export const getVoicePref = () => typeof window !== "undefined" && window.localStorage.getItem(VOICE_KEY) !== "off";
export const setVoicePref = (on: boolean) => window.localStorage.setItem(VOICE_KEY, on ? "on" : "off");

export function speak(text: string) {
  if (typeof window === "undefined" || !getVoicePref() || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
