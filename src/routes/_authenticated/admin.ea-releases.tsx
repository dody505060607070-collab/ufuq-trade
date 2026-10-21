import { HelpNote } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { AdminCrud } from "@/components/admin/AdminCrud";

export const Route = createFileRoute("/_authenticated/admin/ea-releases")({
  component: () => (
    <div className="space-y-3"><HelpNote>{"EA releases are files users can download."}</HelpNote><AdminCrud title="EA releases" table="ea_releases" fields={[
      { key: "version", label: "Version", required: true },
      { key: "file_url", label: "Download URL (.ex5 / .zip)" },
      { key: "notes", label: "Release notes", type: "textarea" },
      { key: "is_latest", label: "Latest", type: "bool" },
    ]} /></div>
  ),
});
