import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Panel } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({ meta: [{ title: "Personal profile | Arrissa AI" }] }),
  component: Profile,
});

const schema = z.object({ full_name: z.string().trim().max(100), phone: z.string().trim().max(30), country: z.string().trim().max(60) });

function Profile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile", user?.id], enabled: !!user, queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data });
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return toast.error("Invalid values.");
    const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user!.id);
    if (error) return toast.error("Could not save profile.");
    toast.success("Profile saved.");
    void qc.invalidateQueries({ queryKey: ["profile"] });
  };
  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password, current_password: String(f.get("current")) } as { password: string });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password changed.");
    e.currentTarget.reset();
  };

  if (!profile.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-6">
      <Panel title="Personal information">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Email</Label><Input value={profile.data.email ?? ""} disabled /></div>
          <div className="space-y-2"><Label htmlFor="full_name">Full name</Label><Input id="full_name" name="full_name" defaultValue={profile.data.full_name ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={profile.data.phone ?? ""} /></div>
          <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" name="country" defaultValue={profile.data.country ?? ""} /></div>
          <div className="sm:col-span-2"><Button type="submit" variant="hero">Save changes</Button></div>
        </form>
      </Panel>
      <Panel title="Change password">
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="current">Current password</Label><Input id="current" name="current" type="password" required /></div>
          <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" name="password" type="password" minLength={8} required /></div>
          <div className="sm:col-span-2"><Button type="submit" variant="secondary" disabled={busy}>Update password</Button></div>
        </form>
      </Panel>
    </div>
  );
}
