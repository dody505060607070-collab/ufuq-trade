import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings | Ufuq Trade" }, { name: "description", content: "Configure your Ufuq Trade EA, profile and app preferences." }] }),
  component: () => <Outlet />,
});
