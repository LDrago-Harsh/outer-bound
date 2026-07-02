import * as React from "react";

import { templatesRepo, type Template } from "./db";

export type TemplateForm = { name: string; subject: string; body: string };
export type TemplateFormErrors = Partial<Record<keyof TemplateForm, string>>;

function toForm(template: Template | null): TemplateForm {
  return template
    ? { name: template.name, subject: template.subject, body: template.body }
    : { name: "", subject: "", body: "" };
}

function validate(form: TemplateForm): TemplateFormErrors {
  const errors: TemplateFormErrors = {};
  if (!form.name.trim()) errors.name = "Name is required";
  if (!form.subject.trim()) errors.subject = "Subject is required";
  if (!form.body.trim()) errors.body = "Body is required";
  return errors;
}

// Editing logic for one template (or a new draft when template is null):
// form state, validation, dirty detection, explicit save via the repository.
export function useTemplateEditor(
  template: Template | null,
  onSaved: (template: Template) => void
) {
  const initial = React.useMemo(() => toForm(template), [template]);
  const [form, setForm] = React.useState<TemplateForm>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => setForm(initial), [initial]);

  const setField = (key: keyof TemplateForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const errors = React.useMemo(() => validate(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const dirty = React.useMemo(
    () =>
      form.name !== initial.name ||
      form.subject !== initial.subject ||
      form.body !== initial.body,
    [form, initial]
  );

  const reset = () => {
    setForm(initial);
    setSaveError(null);
  };

  const save = async (): Promise<Template | null> => {
    if (!valid || saving || (!dirty && template)) return template;
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const saved: Template = template
        ? {
            ...template,
            name: form.name.trim(),
            subject: form.subject.trim(),
            body: form.body,
            updatedAt: now,
          }
        : {
            id: crypto.randomUUID(),
            name: form.name.trim(),
            subject: form.subject.trim(),
            body: form.body,
            createdAt: now,
            updatedAt: now,
          };
      await templatesRepo.put(saved);
      onSaved(saved);
      return saved;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save template");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { form, setField, errors, valid, dirty, saving, saveError, reset, save };
}
