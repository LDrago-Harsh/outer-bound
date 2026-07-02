import { validateRows } from "./validation";
import { isBlankRow } from "./duplicates";
import type { Lead } from "./db";
import type { AppField } from "./preview-store";

export type ImportPlan = {
  leads: Lead[];
  ignored: number; // blank rows + duplicate-review ignores + validation errors
};

// Pure planning: applies the import rules and builds ready-to-store leads.
// No persistence — the importer decides what to do with the plan.
// Skips blank rows, rows ignored during duplicate review, and rows with
// validation errors. Reusable by any future CSV import.
export function buildImportPlan(
  rows: string[][],
  fields: (AppField | null)[],
  ignoredRowNumbers: Set<number>,
  defaultSource: string
): ImportPlan {
  const errorRows = new Set(
    validateRows(rows, fields)
      .issueRows.filter((r) => r.status === "error")
      .map((r) => r.rowNumber)
  );

  const col = (field: AppField) => fields.indexOf(field);
  const cell = (row: string[], c: number) => (c >= 0 ? (row[c] ?? "").trim() : "");

  const leads: Lead[] = [];
  let ignored = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    if (isBlankRow(row) || ignoredRowNumbers.has(rowNumber) || errorRows.has(rowNumber)) {
      ignored += 1;
      return;
    }
    const firstName = cell(row, col("firstName"));
    const lastName = cell(row, col("lastName"));
    const now = new Date().toISOString();
    leads.push({
      id: crypto.randomUUID(),
      firstName,
      lastName,
      fullName:
        cell(row, col("fullName")) || [firstName, lastName].filter(Boolean).join(" "),
      company: cell(row, col("company")),
      website: cell(row, col("website")),
      email: cell(row, col("email")),
      phone: cell(row, col("phone")),
      linkedin: cell(row, col("linkedin")),
      country: cell(row, col("country")),
      city: cell(row, col("city")),
      industry: cell(row, col("industry")),
      jobTitle: cell(row, col("jobTitle")),
      source: cell(row, col("source")) || defaultSource,
      tags: cell(row, col("tags"))
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      notes: cell(row, col("notes")),
      importedAt: now,
      updatedAt: now,
    });
  });

  return { leads, ignored };
}
