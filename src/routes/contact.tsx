import { useT } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  head: () => seo("Contact", "Get in touch with the Ufuq Trade team."),
  component: Contact,
});

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  message: z.string().trim().min(1).max(2000),
});

function Contact() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) return toast.error(t("Please fill all fields with valid values."));
    setBusy(true);
    const { error } = await supabase.from("contact_messages").insert(parsed.data);
    setBusy(false);
    if (error) return toast.error(t("Could not send your message."));
    toast.success(t("Message sent. We'll get back to you soon."));
    form.reset();
  };
  return (
    <PublicLayout>
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{t("Contact us")}</h1>
        <p className="mt-2 text-muted-foreground">{t("Questions about the platform, brokers or the EA? Send us a message.")}</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-2"><Label htmlFor="name">{t("Name")}</Label><Input id="name" name="name" required maxLength={100} /></div>
          <div className="space-y-2"><Label htmlFor="email">{t("Email")}</Label><Input id="email" name="email" type="email" required maxLength={255} /></div>
          <div className="space-y-2"><Label htmlFor="message">{t("Message")}</Label><Textarea id="message" name="message" rows={5} required maxLength={2000} /></div>
          <Button type="submit" variant="hero" disabled={busy} className="w-full">{busy ? t("Sending…") : t("Send message")}</Button>
        </form>
      </div>
    </PublicLayout>
  );
}
