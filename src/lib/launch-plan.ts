import type { Campaign, Lead, QueueItem, SmtpAccount, Template } from "./db";

export const BATCH_SIZE = 50;
export const DELAY_SECONDS = 5;

export type Breakdown = { label: string; count: number }[];

export function breakdownBy(leads: Lead[], key: "country" | "source"): Breakdown {
  const map = new Map<string, number>();
  for (const lead of leads) {
    const label = lead[key].trim() || "Unknown";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export type EmailStats = {
  missing: number; // leads without an email
  duplicateExtras: number; // extra occurrences of the same email
  sendable: number; // unique, non-empty emails
};

export function campaignEmailStats(leads: Lead[]): EmailStats {
  let missing = 0;
  let duplicateExtras = 0;
  const seen = new Set<string>();
  for (const lead of leads) {
    const email = lead.email.trim().toLowerCase();
    if (!email) missing += 1;
    else if (seen.has(email)) duplicateExtras += 1;
    else seen.add(email);
  }
  return { missing, duplicateExtras, sendable: seen.size };
}

export type SendingEstimate = {
  totalEmails: number;
  batches: number;
  seconds: number; // active sending time at DELAY_SECONDS per email
  days: number; // spread across days by the daily limit
};

// Simple estimation only: BATCH_SIZE emails per batch, DELAY_SECONDS between
// emails, capped per day by the account's daily limit (0 = no limit).
export function estimateSending(
  totalEmails: number,
  dailyLimit: number,
  batchSize: number = BATCH_SIZE,
  delaySeconds: number = DELAY_SECONDS
): SendingEstimate {
  return {
    totalEmails,
    batches: Math.ceil(totalEmails / batchSize),
    seconds: totalEmails * delaySeconds,
    days: dailyLimit > 0 ? Math.max(1, Math.ceil(totalEmails / dailyLimit)) : 1,
  };
}

export function formatEstimate(estimate: SendingEstimate): string {
  if (estimate.totalEmails === 0) return "—";
  if (estimate.days > 1) return `~${estimate.days} days (daily limit)`;
  if (estimate.seconds < 60) return `~${estimate.seconds}s`;
  if (estimate.seconds < 3600) return `~${Math.ceil(estimate.seconds / 60)} min`;
  return `~${(estimate.seconds / 3600).toFixed(1)} h`;
}

export function computeWarnings(input: {
  leads: Lead[];
  template: Template | null;
  smtp: SmtpAccount | null;
  stats: EmailStats;
}): string[] {
  const warnings: string[] = [];
  if (!input.smtp) warnings.push("No default SMTP account — set one on the SMTP page.");
  if (input.leads.length === 0) warnings.push("This campaign has no leads.");
  if (!input.template) warnings.push("The selected template no longer exists.");
  if (input.stats.missing > 0)
    warnings.push(`${input.stats.missing} leads have no email address and will be skipped.`);
  if (input.stats.duplicateExtras > 0)
    warnings.push(
      `${input.stats.duplicateExtras} duplicate emails inside this campaign — only the first occurrence will be queued.`
    );
  return warnings;
}

// Builds pending queue items: one per unique, non-empty email. Sends nothing.
export function buildQueueItems(
  campaign: Campaign,
  leads: Lead[],
  template: Template,
  smtp: SmtpAccount
): QueueItem[] {
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const items: QueueItem[] = [];
  for (const lead of leads) {
    const email = lead.email.trim();
    const norm = email.toLowerCase();
    if (!email || seen.has(norm)) continue;
    seen.add(norm);
    items.push({
      id: crypto.randomUUID(),
      campaignId: campaign.id,
      leadId: lead.id,
      templateId: template.id,
      smtpAccountId: smtp.id,
      email,
      status: "pending",
      attempts: 0,
      error: "",
      sentAt: null,
      createdAt: now,
    });
  }
  return items;
}
