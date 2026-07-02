"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import {
  getPreview,
  detectMappings,
  loadSavedMapping,
  saveMapping,
  APP_FIELDS,
  FIELD_LABELS,
  type AppField,
  type Confidence,
  type CsvPreview,
} from "@/lib/preview-store";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// High/Medium/Low/Unknown = auto-detected; Manual = user-selected.
type DisplayConfidence = Confidence | "manual";

const CONFIDENCE_STYLES: Record<DisplayConfidence, string> = {
  high: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  medium: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  low: "border-orange-500/40 text-orange-600 dark:text-orange-400",
  unknown: "text-muted-foreground",
  manual: "border-sky-500/40 text-sky-600 dark:text-sky-400",
};

const CONFIDENCE_LABELS: Record<DisplayConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  unknown: "Unknown",
  manual: "Manual",
};

function ConfidenceBadge({ confidence }: { confidence: DisplayConfidence }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs",
        CONFIDENCE_STYLES[confidence]
      )}
    >
      {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

export default function ImportMappingPage() {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [preview, setPreview] = React.useState<CsvPreview | null>(null);
  const [fields, setFields] = React.useState<(AppField | null)[]>([]);
  const [confidences, setConfidences] = React.useState<DisplayConfidence[]>([]);

  React.useEffect(() => {
    const p = getPreview();
    setPreview(p);
    if (p?.status === "ready") {
      const detected = detectMappings(p.headers);
      const remembered = loadSavedMapping(p.headers);
      setFields(remembered ?? detected.map((d) => d.field));
      setConfidences(detected.map((d) => d.confidence));
    }
    setMounted(true);
  }, []);

  const onFieldChange = (index: number, value: string) => {
    if (preview?.status !== "ready") return;
    const next = fields.slice();
    next[index] = value === "" ? null : (value as AppField);
    setFields(next);
    setConfidences((prev) => {
      const copy = prev.slice();
      copy[index] = "manual";
      return copy;
    });
    saveMapping(preview.headers, next);
  };

  const warnings = React.useMemo(() => {
    if (preview?.status !== "ready") return [];
    const list: string[] = [];
    const mapped = fields.filter((f): f is AppField => f !== null);

    if (!mapped.includes("email")) list.push("No Email column mapped — required for sending.");
    if (!mapped.some((f) => f === "firstName" || f === "fullName"))
      list.push("No name field mapped (First Name or Full Name) — personalization will be limited.");

    const counts = new Map<AppField, number>();
    for (const f of mapped) counts.set(f, (counts.get(f) ?? 0) + 1);
    for (const [field, count] of counts) {
      if (count > 1) list.push(`${FIELD_LABELS[field]} is mapped to ${count} columns.`);
    }
    return list;
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
          title="Nothing to map"
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

  const sampleFor = (col: number): string =>
    preview.rows.map((row) => row[col] ?? "").find((v) => v.trim() !== "") ?? "";

  const mappedCount = fields.filter((f) => f !== null).length;

  const onContinue = () => {
    saveMapping(preview.headers, fields);
    router.push("/import/validation");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Column Mapping"
        description={preview.filename}
        actions={
          <Link
            href="/import/preview"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Columns detected" value={String(preview.totalCols)} />
        <StatCard label="Mapped" value={String(mappedCount)} />
        <StatCard label="Ignored" value={String(preview.totalCols - mappedCount)} />
        <StatCard label="Warnings" value={String(warnings.length)} />
      </div>

      {warnings.length > 0 && (
        <Card className="mt-6 border-amber-500/40">
          <ul className="space-y-1 p-4">
            {warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                  aria-hidden="true"
                />
                {warning}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <ul className="divide-y">
          {preview.headers.map((header, i) => (
            <li key={i} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm" title={header}>
                  {header || `Column ${i + 1}`}
                </p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={sampleFor(i)}
                >
                  {sampleFor(i) || "(no sample value)"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`map-${i}`}>
                  Map {header || `column ${i + 1}`} to field
                </label>
                <select
                  id={`map-${i}`}
                  value={fields[i] ?? ""}
                  onChange={(e) => onFieldChange(i, e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Ignore column</option>
                  {APP_FIELDS.map((field) => (
                    <option key={field} value={field}>
                      {FIELD_LABELS[field]}
                    </option>
                  ))}
                </select>
                <ConfidenceBadge confidence={confidences[i] ?? "unknown"} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Link
          href="/import/preview"
          className={buttonVariants({ variant: "outline" })}
        >
          Back
        </Link>
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}
