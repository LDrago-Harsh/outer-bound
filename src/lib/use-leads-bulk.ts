import * as React from "react";

import { campaignsRepo, leadsRepo, type Lead } from "./db";
import { downloadFile } from "./backup";

// All bulk-action logic for the Leads page: selection (incl. shift ranges),
// delete (with campaign cleanup), CSV export, source change, add/remove tags.

export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,;]/).map((t) => t.trim()).filter(Boolean))];
}

const CSV_COLUMNS: { header: string; value: (lead: Lead) => string }[] = [
  { header: "First Name", value: (l) => l.firstName },
  { header: "Last Name", value: (l) => l.lastName },
  { header: "Full Name", value: (l) => l.fullName },
  { header: "Company", value: (l) => l.company },
  { header: "Website", value: (l) => l.website },
  { header: "Email", value: (l) => l.email },
  { header: "Phone", value: (l) => l.phone },
  { header: "LinkedIn", value: (l) => l.linkedin },
  { header: "Country", value: (l) => l.country },
  { header: "City", value: (l) => l.city },
  { header: "Industry", value: (l) => l.industry },
  { header: "Job Title", value: (l) => l.jobTitle },
  { header: "Source", value: (l) => l.source },
  { header: "Tags", value: (l) => l.tags.join("; ") },
  { header: "Notes", value: (l) => l.notes },
  { header: "Imported At", value: (l) => l.importedAt },
];

export function useLeadsBulk({
  allLeads,
  results,
  setLeads,
}: {
  allLeads: Lead[];
  results: Lead[]; // filtered + sorted, defines shift-select order
  setLeads: (leads: Lead[]) => void;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const lastIndexRef = React.useRef<number | null>(null);

  const count = selected.size;

  const toggle = (id: string, index: number, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastIndexRef.current !== null) {
        const start = Math.min(lastIndexRef.current, index);
        const end = Math.max(lastIndexRef.current, index);
        const select = !prev.has(id);
        for (let i = start; i <= end; i++) {
          const rowId = results[i]?.id;
          if (!rowId) continue;
          if (select) next.add(rowId);
          else next.delete(rowId);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastIndexRef.current = index;
  };

  const setMany = (ids: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const selectAllFiltered = () => setSelected(new Set(results.map((r) => r.id)));

  const clear = () => {
    setSelected(new Set());
    lastIndexRef.current = null;
  };

  // Deletes permanently and removes the leads from every campaign selection.
  const deleteSelected = async () => {
    const removed = new Set(selected);
    await leadsRepo.removeMany([...removed]);
    const campaigns = await campaignsRepo.getAll();
    const now = new Date().toISOString();
    await Promise.all(
      campaigns
        .filter((c) => c.leadIds.some((id) => removed.has(id)))
        .map((c) => {
          const leadIds = c.leadIds.filter((id) => !removed.has(id));
          return campaignsRepo.put({
            ...c,
            leadIds,
            leadCount: leadIds.length,
            updatedAt: now,
          });
        })
    );
    setLeads(allLeads.filter((l) => !removed.has(l.id)));
    clear();
  };

  const exportSelected = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = allLeads
      .filter((l) => selected.has(l.id))
      .map((l) => CSV_COLUMNS.map((c) => esc(c.value(l))).join(","));
    downloadFile(
      [CSV_COLUMNS.map((c) => esc(c.header)).join(","), ...rows].join("\n"),
      `outerbound-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv"
    );
  };

  const updateSelected = async (mutate: (lead: Lead) => Lead) => {
    const now = new Date().toISOString();
    const next = allLeads.map((l) =>
      selected.has(l.id) ? { ...mutate(l), updatedAt: now } : l
    );
    await leadsRepo.putMany(next.filter((l) => selected.has(l.id)));
    setLeads(next);
  };

  const changeSource = (source: string) =>
    updateSelected((l) => ({ ...l, source: source.trim() }));

  const addTags = (input: string) => {
    const tags = parseTags(input);
    return updateSelected((l) => ({ ...l, tags: [...new Set([...l.tags, ...tags])] }));
  };

  const removeTags = (input: string) => {
    const remove = new Set(parseTags(input).map((t) => t.toLowerCase()));
    return updateSelected((l) => ({
      ...l,
      tags: l.tags.filter((t) => !remove.has(t.toLowerCase())),
    }));
  };

  return {
    selected,
    count,
    toggle,
    setMany,
    selectAllFiltered,
    clear,
    deleteSelected,
    exportSelected,
    changeSource,
    addTags,
    removeTags,
  };
}
