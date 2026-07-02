"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { pageTitle } from "@/lib/nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <h2 className="text-sm font-semibold">{pageTitle(pathname)}</h2>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Global search"
          className="inline-flex h-9 w-56 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            Ctrl K
          </kbd>
        </button>

        <ThemeToggle />

        <div
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground"
          role="status"
          aria-label="Application status: ready"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Ready
        </div>
      </div>
    </header>
  );
}
