"use client";

import * as React from "react";
import { X } from "lucide-react";

import type { Lead } from "@/lib/db";
import { useLeadEditor, type EditableField } from "@/lib/use-lead-editor";
import { cn, INPUT_CLASS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast, useToast } from "@/components/ui/toast";

const FIELDS: { key: EditableField; label: string; textarea?: boolean }[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "company", label: "Company" },
  { key: "website", label: "Website" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "industry", label: "Industry" },
  { key: "jobTitle", label: "Job Title" },
  { key: "source", label: "Source" },
  { key: "tags", label: "Tags (comma separated)" },
  { key: "notes", label: "Notes", textarea: true },
];

// Lead editor drawer: extends the original read-only drawer with inline
// editing, validation, dirty-state protection, and keyboard shortcuts.
export function LeadDrawer({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: (lead: Lead) => void;
}) {
  const editor = useLeadEditor(lead, onSaved);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const toast = useToast();

  const requestClose = React.useCallback(() => {
    if (editor.dirty) setConfirmDiscard(true);
    else onClose();
  }, [editor.dirty, onClose]);

  const onSave = async () => {
    if (await editor.save()) toast.show("Lead saved");
  };
  const onSaveRef = React.useRef(onSave);
  onSaveRef.current = onSave;

  // Escape closes (with dirty confirmation), Ctrl/Cmd+S saves.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const title =
    editor.form.firstName || editor.form.lastName
      ? [editor.form.firstName, editor.form.lastName].filter(Boolean).join(" ")
      : lead.fullName || lead.email || "Lead";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={requestClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Edit lead"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {[editor.form.jobTitle, editor.form.company].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={requestClose}
            aria-label="Close lead editor"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="flex-1 overflow-y-auto p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((field) => {
              const error = editor.errors[field.key];
              const id = `lead-${field.key}`;
              return (
                <div
                  key={field.key}
                  className={cn(field.textarea && "col-span-2")}
                >
                  <label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">
                    {field.label}
                  </label>
                  {field.textarea ? (
                    <textarea
                      id={id}
                      rows={4}
                      value={editor.form[field.key]}
                      onChange={(e) => editor.setField(field.key, e.target.value)}
                      className={cn(INPUT_CLASS, "py-2")}
                    />
                  ) : (
                    <input
                      id={id}
                      type="text"
                      value={editor.form[field.key]}
                      onChange={(e) => editor.setField(field.key, e.target.value)}
                      aria-invalid={Boolean(error)}
                      className={cn(INPUT_CLASS, "h-9", error && "border-destructive")}
                    />
                  )}
                  {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                </div>
              );
            })}
          </div>
          {editor.saveError && (
            <p className="mt-3 text-sm text-destructive">{editor.saveError}</p>
          )}
          {/* Hidden submit so Enter in a field saves via the form. */}
          <button type="submit" className="sr-only">
            Save
          </button>
        </form>

        <div className="flex items-center justify-between gap-2 border-t p-4">
          <span className="text-xs text-muted-foreground">
            {editor.dirty ? "Unsaved changes" : `Updated ${new Date(lead.updatedAt).toLocaleString()}`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={requestClose}>
              Cancel
            </Button>
            <Button variant="outline" disabled={!editor.dirty} onClick={editor.reset}>
              Reset Changes
            </Button>
            <Button
              disabled={!editor.dirty || editor.saving || Object.keys(editor.errors).length > 0}
              onClick={onSave}
              title="Ctrl+S"
            >
              {editor.saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </aside>

      <Toast message={toast.message} />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="Your edits to this lead will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
      />
    </>
  );
}
