"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Pencil } from "lucide-react";

import {
  campaignsRepo,
  leadsRepo,
  templatesRepo,
  smtpRepo,
  queueRepo,
  type AppSettings,
  type Campaign,
  type Lead,
  type SmtpAccount,
  type Template,
} from "@/lib/db";
import {
  breakdownBy,
  buildQueueItems,
  campaignEmailStats,
  computeWarnings,
  estimateSending,
  formatEstimate,
  type Breakdown,
} from "@/lib/launch-plan";
import { loadSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      campaign: Campaign | null;
      leads: Lead[];
      template: Template | null;
      smtp: SmtpAccount | null;
      settings: AppSettings;
    };

function BreakdownCard({ title, rows }: { title: string; rows: Breakdown }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(0, 8).map((row) => (
              <li key={row.label} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{row.label}</span>
                <span className="text-muted-foreground">{row.count.toLocaleString()}</span>
              </li>
            ))}
            {rows.length > 8 && (
              <li className="text-xs text-muted-foreground">+{rows.length - 8} more</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function CampaignReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [generating, setGenerating] = React.useState(false);
  const [generateError, setGenerateError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [campaigns, allLeads, templates, accounts, settings] = await Promise.all([
        campaignsRepo.getAll(),
        leadsRepo.getAll(),
        templatesRepo.getAll(),
        smtpRepo.getAll(),
        loadSettings(),
      ]);
      const campaign = campaigns.find((c) => c.id === params.id) ?? null;
      const idSet = new Set(campaign?.leadIds ?? []);
      setState({
        status: "ready",
        campaign,
        leads: allLeads.filter((l) => idSet.has(l.id)),
        template: templates.find((t) => t.id === campaign?.templateId) ?? null,
        smtp: accounts.find((a) => a.isDefault) ?? null,
        settings,
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not read the local database.",
      });
    }
  }, [params.id]);

  React.useEffect(() => {
    load();
  }, [load]);

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
          title="Could not load the campaign"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const { campaign, leads, template, smtp, settings } = state;

  if (!campaign) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="Campaign not found"
          description="It may have been deleted."
          action={
            <Link href="/campaigns" className={buttonVariants()}>
              Back to Campaigns
            </Link>
          }
        />
      </div>
    );
  }

  const stats = campaignEmailStats(leads);
  const estimate = estimateSending(
    stats.sendable,
    smtp?.dailyLimit ?? 0,
    settings.batchSize,
    settings.defaultDelaySeconds
  );
  const warnings = computeWarnings({ leads, template, smtp, stats });
  const canGenerate = Boolean(template && smtp && stats.sendable > 0) && !generating;

  const onGenerate = async () => {
    if (!template || !smtp || generating) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const items = buildQueueItems(campaign, leads, template, smtp);
      const existing = (await queueRepo.getAll()).filter(
        (item) => item.campaignId === campaign.id
      );
      await queueRepo.removeMany(existing.map((item) => item.id));
      await queueRepo.putMany(items);
      router.push("/queue");
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Failed to generate the queue."
      );
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={campaign.name}
        description={campaign.description || "Campaign review"}
        actions={
          <>
            <Link
              href="/campaigns"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Link>
            <Link
              href={`/campaigns?id=${campaign.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Pencil aria-hidden="true" />
              Edit Campaign
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Created" value={new Date(campaign.createdAt).toLocaleString()} />
        <StatCard label="Updated" value={new Date(campaign.updatedAt).toLocaleString()} />
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

      <Section title="Leads" className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Selected leads" value={leads.length.toLocaleString()} />
          <StatCard label="Missing emails" value={stats.missing.toLocaleString()} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <BreakdownCard title="By country" rows={breakdownBy(leads, "country")} />
          <BreakdownCard title="By source" rows={breakdownBy(leads, "source")} />
        </div>
      </Section>

      <Section title="Template" className="mt-6">
        {template ? (
          <Card className="p-4">
            <p className="text-sm font-medium">{template.subject}</p>
            <hr className="my-3" />
            <pre className="whitespace-pre-wrap break-words font-mono text-sm text-muted-foreground">
              {template.body}
            </pre>
          </Card>
        ) : (
          <Card className="border-amber-500/40 p-4">
            <p className="text-sm text-muted-foreground">
              The selected template no longer exists.
            </p>
          </Card>
        )}
      </Section>

      <Section title="SMTP" className="mt-6">
        {smtp ? (
          <Card className="p-4">
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {(
                [
                  ["Account", smtp.name || smtp.senderEmail],
                  ["Sender name", smtp.senderName],
                  ["Sender email", smtp.senderEmail],
                  ["Host", smtp.host],
                  [
                    "Encryption",
                    smtp.encryption === "ssl"
                      ? "SSL/TLS"
                      : smtp.encryption === "starttls"
                        ? "STARTTLS"
                        : "None",
                  ],
                  ["Daily limit", smtp.dailyLimit ? String(smtp.dailyLimit) : "No limit"],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="truncate" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : (
          <Card className="border-amber-500/40 p-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              No default SMTP account. Mark one as default on the SMTP page.
            </p>
          </Card>
        )}
      </Section>

      <Section
        title="Estimated sending"
        description={`Batch size ${settings.batchSize}, ${settings.defaultDelaySeconds}s delay between emails. Simple estimation only.`}
        className="mt-6"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total emails" value={estimate.totalEmails.toLocaleString()} />
          <StatCard label="Estimated batches" value={String(estimate.batches)} />
          <StatCard label="Estimated time" value={formatEstimate(estimate)} />
        </div>
      </Section>

      {generateError && <p className="mt-4 text-sm text-destructive">{generateError}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Link href="/campaigns" className={buttonVariants({ variant: "outline" })}>
          Back
        </Link>
        <Link
          href={`/campaigns?id=${campaign.id}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Edit Campaign
        </Link>
        <Button disabled={!canGenerate} onClick={onGenerate}>
          {generating ? "Generating…" : "Generate Queue"}
        </Button>
      </div>
    </div>
  );
}
