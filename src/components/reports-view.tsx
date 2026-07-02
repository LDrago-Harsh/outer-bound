"use client";

import * as React from "react";
import { AlertTriangle, BarChart3, Download, Search } from "lucide-react";

import {
  campaignsRepo,
  emailLogsRepo,
  smtpRepo,
  templatesRepo,
  type Campaign,
  type EmailLog,
  type SmtpAccount,
  type Template,
} from "@/lib/db";
import { downloadFile } from "@/lib/backup";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const INPUT_CLASS =
  "rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const PAGE_SIZE = 500;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      logs: EmailLog[];
      campaigns: Map<string, Campaign>;
      templates: Map<string, Template>;
      smtp: Map<string, SmtpAccount>;
    };

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function ReportsView() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [q, setQ] = React.useState("");
  const [campaignId, setCampaignId] = React.useState("");
  const [smtpId, setSmtpId] = React.useState("");
  const [status, setStatus] = React.useState<"" | "sent" | "failed">("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [logs, campaigns, templates, smtp] = await Promise.all([
        emailLogsRepo.getAll(),
        campaignsRepo.getAll(),
        templatesRepo.getAll(),
        smtpRepo.getAll(),
      ]);
      setState({
        status: "ready",
        logs,
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

  const filtered = React.useMemo(() => {
    if (state.status !== "ready") return [];
    const query = q.trim().toLowerCase();
    const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
    const toIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : null;
    return state.logs
      .filter((log) => {
        if (campaignId && log.campaignId !== campaignId) return false;
        if (smtpId && log.smtpId !== smtpId) return false;
        if (status && log.status !== status) return false;
        if (fromIso && log.sentAt < fromIso) return false;
        if (toIso && log.sentAt > toIso) return false;
        if (query) {
          const campaign = state.campaigns.get(log.campaignId)?.name ?? "";
          const haystack =
            `${log.recipient} ${log.subject} ${campaign}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }, [state, q, campaignId, smtpId, status, from, to]);

  React.useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filtered.length]);

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
          title="Could not load reports"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const { logs, campaigns, templates, smtp } = state;

  const sent = filtered.filter((l) => l.status === "sent").length;
  const failed = filtered.length - sent;
  const successRate =
    filtered.length === 0 ? "—" : `${Math.round((sent / filtered.length) * 100)}%`;
  const sentDurations = filtered.filter((l) => l.status === "sent" && l.duration > 0);
  const avgDuration =
    sentDurations.length === 0
      ? "—"
      : formatDuration(
          Math.round(
            sentDurations.reduce((sum, l) => sum + l.duration, 0) / sentDurations.length
          )
        );

  const onExport = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = [
      "Date",
      "Recipient",
      "Campaign",
      "Template",
      "SMTP",
      "Status",
      "Attempts",
      "Duration (ms)",
      "Subject",
      "Error",
    ];
    const rows = filtered.map((log) =>
      [
        new Date(log.sentAt).toISOString(),
        log.recipient,
        campaigns.get(log.campaignId)?.name ?? "",
        templates.get(log.templateId)?.name ?? "",
        smtp.get(log.smtpId)?.name || smtp.get(log.smtpId)?.senderEmail || "",
        log.status,
        log.attempts,
        log.duration,
        log.subject,
        log.error,
      ]
        .map(esc)
        .join(",")
    );
    downloadFile(
      [header.map(esc).join(","), ...rows].join("\n"),
      `outerbound-report-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv"
    );
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Reports"
        description="Permanent send history, from EmailLogs only."
        actions={
          filtered.length > 0 ? (
            <Button size="sm" variant="outline" onClick={onExport}>
              <Download aria-hidden="true" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {logs.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No send history yet"
          description="Every email the queue sends (or fails to send) is logged here permanently."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total sent" value={sent.toLocaleString()} />
            <StatCard label="Total failed" value={failed.toLocaleString()} />
            <StatCard label="Success rate" value={successRate} />
            <StatCard label="Average send time" value={avgDuration} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search recipient, subject, campaign…"
                aria-label="Search logs"
                className={cn(INPUT_CLASS, "h-9 w-full pl-8")}
              />
            </div>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              aria-label="Filter by campaign"
              className={cn(INPUT_CLASS, "h-9")}
            >
              <option value="">All campaigns</option>
              {[...campaigns.values()].map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={smtpId}
              onChange={(e) => setSmtpId(e.target.value)}
              aria-label="Filter by SMTP account"
              className={cn(INPUT_CLASS, "h-9")}
            >
              <option value="">All SMTP</option>
              {[...smtp.values()].map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.senderEmail}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | "sent" | "failed")}
              aria-label="Filter by status"
              className={cn(INPUT_CLASS, "h-9")}
            >
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
              className={cn(INPUT_CLASS, "h-9")}
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
              className={cn(INPUT_CLASS, "h-9")}
            />
          </div>

          <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
            Showing {filtered.length.toLocaleString()} of {logs.length.toLocaleString()} logs
          </p>

          {filtered.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={Search}
                title="No logs match"
                description="Try a different search or remove some filters."
              />
            </div>
          ) : (
            <>
              <Card className="mt-3">
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full min-w-max border-collapse text-sm">
                    <thead>
                      <tr>
                        {[
                          "Date",
                          "Recipient",
                          "Campaign",
                          "Template",
                          "SMTP",
                          "Status",
                          "Attempts",
                          "Duration",
                        ].map((h) => (
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
                      {filtered.slice(0, visible).map((log) => {
                        const account = smtp.get(log.smtpId);
                        return (
                          <tr
                            key={log.id}
                            className="border-b last:border-b-0 hover:bg-accent/30"
                          >
                            <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                              {new Date(log.sentAt).toLocaleString()}
                            </td>
                            <td className="max-w-[220px] truncate px-3 py-1.5">
                              {log.recipient}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                              {campaigns.get(log.campaignId)?.name ?? "—"}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                              {templates.get(log.templateId)?.name ?? "—"}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                              {account ? account.name || account.senderEmail : "—"}
                            </td>
                            <td className="px-3 py-1.5">
                              <span
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-xs",
                                  log.status === "sent"
                                    ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                    : "border-red-500/40 text-red-600 dark:text-red-400"
                                )}
                                title={log.error || undefined}
                              >
                                {log.status === "sent" ? "Sent" : "Failed"}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {log.attempts}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                              {formatDuration(log.duration)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {filtered.length > visible && (
                <div className="mt-3 flex justify-center">
                  <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                    Show more ({(filtered.length - visible).toLocaleString()} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
