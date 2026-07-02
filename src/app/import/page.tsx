"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, X, RefreshCw, Check, History } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/settings";
import {
  parseCsvToPreview,
  readRecentImports,
  addRecentImport,
  type RecentImport,
} from "@/lib/preview-store";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const LAST_FILE_KEY = "outerbound.import.lastFile";

const TIPS = [
  "Export directly from Apify",
  "CSV only",
  "UTF-8 recommended",
  "First row should contain headers",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isCsv(file: File): boolean {
  return file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
}

export default function ImportPage() {
  const router = useRouter();
  const [parsing, setParsing] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const [lastFilename, setLastFilename] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<RecentImport[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const disabled = file !== null;

  React.useEffect(() => {
    setLastFilename(localStorage.getItem(LAST_FILE_KEY));
    setRecent(readRecentImports());
  }, []);

  const selectFile = (selected: File) => {
    if (!isCsv(selected)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setFile(selected);
    localStorage.setItem(LAST_FILE_KEY, selected.name);
    setLastFilename(selected.name);
    addRecentImport(selected.name);
    setRecent(readRecentImports());
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files[0];
    if (dropped) selectFile(dropped);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) selectFile(selected);
    e.target.value = "";
  };

  const removeFile = () => setFile(null);
  const browse = () => inputRef.current?.click();

  const onContinue = async () => {
    if (!file || parsing) return;
    setParsing(true);
    await parseCsvToPreview(file);
    router.push("/import/preview");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import"
        description="Upload a CSV exported from Apify to start a new import."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={onInputChange}
          />

          <button
            type="button"
            disabled={disabled}
            onClick={browse}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            aria-label="Upload CSV file. Drag and drop or press Enter to browse."
            className={cn(
              "flex min-h-[260px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              dragOver && "border-foreground bg-accent/50",
              invalid && "border-destructive",
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-accent/30"
            )}
          >
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border bg-muted/50">
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <span className="block text-sm font-medium">
              {disabled
                ? "Remove or replace the selected file to upload another"
                : "Drag your CSV here, or click to browse"}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {invalid ? (
                <span className="text-destructive">Only .csv files are supported.</span>
              ) : lastFilename && !disabled ? (
                <>Last file: {lastFilename}</>
              ) : (
                <>CSV files only</>
              )}
            </span>
          </button>

          {file && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} · Modified{" "}
                    {new Date(file.lastModified).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={browse}>
                  <RefreshCw aria-hidden="true" />
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={removeFile}
                  aria-label="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button disabled={!file || parsing} onClick={onContinue}>
              {parsing ? "Parsing…" : "Continue"}
            </Button>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold">Recent imports</h2>
            {recent.length === 0 ? (
              <EmptyState
                icon={History}
                title="No recent imports"
                description="Files you upload will show up here so you can pick up where you left off."
              />
            ) : (
              <Card>
                <ul className="divide-y">
                  {recent.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-3">
                      <FileSpreadsheet
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{item.filename}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.date)}
                      </span>
                      <span className="w-14 text-right text-xs text-muted-foreground">
                        {item.rows ?? "-"} rows
                      </span>
                      <span className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">
                        {item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Import tips</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    {tip}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
