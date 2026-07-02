"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { runImport } from "@/lib/importer";
import { formatElapsed } from "@/lib/utils";
import type { Lead } from "@/lib/db";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Phase =
  | { name: "running" }
  | { name: "done"; failed: number }
  | { name: "stopped"; reason: string };

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

// Reusable import progress dialog: runs the import in batches, supports
// cancel + resume-style retry, then redirects to /leads on success.
export function ImportModal({
  onClose,
  leads,
  ignored,
}: {
  onClose: () => void;
  leads: Lead[];
  ignored: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>({ name: "running" });
  const [imported, setImported] = React.useState(0);
  const [current, setCurrent] = React.useState("");
  const [elapsed, setElapsed] = React.useState(0);
  const cancelRef = React.useRef(false);
  const importedRef = React.useRef(0);
  const startedRef = React.useRef(false);
  const startTimeRef = React.useRef(0);

  const total = leads.length;
  const remaining = total - imported;
  const percent = total === 0 ? 100 : Math.round((imported / total) * 100);

  const start = React.useCallback(async () => {
    cancelRef.current = false;
    setPhase({ name: "running" });
    const base = importedRef.current;
    try {
      await runImport(leads.slice(base), {
        onProgress: (count, label) => {
          importedRef.current = base + count;
          setImported(base + count);
          setCurrent(label);
        },
        isCancelled: () => cancelRef.current,
      });
      if (cancelRef.current) {
        setPhase({ name: "stopped", reason: "Cancelled" });
      } else {
        setPhase({ name: "done", failed: 0 });
      }
    } catch (error) {
      setPhase({
        name: "stopped",
        reason:
          error instanceof Error
            ? error.message
            : "Unexpected error while writing to the local database.",
      });
    }
  }, [leads]);

  // Kick off exactly once.
  React.useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startTimeRef.current = Date.now();
      start();
    }
  }, [start]);

  // Elapsed timer while running.
  React.useEffect(() => {
    if (phase.name !== "running") return;
    const interval = setInterval(
      () => setElapsed(Date.now() - startTimeRef.current),
      500
    );
    return () => clearInterval(interval);
  }, [phase.name]);

  // Auto-redirect shortly after success.
  React.useEffect(() => {
    if (phase.name !== "done") return;
    const timer = setTimeout(() => router.push("/leads"), 1500);
    return () => clearTimeout(timer);
  }, [phase.name, router]);

  return (
    <AlertDialog open onOpenChange={(open) => !open && phase.name !== "running" && onClose()}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => {
          if (phase.name === "running") e.preventDefault();
        }}
      >
        {phase.name === "running" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Importing leads…</AlertDialogTitle>
              <AlertDialogDescription>
                Writing {total.toLocaleString()} leads to the local database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-foreground transition-[width] duration-150"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Imported" value={imported.toLocaleString()} />
              <Fact label="Remaining" value={remaining.toLocaleString()} />
              <Fact label="Elapsed" value={formatElapsed(elapsed)} />
              <Fact label="Current" value={current || "—"} />
            </div>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => (cancelRef.current = true)}>
                Cancel
              </Button>
            </AlertDialogFooter>
          </>
        )}

        {phase.name === "done" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Import Complete</AlertDialogTitle>
              <AlertDialogDescription>
                Taking you to your leads…
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-3 gap-3">
              <Fact label="Imported" value={imported.toLocaleString()} />
              <Fact label="Ignored" value={ignored.toLocaleString()} />
              <Fact label="Failed" value={String(phase.failed)} />
            </div>
            <AlertDialogFooter>
              <Button onClick={() => router.push("/leads")}>Open Leads</Button>
            </AlertDialogFooter>
          </>
        )}

        {phase.name === "stopped" && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Import stopped</AlertDialogTitle>
              <AlertDialogDescription>{phase.reason}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Fact label="Imported" value={imported.toLocaleString()} />
              <Fact label="Remaining" value={remaining.toLocaleString()} />
            </div>
            <AlertDialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={start}>Retry</Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
