import {
  campaignsRepo,
  conversationsRepo,
  emailLogsRepo,
  leadsRepo,
  queueRepo,
  settingsRepo,
  smtpRepo,
  templatesRepo,
  type AppSettings,
  type Campaign,
  type Conversation,
  type EmailLog,
  type Lead,
  type QueueItem,
  type SmtpAccount,
  type Template,
} from "./db";

// All backup logic in one place: export, parse/validate, import, clear.

export type BackupData = {
  app: "outerbound";
  version: number;
  exportedAt: string;
  leads: Lead[];
  templates: Template[];
  campaigns: Campaign[];
  smtp: SmtpAccount[];
  queue: QueueItem[];
  conversations: Conversation[];
  settings: AppSettings[];
  emailLogs: EmailLog[];
};

export const BACKUP_STORES = [
  "leads",
  "templates",
  "campaigns",
  "smtp",
  "queue",
  "conversations",
  "settings",
  "emailLogs",
] as const;

export type BackupStore = (typeof BACKUP_STORES)[number];

export async function exportDatabase(): Promise<BackupData> {
  const [leads, templates, campaigns, smtp, queue, conversations, settings, emailLogs] =
    await Promise.all([
      leadsRepo.getAll(),
      templatesRepo.getAll(),
      campaignsRepo.getAll(),
      smtpRepo.getAll(),
      queueRepo.getAll(),
      conversationsRepo.getAll(),
      settingsRepo.getAll(),
      emailLogsRepo.getAll(),
    ]);
  return {
    app: "outerbound",
    version: 1,
    exportedAt: new Date().toISOString(),
    leads,
    templates,
    campaigns,
    smtp,
    queue,
    conversations,
    settings,
    emailLogs,
  };
}

export function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, "application/json");
}

export function parseBackup(text: string): BackupData {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const backup = data as Partial<BackupData>;
  if (backup?.app !== "outerbound") {
    throw new Error("This file is not an Outerbound backup.");
  }
  // Backups from before email logs existed simply have none.
  const normalized = {
    ...backup,
    emailLogs: Array.isArray(backup.emailLogs) ? backup.emailLogs : [],
  };
  for (const store of BACKUP_STORES) {
    if (!Array.isArray(normalized[store])) {
      throw new Error(`The backup is missing the "${store}" section.`);
    }
  }
  return normalized as BackupData;
}

export function backupCounts(data: BackupData): { store: BackupStore; count: number }[] {
  return BACKUP_STORES.map((store) => ({ store, count: data[store].length }));
}

export async function clearAllData(): Promise<void> {
  const repos = [
    leadsRepo,
    templatesRepo,
    campaignsRepo,
    smtpRepo,
    queueRepo,
    conversationsRepo,
    settingsRepo,
    emailLogsRepo,
  ];
  for (const repo of repos) {
    const all = await repo.getAll();
    await repo.removeMany(all.map((item: { id: string }) => item.id));
  }
}

// Replaces ALL existing data with the backup's contents.
export async function importBackup(data: BackupData): Promise<void> {
  await clearAllData();
  await Promise.all([
    leadsRepo.putMany(data.leads),
    templatesRepo.putMany(data.templates),
    campaignsRepo.putMany(data.campaigns),
    smtpRepo.putMany(data.smtp),
    queueRepo.putMany(data.queue),
    conversationsRepo.putMany(data.conversations),
    settingsRepo.putMany(data.settings),
    emailLogsRepo.putMany(data.emailLogs),
  ]);
}
