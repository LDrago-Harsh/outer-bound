"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";

import {
  getPreview,
  loadSavedMapping,
  type AppField,
  type CsvPreview,
} from "@/lib/preview-store";
import { validateRows, type IssueRowStatus } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Filter = "all" | IssueRowStatus;

const STATUS_STYLES: Record<IssueRowStatus, string> = {
  error: "border-red-500/40 text-red-600 dark:text-red-400",
  warning: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  ignored: "text-muted-foreground",
};

const STATUS_LABELS: Record<IssueRowStatus, string> = {
  error: "Error",
  warning: "Warning",
  ignored: "Ignored",
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "error", label: "Errors" },
  { value: "warning", label: "Warnings" },
  { value: "ignored", label: "Ignored" },
];

export default function ImportValidationPage() {
  const [mounted, setMounted] = React.useState(false);
  const [preview, setPreview] = React.useState<CsvPreview | null>(null);
  const [fields, setFields] = React.useState<(AppField | null)[] | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");

  React.useEffect(() => {
    const p = getPreview();
    setPreview(p);
    if (p?.status === "ready") setFields(loadSavedMapping(p.headers));
    setMounted(true);
  }, []);

  const result = React.useMemo(() => {
    if (preview?.status !== "ready" || !fields) return null;
    return validateRows(preview.rows, fields);
  }, [preview, fields]);

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
          title="Nothing to validate"
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

  if (!fields || !result) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="No column mapping found"
          description="Map the CSV columns before validating rows."
          action={
            <Link href="/import/mapping" className={buttonVariants()}>
              Go to Mapping
            </Link>
          }
        />
      </div>
    );
  }

  const filtered =
    filter === "all"
      ? result.issueRows
      : result.issueRows.filter((row) => row.status === filter);

  const countFor = (f: Filter) =>
    f === "all"
      ? result.issueRows.length
      : result.issueRows.filter((row) => row.status === f).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Validation"
        description={preview.filename}
        actions={
          <Link
            href="/import/mapping"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total rows" value={result.totalRows.toLocaleString()} />
        <StatCard label="Valid rows" value={result.validRows.toLocaleString()} />
        <StatCard label="Warnings" value={result.warningRows.toLocaleString()} />
        <StatCard label="Errors" value={result.errorRows.toLocaleString()} />
        <StatCard label="Rows ignored" value={result.ignoredRows.toLocaleString()} />
      </div>

      {!result.emailMapped && (
        <Card className="mt-6 border-amber-500/40">
          <p className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
              aria-hidden="true"
            />
            No Email column is mapped — email rules were skipped. Go back to Mapping to
            map one.
          </p>
        </Card>
      )}

      <div className="mt-6 flex items-center gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label} ({countFor(f.value)})
          </Button>
        ))}
      </div>

      <Card className="mt-3">
        {result.issueRows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All rows look good"
            description="No errors, warnings, or ignored rows in this file."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No rows match this filter"
            description="Switch filters to see other issues."
          />
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr>
                  {["Row", "Status", "Issues", "Preview"].map((h) => (
                    <th
                      key={h}
                      className="sticky top-0 z-10 whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-xs font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className="border-b last:border-b-0 hover:bg-accent/30"
                  >
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {row.rowNumber}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs",
                          STATUS_STYLES[row.status]
                        )}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="max-w-[360px] truncate px-3 py-1.5" title={row.issues.join("; ")}>
                      {row.issues.join("; ")}
                    </td>
                    <td
                      className="max-w-[280px] truncate px-3 py-1.5 text-muted-foreground"
                      title={row.preview}
                    >
                      {row.preview}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 flex justify-end gap-3">
        <Link
          href="/import/mapping"
          className={buttonVariants({ variant: "outline" })}
        >
          Back
        </Link>
        <Link href="/import/duplicates" className={buttonVariants()}>
          Continue
        </Link>
      </div>
    </div>
  );
}
