import { useT, HelpNote, LanguageToggle } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InstrumentIcon } from "./InstrumentIcon";
import { useInstruments, useProfile } from "@/lib/trading";
import { cn } from "@/lib/utils";

export function InstrumentPicker({ open, onOpenChange, value, onChange }: { open: boolean; onOpenChange: (v: boolean) => void; value: string; onChange: (s: string) => void }) {
  const t = useT();
  const instruments = useInstruments();
  const profile = useProfile();
  const [q, setQ] = useState("");
  const favs = profile.data?.favorite_instruments ?? [];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (instruments.data ?? [])
      .filter((i) => !s || i.symbol.toLowerCase().includes(s) || i.name.toLowerCase().includes(s))
      .sort((a, b) => Number(favs.includes(b.symbol)) - Number(favs.includes(a.symbol)) || a.sort_order - b.sort_order);
  }, [instruments.data, q, favs]);

  const toggleFav = (sym: string) =>
    void profile.update({ favorite_instruments: favs.includes(sym) ? favs.filter((x) => x !== sym) : [...favs, sym] });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-3xl p-0">
        <DialogHeader className="border-b border-border p-5"><DialogTitle className="text-center">{t("Select Instrument")}</DialogTitle></DialogHeader>
        <div className="space-y-3 p-5 pt-0">
          <Input autoFocus placeholder={t("Search...")} value={q} onChange={(e) => setQ(e.target.value)} className="rounded-full" />
          <div className="grid max-h-[60vh] gap-1 overflow-y-auto sm:grid-cols-2">
            {list.map((i) => (
              <div key={i.id} className={cn("flex items-center gap-3 rounded-full border border-transparent px-4 py-3 hover:bg-secondary", i.symbol === value && "border-primary")}>
                <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => { onChange(i.symbol); onOpenChange(false); }}>
                  <InstrumentIcon flag={i.flag} />
                  <span className="font-semibold">{i.symbol}</span>
                  <span className="truncate text-xs text-muted-foreground">{i.name}</span>
                </button>
                <button onClick={() => toggleFav(i.symbol)} aria-label={favs.includes(i.symbol) ? t("Remove favourite") : t("Add favourite")}>
                  <Star className={cn("h-4 w-4", favs.includes(i.symbol) ? "fill-warning text-warning" : "text-muted-foreground")} />
                </button>
              </div>
            ))}
            {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("No instruments match.")}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
