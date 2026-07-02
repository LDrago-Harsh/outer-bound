"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { Lead } from "@/lib/db";
import { nameOf, type SortKey, type SortState } from "@/lib/use-leads-filter";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PAGE_SIZE = 500;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "source", label: "Source" },
  { key: "importedAt", label: "Imported" },
];

// Shared sortable leads table with incremental rendering.
// Pass selectedIds/onToggleLead for checkbox selection mode.
export function LeadsTable({
  leads,
  sort,
  onSort,
  onRowClick,
  selectedIds,
  onToggleLead,
  onToggleMany,
  className,
}: {
  leads: Lead[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onRowClick?: (lead: Lead) => void;
  selectedIds?: Set<string>;
  onToggleLead?: (id: string, index: number, shiftKey: boolean) => void;
  onToggleMany?: (ids: string[], selected: boolean) => void;
  className?: string;
}) {
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  React.useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [leads.length]);

  const selectable = Boolean(selectedIds && onToggleLead);
  const shown = leads.slice(0, visible);
  const allShownSelected =
    selectable && shown.length > 0 && shown.every((l) => selectedIds!.has(l.id));

  return (
    <div className={className}>
      <Card>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr>
                {selectable && (
                  <th className="sticky top-0 z-10 w-10 border-b bg-muted px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            !allShownSelected && shown.some((l) => selectedIds!.has(l.id));
                      }}
                      onChange={() =>
                        onToggleMany?.(
                          shown.map((l) => l.id),
                          !allShownSelected
                        )
                      }
                      aria-label="Select all visible leads"
                      className="h-4 w-4 accent-foreground"
                    />
                  </th>
                )}
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className="sticky top-0 z-10 whitespace-nowrap border-b bg-muted p-0 text-left"
                  >
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      className="flex w-full items-center gap-1 px-3 py-2 text-xs font-semibold hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {sort.key === column.key &&
                        (sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((lead, index) => {
                const isSelected = selectable && selectedIds!.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    onClick={(e) =>
                      onRowClick
                        ? onRowClick(lead)
                        : selectable && onToggleLead!(lead.id, index, e.shiftKey)
                    }
                    className={cn(
                      "cursor-pointer border-b last:border-b-0 hover:bg-accent/30",
                      isSelected && "bg-accent/40"
                    )}
                  >
                    {selectable && (
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLead!(lead.id, index, e.shiftKey);
                          }}
                          aria-label={`Select ${nameOf(lead) || lead.email}`}
                          className="h-4 w-4 accent-foreground"
                        />
                      </td>
                    )}
                    <td className="max-w-[200px] truncate px-3 py-1.5 font-medium">
                      {nameOf(lead) || "—"}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-1.5 text-muted-foreground">
                      {lead.company}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground">
                      {lead.email}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-1.5 text-muted-foreground">
                      {lead.phone}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-1.5 text-muted-foreground">
                      {lead.country}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                      {lead.source}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                      {formatDate(lead.importedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {leads.length > visible && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show more ({(leads.length - visible).toLocaleString()} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
