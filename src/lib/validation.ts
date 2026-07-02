import { FIELD_LABELS, type AppField } from "./preview-store";

export type IssueRowStatus = "error" | "warning" | "ignored";

export type ValidatedRow = {
  rowNumber: number; // 1-based data row number (header excluded)
  status: IssueRowStatus;
  issues: string[];
  preview: string;
};

export type ValidationResult = {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  ignoredRows: number;
  emailMapped: boolean;
  issueRows: ValidatedRow[]; // only rows with errors/warnings/ignored
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}

// Validates every row against the column mapping. Rules apply only to
// mapped columns. Warnings never block, errors never modify the data,
// blank rows are ignored automatically.
export function validateRows(
  rows: string[][],
  fields: (AppField | null)[]
): ValidationResult {
  const col = (field: AppField) => fields.indexOf(field);
  const emailCol = col("email");
  const websiteCol = col("website");
  const phoneCol = col("phone");
  const companyCol = col("company");
  const firstNameCol = col("firstName");
  const fullNameCol = col("fullName");

  const cell = (row: string[], c: number) => (c >= 0 ? (row[c] ?? "").trim() : "");

  // First pass: count email occurrences for in-CSV duplicate detection.
  const emailCounts = new Map<string, number>();
  for (const row of rows) {
    const email = cell(row, emailCol).toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }

  const result: ValidationResult = {
    totalRows: rows.length,
    validRows: 0,
    warningRows: 0,
    errorRows: 0,
    ignoredRows: 0,
    emailMapped: emailCol >= 0,
    issueRows: [],
  };

  rows.forEach((row, i) => {
    const rowNumber = i + 1;

    if (row.every((c) => (c ?? "").trim() === "")) {
      result.ignoredRows += 1;
      result.issueRows.push({
        rowNumber,
        status: "ignored",
        issues: ["Blank row — excluded automatically"],
        preview: "",
      });
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const email = cell(row, emailCol);
    if (emailCol >= 0) {
      if (!email) errors.push("Email missing");
      else if (!EMAIL_RE.test(email)) errors.push("Invalid email format");
      else if ((emailCounts.get(email.toLowerCase()) ?? 0) > 1)
        errors.push(
          `Duplicate email in CSV (appears ${emailCounts.get(email.toLowerCase())} times)`
        );
    }

    const website = cell(row, websiteCol);
    if (websiteCol >= 0 && website && !isValidUrl(website)) {
      errors.push("Invalid website URL");
    }

    for (const [c, field] of [
      [phoneCol, "phone"],
      [companyCol, "company"],
      [firstNameCol, "firstName"],
    ] as const) {
      if (c >= 0 && !cell(row, c)) warnings.push(`${FIELD_LABELS[field]} empty`);
    }

    const previewText =
      [email, cell(row, fullNameCol) || cell(row, firstNameCol), cell(row, companyCol)]
        .filter(Boolean)
        .join(" · ") ||
      row.find((c) => (c ?? "").trim() !== "") ||
      "";

    if (errors.length > 0) {
      result.errorRows += 1;
      result.issueRows.push({
        rowNumber,
        status: "error",
        issues: [...errors, ...warnings],
        preview: previewText,
      });
    } else if (warnings.length > 0) {
      result.warningRows += 1;
      result.issueRows.push({
        rowNumber,
        status: "warning",
        issues: warnings,
        preview: previewText,
      });
    } else {
      result.validRows += 1;
    }
  });

  return result;
}
