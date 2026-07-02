"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Copy, Plus, Search, Send, Trash2 } from "lucide-react";

import {
  campaignsRepo,
  leadsRepo,
  templatesRepo,
  type Campaign,
  type Lead,
  type Template,
} from "@/lib/db";
import { useCampaignEditor } from "@/lib/use-campaign-editor";
import { useLeadsFilter } from "@/lib/use-leads-filter";
import { cn, INPUT_CLASS } from "@/lib/utils";
import { formatDate } from "@/lib/settings";
import { LeadsTable } from "@/components/leads-table";
import { LeadsToolbar } from "@/components/leads-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast, useToast } from "@/components/ui/toast";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; campaigns: Campaign[]; templates: Template[]; leads: Lead[] };

export function CampaignsView() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = React.useState<string | "new" | null>(null);
  const [q, setQ] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const toast = useToast();

  const campaigns = React.useMemo(
    () =>
      state.status === "ready"
        ? [...state.campaigns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [state]
  );
  const templates = state.status === "ready" ? state.templates : [];
  const leads = state.status === "ready" ? state.leads : [];

  const listed = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    return query
      ? campaigns.filter((c) => c.name.toLowerCase().includes(query))
      : campaigns;
  }, [campaigns, q]);

  const current =
    selected && selected !== "new" ? campaigns.find((c) => c.id === selected) ?? null : null;

  const editor = useCampaignEditor(current, (saved) => {
    setState((prev) =>
      prev.status === "ready"
        ? {
            ...prev,
            campaigns: prev.campaigns.some((c) => c.id === saved.id)
              ? prev.campaigns.map((c) => (c.id === saved.id ? saved : c))
              : [...prev.campaigns, saved],
          }
        : prev
    );
    setSelected(saved.id);
    toast.show("Campaign saved");
  });
  const editorRef = React.useRef(editor);
  editorRef.current = editor;

  const leadFilter = useLeadsFilter(leads, { syncUrl: false });

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [allCampaigns, allTemplates, allLeads] = await Promise.all([
        campaignsRepo.getAll(),
        templatesRepo.getAll(),
        leadsRepo.getAll(),
      ]);
      setState({
        status: "ready",
        campaigns: allCampaigns,
        templates: allTemplates,
        leads: allLeads,
      });
      const paramId = new URLSearchParams(window.location.search).get("id");
      const newest = [...allCampaigns].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      )[0];
      setSelected(
        paramId && allCampaigns.some((c) => c.id === paramId)
          ? paramId
          : newest?.id ?? null
      );
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
    const copy: Campaign = {
      ...current,
      id: crypto.randomUUID(),
      name: `${current.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await campaignsRepo.put(copy);
    setState((prev) =>
      prev.status === "ready" ? { ...prev, campaigns: [...prev.campaigns, copy] } : prev
    );
    setSelected(copy.id);
  };

  const onDelete = async () => {
    if (!current) return;
    await campaignsRepo.remove(current.id);
    const remaining = campaigns.filter((c) => c.id !== current.id);
    setState((prev) =>
      prev.status === "ready"
        ? { ...prev, campaigns: prev.campaigns.filter((c) => c.id !== current.id) }
        : prev
    );
    setSelected(remaining[0]?.id ?? null);
  };

  const onDiscard = () => {
    editor.reset();
    if (selected === "new") setSelected(campaigns[0]?.id ?? null);
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
          title="Could not load campaigns"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === editor.form.templateId);
  const editing = selected !== null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Campaigns"
        description="Pick leads and a template. Nothing sends yet."
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus aria-hidden="true" />
            New Campaign
          </Button>
        }
      />

      {campaigns.length === 0 && selected !== "new" ? (
        <EmptyState
          icon={Send}
          title="Create your first campaign"
          description="A campaign pairs a set of leads with an email template."
          action={
            <Button onClick={onNew}>
              <Plus aria-hidden="true" />
              New Campaign
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
                placeholder="Search campaigns…"
                aria-label="Search campaigns"
                className={cn(INPUT_CLASS, "h-9 pl-8")}
              />
            </div>
            <Card>
              {listed.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No campaigns match.</p>
              ) : (
                <ul className="divide-y">
                  {listed.map((campaign) => (
                    <li key={campaign.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(campaign.id)}
                        className={cn(
                          "w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          selected === campaign.id && "bg-accent"
                        )}
                      >
                        <span className="block truncate text-sm font-medium">
                          {campaign.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {campaign.leadCount.toLocaleString()} leads · Updated{" "}
                          {formatDate(campaign.updatedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {editing ? (
            <div className="min-w-0 space-y-6">
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="cmp-name"
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Campaign Name
                      </label>
                      <input
                        id="cmp-name"
                        type="text"
                        value={editor.form.name}
                        onChange={(e) => editor.setField("name", e.target.value)}
                        className={cn(
                          INPUT_CLASS,
                          "h-9",
                          editor.errors.name && editor.dirty && "border-destructive"
                        )}
                      />
                      {editor.errors.name && editor.dirty && (
                        <p className="mt-1 text-xs text-destructive">{editor.errors.name}</p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="cmp-template"
                        className="mb-1 block text-xs text-muted-foreground"
                      >
                        Template
                      </label>
                      <select
                        id="cmp-template"
                        value={editor.form.templateId}
                        onChange={(e) => editor.setField("templateId", e.target.value)}
                        className={cn(
                          INPUT_CLASS,
                          "h-9",
                          editor.errors.templateId && editor.dirty && "border-destructive"
                        )}
                      >
                        <option value="">Select a template…</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      {templates.length === 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No templates yet — create one on the Templates page.
                        </p>
                      )}
                      {editor.errors.templateId && editor.dirty && (
                        <p className="mt-1 text-xs text-destructive">
                          {editor.errors.templateId}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="cmp-description"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Description
                    </label>
                    <textarea
                      id="cmp-description"
                      rows={2}
                      value={editor.form.description}
                      onChange={(e) => editor.setField("description", e.target.value)}
                      className={cn(INPUT_CLASS, "py-2")}
                    />
                  </div>
                </div>
              </Card>

              <div>
                <h2 className="mb-2 text-sm font-semibold">
                  Leads{" "}
                  <span className="font-normal text-muted-foreground">
                    · {editor.form.leadIds.length.toLocaleString()} selected
                  </span>
                </h2>
                {leads.length === 0 ? (
                  <EmptyState
                    title="No leads to select"
                    description="Import leads first, then add them to this campaign."
                  />
                ) : (
                  <>
                    <LeadsToolbar filter={leadFilter} />
                    {leadFilter.results.length === 0 ? (
                      <div className="mt-3">
                        <EmptyState
                          icon={Search}
                          title="No matching leads"
                          description="Try a different search or remove some filters."
                          action={<Button onClick={leadFilter.clearAll}>Clear Filters</Button>}
                        />
                      </div>
                    ) : (
                      <LeadsTable
                        className="mt-3"
                        leads={leadFilter.results}
                        sort={leadFilter.sort}
                        onSort={leadFilter.onSort}
                        selectedIds={editor.leadIdSet}
                        onToggleLead={editor.toggleLead}
                        onToggleMany={editor.setLeadSelection}
                      />
                    )}
                    {editor.errors.leads && editor.dirty && (
                      <p className="mt-2 text-xs text-destructive">{editor.errors.leads}</p>
                    )}
                  </>
                )}
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold">Summary</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCard
                    label="Selected leads"
                    value={editor.form.leadIds.length.toLocaleString()}
                  />
                  <StatCard label="Template" value={selectedTemplate?.name ?? "—"} />
                  <StatCard label="Campaign name" value={editor.form.name || "—"} />
                </div>
              </div>

              {editor.saveError && (
                <p className="text-sm text-destructive">{editor.saveError}</p>
              )}

              <div className="flex items-center justify-between gap-2">
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
                      <Link
                        href={`/campaigns/${current.id}/review`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Review &amp; Launch
                      </Link>
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
          ) : (
            <EmptyState
              icon={Send}
              title="Select a campaign"
              description="Choose a campaign from the list or create a new one."
            />
          )}
        </div>
      )}

      <Toast message={toast.message} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this campaign?"
        description={current ? `"${current.name}" will be permanently deleted.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description="Your edits to this campaign will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={onDiscard}
      />
    </div>
  );
}
