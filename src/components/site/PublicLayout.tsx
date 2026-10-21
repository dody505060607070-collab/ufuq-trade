import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Instagram, Send } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function PublicHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/about" className="hover:text-foreground">About</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
          <Link to="/risk-disclosure" className="hover:text-foreground">Risk</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="hero" size="sm"><Link to="/dashboard">Open dashboard</Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm"><Link to="/login">Sign in</Link></Button>
              <Button asChild variant="hero" size="sm"><Link to="/register">Get started</Link></Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            AI-powered market analysis and execution tools for MetaTrader 5 traders. Trading involves substantial risk.
          </p>
          <div className="flex gap-3 text-muted-foreground">
            <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-foreground"><Instagram className="h-5 w-5" /></a>
            <a href="https://t.me" target="_blank" rel="noreferrer" aria-label="Telegram" className="hover:text-foreground"><Send className="h-5 w-5" /></a>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Company</p>
          <Link to="/about" className="block text-muted-foreground hover:text-foreground">About</Link>
          <Link to="/contact" className="block text-muted-foreground hover:text-foreground">Contact</Link>
          <Link to="/web-app-install-trigger" className="block text-muted-foreground hover:text-foreground">Install app</Link>
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Legal</p>
          <Link to="/terms" className="block text-muted-foreground hover:text-foreground">Terms</Link>
          <Link to="/privacy" className="block text-muted-foreground hover:text-foreground">Privacy</Link>
          <Link to="/risk-disclosure" className="block text-muted-foreground hover:text-foreground">Risk disclosure</Link>
        </div>
      </div>
      <p className="border-t border-border/60 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Arrissa AI. All rights reserved.
      </p>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string }[] }) {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-xl font-medium">{s.h}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
      </article>
    </PublicLayout>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center bg-hero-glow px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-glow">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
