import * as React from "react";

import { campaignsRepo, type Campaign } from "./db";

export type CampaignForm = {
  name: string;
  description: string;
  templateId: string;
  leadIds: string[];
};

export type CampaignFormErrors = Partial<
  Record<"name" | "templateId" | "leads", string>
>;

function toForm(campaign: Campaign | null): CampaignForm {
  return campaign
    ? {
        name: campaign.name,
        description: campaign.description,
        templateId: campaign.templateId,
        leadIds: campaign.leadIds,
      }
    : { name: "", description: "", templateId: "", leadIds: [] };
}

function validate(form: CampaignForm): CampaignFormErrors {
  const errors: CampaignFormErrors = {};
  if (!form.name.trim()) errors.name = "Campaign name is required";
  if (!form.templateId) errors.templateId = "Template is required";
  if (form.leadIds.length === 0) errors.leads = "Select at least one lead";
  return errors;
}

// Editing logic for one campaign (or a new draft when campaign is null).
export function useCampaignEditor(
  campaign: Campaign | null,
  onSaved: (campaign: Campaign) => void
) {
  const initial = React.useMemo(() => toForm(campaign), [campaign]);
  const [form, setForm] = React.useState<CampaignForm>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => setForm(initial), [initial]);

  const setField = (key: "name" | "description" | "templateId", value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const leadIdSet = React.useMemo(() => new Set(form.leadIds), [form.leadIds]);

  const toggleLead = (id: string) =>
    setForm((prev) => ({
      ...prev,
      leadIds: prev.leadIds.includes(id)
        ? prev.leadIds.filter((x) => x !== id)
        : [...prev.leadIds, id],
    }));

  const setLeadSelection = (ids: string[], selected: boolean) =>
    setForm((prev) => {
      const set = new Set(prev.leadIds);
      for (const id of ids) {
        if (selected) set.add(id);
        else set.delete(id);
      }
      return { ...prev, leadIds: [...set] };
    });

  const errors = React.useMemo(() => validate(form), [form]);
  const valid = Object.keys(errors).length === 0;

  const dirty = React.useMemo(() => {
    if (
      form.name !== initial.name ||
      form.description !== initial.description ||
      form.templateId !== initial.templateId ||
      form.leadIds.length !== initial.leadIds.length
    )
      return true;
    const set = new Set(initial.leadIds);
    return form.leadIds.some((id) => !set.has(id));
  }, [form, initial]);

  const reset = () => {
    setForm(initial);
    setSaveError(null);
  };

  const save = async (): Promise<Campaign | null> => {
    if (!valid || saving || (!dirty && campaign)) return campaign;
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const saved: Campaign = campaign
        ? {
            ...campaign,
            name: form.name.trim(),
            description: form.description.trim(),
            templateId: form.templateId,
            leadIds: form.leadIds,
            leadCount: form.leadIds.length,
            updatedAt: now,
          }
        : {
            id: crypto.randomUUID(),
            name: form.name.trim(),
            description: form.description.trim(),
            templateId: form.templateId,
            leadIds: form.leadIds,
            leadCount: form.leadIds.length,
            createdAt: now,
            updatedAt: now,
          };
      await campaignsRepo.put(saved);
      onSaved(saved);
      return saved;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save campaign");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    form,
    setField,
    leadIdSet,
    toggleLead,
    setLeadSelection,
    errors,
    valid,
    dirty,
    saving,
    saveError,
    reset,
    save,
  };
}
