import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

export type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "bool" | "list" | "select";
  options?: string[];
  required?: boolean;
  table?: boolean;
};

type Row = Record<string, unknown> & { id: string };

export function AdminCrud({ table, fields, order = "created_at", ascending = false, title }: { table: string; fields: Field[]; order?: string; ascending?: boolean; title: string }) {
  const qc = useQueryClient();
  const db = supabase as unknown as { from: (t: string) => any };
  const q = useQuery({
    queryKey: ["admin", table],
    queryFn: async () => {
      const { data, error } = await db.from(table).select("*").order(order, { ascending });
      if (error) throw error;
      return data as Row[];
    },
  });
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values: Record<string, unknown> = {};
    for (const fd of fields) {
      const raw = f.get(fd.key);
      if (fd.type === "bool") values[fd.key] = raw === "on";
      else if (fd.type === "number") values[fd.key] = raw === "" || raw == null ? null : Number(raw);
      else if (fd.type === "list") values[fd.key] = String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      else values[fd.key] = raw === "" ? null : raw;
      if (fd.required && (values[fd.key] == null || values[fd.key] === "")) return toast.error(`${fd.label} is required.`);
    }
    const isNew = editing === "new";
    const { error } = isNew ? await db.from(table).insert(values) : await db.from(table).update(values).eq("id", (editing as Row).id);
    if (error) return toast.error(error.message);
    void logAudit(`${table}.${isNew ? "create" : "update"}`, values);
    toast.success("Saved.");
    setEditing(null);
    void qc.invalidateQueries({ queryKey: ["admin", table] });
  };

  const remove = async (row: Row) => {
    if (!confirm("Delete this item?")) return;
    const { error } = await db.from(table).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    void logAudit(`${table}.delete`, { id: row.id });
    void qc.invalidateQueries({ queryKey: ["admin", table] });
  };

  const cols = fields.filter((f) => f.table !== false);
  const current = editing && editing !== "new" ? editing : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        <Button variant="hero" size="sm" onClick={() => setEditing("new")}><Plus /> Add</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>{cols.map((c) => <th key={c.key} className="px-4 py-3">{c.label}</th>)}<th className="w-24" /></tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                {cols.map((c) => (
                  <td key={c.key} className="max-w-xs truncate px-4 py-3">
                    {c.type === "bool" ? (r[c.key] ? "Yes" : "No") : Array.isArray(r[c.key]) ? (r[c.key] as string[]).join(", ") : String(r[c.key] ?? "—")}
                  </td>
                ))}
                <td className="px-2 text-right">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(r)} aria-label="Edit"><Pencil /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(r)} aria-label="Delete"><Trash2 /></Button>
                </td>
              </tr>
            ))}
            {q.data?.length === 0 && <tr><td colSpan={cols.length + 1} className="px-4 py-8 text-center text-muted-foreground">Nothing here yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === "new" ? "Add" : "Edit"} {title.toLowerCase()}</DialogTitle></DialogHeader>
          <form key={current?.id ?? "new"} onSubmit={save} className="space-y-3">
            {fields.map((f) => {
              const v = current?.[f.key];
              return (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  {f.type === "textarea" ? <Textarea id={f.key} name={f.key} defaultValue={String(v ?? "")} rows={5} />
                    : f.type === "bool" ? <div><Switch id={f.key} name={f.key} defaultChecked={current ? !!v : true} /></div>
                    : f.type === "select" ? (
                      <select id={f.key} name={f.key} defaultValue={String(v ?? f.options?.[0] ?? "")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )
                    : <Input id={f.key} name={f.key} type={f.type === "number" ? "number" : "text"} step="any" defaultValue={Array.isArray(v) ? v.join(", ") : String(v ?? "")} />}
                </div>
              );
            })}
            <Button type="submit" variant="hero" className="w-full">Save</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
