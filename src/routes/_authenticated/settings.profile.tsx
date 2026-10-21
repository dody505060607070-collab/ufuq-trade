import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { User, Mail, AtSign, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { Page, Card } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/trading";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  head: () => ({ meta: [{ title: "Personal Profile | Arrissa AI" }, { name: "description", content: "Manage your account information and password." }] }),
  component: ProfilePage,
});

const info = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(50),
  last_name: z.string().trim().max(50),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "Username: 3–24 letters, numbers or _"),
});
const pw = z.string().min(8, "Min 8 characters").regex(/[A-Z]/, "Needs 1 uppercase letter").regex(/[0-9]/, "Needs 1 number");

function ProfilePage() {
  const { user } = useAuth();
  const profile = useProfile();
  const [f, setF] = useState({ first_name: "", last_name: "", username: "" });
  useEffect(() => {
    const p = profile.data;
    if (p) setF({ first_name: p.first_name ?? p.full_name?.split(" ")[0] ?? "", last_name: p.last_name ?? "", username: p.username ?? "" });
  }, [profile.data]);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const r = info.safeParse(f);
    if (!r.success) return toast.error(r.error.issues[0]!.message);
    setSaving(true);
    await profile.update({ ...r.data, full_name: `${r.data.first_name} ${r.data.last_name}`.trim() }, "Profile saved.");
    setSaving(false);
  };

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [changing, setChanging] = useState(false);
  const change = async () => {
    if (!pwd.current) return toast.error("Enter your current password.");
    const r = pw.safeParse(pwd.next);
    if (!r.success) return toast.error(r.error.issues[0]!.message);
    if (pwd.next !== pwd.confirm) return toast.error("New passwords do not match.");
    setChanging(true);
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: user!.email!, password: pwd.current });
    if (e1) { setChanging(false); return toast.error("Current password is incorrect."); }
    const { error } = await supabase.auth.updateUser({ password: pwd.next });
    setChanging(false);
    if (error) return toast.error(error.message);
    setPwd({ current: "", next: "", confirm: "" });
    toast.success("Password changed.");
  };

  return (
    <Page title="Personal Profile" subtitle="Manage your account information and password.">
      <Card title="Account Information">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" icon={<User />}><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} className="h-11 rounded-full pl-11" /></Field>
            <Field label="Last name" icon={<User />}><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} className="h-11 rounded-full pl-11" /></Field>
          </div>
          <Field label="Email address" icon={<Mail />}><Input value={user?.email ?? ""} disabled className="h-11 rounded-full pl-11" /></Field>
          <Field label="Username" icon={<AtSign />}><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} className="h-11 rounded-full pl-11" /></Field>
          <Button variant="hero" className="h-11 w-full rounded-full" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save changes</Button>
        </div>
      </Card>
      <Card title="Change Password">
        <div className="space-y-4">
          <Pw label="Current password" placeholder="Enter current password" v={pwd.current} on={(v) => setPwd({ ...pwd, current: v })} />
          <Pw label="New password" placeholder="Min 8 chars, 1 uppercase, 1 number" v={pwd.next} on={(v) => setPwd({ ...pwd, next: v })} />
          <Pw label="Confirm new password" placeholder="Repeat new password" v={pwd.confirm} on={(v) => setPwd({ ...pwd, confirm: v })} />
          <Button variant="hero" className="h-11 w-full rounded-full" onClick={change} disabled={changing}>{changing && <Loader2 className="animate-spin" />} Change password</Button>
          <p className="text-xs text-muted-foreground">Signed up with Google? Use "Forgot password" on the login page to set a password first.</p>
        </div>
      </Card>
    </Page>
  );
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">{label}</p>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {children}
      </div>
    </div>
  );
}

function Pw({ label, placeholder, v, on }: { label: string; placeholder: string; v: string; on: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} icon={<Lock />}>
      <Input type={show ? "text" : "password"} placeholder={placeholder} value={v} onChange={(e) => on(e.target.value)} className="h-11 rounded-full px-11" autoComplete="new-password" />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    </Field>
  );
}
