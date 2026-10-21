import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings | Arrissa AI" }, { name: "description", content: "Configure your Arrissa EA, profile and app preferences." }] }),
  component: () => <Outlet />,
});
