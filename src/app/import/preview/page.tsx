"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

import { getPreview, type CsvPreview } from "@/lib/preview-store";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";

export default function ImportPreviewPage() {
  const [preview, setPreview] = React.useState<CsvPreview | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setPreview(getPreview());
    setMounted(true);
  }, []);

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
          title="Could not preview this file"
          description={
            preview?.message ??
            "No preview data. Select a CSV on the Import page first."
          }
          action={
            <Link href="/import" className={buttonVariants()}>
              Try another file
            </Link>
          }
        />
      </div>
    );
  }

  const displayRows = preview.rows.slice(0, 50);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Preview"
        description={preview.filename}
        actions={
          <Link
            href="/import"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ArrowLeft aria-hidden="true" />
            Back to Import
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Filename" value={preview.filename} />
        <StatCard label="Total rows" value={preview.totalRows.toLocaleString()} />
        <StatCard label="Total columns" value={String(preview.totalCols)} />
      </div>

      <Section title={`Detected headers (${preview.totalCols})`} className="mt-6">
        <div className="flex flex-wrap gap-1.5">
          {preview.headers.map((header, i) => (
            <span
              key={i}
              className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs"
            >
              {header || <em className="not-italic text-muted-foreground">(empty)</em>}
            </span>
          ))}
        </div>
      </Section>

      <Section
        title={`First ${displayRows.length} rows`}
        description={
          preview.totalRows > displayRows.length
            ? `Showing ${displayRows.length} of ${preview.totalRows.toLocaleString()} rows.`
            : undefined
        }
        className="mt-6"
      >
        <Card>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr>
                  {preview.headers.map((header, i) => (
                    <th
                      key={i}
                      className="sticky top-0 z-10 whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-xs font-semibold"
                    >
                      {header || `Column ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, r) => (
                  <tr key={r} className="border-b last:border-b-0 hover:bg-accent/30">
                    {preview.headers.map((_, c) => (
                      <td
                        key={c}
                        className="max-w-[280px] truncate whitespace-nowrap px-3 py-1.5 text-muted-foreground"
                        title={row[c] ?? ""}
                      >
                        {row[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <div className="mt-6 flex justify-end">
        <Link href="/import/mapping" className={buttonVariants()}>
          Continue
        </Link>
      </div>
    </div>
  );
}
