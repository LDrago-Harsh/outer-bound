import {
  campaignsRepo,
  conversationsRepo,
  emailLogsRepo,
  leadsRepo,
  queueRepo,
  smtpRepo,
  templatesRepo,
  type Campaign,
  type Conversation,
  type EmailLog,
  type Lead,
  type QueueItem,
  type SmtpAccount,
  type Template,
} from "./db";
import { loadSettings } from "./settings";
import { readRecentImports, type RecentImport } from "./preview-store";

export type { RecentImport };
import { nameOf } from "./use-leads-filter";
import { getQueueController } from "./queue-controller";

// Single service behind the dashboard. Each widget method is independent,
// but every store is fetched at most once per service instance — the UI
// performs no business calculations.

export type TodayActivity = {
  sent: number;
  replies: number;
  failed: number;
  queued: number;
  pending: number;
};

export type Overview = {
  leads: number;
  templates: number;
  campaigns: number;
  smtpAccounts: number;
  conversations: number;
};

export type RecentCampaign = {
  id: string;
  name: string;
  leadCount: number;
  status: "Draft" | "Queued" | "Sending" | "Sent";
  updatedAt: string;
};

export type RecentReply = { leadName: string; campaignName: string; at: string };

export type QueueStatusSummary = {
  pending: number;
  sending: number;
  failed: number;
  completed: number;
};

export type SmtpStatus = {
  name: string;
  dailyLimit: number;
  sentToday: number;
} | null;

export type FeedItem = { at: string; text: string };

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function createDashboardService() {
  const cache = new Map<string, Promise<unknown>>();
  const cached = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key) as Promise<T>;
  };

  const leads = () => cached<Lead[]>("leads", () => leadsRepo.getAll());
  const templates = () => cached<Template[]>("templates", () => templatesRepo.getAll());
  const campaigns = () => cached<Campaign[]>("campaigns", () => campaignsRepo.getAll());
  const smtp = () => cached<SmtpAccount[]>("smtp", () => smtpRepo.getAll());
  const queue = () => cached<QueueItem[]>("queue", () => queueRepo.getAll());
  const conversations = () =>
    cached<Conversation[]>("conversations", () => conversationsRepo.getAll());
  const emailLogs = () => cached<EmailLog[]>("emailLogs", () => emailLogsRepo.getAll());

  const incomingMessages = async () => {
    const all = await conversations();
    return all.flatMap((c) =>
      c.messages
        .filter((m) => m.type === "incoming")
        .map((m) => ({ conversation: c, message: m }))
    );
  };

  return {
    async todayActivity(): Promise<TodayActivity> {
      const today = startOfToday();
      const [logs, replies, items] = await Promise.all([
        emailLogs(),
        incomingMessages(),
        queue(),
      ]);
      return {
        sent: logs.filter((l) => l.status === "sent" && l.sentAt >= today).length,
        failed: logs.filter((l) => l.status === "failed" && l.sentAt >= today).length,
        replies: replies.filter((r) => r.message.at >= today).length,
        queued: items.length,
        pending: items.filter((i) => i.status === "pending").length,
      };
    },

    async overview(): Promise<Overview> {
      const [l, t, c, s, conv] = await Promise.all([
        leads(),
        templates(),
        campaigns(),
        smtp(),
        conversations(),
      ]);
      return {
        leads: l.length,
        templates: t.length,
        campaigns: c.length,
        smtpAccounts: s.length,
        conversations: conv.length,
      };
    },

    async recentImports(): Promise<RecentImport[]> {
      return readRecentImports().slice(0, 5);
    },

    async recentCampaigns(): Promise<RecentCampaign[]> {
      const [all, items, logs] = await Promise.all([campaigns(), queue(), emailLogs()]);
      const loggedCampaigns = new Set(logs.map((l) => l.campaignId));
      return [...all]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5)
        .map((c) => {
          const own = items.filter((i) => i.campaignId === c.id);
          const status: RecentCampaign["status"] = own.some(
            (i) => i.status === "sending"
          )
            ? "Sending"
            : own.some((i) => i.status === "pending")
              ? "Queued"
              : loggedCampaigns.has(c.id)
                ? "Sent"
                : "Draft";
          return {
            id: c.id,
            name: c.name,
            leadCount: c.leadCount,
            status,
            updatedAt: c.updatedAt,
          };
        });
    },

    async recentReplies(): Promise<RecentReply[]> {
      const [replies, allLeads, allCampaigns] = await Promise.all([
        incomingMessages(),
        leads(),
        campaigns(),
      ]);
      const leadMap = new Map(allLeads.map((l) => [l.id, l]));
      const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
      return replies
        .sort((a, b) => b.message.at.localeCompare(a.message.at))
        .slice(0, 5)
        .map(({ conversation, message }) => {
          const lead = leadMap.get(conversation.leadId);
          return {
            leadName: lead ? nameOf(lead) || lead.email : "Unknown lead",
            campaignName: campaignMap.get(conversation.campaignId)?.name ?? "—",
            at: message.at,
          };
        });
    },

    async queueStatus(): Promise<QueueStatusSummary> {
      const items = await queue();
      return {
        pending: items.filter((i) => i.status === "pending").length,
        sending: items.filter((i) => i.status === "sending").length,
        failed: items.filter((i) => i.status === "failed").length,
        completed: items.filter((i) => i.status === "sent").length,
      };
    },

    async smtpStatus(): Promise<SmtpStatus> {
      const [accounts, settings, logs] = await Promise.all([
        smtp(),
        loadSettings(),
        emailLogs(),
      ]);
      const account =
        accounts.find((a) => a.id === settings.defaultSmtpId) ??
        accounts.find((a) => a.isDefault) ??
        null;
      if (!account) return null;
      const today = startOfToday();
      return {
        name: account.name || account.senderEmail,
        dailyLimit: account.dailyLimit,
        sentToday: logs.filter(
          (l) => l.smtpId === account.id && l.status === "sent" && l.sentAt >= today
        ).length,
      };
    },

    async warnings(): Promise<string[]> {
      const [s, t, c, items] = await Promise.all([
        smtp(),
        templates(),
        campaigns(),
        queue(),
      ]);
      const list: string[] = [];
      if (s.length === 0) list.push("No SMTP accounts — add one before sending.");
      if (t.length === 0) list.push("No templates yet.");
      if (c.length === 0) list.push("No campaigns yet.");
      const pending = items.filter((i) => i.status === "pending").length;
      if (getQueueController().getProgress().state === "stopped" && pending > 0) {
        list.push(`Queue is stopped with ${pending} pending emails.`);
      }
      return list;
    },

    async activityFeed(): Promise<FeedItem[]> {
      const [allCampaigns, logs, replies] = await Promise.all([
        campaigns(),
        emailLogs(),
        incomingMessages(),
      ]);
      const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
      const items: FeedItem[] = [];

      for (const imp of readRecentImports()) {
        items.push({ at: imp.date, text: `Imported CSV "${imp.filename}"` });
      }
      for (const c of allCampaigns) {
        items.push({ at: c.createdAt, text: `Created campaign "${c.name}"` });
      }
      // Group sent emails per campaign per day to keep the feed readable.
      const sentGroups = new Map<string, { at: string; count: number; campaignId: string }>();
      for (const log of logs.filter((l) => l.status === "sent")) {
        const key = `${log.campaignId}:${log.sentAt.slice(0, 10)}`;
        const entry = sentGroups.get(key);
        if (entry) {
          entry.count += 1;
          if (log.sentAt > entry.at) entry.at = log.sentAt;
        } else {
          sentGroups.set(key, { at: log.sentAt, count: 1, campaignId: log.campaignId });
        }
      }
      for (const group of sentGroups.values()) {
        const name = campaignMap.get(group.campaignId)?.name ?? "campaign";
        items.push({
          at: group.at,
          text: `Sent ${group.count} email${group.count === 1 ? "" : "s"} · ${name}`,
        });
      }
      for (const { conversation, message } of replies) {
        const name = campaignMap.get(conversation.campaignId)?.name ?? "campaign";
        items.push({ at: message.at, text: `Reply received · ${name}` });
      }

      return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
