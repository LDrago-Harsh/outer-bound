import Papa from "papaparse";

const STORAGE_KEY = "outerbound.import.preview";
const MAPPINGS_KEY = "outerbound.import.mappings";

export type CsvPreview =
  | {
      status: "ready";
      filename: string;
      headers: string[];
      rows: string[][];
      totalRows: number;
      totalCols: number;
    }
  | { status: "error"; filename: string; message: string };

// sessionStorage: survives refreshes, cleared when the tab closes.
// Very large files that exceed the storage quota stay in memory only.
let memoryFallback: CsvPreview | null = null;

export function getPreview(): CsvPreview | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CsvPreview;
  } catch {
    // fall through to memory
  }
  return memoryFallback;
}

function setPreview(preview: CsvPreview): void {
  memoryFallback = preview;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(preview));
  } catch {
    // Quota exceeded — kept in memory; lost on refresh.
  }
}

// Parses the file once, keeping the header row, all data rows, and totals.
// Later steps (mapping, validation) reuse this data without reparsing.
export function parseCsvToPreview(file: File): Promise<CsvPreview> {
  return new Promise((resolve) => {
    let headers: string[] | null = null;
    const rows: string[][] = [];
    let totalRows = 0;

    const finish = (preview: CsvPreview) => {
      setPreview(preview);
      resolve(preview);
    };

    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      step: (results) => {
        const row = results.data;
        if (headers === null) {
          headers = row;
          return;
        }
        totalRows += 1;
        rows.push(row);
      },
      complete: () => {
        if (headers === null || headers.every((h) => h.trim() === "")) {
          finish({
            status: "error",
            filename: file.name,
            message: "The file is empty or has no header row.",
          });
          return;
        }
        finish({
          status: "ready",
          filename: file.name,
          headers,
          rows,
          totalRows,
          totalCols: headers.length,
        });
      },
      error: (error) => {
        finish({
          status: "error",
          filename: file.name,
          message: error.message || "The file could not be read or parsed.",
        });
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

export const APP_FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "company",
  "website",
  "email",
  "phone",
  "linkedin",
  "country",
  "city",
  "industry",
  "jobTitle",
  "source",
  "tags",
  "notes",
] as const;

export type AppField = (typeof APP_FIELDS)[number];
export type Confidence = "high" | "medium" | "low" | "unknown";
export type ColumnMapping = { field: AppField | null; confidence: Confidence };

export const FIELD_LABELS: Record<AppField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  fullName: "Full Name",
  company: "Company",
  website: "Website",
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  country: "Country",
  city: "City",
  industry: "Industry",
  jobTitle: "Job Title",
  source: "Source",
  tags: "Tags",
  notes: "Notes",
};

// Compared against normalized headers (lowercase, alphanumerics only).
const SYNONYMS: Record<AppField, string[]> = {
  firstName: ["firstname", "first", "givenname", "fname", "forename"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  fullName: ["fullname", "name", "contactname", "person", "leadname"],
  company: [
    "company",
    "companyname",
    "organization",
    "organisation",
    "employer",
    "business",
    "businessname",
  ],
  website: ["website", "websiteurl", "companywebsite", "domain", "url", "site", "web"],
  email: ["email", "emailaddress", "mail", "workemail", "contactemail", "emails"],
  phone: [
    "phone",
    "phonenumber",
    "mobile",
    "mobilenumber",
    "telephone",
    "tel",
    "cell",
    "cellphone",
  ],
  linkedin: ["linkedin", "linkedinurl", "linkedinprofile", "linkedinlink"],
  country: ["country", "countryname", "countrycode", "nation"],
  city: ["city", "town", "locality"],
  industry: ["industry", "sector", "vertical"],
  jobTitle: ["jobtitle", "title", "role", "position", "designation", "jobrole"],
  source: ["source", "leadsource", "origin"],
  tags: ["tags", "tag", "labels", "keywords"],
  notes: ["notes", "note", "comments", "comment", "description", "remarks"],
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// One pass per header: exact synonym = high, prefix/suffix = medium,
// substring = low. Each app field is assigned to at most one column.
export function detectMappings(headers: string[]): ColumnMapping[] {
  const used = new Set<AppField>();

  return headers.map((header) => {
    const norm = normalize(header);
    if (!norm) return { field: null, confidence: "unknown" as const };

    let best: { field: AppField; confidence: Confidence } | null = null;

    for (const field of APP_FIELDS) {
      if (used.has(field)) continue;
      for (const syn of SYNONYMS[field]) {
        let confidence: Confidence | null = null;
        if (norm === syn) confidence = "high";
        else if (syn.length >= 4 && (norm.startsWith(syn) || norm.endsWith(syn)))
          confidence = "medium";
        else if (syn.length >= 4 && norm.includes(syn)) confidence = "low";

        if (
          confidence &&
          (!best || CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[best.confidence])
        ) {
          best = { field, confidence };
        }
        if (best?.confidence === "high") break;
      }
      if (best?.confidence === "high") break;
    }

    if (best) {
      used.add(best.field);
      return best;
    }
    return { field: null, confidence: "unknown" as const };
  });
}

// Remembers the chosen mapping per unique header set for this browser session.
type SavedMappings = Record<string, (AppField | null)[]>;

// Joined with a control character that never appears in real headers.
function headerSignature(headers: string[]): string {
  return headers.join("");
}

function readSavedMappings(): SavedMappings {
  try {
    return JSON.parse(sessionStorage.getItem(MAPPINGS_KEY) ?? "{}") as SavedMappings;
  } catch {
    return {};
  }
}

export function loadSavedMapping(headers: string[]): (AppField | null)[] | null {
  const saved = readSavedMappings()[headerSignature(headers)];
  return saved && saved.length === headers.length ? saved : null;
}

export function saveMapping(headers: string[], fields: (AppField | null)[]): void {
  try {
    const all = readSavedMappings();
    all[headerSignature(headers)] = fields;
    sessionStorage.setItem(MAPPINGS_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable — mapping simply won't be remembered.
  }
}

// ---------------------------------------------------------------------------
// Recent import history (localStorage)
// ---------------------------------------------------------------------------

const RECENT_KEY = "outerbound.import.recent";
const MAX_RECENT = 10;

export type RecentImport = {
  filename: string;
  date: string;
  rows: number | null;
  status: string;
};

export function readRecentImports(): RecentImport[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentImport[];
  } catch {
    return [];
  }
}

function writeRecentImports(items: RecentImport[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // Storage unavailable — history simply isn't kept.
  }
}

export function addRecentImport(filename: string): void {
  writeRecentImports([
    { filename, date: new Date().toISOString(), rows: null, status: "Selected" },
    ...readRecentImports(),
  ]);
}

// Marks the most recent entry for a file as imported, with its row count.
export function completeRecentImport(filename: string, rows: number): void {
  const items = readRecentImports();
  const index = items.findIndex((i) => i.filename === filename);
  if (index === -1) return;
  items[index] = { ...items[index], rows, status: "Imported" };
  writeRecentImports(items);
}
