import * as React from "react";

import { leadsRepo, type Lead } from "./db";
import { isValidEmail, isValidUrl } from "./validation";

export const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
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

export type EditableField = (typeof EDITABLE_FIELDS)[number];
export type LeadForm = Record<EditableField, string>;
export type FieldErrors = Partial<Record<EditableField, string>>;

function toForm(lead: Lead): LeadForm {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    company: lead.company,
    website: lead.website,
    email: lead.email,
    phone: lead.phone,
    linkedin: lead.linkedin,
    country: lead.country,
    city: lead.city,
    industry: lead.industry,
    jobTitle: lead.jobTitle,
    source: lead.source,
    tags: lead.tags.join(", "),
    notes: lead.notes,
  };
}

function validate(form: LeadForm): FieldErrors {
  const errors: FieldErrors = {};
  const email = form.email.trim();
  if (email && !isValidEmail(email)) errors.email = "Invalid email format";
  const website = form.website.trim();
  if (website && !isValidUrl(website)) errors.website = "Invalid URL";
  const linkedin = form.linkedin.trim();
  if (linkedin && !isValidUrl(linkedin)) errors.linkedin = "Invalid URL";
  return errors;
}

// All editing logic for a single lead: form state, validation, dirty
// detection, and persistence through the repository.
export function useLeadEditor(lead: Lead, onSaved: (lead: Lead) => void) {
  const initial = React.useMemo(() => toForm(lead), [lead]);
  const [form, setForm] = React.useState<LeadForm>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Re-sync when a different (or freshly saved) lead comes in.
  React.useEffect(() => setForm(initial), [initial]);

  const setField = (key: EditableField, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const errors = React.useMemo(() => validate(form), [form]);
  const dirty = React.useMemo(
    () => EDITABLE_FIELDS.some((key) => form[key] !== initial[key]),
    [form, initial]
  );

  const reset = () => {
    setForm(initial);
    setSaveError(null);
  };

  const save = async (): Promise<boolean> => {
    if (!dirty || saving || Object.keys(errors).length > 0) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const firstName = form.firstName.trim();
      const lastName = form.lastName.trim();
      // Keep a CSV-provided full name; recompute only if it was derived.
      const oldDerived = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
      const fullName =
        !lead.fullName || lead.fullName === oldDerived
          ? [firstName, lastName].filter(Boolean).join(" ")
          : lead.fullName;

      const updated: Lead = {
        ...lead,
        firstName,
        lastName,
        fullName,
        company: form.company.trim(),
        website: form.website.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        linkedin: form.linkedin.trim(),
        country: form.country.trim(),
        city: form.city.trim(),
        industry: form.industry.trim(),
        jobTitle: form.jobTitle.trim(),
        source: form.source.trim(),
        tags: form.tags
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
        updatedAt: new Date().toISOString(),
      };
      await leadsRepo.update(updated);
      onSaved(updated);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save lead");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { form, setField, errors, dirty, saving, saveError, reset, save };
}
