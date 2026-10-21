import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Page, Card } from "@/components/app/AppShell";
import { Switch } from "@/components/ui/switch";
import { useProfile } from "@/lib/trading";
import { getVoicePref, setVoicePref, speak } from "@/lib/alerts";

export const Route = createFileRoute("/_authenticated/settings/preferences")({
  head: () => ({ meta: [{ title: "Settings | Arrissa AI" }, { name: "description", content: "Manage your notification and display preferences." }] }),
  component: Prefs,
});

function Prefs() {
  const t = useT();
  const profile = useProfile();
  const p = profile.data;
  const [voice, setVoice] = useState(true);
  useEffect(() => setVoice(getVoicePref()), []);

  const togglePush = async (v: boolean) => {
    if (v && "Notification" in window && Notification.permission !== "granted") {
      const r = await Notification.requestPermission();
      if (r !== "granted") return toast.error(t("Notifications are blocked in your browser settings."));
    }
    void profile.update({ push_notifications: v }, v ? t("Signal notifications on.") : t("Signal notifications off."));
  };

  return (
    <Page title={t("Settings")} subtitle={t("Manage your notification and display preferences.")}>
      <Card title={t("Notifications")}>
        <Row title={t("Signal Push Notifications")} desc="Receive OS notifications when a new signal arrives, even when the app is in the background." checked={!!p?.push_notifications} on={togglePush} />
      </Card>
      <Card title={t("Sound")}>
        <Row title={t("Voice notifications")} desc="A spoken line when things happen: trades opened, TP / SL hit, trades closed, new signals, connection changes and more. Saved on this device."
          checked={voice} on={(v) => { setVoice(v); setVoicePref(v); if (v) speak(t("Voice notifications on")); }} />
      </Card>
      <Card title={t("Display")}>
        <div className="space-y-4">
          <Row title={t("Dashboard Tooltips")} desc="Show small helper tooltips after hovering an item for 2 seconds." checked={!!p?.show_tooltips} on={(v) => void profile.update({ show_tooltips: v })} />
          <Row title={t("Copy TP to trading form")} desc='When on, "Use Signal" loads the Take Profit value into the trading form.' checked={!!p?.copy_tp} on={(v) => void profile.update({ copy_tp: v })} />
          <Row title={t("Copy SL to trading form")} desc='When on, "Use Signal" loads the Stop Loss value into the trading form.' checked={!!p?.copy_sl} on={(v) => void profile.update({ copy_sl: v })} />
        </div>
      </Card>
    </Page>
  );
}

function Row({ title, desc, checked, on }: { title: string; desc: string; checked: boolean; on: (v: boolean) => void }) {
  const t = useT();
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/40 px-4 py-3">
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <Switch checked={checked} onCheckedChange={on} />
    </label>
  );
}
