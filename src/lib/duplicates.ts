import type { AppField } from "./preview-store";

export type MatchedField = "Email" | "Website" | "Full Name + Company";

export type DuplicateGroup = {
  id: number;
  key: string;
  matchedField: MatchedField;
  rowNumbers: number[]; // 1-based data row numbers
};

export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => (cell ?? "").trim() === "");
}

function normalizeWebsite(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Groups duplicate rows within the CSV only. Priority: Email, then Website,
// then Full Name + Company. A row belongs to at most one group; blank keys
// and blank rows are ignored.
export function findDuplicateGroups(
  rows: string[][],
  fields: (AppField | null)[]
): DuplicateGroup[] {
  const col = (field: AppField) => fields.indexOf(field);
  const emailCol = col("email");
  const websiteCol = col("website");
  const fullNameCol = col("fullName");
  const companyCol = col("company");
  const cell = (row: string[], c: number) => (c >= 0 ? (row[c] ?? "").trim() : "");

  const grouped = new Set<number>();
  const groups: DuplicateGroup[] = [];
  let nextId = 1;

  const collect = (matchedField: MatchedField, keyFor: (row: string[]) => string) => {
    const byKey = new Map<string, number[]>();
    rows.forEach((row, i) => {
      if (grouped.has(i) || isBlankRow(row)) return;
      const key = keyFor(row);
      if (!key) return;
      const list = byKey.get(key);
      if (list) list.push(i);
      else byKey.set(key, [i]);
    });
    for (const [key, indices] of byKey) {
      if (indices.length < 2) continue;
      indices.forEach((i) => grouped.add(i));
      groups.push({
        id: nextId++,
        key,
        matchedField,
        rowNumbers: indices.map((i) => i + 1),
      });
    }
  };

  collect("Email", (row) => cell(row, emailCol).toLowerCase());
  collect("Website", (row) => normalizeWebsite(cell(row, websiteCol)));
  if (fullNameCol >= 0 && companyCol >= 0) {
    collect("Full Name + Company", (row) => {
      const name = normalizeText(cell(row, fullNameCol));
      const company = normalizeText(cell(row, companyCol));
      return name && company ? `${name} @ ${company}` : "";
    });
  }

  return groups;
}
