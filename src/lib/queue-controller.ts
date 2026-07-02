import {
  emailLogsRepo,
  leadsRepo,
  queueRepo,
  smtpRepo,
  templatesRepo,
  type Lead,
  type QueueItem,
  type SmtpAccount,
  type Template,
} from "./db";
import { DELAY_SECONDS } from "./launch-plan";
import { sendEmail } from "./email-service";
import { renderTemplate } from "./render-template";
import { recordOutgoingMessage } from "./conversations";
import { loadSettings } from "./settings";

export type QueueRunState =
  | "idle"
  | "running"
  | "pausing"
  | "paused"
  | "stopping"
  | "stopped";

export type QueueProgress = {
  state: QueueRunState;
  currentEmail: string | null;
  sentThisRun: number;
  failedThisRun: number;
  elapsedMs: number;
};

type Listener = () => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Owns all queue processing: loads pending items, updates statuses through the
// repository, calls /api/send one email at a time, records attempts/errors,
// and handles pause/resume/stop. The UI only subscribes and issues commands.
class QueueController {
  private state: QueueRunState = "idle";
  private currentEmail: string | null = null;
  private sentThisRun = 0;
  private failedThisRun = 0;
  private pauseRequested = false;
  private stopRequested = false;
  private loopActive = false;
  private elapsedAccum = 0;
  private runStart: number | null = null;
  private delaySeconds = DELAY_SECONDS;
  private stopOnFirstError = false;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getProgress(): QueueProgress {
    return {
      state: this.state,
      currentEmail: this.currentEmail,
      sentThisRun: this.sentThisRun,
      failedThisRun: this.failedThisRun,
      elapsedMs: this.elapsedAccum + (this.runStart ? Date.now() - this.runStart : 0),
    };
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  // Processes pending items sequentially — one email at a time, never parallel.
  async start(): Promise<void> {
    if (this.loopActive) return;
    this.loopActive = true;
    this.pauseRequested = false;
    this.stopRequested = false;
    if (this.state === "idle" || this.state === "stopped") {
      this.sentThisRun = 0;
      this.failedThisRun = 0;
      this.elapsedAccum = 0;
    }
    this.state = "running";
    this.runStart = Date.now();
    this.notify();

    try {
      const [templates, accounts, leads] = await Promise.all([
        templatesRepo.getAll(),
        smtpRepo.getAll(),
        leadsRepo.getAll(),
      ]);
      const templateMap = new Map(templates.map((t) => [t.id, t]));
      const smtpMap = new Map(accounts.map((a) => [a.id, a]));
      const leadMap = new Map(leads.map((l) => [l.id, l]));

      // Sending preferences from Settings.
      const settings = await loadSettings();
      this.delaySeconds = settings.defaultDelaySeconds;
      this.stopOnFirstError = settings.stopOnFirstError;

      while (!this.pauseRequested && !this.stopRequested) {
        const pending = (await queueRepo.getAll())
          .filter((item) => item.status === "pending")
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const item = pending[0];
        if (!item) break;
        const failedBefore = this.failedThisRun;
        await this.sendOne(item, templateMap, smtpMap, leadMap);
        if (this.stopOnFirstError && this.failedThisRun > failedBefore) {
          this.stopRequested = true;
          break;
        }
        if (pending.length > 1) await this.delayBetweenEmails();
      }
    } finally {
      this.elapsedAccum += this.runStart ? Date.now() - this.runStart : 0;
      this.runStart = null;
      this.currentEmail = null;
      this.state = this.stopRequested ? "stopped" : this.pauseRequested ? "paused" : "idle";
      this.loopActive = false;
      this.notify();
    }
  }

  // Pause stops after the current email finishes; resume continues from there.
  pause(): void {
    if (this.loopActive) {
      this.pauseRequested = true;
      this.state = "pausing";
      this.notify();
    }
  }

  resume(): void {
    if (!this.loopActive) void this.start();
  }

  // Stop halts as soon as possible; remaining pending items stay pending.
  stop(): void {
    if (this.loopActive) {
      this.stopRequested = true;
      this.state = "stopping";
      this.notify();
    } else if (this.state === "paused") {
      this.state = "stopped";
      this.notify();
    }
  }

  async retryFailed(): Promise<void> {
    const failed = (await queueRepo.getAll()).filter((item) => item.status === "failed");
    await queueRepo.putMany(
      failed.map((item) => ({ ...item, status: "pending" as const, error: "" }))
    );
    this.notify();
  }

  async clearCompleted(): Promise<void> {
    const sent = (await queueRepo.getAll()).filter((item) => item.status === "sent");
    await queueRepo.removeMany(sent.map((item) => item.id));
    this.notify();
  }

  // Permanent, immutable history: one EmailLog per attempt outcome.
  private async writeLog(
    item: QueueItem,
    log: {
      status: "sent" | "failed";
      subject: string;
      duration: number;
      attempts: number;
      error: string;
    }
  ): Promise<void> {
    try {
      await emailLogsRepo.put({
        id: crypto.randomUUID(),
        queueItemId: item.id,
        campaignId: item.campaignId,
        leadId: item.leadId,
        templateId: item.templateId,
        smtpId: item.smtpAccountId,
        recipient: item.email,
        subject: log.subject,
        status: log.status,
        sentAt: new Date().toISOString(),
        duration: log.duration,
        attempts: log.attempts,
        error: log.error,
      });
    } catch {
      // History is best-effort; never block the queue on it.
    }
  }

  private async delayBetweenEmails(): Promise<void> {
    // Sleep in short slices so pause/stop react quickly.
    const total = this.delaySeconds * 1000;
    for (let waited = 0; waited < total; waited += 250) {
      if (this.pauseRequested || this.stopRequested) return;
      await sleep(250);
    }
  }

  private async sendOne(
    item: QueueItem,
    templateMap: Map<string, Template>,
    smtpMap: Map<string, SmtpAccount>,
    leadMap: Map<string, Lead>
  ): Promise<void> {
    this.currentEmail = item.email;
    this.notify();

    const attempts = (item.attempts ?? 0) + 1;
    const template = templateMap.get(item.templateId);
    const smtp = smtpMap.get(item.smtpAccountId);
    const lead = leadMap.get(item.leadId);

    if (!template || !smtp || !lead) {
      const error = !template
        ? "Template no longer exists"
        : !smtp
          ? "SMTP account no longer exists"
          : "Lead no longer exists";
      this.failedThisRun += 1;
      await queueRepo.put({ ...item, status: "failed", attempts, error });
      await this.writeLog(item, {
        status: "failed",
        subject: template?.subject ?? "",
        duration: 0,
        attempts,
        error,
      });
      this.notify();
      return;
    }

    await queueRepo.put({ ...item, status: "sending", error: "" });
    this.notify();

    // Variables are rendered immediately before sending.
    const subject = renderTemplate(template.subject, lead);
    const startedAt = Date.now();
    try {
      const body = renderTemplate(template.body, lead);
      const result = await sendEmail({ smtp, to: item.email, subject, body });
      const duration = Date.now() - startedAt;

      if (result.ok) {
        this.sentThisRun += 1;
        await queueRepo.put({
          ...item,
          status: "sent",
          attempts,
          error: "",
          sentAt: new Date().toISOString(),
        });
        await this.writeLog(item, { status: "sent", subject, duration, attempts, error: "" });
        try {
          // Inbox is best-effort: never fail a sent item over it.
          await recordOutgoingMessage({
            leadId: item.leadId,
            campaignId: item.campaignId,
            subject,
            body,
          });
        } catch {
          // ignore
        }
      } else {
        const error = result.error || "Send failed";
        this.failedThisRun += 1;
        await queueRepo.put({ ...item, status: "failed", attempts, error });
        await this.writeLog(item, { status: "failed", subject, duration, attempts, error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      this.failedThisRun += 1;
      await queueRepo.put({ ...item, status: "failed", attempts, error: message });
      await this.writeLog(item, {
        status: "failed",
        subject,
        duration: Date.now() - startedAt,
        attempts,
        error: message,
      });
    }
    this.notify();
  }
}

// Module-level singleton: sending survives in-app navigation.
let instance: QueueController | null = null;

export function getQueueController(): QueueController {
  if (!instance) instance = new QueueController();
  return instance;
}
