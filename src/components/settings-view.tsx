"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { AlertTriangle, Download, Upload } from "lucide-react";

import { smtpRepo, type AppSettings, type SmtpAccount } from "@/lib/db";
import { loadSettings, saveSettings, notifySettingsChanged, DATE_FORMATS } from "@/lib/settings";
import {
  backupCounts,
  clearAllData,
  downloadJson,
  exportDatabase,
  importBackup,
  parseBackup,
  type BackupData,
} from "@/lib/backup";
import { cn, INPUT_CLASS } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast, useToast } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

type SettingsForm = Omit<AppSettings, "batchSize" | "defaultDelaySeconds"> & {
  batchSize: string;
  defaultDelaySeconds: string;
};

function toForm(settings: AppSettings): SettingsForm {
  return {
    ...settings,
    batchSize: String(settings.batchSize),
    defaultDelaySeconds: String(settings.defaultDelaySeconds),
  };
}

function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export function SettingsView() {
  const { setTheme } = useTheme();
  const [form, setForm] = React.useState<SettingsForm | null>(null);
  const [saved, setSaved] = React.useState<AppSettings | null>(null);
  const [accounts, setAccounts] = React.useState<SmtpAccount[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const toast = useToast();
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [pendingBackup, setPendingBackup] = React.useState<BackupData | null>(null);
  const [backupError, setBackupError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const timezones = React.useMemo(getTimezones, []);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const [settings, smtp] = await Promise.all([loadSettings(), smtpRepo.getAll()]);
      setSaved(settings);
      setForm(toForm(settings));
      setAccounts(smtp);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not read the local database."
      );
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load settings"
          description={loadError}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  if (!form || !saved) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const batchSize = Number(form.batchSize);
  const delaySeconds = Number(form.defaultDelaySeconds);
  const errors = {
    appName: !form.appName.trim() ? "Required" : null,
    batchSize:
      !form.batchSize.trim() || !Number.isInteger(batchSize) || batchSize < 1
        ? "Whole number, at least 1"
        : null,
    defaultDelaySeconds:
      !form.defaultDelaySeconds.trim() ||
      !Number.isInteger(delaySeconds) ||
      delaySeconds < 0
        ? "Whole number, 0 or more"
        : null,
  };
  const valid = !errors.appName && !errors.batchSize && !errors.defaultDelaySeconds;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved));

  const onSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const next: AppSettings = {
        ...saved,
        ...form,
        appName: form.appName.trim(),
        defaultSource: form.defaultSource.trim(),
        batchSize,
        defaultDelaySeconds: delaySeconds,
      };
      await saveSettings(next);
      setSaved(next);
      setForm(toForm(next));
      setTheme(next.theme);
      toast.show("Settings saved");
    } finally {
      setSaving(false);
    }
  };

  const onExport = async () => {
    const data = await exportDatabase();
    downloadJson(data, `outerbound-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const onPickBackup = async (file: File) => {
    setBackupError(null);
    try {
      setPendingBackup(parseBackup(await file.text()));
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Invalid backup file");
    }
  };

  const onImportConfirm = async () => {
    if (!pendingBackup) return;
    await importBackup(pendingBackup);
    setPendingBackup(null);
    await load();
    const restored = await loadSettings();
    setTheme(restored.theme);
    notifySettingsChanged();
    toast.show("Backup imported");
  };

  const onClearAll = async () => {
    await clearAllData();
    await load();
    const reset = await loadSettings();
    setTheme(reset.theme);
    notifySettingsChanged();
    toast.show("All data cleared");
  };

  const field = (
    key: "appName" | "defaultSource" | "batchSize" | "defaultDelaySeconds",
    label: string
  ) => (
    <div>
      <label htmlFor={`set-${key}`} className="mb-1 block text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={`set-${key}`}
        type="text"
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        className={cn(
          INPUT_CLASS,
          "h-9",
          key in errors && errors[key as keyof typeof errors] && "border-destructive"
        )}
      />
      {key in errors && errors[key as keyof typeof errors] && (
        <p className="mt-1 text-xs text-destructive">
          {errors[key as keyof typeof errors]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Global preferences. Everything is stored locally."
        actions={
          <Button size="sm" disabled={!valid || !dirty || saving} onClick={onSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {field("appName", "Application Name")}
            <div>
              <label htmlFor="set-timezone" className="mb-1 block text-xs text-muted-foreground">
                Timezone
              </label>
              <select
                id="set-timezone"
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className={cn(INPUT_CLASS, "h-9")}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="set-dateformat" className="mb-1 block text-xs text-muted-foreground">
                Date Format
              </label>
              <select
                id="set-dateformat"
                value={form.dateFormat}
                onChange={(e) => set("dateFormat", e.target.value)}
                className={cn(INPUT_CLASS, "h-9")}
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sending</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="set-smtp" className="mb-1 block text-xs text-muted-foreground">
                Default SMTP
              </label>
              <select
                id="set-smtp"
                value={form.defaultSmtpId}
                onChange={(e) => set("defaultSmtpId", e.target.value)}
                className={cn(INPUT_CLASS, "h-9")}
              >
                <option value="">Account marked Default</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.senderEmail}
                  </option>
                ))}
              </select>
            </div>
            {field("batchSize", "Batch Size")}
            {field("defaultDelaySeconds", "Default Delay (seconds)")}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.stopOnFirstError}
                onChange={(e) => set("stopOnFirstError", e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              Stop on first error
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {field("defaultSource", "Default Source")}
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.rememberMapping}
                  onChange={(e) => set("rememberMapping", e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                Remember column mapping
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.skipDuplicateDetection}
                  onChange={(e) => set("skipDuplicateDetection", e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                Skip duplicate detection
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="set-theme" className="mb-1 block text-xs text-muted-foreground">
                Theme
              </label>
              <select
                id="set-theme"
                value={form.theme}
                onChange={(e) => set("theme", e.target.value as AppSettings["theme"])}
                className={cn(INPUT_CLASS, "h-9")}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-density" className="mb-1 block text-xs text-muted-foreground">
                Density
              </label>
              <select
                id="set-density"
                value={form.density}
                onChange={(e) => set("density", e.target.value as AppSettings["density"])}
                className={cn(INPUT_CLASS, "h-9")}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download aria-hidden="true" />
                Export Entire Database
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" />
                Import Backup
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmClear(true)}
              >
                Clear All Data
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPickBackup(file);
                  e.target.value = "";
                }}
              />
            </div>
            {backupError && <p className="text-sm text-destructive">{backupError}</p>}
            <p className="text-xs text-muted-foreground">
              Backups are plain JSON files, including SMTP credentials. Keep them safe.
            </p>
          </CardContent>
        </Card>
      </div>

      <Toast message={toast.message} />

      {pendingBackup && (
        <AlertDialog open onOpenChange={(open) => !open && setPendingBackup(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import this backup?</AlertDialogTitle>
              <AlertDialogDescription>
                Exported {new Date(pendingBackup.exportedAt).toLocaleString()}. This
                replaces ALL existing data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="grid grid-cols-2 gap-1 text-sm">
              {backupCounts(pendingBackup).map(({ store, count }) => (
                <li key={store} className="flex justify-between gap-2">
                  <span className="capitalize text-muted-foreground">{store}</span>
                  <span>{count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setPendingBackup(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={onImportConfirm}>
                Replace Data
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all data?"
        description="Leads, templates, campaigns, SMTP accounts, queue, inbox, and settings will be permanently deleted."
        confirmLabel="Delete Everything"
        destructive
        onConfirm={onClearAll}
      />
    </div>
  );
}
