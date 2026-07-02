"use client";

import { Search, X } from "lucide-react";

import type { useLeadsFilter, BoolFilterKey } from "@/lib/use-leads-filter";
import { Button } from "@/components/ui/button";

type LeadsFilter = ReturnType<typeof useLeadsFilter>;

const BOOL_FILTERS: { key: BoolFilterKey; label: string }[] = [
  { key: "hasEmail", label: "Has Email" },
  { key: "hasPhone", label: "Has Phone" },
  { key: "hasWebsite", label: "Has Website" },
];

// Shared search + filter toolbar for lead lists, driven by useLeadsFilter.
export function LeadsToolbar({ filter }: { filter: LeadsFilter }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filter.qInput}
            onChange={(e) => filter.setQInput(e.target.value)}
            placeholder="Search name, company, email, phone…"
            aria-label="Search leads"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {filter.sources.length > 0 && (
          <select
            value={filter.source ?? ""}
            onChange={(e) => filter.setSource(e.target.value || null)}
            aria-label="Filter by source"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All sources</option>
            {filter.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {filter.countries.length > 0 && (
          <select
            value={filter.country ?? ""}
            onChange={(e) => filter.setCountry(e.target.value || null)}
            aria-label="Filter by country"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All countries</option>
            {filter.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {BOOL_FILTERS.filter((b) => filter.available[b.key]).map((b) => (
          <Button
            key={b.key}
            variant={filter.bools[b.key] ? "secondary" : "outline"}
            size="sm"
            aria-pressed={filter.bools[b.key]}
            onClick={() => filter.setBool(b.key, !filter.bools[b.key])}
          >
            {b.label}
          </Button>
        ))}
      </div>

      {filter.hasActiveFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {filter.chips.map((chip) => (
            <span
              key={chip.id}
              className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pl-2 pr-1 text-xs"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.remove}
                aria-label={`Remove filter ${chip.label}`}
                className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={filter.clearAll}>
            Clear All Filters
          </Button>
        </div>
      )}

      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        Showing {filter.results.length.toLocaleString()} of{" "}
        {filter.leadsTotal.toLocaleString()} leads
      </p>
    </div>
  );
}
