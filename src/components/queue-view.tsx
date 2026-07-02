"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ListTodo, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";

import {
  queueRepo,
  leadsRepo,
  campaignsRepo,
  templatesRepo,
  smtpRepo,
  type Campaign,
  type Lead,
  type QueueItem,
  type QueueStatus,
  type SmtpAccount,
  type Template,
} from "@/lib/db";
import { getQueueController, type QueueProgress } from "@/lib/queue-controller";
import { nameOf } from "@/lib/use-leads-filter";
import { cn, formatElapsed } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 500;

const STATUS_STYLES: Record<QueueStatus, string> = {
  pending: "text-muted-foreground",
  sending: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  sent: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  failed: "border-red-500/40 text-red-600 dark:text-red-400",
  cancelled: "text-muted-foreground",
};

const STATUS_LABELS: Record<QueueStatus, string> = {
  pending: "Pending",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      items: QueueItem[];
      leads: Map<string, Lead>;
      campaigns: Map<string, Campaign>;
      templates: Map<string, Template>;
      smtp: Map<string, SmtpAccount>;
    };

export function QueueView() {
  const controller = React.useMemo(getQueueController, []);
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [progress, setProgress] = React.useState<QueueProgress>(controller.getProgress());
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const refreshItems = React.useCallback(async () => {
    try {
      const items = await queueRepo.getAll();
      setState((prev) =>
        prev.status === "ready" ? { ...prev, items } : prev
      );
    } catch {
      // keep current state
    }
  }, []);

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [items, leads, campaigns, templates, smtp] = await Promise.all([
        queueRepo.getAll(),
        leadsRepo.getAll(),
        campaignsRepo.getAll(),
        templatesRepo.getAll(),
        smtpRepo.getAll(),
      ]);
      setState({
        status: "ready",
        items,
        leads: new Map(leads.map((l) => [l.id, l])),
        campaigns: new Map(campaigns.map((c) => [c.id, c])),
        templates: new Map(templates.map((t) => [t.id, t])),
        smtp: new Map(smtp.map((a) => [a.id, a])),
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not read the local database.",
      });
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Controller drives updates: refresh items + progress on every notification.
  React.useEffect(() => {
    const unsubscribe = controller.subscribe(() => {
      setProgress(controller.getProgress());
      refreshItems();
    });
    return unsubscribe;
  }, [controller, refreshItems]);

  // Tick the elapsed clock while running.
  const running = progress.state === "running" || progress.state === "pausing" || progress.state === "stopping";
  React.useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setProgress(controller.getProgress()), 1000);
    return () => clearInterval(interval);
  }, [running, controller]);

  const items = React.useMemo(
    () =>
      state.status === "ready"
        ? [...state.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : [],
    [state]
  );

  const counts = React.useMemo(() => {
    const c: Record<QueueStatus, number> = {
      pending: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const item of items) c[item.status] += 1;
    return c;
  }, [items]);

  if (state.status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the queue"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const total = items.length;
  const processed = counts.sent + counts.failed + counts.cancelled;
  const percent = total === 0 ? 0 : Math.round((processed / total) * 100);
  const canStart =
    counts.pending > 0 && (progress.state === "idle" || progress.state === "stopped");
  const isPaused = progress.state === "paused";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Queue"
        description="Every queued email. Sending is always started manually."
      />

      {total === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Queue is empty"
          description="Generate a queue from a campaign's review page."
          action={
            <Link href="/campaigns" className={buttonVariants()}>
              Go to Campaigns
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Pending" value={counts.pending.toLocaleString()} />
            <StatCard label="Sending" value={String(counts.sending)} />
            <StatCard label="Sent" value={counts.sent.toLocaleString()} />
            <StatCard label="Failed" value={counts.failed.toLocaleString()} />
            <StatCard label="Total" value={total.toLocaleString()} />
          </div>

          <Card className="mt-6 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {canStart && (
                <Button size="sm" onClick={() => controller.start()}>
                  <Play aria-hidden="true" />
                  Start Queue
                </Button>
              )}
              {progress.state === "running" && (
                <Button size="sm" variant="outline" onClick={() => controller.pause()}>
                  <Pause aria-hidden="true" />
                  Pause Queue
                </Button>
              )}
              {isPaused && counts.pending > 0 && (
                <Button size="sm" onClick={() => controller.resume()}>
                  <Play aria-hidden="true" />
                  Resume Queue
                </Button>
              )}
              {(running || isPaused) && (
                <Button size="sm" variant="outline" onClick={() => controller.stop()}>
                  <Square aria-hidden="true" />
                  Stop Queue
                </Button>
              )}
              {counts.failed > 0 && (
                <Button size="sm" variant="outline" onClick={() => controller.retryFailed()}>
                  <RotateCcw aria-hidden="true" />
                  Retry Failed
                </Button>
              )}
              {counts.sent > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => controller.clearCompleted()}
                >
                  <Trash2 aria-hidden="true" />
                  Clear Completed
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {progress.state === "running" && "Running"}
                {progress.state === "pausing" && "Pausing after current email…"}
                {progress.state === "stopping" && "Stopping…"}
                {progress.state === "paused" && "Paused"}
                {progress.state === "stopped" && "Stopped"}
                {progress.state === "idle" && "Idle"}
              </span>
            </div>

            <div className="mt-4">
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
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current</p>
                  <p className="truncate font-medium">{progress.currentEmail ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="font-medium">{counts.pending.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="font-medium">{processed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Elapsed</p>
                  <p className="font-medium">{formatElapsed(progress.elapsedMs)}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="mt-6">
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr>
                    {["Status", "Lead", "Email", "Campaign", "Template", "SMTP", "Attempts", "Created"].map(
                      (h) => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 whitespace-nowrap border-b bg-muted px-3 py-2 text-left text-xs font-semibold"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, visible).map((item) => {
                    const lead = state.leads.get(item.leadId);
                    return (
                      <tr key={item.id} className="border-b last:border-b-0 hover:bg-accent/30">
                        <td className="px-3 py-1.5">
                          <span
                            className={cn(
                              "rounded-md border px-2 py-0.5 text-xs",
                              STATUS_STYLES[item.status]
                            )}
                            title={item.error || undefined}
                          >
                            {STATUS_LABELS[item.status]}
                          </span>
                          {item.status === "failed" && item.error && (
                            <p
                              className="mt-0.5 max-w-[200px] truncate text-xs text-muted-foreground"
                              title={item.error}
                            >
                              {item.error}
                            </p>
                          )}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-1.5">
                          {lead ? nameOf(lead) || "—" : "—"}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-1.5 text-muted-foreground">
                          {item.email}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                          {state.campaigns.get(item.campaignId)?.name ?? "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                          {state.templates.get(item.templateId)?.name ?? "—"}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                          {(() => {
                            const account = state.smtp.get(item.smtpAccountId);
                            return account ? account.name || account.senderEmail : "—";
                          })()}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {item.attempts ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {items.length > visible && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show more ({(items.length - visible).toLocaleString()} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
