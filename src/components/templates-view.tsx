"use client";

import * as React from "react";
import { AlertTriangle, Copy, FileText, Plus, Search, Trash2 } from "lucide-react";

import { leadsRepo, templatesRepo, type Lead, type Template } from "@/lib/db";
import { useTemplateEditor } from "@/lib/use-template-editor";
import { analyzeVariables, renderTemplate, TEMPLATE_VARIABLES } from "@/lib/render-template";
import { nameOf } from "@/lib/use-leads-filter";
import { cn, INPUT_CLASS } from "@/lib/utils";
import { formatDate } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast, useToast } from "@/components/ui/toast";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; templates: Template[] };

export function TemplatesView() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = React.useState<string | "new" | null>(null);
  const [q, setQ] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const toast = useToast();
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const activeFieldRef = React.useRef<"subject" | "body">("body");
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [previewLeadId, setPreviewLeadId] = React.useState("");

  const templates = React.useMemo(
    () =>
      state.status === "ready"
        ? [...state.templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [state]
  );

  const listed = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return query
      ? templates.filter((t) => t.name.toLowerCase().includes(query))
      : templates;
  }, [templates, q]);

  const current =
    selected && selected !== "new" ? templates.find((t) => t.id === selected) ?? null : null;

  const editor = useTemplateEditor(current, (saved) => {
    setState((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            templates: prev.templates.some((t) => t.id === saved.id)
              ? prev.templates.map((t) => (t.id === saved.id ? saved : t))
              : [...prev.templates, saved],
          }
        : prev
    );
    setSelected(saved.id);
    toast.show("Template saved");
  });
  const editorRef = React.useRef(editor);
  editorRef.current = editor;

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const all = await templatesRepo.getAll();
      setState({ status: "ready", templates: all });
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

  // Leads are only needed for the rendered preview.
  React.useEffect(() => {
    leadsRepo
      .getAll()
      .then(setLeads)
      .catch(() => setLeads([]));
  }, []);

  // Auto-resize the body textarea to its content.
  React.useEffect(() => {
    const el = bodyRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editor.form.body, selected]);

  // Ctrl/Cmd+S saves, Escape cancels editing.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        editorRef.current.save();
      }
      if (e.key === "Escape") {
        if (editorRef.current.dirty) setConfirmDiscard(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onNew = () => setSelected("new");

  const onDuplicate = async () => {
    if (!current) return;
    const now = new Date().toISOString();
    const copy: Template = {
      ...current,
      id: crypto.randomUUID(),
      name: `${current.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await templatesRepo.put(copy);
      setState((prev) =>
        prev.status === "ready"
          ? { status: "ready", templates: [...prev.templates, copy] }
          : prev
      );
      setSelected(copy.id);
    } catch {
      // Surface via the editor's error slot on next save; keep it simple.
    }
  };

  const onDelete = async () => {
    if (!current) return;
    await templatesRepo.remove(current.id);
    const remaining = templates.filter((t) => t.id !== current.id);
    setState((prev) =>
      prev.status === "ready"
        ? { status: "ready", templates: prev.templates.filter((t) => t.id !== current.id) }
        : prev
    );
    setSelected(remaining[0]?.id ?? null);
  };

  const onDiscard = () => {
    editor.reset();
    if (selected === "new") setSelected(templates[0]?.id ?? null);
  };

  // Inserts a variable token at the cursor of the last-focused field.
  const insertVariable = (variable: string) => {
    const token = `{{${variable}}}`;
    const target = activeFieldRef.current;
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    const key = target === "subject" ? ("subject" as const) : ("body" as const);
    const value = editor.form[key];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    editor.setField(key, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const variableWarnings = analyzeVariables(
    `${editor.form.subject}\n${editor.form.body}`
  );

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
          title="Could not load templates"
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
        title="Templates"
        description="Plain-text email templates for your campaigns."
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus aria-hidden="true" />
            New Template
          </Button>
        }
      />

      {templates.length === 0 && selected !== "new" ? (
        <EmptyState
          icon={FileText}
          title="Create your first template"
          description="Templates hold the subject and body of the emails you send."
          action={
            <Button onClick={onNew}>
              <Plus aria-hidden="true" />
              New Template
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
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
                placeholder="Search templates…"
                aria-label="Search templates"
                className={cn(INPUT_CLASS, "h-9 pl-8")}
              />
            </div>
            <Card>
              {listed.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No templates match.</p>
              ) : (
                <ul className="divide-y">
                  {listed.map((template) => (
                    <li key={template.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(template.id)}
                        className={cn(
                          "w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          selected === template.id && "bg-accent"
                        )}
                      >
                        <span className="block truncate text-sm font-medium">
                          {template.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Updated {formatDate(template.updatedAt)}
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
                <div className="space-y-3">
                  <div>
                    <label htmlFor="tpl-name" className="mb-1 block text-xs text-muted-foreground">
                      Name
                    </label>
                    <input
                      id="tpl-name"
                      type="text"
                      value={editor.form.name}
                      onChange={(e) => editor.setField("name", e.target.value)}
                      className={cn(INPUT_CLASS, "h-9", editor.errors.name && editor.dirty && "border-destructive")}
                    />
                    {editor.errors.name && editor.dirty && (
                      <p className="mt-1 text-xs text-destructive">{editor.errors.name}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="tpl-subject" className="mb-1 block text-xs text-muted-foreground">
                      Subject
                    </label>
                    <input
                      id="tpl-subject"
                      ref={subjectRef}
                      type="text"
                      value={editor.form.subject}
                      onFocus={() => (activeFieldRef.current = "subject")}
                      onChange={(e) => editor.setField("subject", e.target.value)}
                      className={cn(INPUT_CLASS, "h-9", editor.errors.subject && editor.dirty && "border-destructive")}
                    />
                    {editor.errors.subject && editor.dirty && (
                      <p className="mt-1 text-xs text-destructive">{editor.errors.subject}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="tpl-body" className="mb-1 block text-xs text-muted-foreground">
                      Body
                    </label>
                    <textarea
                      id="tpl-body"
                      ref={bodyRef}
                      rows={10}
                      value={editor.form.body}
                      onFocus={() => (activeFieldRef.current = "body")}
                      onChange={(e) => editor.setField("body", e.target.value)}
                      className={cn(
                        INPUT_CLASS,
                        "min-h-[240px] resize-none overflow-hidden py-2 font-mono",
                        editor.errors.body && editor.dirty && "border-destructive"
                      )}
                    />
                    {editor.errors.body && editor.dirty && (
                      <p className="mt-1 text-xs text-destructive">{editor.errors.body}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                      Variables — click to insert at the cursor
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() => insertVariable(variable)}
                          className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {`{{${variable}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(variableWarnings.unknown.length > 0 ||
                    variableWarnings.duplicates.length > 0) && (
                    <ul className="space-y-1">
                      {variableWarnings.unknown.map((v) => (
                        <li
                          key={`unknown-${v}`}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                            aria-hidden="true"
                          />
                          Unknown variable {`{{${v}}}`} — it will render as empty text.
                        </li>
                      ))}
                      {variableWarnings.duplicates.map((v) => (
                        <li
                          key={`dup-${v}`}
                          className="flex items-start gap-2 text-xs text-muted-foreground"
                        >
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                            aria-hidden="true"
                          />
                          {`{{${v}}}`} is used more than once.
                        </li>
                      ))}
                    </ul>
                  )}

                  {editor.saveError && (
                    <p className="text-sm text-destructive">{editor.saveError}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {editor.dirty ? "Unsaved changes" : current ? `Updated ${new Date(current.updatedAt).toLocaleString()}` : ""}
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
                </div>
              </Card>

              <div className="mb-2 mt-6 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Preview</h2>
                {leads.length > 0 && (
                  <select
                    value={previewLeadId}
                    onChange={(e) => setPreviewLeadId(e.target.value)}
                    aria-label="Preview with lead"
                    className={cn(INPUT_CLASS, "h-8 w-auto")}
                  >
                    <option value="">No lead (raw template)</option>
                    {leads.slice(0, 200).map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {nameOf(lead) || lead.email || lead.company || "Lead"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <Card className="p-4">
                {(() => {
                  const lead = leads.find((l) => l.id === previewLeadId) ?? null;
                  const subject = lead
                    ? renderTemplate(editor.form.subject, lead)
                    : editor.form.subject;
                  const body = lead
                    ? renderTemplate(editor.form.body, lead)
                    : editor.form.body;
                  return (
                    <>
                      <p className="text-sm font-medium">
                        {subject || (
                          <span className="text-muted-foreground">(no subject)</span>
                        )}
                      </p>
                      <hr className="my-3" />
                      <pre className="whitespace-pre-wrap break-words font-mono text-sm text-muted-foreground">
                        {body || "(empty body)"}
                      </pre>
                    </>
                  );
                })()}
              </Card>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="Select a template"
              description="Choose a template from the list or create a new one."
            />
          )}
        </div>
      )}

      <Toast message={toast.message} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this template?"
        description={current ? `"${current.name}" will be permanently deleted.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description="Your edits to this template will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={onDiscard}
      />
    </div>
  );
}
