import * as React from "react";

import type { Lead } from "./db";

export type SortKey =
  | "name"
  | "company"
  | "email"
  | "phone"
  | "country"
  | "source"
  | "importedAt";

export type SortState = { key: SortKey; dir: "asc" | "desc" };

export type BoolFilterKey = "hasEmail" | "hasPhone" | "hasWebsite";
type BoolFilters = Record<BoolFilterKey, boolean>;

export type FilterChip = { id: string; label: string; remove: () => void };

const SORT_KEYS: SortKey[] = [
  "name",
  "company",
  "email",
  "phone",
  "country",
  "source",
  "importedAt",
];

const DEFAULT_SORT: SortState = { key: "importedAt", dir: "desc" };
const NO_BOOLS: BoolFilters = { hasEmail: false, hasPhone: false, hasWebsite: false };
const DEFAULT_STATE = {
  q: "",
  source: null as string | null,
  country: null as string | null,
  bools: NO_BOOLS,
  sort: DEFAULT_SORT,
};

export function nameOf(lead: Lead): string {
  return lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(" ");
}

function sortValue(lead: Lead, key: SortKey): string {
  if (key === "name") return nameOf(lead).toLowerCase();
  if (key === "importedAt") return lead.importedAt;
  return (lead[key] ?? "").toLowerCase();
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Initial state comes from the URL so a refresh preserves the current view.
function readInitial() {
  if (typeof window === "undefined") return DEFAULT_STATE;
  const params = new URLSearchParams(window.location.search);
  const sortParam = (params.get("sort") ?? "").split(".");
  const sort: SortState =
    SORT_KEYS.includes(sortParam[0] as SortKey) &&
    (sortParam[1] === "asc" || sortParam[1] === "desc")
      ? { key: sortParam[0] as SortKey, dir: sortParam[1] }
      : DEFAULT_SORT;
  return {
    q: params.get("q") ?? "",
    source: params.get("source"),
    country: params.get("country"),
    bools: {
      hasEmail: params.get("hasEmail") === "1",
      hasPhone: params.get("hasPhone") === "1",
      hasWebsite: params.get("hasWebsite") === "1",
    },
    sort,
  };
}

// All search/filter/sort state and derived data for lead lists.
// Search + filters run in a single memoized pass over a prebuilt index.
// Pass { syncUrl: false } for embedded uses (e.g. campaign lead selection).
export function useLeadsFilter(leads: Lead[], opts: { syncUrl?: boolean } = {}) {
  const { syncUrl = true } = opts;
  const initial = React.useMemo(
    () => (syncUrl ? readInitial() : DEFAULT_STATE),
    [syncUrl]
  );
  const [qInput, setQInput] = React.useState(initial.q);
  const [q, setQ] = React.useState(initial.q);
  const [source, setSource] = React.useState<string | null>(initial.source);
  const [country, setCountry] = React.useState<string | null>(initial.country);
  const [bools, setBools] = React.useState<BoolFilters>(initial.bools);
  const [sort, setSort] = React.useState<SortState>(initial.sort);

  // Debounced live search (~200ms).
  React.useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), 200);
    return () => clearTimeout(timer);
  }, [qInput]);

  // Keep the URL in sync (replaceState avoids re-renders and history spam).
  React.useEffect(() => {
    if (!syncUrl) return;
    const params = new URLSearchParams();
    const query = normalizeQuery(q);
    if (query) params.set("q", query);
    if (source) params.set("source", source);
    if (country) params.set("country", country);
    for (const key of Object.keys(bools) as BoolFilterKey[]) {
      if (bools[key]) params.set(key, "1");
    }
    if (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) {
      params.set("sort", `${sort.key}.${sort.dir}`);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [syncUrl, q, source, country, bools, sort]);

  // Filter options and availability, derived from the data.
  const sources = React.useMemo(() => uniqueSorted(leads.map((l) => l.source)), [leads]);
  const countries = React.useMemo(() => uniqueSorted(leads.map((l) => l.country)), [leads]);
  const available = React.useMemo(
    () => ({
      hasEmail: leads.some((l) => l.email),
      hasPhone: leads.some((l) => l.phone),
      hasWebsite: leads.some((l) => l.website),
    }),
    [leads]
  );

  // Search index: one lowercase haystack per lead, built once per dataset.
  const indexed = React.useMemo(
    () =>
      leads.map((lead) => ({
        lead,
        haystack: [nameOf(lead), lead.company, lead.email, lead.phone, lead.country, lead.source]
          .join(" ")
          .toLowerCase(),
      })),
    [leads]
  );

  const filtered = React.useMemo(() => {
    const terms = normalizeQuery(q) ? normalizeQuery(q).split(" ") : [];
    return indexed
      .filter(
        ({ lead, haystack }) =>
          terms.every((t) => haystack.includes(t)) &&
          (!source || lead.source === source) &&
          (!country || lead.country === country) &&
          (!bools.hasEmail || Boolean(lead.email)) &&
          (!bools.hasPhone || Boolean(lead.phone)) &&
          (!bools.hasWebsite || Boolean(lead.website))
      )
      .map((entry) => entry.lead);
  }, [indexed, q, source, country, bools]);

  const results = React.useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) => sortValue(a, sort.key).localeCompare(sortValue(b, sort.key)) * factor
    );
  }, [filtered, sort]);

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "importedAt" ? "desc" : "asc" }
    );

  const setBool = (key: BoolFilterKey, value: boolean) =>
    setBools((prev) => ({ ...prev, [key]: value }));

  const clearAll = () => {
    setQInput("");
    setQ("");
    setSource(null);
    setCountry(null);
    setBools(NO_BOOLS);
  };

  const boolLabels: Record<BoolFilterKey, string> = {
    hasEmail: "Has Email",
    hasPhone: "Has Phone",
    hasWebsite: "Has Website",
  };

  const chips: FilterChip[] = [
    ...(source ? [{ id: "source", label: `Source: ${source}`, remove: () => setSource(null) }] : []),
    ...(country
      ? [{ id: "country", label: `Country: ${country}`, remove: () => setCountry(null) }]
      : []),
    ...(Object.keys(bools) as BoolFilterKey[])
      .filter((key) => bools[key])
      .map((key) => ({ id: key, label: boolLabels[key], remove: () => setBool(key, false) })),
  ];

  const hasActiveFilters = chips.length > 0 || normalizeQuery(q) !== "";

  return {
    qInput,
    setQInput,
    leadsTotal: leads.length,
    source,
    setSource,
    country,
    setCountry,
    bools,
    setBool,
    sort,
    onSort,
    sources,
    countries,
    available,
    results,
    chips,
    clearAll,
    hasActiveFilters,
  };
}
