import type { Lead } from "./db";

// The single variable-replacement implementation.
// Everything that renders templates must go through renderTemplate().

export const TEMPLATE_VARIABLES = [
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
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const KNOWN = new Set<string>(TEMPLATE_VARIABLES);

// Missing or non-string values render as empty strings —
// never "undefined", "null", or "[object Object]".
export function renderTemplate(text: string, lead: Lead): string {
  return text.replace(VARIABLE_RE, (_match, name: string) => {
    if (!KNOWN.has(name)) return "";
    const value = lead[name as TemplateVariable];
    return typeof value === "string" ? value : "";
  });
}

export type VariableAnalysis = { unknown: string[]; duplicates: string[] };

export function analyzeVariables(text: string): VariableAnalysis {
  const counts = new Map<string, number>();
  for (const match of text.matchAll(VARIABLE_RE)) {
    const name = match[1];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const unknown: string[] = [];
  const duplicates: string[] = [];
  for (const [name, count] of counts) {
    if (!KNOWN.has(name)) unknown.push(name);
    else if (count > 1) duplicates.push(name);
  }
  return { unknown, duplicates };
}
