"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Download, Search, Trash2, Users } from "lucide-react";

import { leadsRepo, type Lead } from "@/lib/db";
import { useLeadsFilter } from "@/lib/use-leads-filter";
import { useLeadsBulk } from "@/lib/use-leads-bulk";
import { LeadDrawer } from "@/components/lead-drawer";
import { LeadsTable } from "@/components/leads-table";
import { LeadsToolbar } from "@/components/leads-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

const PROMPTS = {
  source: {
    title: "Change Source",
    label: "New source",
    confirm: "Update",
  },
  addTags: {
    title: "Add Tags",
    label: "Tags (comma separated)",
    confirm: "Add",
  },
  removeTags: {
    title: "Remove Tags",
    label: "Tags (comma separated)",
    confirm: "Remove",
  },
} as const;

type PromptAction = keyof typeof PROMPTS;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; leads: Lead[] };

export function LeadsView() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = React.useState<Lead | null>(null);

  const leads = state.status === "ready" ? state.leads : [];
  const filter = useLeadsFilter(leads);
  const { results } = filter;

  const setLeads = React.useCallback(
    (next: Lead[]) =>
      setState((prev) =>
        prev.status === "ready" ? { status: "ready", leads: next } : prev
      ),
    []
  );
  const bulk = useLeadsBulk({ allLeads: leads, results, setLeads });
  const bulkRef = React.useRef(bulk);
  bulkRef.current = bulk;
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [prompt, setPrompt] = React.useState<{ action: PromptAction; value: string } | null>(
    null
  );

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", leads: await leadsRepo.getAll() });
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

  // Ctrl+A select filtered, Escape clear, Delete delete — unless typing,
  // the drawer is open, or a dialog is showing.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (selected || confirmDelete || prompt) return;
      const b = bulkRef.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        b.selectAllFiltered();
      }
      if (e.key === "Escape" && b.count > 0) b.clear();
      if (e.key === "Delete" && b.count > 0) setConfirmDelete(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, confirmDelete, prompt]);

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
          title="Could not load leads"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const lastImport =
    leads.length > 0
      ? new Date(
          leads.reduce((max, l) => (l.importedAt > max ? l.importedAt : max), leads[0].importedAt)
        ).toLocaleString()
      : "—";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Leads" description="Everything you've imported, in one place." />

      {leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Import a CSV to get your first leads into the app."
          action={
            <Link href="/import" className={buttonVariants()}>
              Import Leads
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Leads" value={leads.length.toLocaleString()} />
            <StatCard label="Last import" value={lastImport} />
          </div>

          <div className="mt-6">
            <LeadsToolbar filter={filter} />
          </div>

          {bulk.count > 0 && (
            <Card className="mt-3 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 text-sm font-medium">
                  {bulk.count.toLocaleString()} selected
                </span>
                {bulk.count < results.length && (
                  <Button variant="ghost" size="sm" onClick={bulk.selectAllFiltered}>
                    Select all {results.length.toLocaleString()} filtered
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={bulk.clear}>
                  Clear
                </Button>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                <Button variant="outline" size="sm" onClick={bulk.exportSelected}>
                  <Download aria-hidden="true" />
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt({ action: "source", value: "" })}
                >
                  Change Source
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt({ action: "addTags", value: "" })}
                >
                  Add Tags
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt({ action: "removeTags", value: "" })}
                >
                  Remove Tags
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Delete Selected
                </Button>
              </div>
            </Card>
          )}

          {results.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={Search}
                title="No matching leads"
                description="Try a different search or remove some filters."
                action={<Button onClick={filter.clearAll}>Clear Filters</Button>}
              />
            </div>
          ) : (
            <LeadsTable
              className="mt-3"
              leads={results}
              sort={filter.sort}
              onSort={filter.onSort}
              onRowClick={setSelected}
              selectedIds={bulk.selected}
              onToggleLead={bulk.toggle}
              onToggleMany={bulk.setMany}
            />
          )}
        </>
      )}

      {selected && (
        <LeadDrawer
          lead={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setSelected(updated);
            setState((prev) =>
              prev.status === "ready"
                ? {
                    status: "ready",
                    leads: prev.leads.map((l) => (l.id === updated.id ? updated : l)),
                  }
                : prev
            );
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${bulk.count.toLocaleString()} leads?`}
        description="They will be permanently deleted and removed from every campaign."
        confirmLabel="Delete"
        destructive
        onConfirm={() => bulk.deleteSelected()}
      />

      {prompt && (
        <AlertDialog open onOpenChange={(open) => !open && setPrompt(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{PROMPTS[prompt.action].title}</AlertDialogTitle>
              <AlertDialogDescription>
                Applies to {bulk.count.toLocaleString()} selected leads.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div>
              <label
                htmlFor="bulk-prompt"
                className="mb-1 block text-xs text-muted-foreground"
              >
                {PROMPTS[prompt.action].label}
              </label>
              <input
                id="bulk-prompt"
                type="text"
                autoFocus
                value={prompt.value}
                onChange={(e) =>
                  setPrompt((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setPrompt(null)}>
                Cancel
              </Button>
              <Button
                disabled={!prompt.value.trim()}
                onClick={async () => {
                  const { action, value } = prompt;
                  setPrompt(null);
                  if (action === "source") await bulk.changeSource(value);
                  else if (action === "addTags") await bulk.addTags(value);
                  else await bulk.removeTags(value);
                }}
              >
                {PROMPTS[prompt.action].confirm}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
