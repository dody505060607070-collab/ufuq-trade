import { Link } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";

export function Logo({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
        <TrendingUp className="h-4 w-4 text-primary-foreground" />
      </span>
      <span className="text-lg">
        Arrissa<span className="text-gradient">AI</span>
      </span>
    </Link>
  );
}
