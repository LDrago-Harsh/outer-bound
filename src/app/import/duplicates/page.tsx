"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown } from "lucide-react";

import {
  getPreview,
  loadSavedMapping,
  completeRecentImport,
  type AppField,
  type CsvPreview,
} from "@/lib/preview-store";
import { findDuplicateGroups, isBlankRow, type DuplicateGroup } from "@/lib/duplicates";
import { buildImportPlan, type ImportPlan } from "@/lib/import-plan";
import { ImportModal } from "@/components/import-modal";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type KeptMap = Record<number, number[]>; // group id -> kept row numbers

function defaultKept(groups: DuplicateGroup[]): KeptMap {
  const map: KeptMap = {};
  for (const g of groups) map[g.id] = [g.rowNumbers[0]]; // Keep First
  return map;
}

export default function ImportDuplicatesPage() {
  const [mounted, setMounted] = React.useState(false);
  const [preview, setPreview] = React.useState<CsvPreview | null>(null);
  const [fields, setFields] = React.useState<(AppField | null)[] | null>(null);
  const [kept, setKept] = React.useState<KeptMap>({});
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);

  const groups = React.useMemo(() => {
    if (preview?.status !== "ready" || !fields) return null;
    return findDuplicateGroups(preview.rows, fields);
  }, [preview, fields]);

  React.useEffect(() => {
    const p = getPreview();
    setPreview(p);
    if (p?.status === "ready") setFields(loadSavedMapping(p.headers));
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (groups) setKept(defaultKept(groups));
  }, [groups]);

  if (!mounted) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!preview || preview.status === "error") {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="Nothing to review"
          description="No preview data. Select a CSV on the Import page first."
          action={
            <Link href="/import" className={buttonVariants()}>
              Go to Import
            </Link>
          }
        />
      </div>
    );
  }

  if (!fields || !groups) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="No column mapping found"
          description="Map the CSV columns before reviewing duplicates."
          action={
            <Link href="/import/mapping" className={buttonVariants()}>
              Go to Mapping
            </Link>
          }
        />
      </div>
    );
  }

  const col = (field: AppField) => fields.indexOf(field);
  const cellOf = (rowNumber: number, c: number) =>
    c >= 0 ? (preview.rows[rowNumber - 1]?.[c] ?? "").trim() : "";
  const nameOf = (rowNumber: number) =>
    cellOf(rowNumber, col("fullName")) ||
    [cellOf(rowNumber, col("firstName")), cellOf(rowNumber, col("lastName"))]
      .filter(Boolean)
      .join(" ");

  const nonBlankRows = preview.rows.filter((row) => !isBlankRow(row)).length;
  const duplicateRows = groups.reduce((sum, g) => sum + g.rowNumbers.length, 0);
  const ignoredRows = groups.reduce(
    (sum, g) => sum + (g.rowNumbers.length - (kept[g.id]?.length ?? 0)),
    0
  );
  const rowsRemaining = nonBlankRows - ignoredRows;

  const setGroup = (groupId: number, rowNumbers: number[]) =>
    setKept((prev) => ({ ...prev, [groupId]: rowNumbers }));

  const toggleRow = (group: DuplicateGroup, rowNumber: number) => {
    const current = kept[group.id] ?? [];
    setGroup(
      group.id,
      current.includes(rowNumber)
        ? current.filter((n) => n !== rowNumber)
        : [...current, rowNumber]
    );
  };

  const keepFirstAll = () => setKept(defaultKept(groups));
  const keepLastAll = () => {
    const map: KeptMap = {};
    for (const g of groups) map[g.id] = [g.rowNumbers[g.rowNumbers.length - 1]];
    setKept(map);
  };
  const keepEverything = () => {
    const map: KeptMap = {};
    for (const g of groups) map[g.id] = [...g.rowNumbers];
    setKept(map);
  };

  const onContinue = () => {
    const ignored = groups.flatMap((g) =>
      g.rowNumbers.filter((n) => !(kept[g.id] ?? []).includes(n))
    );
    const importPlan = buildImportPlan(
      preview.rows,
      fields,
      new Set(ignored),
      preview.filename
    );
    completeRecentImport(preview.filename, importPlan.leads.length);
    setPlan(importPlan);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Duplicates"
        description={preview.filename}
        actions={
          <Link
            href="/import/validation"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Duplicate groups" value={String(groups.length)} />
        <StatCard label="Duplicate rows" value={String(duplicateRows)} />
        <StatCard label="Rows remaining" value={rowsRemaining.toLocaleString()} />
        <StatCard label="Rows ignored" value={String(ignoredRows)} />
      </div>

      {groups.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={CheckCircle2}
            title="No duplicates found"
            description="Every row in this CSV is unique by email, website, and name + company."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={keepFirstAll}>
              Keep First for All
            </Button>
            <Button variant="outline" size="sm" onClick={keepLastAll}>
              Keep Last for All
            </Button>
            <Button variant="outline" size="sm" onClick={keepEverything}>
              Keep Everything
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {groups.map((group) => {
              const keptRows = kept[group.id] ?? [];
              return (
                <Card key={group.id}>
                  <details className="group" open={groups.length <= 5}>
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-sm" title={group.key}>
                        {group.key}
                      </span>
                      <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                        {group.matchedField}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.rowNumbers.length} rows · keeping {keptRows.length}
                      </span>
                    </summary>

                    <div className="border-t px-4 py-3">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setGroup(group.id, [...group.rowNumbers])}
                        >
                          Keep All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setGroup(group.id, [group.rowNumbers[0]])}
                        >
                          Keep First
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setGroup(group.id, [
                              group.rowNumbers[group.rowNumbers.length - 1],
                            ])
                          }
                        >
                          Keep Last
                        </Button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-max border-collapse text-sm">
                          <thead>
                            <tr>
                              {["", "Row", "Status", "Name", "Company", "Email", "Website"].map(
                                (h, i) => (
                                  <th
                                    key={i}
                                    className="whitespace-nowrap border-b px-3 py-2 text-left text-xs font-semibold"
                                  >
                                    {h}
                                  </th>
                                )
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {group.rowNumbers.map((rowNumber) => {
                              const isKept = keptRows.includes(rowNumber);
                              return (
                                <tr
                                  key={rowNumber}
                                  className={cn(
                                    "border-b last:border-b-0",
                                    !isKept && "opacity-50"
                                  )}
                                >
                                  <td className="px-3 py-1.5">
                                    <input
                                      type="checkbox"
                                      checked={isKept}
                                      onChange={() => toggleRow(group, rowNumber)}
                                      aria-label={`Keep row ${rowNumber}`}
                                      className="h-4 w-4 accent-foreground"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                                    {rowNumber}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span
                                      className={cn(
                                        "rounded-md border px-2 py-0.5 text-xs",
                                        isKept
                                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {isKept ? "Primary" : "Ignored"}
                                    </span>
                                  </td>
                                  <td className="max-w-[180px] truncate px-3 py-1.5">
                                    {nameOf(rowNumber)}
                                  </td>
                                  <td className="max-w-[180px] truncate px-3 py-1.5 text-muted-foreground">
                                    {cellOf(rowNumber, col("company"))}
                                  </td>
                                  <td className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground">
                                    {cellOf(rowNumber, col("email"))}
                                  </td>
                                  <td className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground">
                                    {cellOf(rowNumber, col("website"))}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-6 flex items-center justify-end gap-4">
        <span className="text-sm text-muted-foreground">
          {rowsRemaining.toLocaleString()} to import · {ignoredRows} ignored ·{" "}
          {groups.length} groups
        </span>
        <Link
          href="/import/validation"
          className={buttonVariants({ variant: "outline" })}
        >
          Back
        </Link>
        <Button onClick={onContinue}>Continue</Button>
      </div>

      {plan && (
        <ImportModal
          onClose={() => setPlan(null)}
          leads={plan.leads}
          ignored={plan.ignored}
        />
      )}
    </div>
  );
}
