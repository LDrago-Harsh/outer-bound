"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Download,
  FileText,
  Inbox,
  Play,
  Send,
} from "lucide-react";

import {
  createDashboardService,
  type DashboardService,
} from "@/lib/dashboard-service";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";

// Each widget loads independently through this tiny state hook —
// the page never blocks on any single widget.
function useWidget<T>(load: () => Promise<T>) {
  const [data, setData] = React.useState<T | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    load()
      .then((result) => {
        if (alive) {
          setData(result);
          setLoaded(true);
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      alive = false;
    };
  }, [load]);
  return { data, loaded, error };
}

function WidgetCard({
  title,
  children,
  loaded,
  error,
}: {
  title: string;
  children: React.ReactNode;
  loaded: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !loaded ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

const QUICK_ACTIONS = [
  { href: "/import", label: "Import CSV", icon: Download },
  { href: "/campaigns", label: "New Campaign", icon: Send },
  { href: "/queue", label: "Start Queue", icon: Play },
  { href: "/inbox", label: "Open Inbox", icon: Inbox },
  { href: "/templates", label: "New Template", icon: FileText },
];

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardView() {
  const service: DashboardService = React.useMemo(createDashboardService, []);

  // Greeting and date are locale/time dependent: render them only on the
  // client to avoid SSR hydration mismatches.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);

  const today = useWidget(service.todayActivity);
  const overview = useWidget(service.overview);
  const imports = useWidget(service.recentImports);
  const recentCampaigns = useWidget(service.recentCampaigns);
  const replies = useWidget(service.recentReplies);
  const queueStatus = useWidget(service.queueStatus);
  const smtpStatus = useWidget(service.smtpStatus);
  const warnings = useWidget(service.warnings);
  const feed = useWidget(service.activityFeed);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={now ? greeting(now) : "Welcome"}
        description={
          now
            ? now.toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : " "
        }
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <action.icon aria-hidden="true" />
            {action.label}
          </Link>
        ))}
      </div>

      {warnings.data && warnings.data.length > 0 && (
        <Card className="mt-6 border-amber-500/40">
          <ul className="space-y-1 p-4">
            {warnings.data.map((warning) => (
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

      <Section title="Today's activity" className="mt-6">
        {today.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Emails sent today" value={today.data.sent.toLocaleString()} />
            <StatCard label="Replies today" value={String(today.data.replies)} />
            <StatCard label="Failed today" value={String(today.data.failed)} />
            <StatCard label="Queued" value={today.data.queued.toLocaleString()} />
            <StatCard label="Pending" value={today.data.pending.toLocaleString()} />
          </div>
        ) : (
          <Skeleton className="h-20 w-full" />
        )}
      </Section>

      <Section title="Overview" className="mt-6">
        {overview.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total leads" value={overview.data.leads.toLocaleString()} />
            <StatCard label="Templates" value={String(overview.data.templates)} />
            <StatCard label="Campaigns" value={String(overview.data.campaigns)} />
            <StatCard label="SMTP accounts" value={String(overview.data.smtpAccounts)} />
            <StatCard
              label="Inbox conversations"
              value={overview.data.conversations.toLocaleString()}
            />
          </div>
        ) : (
          <Skeleton className="h-20 w-full" />
        )}
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <WidgetCard title="Recent imports" loaded={imports.loaded} error={imports.error}>
          {imports.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No imports yet. <Link href="/import" className="underline">Import a CSV.</Link>
            </p>
          ) : (
            <ul className="divide-y">
              {imports.data?.map((item, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.filename}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(item.date)}
                  </span>
                  <span className="w-14 text-right text-xs text-muted-foreground">
                    {item.rows ?? "—"} rows
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard
          title="Recent campaigns"
          loaded={recentCampaigns.loaded}
          error={recentCampaigns.error}
        >
          {recentCampaigns.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns yet.{" "}
              <Link href="/campaigns" className="underline">Create one.</Link>
            </p>
          ) : (
            <ul className="divide-y">
              {recentCampaigns.data?.map((campaign) => (
                <li key={campaign.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link
                    href={`/campaigns?id=${campaign.id}`}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {campaign.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {campaign.leadCount.toLocaleString()} leads
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0 text-[10px]",
                      campaign.status === "Sending"
                        ? "border-sky-500/40 text-sky-600 dark:text-sky-400"
                        : campaign.status === "Sent"
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : campaign.status === "Queued"
                            ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                    )}
                  >
                    {campaign.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(campaign.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <WidgetCard title="Recent replies" loaded={replies.loaded} error={replies.error}>
          {replies.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies yet.</p>
          ) : (
            <ul className="divide-y">
              {replies.data?.map((reply, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {reply.leadName}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {reply.campaignName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(reply.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <div className="space-y-6">
          <WidgetCard
            title="Queue status"
            loaded={queueStatus.loaded}
            error={queueStatus.error}
          >
            <dl className="grid grid-cols-4 gap-3 text-sm">
              {queueStatus.data &&
                (
                  [
                    ["Pending", queueStatus.data.pending],
                    ["Sending", queueStatus.data.sending],
                    ["Failed", queueStatus.data.failed],
                    ["Completed", queueStatus.data.completed],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-semibold">{value.toLocaleString()}</dd>
                  </div>
                ))}
            </dl>
          </WidgetCard>

          <WidgetCard
            title="SMTP status"
            loaded={smtpStatus.loaded}
            error={smtpStatus.error}
          >
            {smtpStatus.data === null ? (
              <p className="text-sm text-muted-foreground">
                No default SMTP account.{" "}
                <Link href="/smtp" className="underline">Set one up.</Link>
              </p>
            ) : (
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Default account</dt>
                  <dd className="truncate font-semibold" title={smtpStatus.data.name}>
                    {smtpStatus.data.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Daily limit</dt>
                  <dd className="font-semibold">
                    {smtpStatus.data.dailyLimit || "No limit"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Sent today</dt>
                  <dd className="font-semibold">{smtpStatus.data.sentToday}</dd>
                </div>
              </dl>
            )}
          </WidgetCard>
        </div>
      </div>

      <Section title="Activity" className="mt-6">
        {feed.data === null ? (
          <Skeleton className="h-32 w-full" />
        ) : feed.data.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">
              Nothing yet — import a CSV to get started.
            </p>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y">
              {feed.data.map((item, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{item.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(item.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
    </div>
  );
}
