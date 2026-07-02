"use client";

import * as React from "react";
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Search,
  Server,
  Trash2,
} from "lucide-react";

import { smtpRepo, type SmtpAccount, type SmtpEncryption } from "@/lib/db";
import { useSmtpEditor, type SmtpForm } from "@/lib/use-smtp-editor";
import { cn, INPUT_CLASS } from "@/lib/utils";
import { formatDate } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast, useToast } from "@/components/ui/toast";

const ENCRYPTION_OPTIONS: { value: SmtpEncryption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "ssl", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
];

type TextField = {
  key: Exclude<keyof SmtpForm, "encryption" | "isDefault">;
  label: string;
  type?: string;
};

const TEXT_FIELDS: TextField[] = [
  { key: "name", label: "Name" },
  { key: "host", label: "SMTP Host" },
  { key: "port", label: "Port" },
  { key: "username", label: "Username" },
  { key: "senderName", label: "Sender Name" },
  { key: "senderEmail", label: "Sender Email" },
  { key: "replyTo", label: "Reply-To" },
  { key: "dailyLimit", label: "Daily Limit" },
];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; accounts: SmtpAccount[] };

export function SmtpView() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = React.useState<string | "new" | null>(null);
  const [q, setQ] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const toast = useToast();

  const accounts = React.useMemo(
    () =>
      state.status === "ready"
        ? [...state.accounts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [state]
  );

  const listed = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return query
      ? accounts.filter(
          (a) =>
            a.name.toLowerCase().includes(query) ||
            a.senderEmail.toLowerCase().includes(query) ||
            a.host.toLowerCase().includes(query)
        )
      : accounts;
  }, [accounts, q]);

  const current =
    selected && selected !== "new" ? accounts.find((a) => a.id === selected) ?? null : null;

  const editor = useSmtpEditor(current, (saved, others) => {
    setState({ status: "ready", accounts: [saved, ...others] });
    setSelected(saved.id);
    toast.show("Account saved");
  });
  const editorRef = React.useRef(editor);
  editorRef.current = editor;

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const all = await smtpRepo.getAll();
      setState({ status: "ready", accounts: all });
      const newest = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      setSelected(newest?.id ?? null);
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

  // Hide the password again whenever the selection changes.
  React.useEffect(() => {
    setShowPassword(false);
  }, [selected]);

  // Ctrl/Cmd+S saves, Escape cancels editing.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        editorRef.current.save();
      }
      if (e.key === "Escape" && editorRef.current.dirty) setConfirmDiscard(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onNew = () => setSelected("new");

  const onDuplicate = async () => {
    if (!current) return;
    const now = new Date().toISOString();
    const copy: SmtpAccount = {
      ...current,
      id: crypto.randomUUID(),
      name: `${current.name || current.senderEmail} (copy)`,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    await smtpRepo.put(copy);
    setState((prev) =>
      prev.status === "ready" ? { status: "ready", accounts: [...prev.accounts, copy] } : prev
    );
    setSelected(copy.id);
  };

  const onDelete = async () => {
    if (!current) return;
    await smtpRepo.remove(current.id);
    const remaining = accounts.filter((a) => a.id !== current.id);
    setState((prev) =>
      prev.status === "ready"
        ? { status: "ready", accounts: prev.accounts.filter((a) => a.id !== current.id) }
        : prev
    );
    setSelected(remaining[0]?.id ?? null);
  };

  const onDiscard = () => {
    editor.reset();
    if (selected === "new") setSelected(accounts[0]?.id ?? null);
  };

  if (state.status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load SMTP accounts"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const editing = selected !== null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="SMTP"
        description="Sending accounts for your campaigns."
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus aria-hidden="true" />
            New
          </Button>
        }
      />

      {accounts.length === 0 && selected !== "new" ? (
        <EmptyState
          icon={Server}
          title="Add your first SMTP account"
          description="Campaigns will send through the accounts you store here."
          action={
            <Button onClick={onNew}>
              <Plus aria-hidden="true" />
              New Account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div>
            <div className="relative mb-3">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search accounts…"
                aria-label="Search SMTP accounts"
                className={cn(INPUT_CLASS, "h-9 pl-8")}
              />
            </div>
            <Card>
              {listed.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No accounts match.</p>
              ) : (
                <ul className="divide-y">
                  {listed.map((account) => (
                    <li key={account.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(account.id)}
                        className={cn(
                          "w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          selected === account.id && "bg-accent"
                        )}
                      >
                        <span className="flex items-center gap-2 truncate text-sm font-medium">
                          {account.name || account.senderEmail}
                          {account.isDefault && (
                            <span className="rounded-md border border-emerald-500/40 px-1.5 py-0 text-[10px] text-emerald-600 dark:text-emerald-400">
                              Default
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {account.senderEmail} · {account.host}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Updated {formatDate(account.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {editing ? (
            <div className="min-w-0">
              <Card className="p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {TEXT_FIELDS.map((field) => {
                    const error = editor.errors[field.key];
                    const id = `smtp-${field.key}`;
                    return (
                      <div key={field.key}>
                        <label
                          htmlFor={id}
                          className="mb-1 block text-xs text-muted-foreground"
                        >
                          {field.label}
                        </label>
                        <input
                          id={id}
                          type="text"
                          value={editor.form[field.key]}
                          onChange={(e) => editor.setField(field.key, e.target.value)}
                          aria-invalid={Boolean(error)}
                          className={cn(
                            INPUT_CLASS,
                            "h-9",
                            error && editor.dirty && "border-destructive"
                          )}
                        />
                        {error && editor.dirty && (
                          <p className="mt-1 text-xs text-destructive">{error}</p>
                        )}
                      </div>
                    );
                  })}

                  <div>
                    <label
                      htmlFor="smtp-password"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Password
                    </label>
                    <div className="flex gap-1">
                      <input
                        id="smtp-password"
                        type={showPassword ? "text" : "password"}
                        value={editor.form.password}
                        onChange={(e) => editor.setField("password", e.target.value)}
                        aria-invalid={Boolean(editor.errors.password)}
                        className={cn(
                          INPUT_CLASS,
                          "h-9",
                          editor.errors.password && editor.dirty && "border-destructive"
                        )}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {editor.errors.password && editor.dirty && (
                      <p className="mt-1 text-xs text-destructive">
                        {editor.errors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="smtp-encryption"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Encryption
                    </label>
                    <select
                      id="smtp-encryption"
                      value={editor.form.encryption}
                      onChange={(e) =>
                        editor.setField("encryption", e.target.value as SmtpEncryption)
                      }
                      className={cn(INPUT_CLASS, "h-9")}
                    >
                      {ENCRYPTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="col-span-full flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editor.form.isDefault}
                      onChange={(e) => editor.setField("isDefault", e.target.checked)}
                      className="h-4 w-4 accent-foreground"
                    />
                    Use as default account
                  </label>
                </div>

                {editor.saveError && (
                  <p className="mt-3 text-sm text-destructive">{editor.saveError}</p>
                )}

                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {editor.dirty
                      ? "Unsaved changes"
                      : current
                        ? `Updated ${new Date(current.updatedAt).toLocaleString()}`
                        : ""}
                  </span>
                  <div className="flex gap-2">
                    {current && (
                      <>
                        <Button variant="outline" size="sm" onClick={onDuplicate}>
                          <Copy aria-hidden="true" />
                          Duplicate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      disabled={!editor.valid || !editor.dirty || editor.saving}
                      onClick={editor.save}
                      title="Ctrl+S"
                    >
                      {editor.saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </Card>

              <p className="mt-3 text-xs text-muted-foreground">
                SMTP credentials are stored locally on this device.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={Server}
              title="Select an account"
              description="Choose an SMTP account from the list or create a new one."
            />
          )}
        </div>
      )}

      <Toast message={toast.message} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this SMTP account?"
        description={
          current
            ? `"${current.name || current.senderEmail}" will be permanently deleted.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description="Your edits to this account will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={onDiscard}
      />
    </div>
  );
}
